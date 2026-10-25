const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
function setup(responses) {
 const calls=[]; let saved;
 const ctx={base:'http://localhost:8000',AbortSignal,saveAuth:value=>saved=value,
 fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});const response=responses.shift();return {ok:response.ok,json:async()=>response.data};}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('  function extractError'),source.indexOf('  function buildAuthModal')),ctx);
 return {ctx,calls,get saved(){return saved;}};
}
test('signup then login uses email and stores server profile',async()=>{
 const run=setup([{ok:true,data:{message:'created'}},{ok:true,data:{access_token:'token',refresh_token:'refresh',user:{username:'Rehan',email:'rehan@example.com'}}}]);
 await run.ctx.authRequest('/signup',{username:'Rehan',email:'rehan@example.com',password:'test-only'});
 await run.ctx.performLogin('rehan@example.com','test-only');
 assert.equal(run.calls[1].body.email,'rehan@example.com');assert.equal(run.saved.username,'Rehan');assert.equal(run.saved.refresh_token,'refresh');
});
test('invalid credentials do not create a session',async()=>{
 const run=setup([{ok:false,data:{detail:'Invalid email or password'}}]);
 await assert.rejects(()=>run.ctx.performLogin('rehan@example.com','wrong'),/Invalid email or password/);assert.equal(run.saved,undefined);
});
test('missing access token is rejected',async()=>{
 const run=setup([{ok:true,data:{}}]);await assert.rejects(()=>run.ctx.performLogin('rehan@example.com','test-only'),/no session/);assert.equal(run.saved,undefined);
});
test('duplicate registration surfaces server message',async()=>{
 const run=setup([{ok:false,data:{detail:'User already exists'}}]);await assert.rejects(()=>run.ctx.authRequest('/signup',{}),/User already exists/);
});
test('validation errors are readable',()=>{
 const run=setup([]);assert.equal(run.ctx.extractError({detail:[{msg:'Invalid email'}]}),'Invalid email');
});
test('successful token refresh does not hide a retried server error as HTTP 401',async()=>{
 const apiSource=source.slice(source.indexOf('  async function api('),source.indexOf('  function markdownToHtml('));
 let count=0;const ctx={base:'http://localhost:8000',auth:{access_token:'old',refresh_token:'refresh'},AbortSignal,saveAuth:()=>{},openAuthModal:()=>assert.fail('must not report auth failure'),fetch:async(url)=>{
  if(url.includes('/refresh'))return {ok:true,json:async()=>({access_token:'new'})};
  count++;return count===1?{status:401,ok:false}:{status:500,ok:false,json:async()=>({detail:'Server failed'})};
 }};vm.createContext(ctx);vm.runInContext(apiSource,ctx);
 await assert.rejects(()=>ctx.api('/chat',{method:'POST'}),error=>error.status===500 && error.message.includes('Server failed'));
});
