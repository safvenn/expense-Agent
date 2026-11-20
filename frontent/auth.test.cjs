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
test('login input validation catches empty email, invalid email, and empty password',()=>{
 const run=setup([]);
 assert.equal(run.ctx.validateAuthInput('login',{email:'',password:''}),'Enter your email address.');
 assert.equal(run.ctx.validateAuthInput('login',{email:'not-an-email',password:'123456'}),'Enter a valid email address.');
 assert.equal(run.ctx.validateAuthInput('login',{email:'user@example.com',password:''}),'Enter your password.');
 assert.equal(run.ctx.validateAuthInput('login',{email:'user@example.com',password:'secret'}),null);
});
test('signup input validation catches missing name, missing/invalid email, and password length',()=>{
 const run=setup([]);
 assert.equal(run.ctx.validateAuthInput('signup',{username:'',email:'user@example.com',password:'secret123'}),'Enter your name.');
 assert.equal(run.ctx.validateAuthInput('signup',{username:'Alex',email:'',password:'secret123'}),'Enter your email address.');
 assert.equal(run.ctx.validateAuthInput('signup',{username:'Alex',email:'bad-email',password:'secret123'}),'Enter a valid email address.');
 assert.equal(run.ctx.validateAuthInput('signup',{username:'Alex',email:'alex@example.com',password:''}),'Create a password.');
 assert.equal(run.ctx.validateAuthInput('signup',{username:'Alex',email:'alex@example.com',password:'12345'}),'Password must be at least 6 characters.');
 assert.equal(run.ctx.validateAuthInput('signup',{username:'Alex',email:'alex@example.com',password:'123456'}),null);
});
test('auth modal template contains standard autocomplete=name and password visibility controls',()=>{
 assert.match(source,/autocomplete="name"/);
 assert.doesNotMatch(source,/autocomplete="nickname"/);
 assert.match(source,/class="password-field-wrapper"/);
 assert.match(source,/class="password-toggle"/);
 assert.doesNotMatch(source,/<button[^>]*class="password-toggle"[^>]*tabindex="-1"/);
 assert.match(source,/<label for="login-password">Password<\/label>/);
 assert.match(source,/<label for="signup-password">Password<\/label>/);

 const css = fs.readFileSync(__dirname + '/styles.css', 'utf8');
 assert.match(css, /\.password-toggle\s+svg\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
});
test('resetPasswordFields restores password type, empties values, and resets toggle labels',()=>{
 const run=setup([]);
 const fakeInputs = [{ type: 'text', value: 'secret' }, { type: 'text', value: 'another' }];
 const fakeSvgs = [{ hidden: true }, { hidden: false }];
 const fakeToggles = [{
   labels: {},
   setAttribute: (k, v) => fakeToggles[0].labels[k] = v,
   querySelector: sel => sel === '.eye-open' ? fakeSvgs[0] : fakeSvgs[1]
 }];
 const fakeRoot = {
   querySelectorAll: sel => sel === '.password-field-wrapper input' ? fakeInputs : fakeToggles
 };
 run.ctx.resetPasswordFields(fakeRoot);
 assert.equal(fakeInputs[0].type, 'password');
 assert.equal(fakeInputs[0].value, '');
 assert.equal(fakeInputs[1].type, 'password');
 assert.equal(fakeInputs[1].value, '');
 assert.equal(fakeToggles[0].labels['aria-label'], 'Show password');
 assert.equal(fakeSvgs[0].hidden, false);
 assert.equal(fakeSvgs[1].hidden, true);
});
test('successful token refresh does not hide a retried server error as HTTP 401',async()=>{
 const apiSource=source.slice(source.indexOf('  async function api('),source.indexOf('  function markdownToHtml('));
 let count=0;const ctx={base:'http://localhost:8000',auth:{access_token:'old',refresh_token:'refresh'},AbortSignal,saveAuth:()=>{},openAuthModal:()=>assert.fail('must not report auth failure'),fetch:async(url)=>{
  if(url.includes('/refresh'))return {ok:true,json:async()=>({access_token:'new'})};
  count++;return count===1?{status:401,ok:false}:{status:500,ok:false,json:async()=>({detail:'Server failed'})};
 }};vm.createContext(ctx);vm.runInContext(apiSource,ctx);
 await assert.rejects(()=>ctx.api('/chat',{method:'POST'}),error=>error.status===500 && error.message.includes('Server failed'));
});
