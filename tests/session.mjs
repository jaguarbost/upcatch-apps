import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require=createRequire(import.meta.url)
async function load(file,overrides){
 const source=await readFile(file,'utf8')
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const exports={}
 new Function('require','exports',output)(name=>Object.hasOwn(overrides,name)?overrides[name]:require(name),exports)
 return exports
}
const seo={PRODUCTION_ORIGIN:'https://upcatch.co.uk',publicSiteOrigin:()=> 'https://upcatch.co.uk'}
const configuration={isSupabaseConfigured:()=>true,supabaseConfig:()=>({url:'https://example.invalid',key:'test-public-key'})}
test('refresh keeps all cookie chunks, removals and fresh request values',async()=>{
 const {NextRequest}=require('next/server')
 const request=new NextRequest('https://upcatch.example/')
 const {proxy}=await load('proxy.ts',{
  '@/lib/seo':seo,
  '@/components/upcatch/site-structured-data':{SiteStructuredData:()=>null},
  '@/lib/supabase/config':configuration,
  '@supabase/ssr':{createServerClient:(_,__,options)=>({auth:{getClaims:async()=>{
   options.cookies.setAll([{name:'old-session.0',value:'',options:{path:'/',maxAge:0}},{name:'session.0',value:'first',options:{path:'/',maxAge:3600}}])
   options.cookies.setAll([{name:'session.0',value:'refreshed',options:{path:'/',maxAge:3600}},{name:'session.1',value:'second',options:{path:'/',maxAge:3600}}])
   return {data:{claims:{sub:'member'}}}
  }}})},
 })
 const response=await proxy(request)
 assert.equal(response.cookies.get('old-session.0').maxAge,0)
 assert.equal(response.cookies.get('session.0').value,'refreshed')
 assert.equal(response.cookies.get('session.1').value,'second')
 assert.equal(request.cookies.get('session.0').value,'refreshed')
 assert.match(response.headers.get('Cache-Control'),/private, no-store/)
})
test('returning signed-in user sees the existing member app at root',async()=>{
 const MemberApp=()=>null
 const {default:Page}=await load('app/page.tsx',{
  '@/components/upcatch/upcatch-app':{UpCatchApp:()=>null},
  '@/components/account/member-app':{MemberApp},
  '@/lib/seo':seo,
  '@/components/upcatch/site-structured-data':{SiteStructuredData:()=>null},
  '@/lib/supabase/config':configuration,
  '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:'member'}},error:null})}})},
  'next/navigation':{redirect:()=>{throw new Error('Unexpected redirect')}},
 })
 assert.equal((await Page()).type,MemberApp)
})
test('anonymous landing retains the existing mockup component',async()=>{
 const UpCatchApp=()=>null
 const {default:Page}=await load('app/page.tsx',{
  '@/components/upcatch/upcatch-app':{UpCatchApp},
  '@/components/account/member-app':{MemberApp:()=>null},
  '@/lib/seo':seo,
  '@/components/upcatch/site-structured-data':{SiteStructuredData:()=>null},
  '@/lib/supabase/config':configuration,
  '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:null,error:null})}})},
  'next/navigation':{redirect:()=>{throw new Error('Unexpected redirect')}},
 })
 assert.equal((await Page()).props.children[1].type,UpCatchApp)
})
test('temporary auth outage is not treated as signed out',async()=>{
 const {requireMember}=await load('lib/server/member.ts',{
  'server-only':{},
  './signin-policy':{signinPolicy:async()=>{throw new Error('Policy must not run during an Auth outage')}},
  '@/lib/seo':seo,
  '@/components/upcatch/site-structured-data':{SiteStructuredData:()=>null},
  '@/lib/supabase/config':configuration,
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:null},error:{name:'AuthRetryableFetchError',status:503}})}})},
  'next/navigation':{redirect:()=>{throw new Error('Unexpected login redirect')}},
 })
 await assert.rejects(()=>requireMember(),/temporarily unavailable/)
})

