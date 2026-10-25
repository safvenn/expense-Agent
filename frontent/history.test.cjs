const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const loader=source.slice(source.indexOf('  async function loadMessages()'),source.indexOf('  /* ---------------- Authentication'));
function setup(api,messages=[]){const state={messages,pending:{id:'pending'},uncertain:true,diagnostic:{response:'preserved'}};const ctx={state,api,auth:{access_token:'test'},base:'http://localhost:8000',historyVersion:0,historyNotice:'',URLSearchParams,$:()=>true,persist:()=>{},renderChat:()=>{}};vm.createContext(ctx);vm.runInContext(loader,ctx);return ctx;}
test('loads authenticated history oldest first, deduplicates local replies, preserves interrupt',async()=>{const c=setup(async()=>({messages:[{id:2,role:'assistant',content:'Hello'},{id:1,role:'user',content:'Hi'}]}),[{role:'user',text:'Hi'},{role:'assistant',text:'Hello'}]);await c.loadMessages();assert.equal(c.state.messages.map(m=>m.text).join(','),'Hi,Hello');assert.equal(c.state.pending.id,'pending');assert.equal(c.state.uncertain,true);assert.equal(c.state.diagnostic.response,'preserved');});
test('paginates and excludes tool/system messages',async()=>{const calls=[];const c=setup(async url=>{calls.push(url);return {messages:calls.length===1?Array.from({length:100},(_,i)=>({id:101-i,role:'tool',content:'hidden'})):[{id:1,role:'user',content:'Oldest'}]};});await c.loadMessages();assert.equal(calls.length,2);assert.match(calls[1],/offset=100/);assert.equal(c.state.messages.length,1);});
test('history failures preserve visible chat and show error',async()=>{const c=setup(async()=>{throw Error('offline')},[{role:'user',text:'Keep me'}]);await c.loadMessages();assert.equal(c.state.messages[0].text,'Keep me');assert.match(c.historyNotice,/offline/);});
test('stale response cannot overwrite another account state',async()=>{let resolve;const c=setup(()=>new Promise(r=>resolve=r));const job=c.loadMessages();c.state={messages:[]};resolve({messages:[{id:1,role:'user',content:'Old account'}]});await job;assert.equal(c.state.messages.length,0);});
test('mutation completion refreshes history before releasing send lock',()=>{assert.match(source,/finally \{\s+await loadMessages\(\);\s+busy = false;/);});
test('JSON message content from updated backend appears in history',async()=>{
 const c=setup(async()=>({messages:[
  {id:3,role:'tool',content:{action_requests:[]}},
  {id:2,role:'assistant',content:{assistant_response:[{type:'text',text:'Hello there'}]}},
  {id:1,role:'user',content:{user_prompt:'Hi'}}
 ]}));
 await c.loadMessages();
 assert.equal(c.state.messages.map(m=>m.text).join(','),'Hi,Hello there');
});
test('serialized JSON displays its value and decodes unicode without duplicate cache entries',async()=>{
 const raw='{"user_prompt":"Bought groceries for \\u20b91,200"}';
 const c=setup(async()=>({messages:[{id:1,role:'user',content:raw}]}),[{role:'user',text:raw}]);
 await c.loadMessages();assert.equal(c.state.messages.length,1);assert.equal(c.state.messages[0].text,'Bought groceries for ₹1,200');
});
test('serialized assistant response is unwrapped while ordinary text stays unchanged',async()=>{
 const c=setup(async()=>({messages:[{id:2,role:'assistant',content:'{"assistant_response":"Recorded"}'},{id:1,role:'user',content:'plain text'}]}));
 await c.loadMessages();assert.equal(c.state.messages.map(m=>m.text).join(','),'plain text,Recorded');
});
test('tool names appear as compact metadata without claiming execution',async()=>{
 const c=setup(async()=>({messages:[{id:2,role:'tool',content:JSON.stringify({action_requests:[{name:'add_expense',args:{amount:100}},{name:'edit_expense'}]})},{id:1,role:'user',content:'Lunch'}]}));
 await c.loadMessages();assert.equal(c.state.messages.length,2);assert.equal(c.state.messages[1].role,'tool');assert.equal(c.state.messages[1].text,'Tool requested: add_expense, edit_expense');
});
test('approval replies remain with their user and tool across history refreshes',async()=>{
 const messages=[{id:4,role:'tool',content:{action_requests:[{name:'add_expense'}]}},{id:3,role:'user',content:'Mandhi'},{id:2,role:'tool',content:{action_requests:[{name:'add_expense'}]}},{id:1,role:'user',content:'Movies'}];
 const c=setup(async()=>({messages}),[{role:'assistant',text:'Movies added',afterUser:{id:1,text:'Movies',occurrence:0}},{role:'assistant',text:'Mandhi added',afterUser:{id:3,text:'Mandhi',occurrence:0}}]);
 await c.loadMessages();await c.loadMessages();
 assert.equal(c.state.messages.map(m=>m.text).join('|'),'Movies|Tool requested: add_expense|Movies added|Mandhi|Tool requested: add_expense|Mandhi added');
});
test('old cached approval replies fill unanswered tool turns in order',async()=>{
 const c=setup(async()=>({messages:[{id:4,role:'tool',content:{action_requests:[{name:'delete_expense'}]}},{id:3,role:'user',content:'Delete'},{id:2,role:'tool',content:{action_requests:[{name:'add_expense'}]}},{id:1,role:'user',content:'Add'}]}),[{role:'assistant',text:'Added'},{role:'assistant',text:'Deleted'}]);
 await c.loadMessages();assert.equal(c.state.messages.map(m=>m.role).join(','),'user,tool,assistant,user,tool,assistant');
});
test('content wrappers survive approval history refresh and reload',async()=>{
 const records=[{id:3,role:'assistant',content:{content:[{type:'text',text:'Lunch added.'}]}},{id:2,role:'agent',content:{content:{action_requests:[{name:'add_expense'}]}}},{id:1,role:'user',content:{content:'Add lunch'}}];
 const c=setup(async()=>({messages:records}),[{role:'user',text:'Add lunch'},{role:'assistant',text:'Lunch added.',afterUser:{text:'Add lunch',occurrence:0}}]);
 await c.loadMessages();await c.loadMessages();
 assert.equal(c.state.messages.map(m=>m.text).join('|'),'Add lunch|Lunch added.');
 const reload=setup(async()=>({messages:records}));await reload.loadMessages();
 assert.equal(reload.state.messages.map(m=>m.text).join('|'),'Add lunch|Lunch added.');
});
test('serialized content wrappers display without JSON or duplicate replies',async()=>{
 const c=setup(async()=>({messages:[{id:2,role:'assistant',content:'{"content":"Added."}'},{id:1,role:'user',content:'{"content":"Lunch"}'}]}),[{role:'assistant',text:'{"content":"Added."}'}]);
 await c.loadMessages();assert.equal(c.state.messages.map(m=>m.text).join('|'),'Lunch|Added.');
});
test('approval reply renders before a slow history request completes',async()=>{
 let release;const renders=[];
 const ctx={historyVersion:0,busy:false,state:{messages:[]},base:'http://localhost:8000',persist:()=>{},renderChat:()=>renders.push(ctx.state.messages.map(m=>m.text).join('|')),api:async()=>({content:'Expense added.'}),accept:data=>{ctx.state.messages.push({role:'assistant',text:data.content});ctx.state.uncertain=false;},loadMessages:()=>new Promise(r=>release=r)};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('  async function mutate('),source.indexOf('  async function decide(')),ctx);
 const job=ctx.mutate('/approve',{});await new Promise(r=>setImmediate(r));
 assert.ok(renders.includes('Expense added.'));assert.equal(ctx.busy,true);release();await job;assert.equal(ctx.busy,false);
});
