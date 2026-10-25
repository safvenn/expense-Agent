const test = require('node:test');
const assert = require('node:assert/strict');
const parse = require('./response.js');
const interrupt = {id:'test',name:'add_expense',args:{title:'Alfam',amount:200,category:'Food'},description:'Tool execution requires approval',allowed_decisions:['approve','edit','reject']};
test('actual Alfam interrupt response becomes a pending approval',()=>assert.deepEqual(parse(interrupt),{pending:interrupt}));
test('JSON-encoded interrupt preserves approval requirement',()=>assert.deepEqual(parse(JSON.stringify(interrupt)),{pending:interrupt}));
test('normal replies and content blocks',()=>{assert.deepEqual(parse({content:'Hello'}),{text:'Hello'});assert.deepEqual(parse({content:[{type:'text',text:'Hello'}]}),{text:'Hello'});});
test('unknown and malformed responses cannot count as success',()=>{for(const data of [null,[],42,{},'hello',{detail:'failure'},{content:[null]}]) assert.throws(()=>parse(data));});
test('array-like decisions from a bridge preserve explicit permissions',()=>assert.deepEqual(parse({...interrupt,allowed_decisions:{0:'approve',1:'edit',2:'reject'}}),{pending:interrupt}));
test('unsupported or absent decisions never authorize an action',()=>{for(const allowed_decisions of [null,[],['execute'],['approve',null],'approve']) assert.throws(()=>parse({...interrupt,allowed_decisions}));});
test('reject-only permission stays reject-only',()=>assert.deepEqual(parse({...interrupt,allowed_decisions:['reject']}).pending.allowed_decisions,['reject']));
test('saved failed interrupt recovers same thread without another API request',()=>{
  const fs=require('node:fs'); const vm=require('node:vm');
  const source=fs.readFileSync(require('node:path').join(__dirname,'app.js'),'utf8');
  const recovery=source.slice(source.indexOf('  // Recover only'),source.indexOf('  function renderChat()'));
  let saves=0;
  const state={thread:'original-thread',uncertain:true,messages:[],diagnostic:{api:'http://localhost:8000',response:interrupt}};
  vm.runInNewContext(recovery,{state,base:'http://localhost:8000',parseChatResponse:parse,persist:()=>saves++});
  assert.equal(state.thread,'original-thread'); assert.equal(state.uncertain,false);
  assert.deepEqual(state.pending,interrupt); assert.equal(saves,1); assert.equal(state.diagnostic,null);
});
test('recovery does not unlock unknown outcomes or another API session',()=>{
  const fs=require('node:fs'); const vm=require('node:vm');
  const source=fs.readFileSync(require('node:path').join(__dirname,'app.js'),'utf8');
  const recovery=source.slice(source.indexOf('  // Recover only'),source.indexOf('  function renderChat()'));
  for(const diagnostic of [{api:'http://localhost:8000',response:{detail:'unknown'}},{api:'http://localhost:9000',response:interrupt}]){
    const state={uncertain:true,messages:[],diagnostic};
    vm.runInNewContext(recovery,{state,base:'http://localhost:8000',parseChatResponse:parse,persist:()=>assert.fail('must not unlock')});
    assert.equal(state.uncertain,true);
  }
});
test('boxed values normalize before permission validation',()=>{
 const wrapped={...interrupt,name:new String('add_expense'),allowed_decisions:[new String('approve'),new String('edit'),new String('reject')]};
 assert.deepEqual(parse(wrapped),{pending:interrupt});
});
test('reported Biriyani response is accepted',()=>{
 const response={id:'cb401e26aea979af000da436b62889a7',name:'add_expense',args:{title:'Biriyani',amount:100,category:'Food'},description:"Tool execution requires approval\n\nTool: add_expense\nArgs: {'title': 'Biriyani', 'amount': 100, 'category': 'Food'}",allowed_decisions:['approve','edit','reject']};
 assert.deepEqual(parse(response),{pending:response});
});
test('actual backend misspelling allowed_decitions is normalized',()=>{
 const {allowed_decisions,...rest}=interrupt;
 assert.deepEqual(parse({...rest,allowed_decitions:allowed_decisions}),{pending:interrupt});
});
test('legacy permissions do not override explicit canonical permissions',()=>{
 assert.deepEqual(parse({...interrupt,allowed_decisions:['reject'],allowed_decitions:['approve']}).pending.allowed_decisions,['reject']);
});
test('saved legacy interrupt recovers without resending expense',()=>{
 const fs=require('node:fs');const vm=require('node:vm');
 const source=fs.readFileSync(require('node:path').join(__dirname,'app.js'),'utf8');
 const recovery=source.slice(source.indexOf('  // Recover only'),source.indexOf('  function renderChat()'));
 const {allowed_decisions,...rest}=interrupt;
 const state={thread:'existing-thread',uncertain:true,messages:[],diagnostic:{api:'http://localhost:8000',response:{...rest,allowed_decitions:allowed_decisions}}};
 vm.runInNewContext(recovery,{state,base:'http://localhost:8000',parseChatResponse:parse,persist:()=>{}});
 assert.equal(state.uncertain,false);assert.equal(state.thread,'existing-thread');assert.deepEqual(state.pending,interrupt);
});