for(const [complete,adult,destination] of [[false,true,'/onboarding'],[true,false,'/onboarding'],[true,true,'/']]){
 test('start routes completed='+complete+' adult='+adult+' to '+destination,async()=>{
  const signal=new Error('redirect');let actual;
  const {default:Page}=await load('app/start/page.tsx',{
   '@/components/account/shell':{AccountShell:()=>null},
   '@/lib/supabase/config':configuration,
   '@/lib/server/member':{requireMember:async()=>({profile:{onboarding_completed_at:complete?'2026-01-01':null},supabase:{rpc:async()=>({data:adult,error:null})}})},
   'next/navigation':{redirect:path=>{actual=path;throw signal}},
  });
  await assert.rejects(()=>Page(),e=>e===signal);assert.equal(actual,destination);
 });
}
test('onboarding status outage does not route a member into the app',async()=>{
 const {default:Page}=await load('app/start/page.tsx',{
  '@/components/account/shell':{AccountShell:()=>null},'@/lib/supabase/config':configuration,
  '@/lib/server/member':{requireMember:async()=>({profile:{onboarding_completed_at:'2026-01-01'},supabase:{rpc:async()=>({data:null,error:{message:'unavailable'}})}})},
  'next/navigation':{redirect:()=>{throw Error('Unexpected redirect')}},
 });
 await assert.rejects(()=>Page(),/onboarding status could not be loaded/);
});
for(const [query,fails,destination] of [['code=ok',false,'/start'],['code=ok&next=reset',false,'/auth/reset-password'],['code=bad',true,'/auth/login?oauth_error=1'],['error=access_denied',false,'/auth/login?oauth_error=1']]){
 test('callback '+query+' redirects safely to '+destination,async()=>{
  const {GET}=await load('app/auth/callback/route.ts',{
   '@/lib/supabase/server':{createClient:async()=>({auth:{exchangeCodeForSession:async()=>({error:fails?{}:null})}})},
  });
  const response=await GET(new Request('https://www.upcatch.co.uk/auth/callback?'+query));
  assert.equal(response.headers.get('location'),'https://www.upcatch.co.uk'+destination);
  assert.equal(response.status,303);assert.match(response.headers.get('cache-control'),/no-store/);
 });
}
async function authActions(google){
 const calls=[];const signal=new Error('redirect');
 const supabase={auth:{
  signInWithPassword:async()=>({data:{user:{email_confirmed_at:'2026-01-01'}},error:null}),
  signOut:async options=>{calls.push(['signOut',options])},
  getUser:async()=>({data:{user:{id:'member'}}}),
  updateUser:async()=>{calls.push(['updateUser']);return {error:null}},
  signUp:async()=>{calls.push(['signUp']);return {data:{session:null},error:null}},
  resetPasswordForEmail:async()=>{calls.push(['resetPassword']);return {error:null}},
 }};
 const actions=await load('app/auth/actions.ts',{
  'next/headers':{cookies:async()=>({})},
  'next/navigation':{redirect:path=>{calls.push(['redirect',path]);throw signal}},
  '@/lib/supabase/server':{createClient:async()=>supabase},
  '@/lib/server/member':{authCallbackUrl:()=> 'https://www.upcatch.co.uk/auth/callback'},
  '@/lib/server/signin-policy':{emailUsesGoogle:async()=>google,signinPolicy:async()=>({allowed:!google,google_required:google})},
  '@/lib/forms':{emailValue:form=>form.get('email'),passwordValue:form=>form.get('password')},
 });
 const form=new FormData();form.set('email','member@example.com');form.set('password','example-password');
 return {actions,calls,form,signal};
}
test('Google-linked password sign-in signs out instead of routing to the app',async()=>{
 const {actions,calls,form}=await authActions(true);
 assert.match((await actions.signIn({},form)).error,/Continue with Google/);
 assert.deepEqual(calls,[['signOut',{scope:'local'}]]);
});
test('confirmed email password sign-in routes through onboarding resolution',async()=>{
 const {actions,calls,form,signal}=await authActions(false);
 await assert.rejects(()=>actions.signIn({},form),e=>e===signal);
 assert.deepEqual(calls,[['redirect','/start']]);
});
test('Google-linked account cannot create a duplicate password signup or request a reset',async()=>{
 const {actions,calls,form}=await authActions(true);
 assert.match((await actions.signUp({},form)).message,/Google/);
 assert.match((await actions.requestReset({},form)).message,/Google/);
 assert.deepEqual(calls,[]);
});
test('Google-linked account cannot set a password from recovery',async()=>{
 const {actions,calls,form}=await authActions(true);
 assert.match((await actions.resetPassword({},form)).error,/Google/);
 assert.deepEqual(calls,[]);
});

test('production auth callbacks use the accepted www domain for login and recovery',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';
 try{
  const {siteUrl,authCallbackUrl}=await load('lib/server/member.ts',{
   'server-only':{},'./signin-policy':{signinPolicy:async()=>({allowed:true})},
   'next/navigation':{redirect:()=>{}},'@/lib/supabase/server':{createClient:async()=>({})},
   '@/lib/supabase/config':configuration,
  });
  assert.equal(siteUrl(),'https://www.upcatch.co.uk');
  assert.equal(authCallbackUrl(),'https://www.upcatch.co.uk/auth/callback');
  assert.equal(authCallbackUrl('reset'),'https://www.upcatch.co.uk/auth/callback?next=reset');
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
