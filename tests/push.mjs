import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
async function load(path,overrides={}){
 const source=await readFile(path,'utf8')
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={}
 new Function('require','exports',js)(name=>{if(!(name in overrides))throw Error('Unexpected import '+name);return overrides[name]},exports)
 return exports
}
const {pushTTL}=await load('lib/push-expiry.ts')
test('offer TTL cannot outlive its 30-second deadline',()=>{
 const now=Date.parse('2026-09-27T12:00:00Z')
 assert.equal(pushTTL('2026-09-27T12:00:30Z',now),30)
 assert.equal(pushTTL('2026-09-27T12:00:30Z',now+18000),12)
 assert.equal(pushTTL('2026-09-27T12:00:30Z',now+31000),0)
 assert.equal(pushTTL('invalid',now),0)
 assert.equal(pushTTL(undefined,now),3600)
})
async function deliveryFixture(t,jobs){
 const originalFetch=global.fetch
 const keys=['ONESIGNAL_API_KEY','NEXT_PUBLIC_ONESIGNAL_APP_ID','ONESIGNAL_ALIAS_SECRET']
 const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]))
 Object.assign(process.env,{ONESIGNAL_API_KEY:'test-key',NEXT_PUBLIC_ONESIGNAL_APP_ID:'test-app',ONESIGNAL_ALIAS_SECRET:'test-alias-secret-with-at-least-32-characters'})
 const requests=[],claimed=[],finished=[]
 global.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({id:'test-notification'})}}
 t.after(()=>{global.fetch=originalFetch;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}})
 const admin={
  auth:{admin:{getUserById:async()=>({data:{user:{email_confirmed_at:'2026-01-01'}},error:null})}},
  from:()=>({select:()=>({eq:()=>({single:async()=>({data:{push_enabled:true},error:null})})})}),
  rpc:async(name,args)=>{
   if(name==='notification_recipients')return {data:[{user_id:'first'},{user_id:'second'},{user_id:'second'}],error:null}
   if(name==='claim_notification_jobs'){claimed.push(args.p_user);return {data:jobs.filter(job=>job.user_id===args.p_user),error:null}}
   if(name==='begin_notification_delivery')return {data:true,error:null}
   if(name==='finish_notification_job'){finished.push(args);return {error:null}}
   throw Error('Unexpected RPC '+name)
  },
 }
 const api=await load('lib/server/notifications.ts',{
  'server-only':{},'node:crypto':await import('node:crypto'),
  '@/lib/email/templates':{notificationEmail:()=>{throw Error('Push test unexpectedly entered email delivery')}},
  '@/lib/supabase/admin':{adminClient:()=>admin},'./member':{siteUrl:()=> 'https://www.upcatch.co.uk'},'@/lib/push-expiry':{pushTTL},
 })
 return {api,requests,claimed,finished}
}
test('expired offers are skipped without contacting OneSignal',async t=>{
 const f=await deliveryFixture(t,[{id:'job',user_id:'first',kind:'meetup_push',lease_token:'lease',payload:{expires_at:new Date(Date.now()-1000).toISOString()}}])
 await f.api.deliverNotifications('first')
 assert.equal(f.requests.length,0);assert.equal(f.finished[0].p_state,'skipped')
})
test('dispatch reaches both members and applies remaining offer TTL',async t=>{
 const f=await deliveryFixture(t,[{id:'job',user_id:'second',kind:'meetup_push',lease_token:'lease',payload:{expires_at:new Date(Date.now()+30000).toISOString()}}])
 await f.api.deliverMemberNotifications('first')
 assert.deepEqual(f.claimed.sort(),['first','second'])
 assert.equal(f.requests.length,1)
 assert.ok(f.requests[0].body.ttl>0&&f.requests[0].body.ttl<=30)
 assert.equal(f.requests[0].body.web_url,'https://www.upcatch.co.uk/app')
 assert.equal(f.requests[0].body.url,undefined)
 assert.notEqual(f.requests[0].body.include_aliases.external_id[0],'second')
 assert.equal(f.finished[0].p_state,'sent')
})
async function browserFixture(t){
 const oldWindow=global.window,oldDocument=global.document
 const scripts=[];let initializations=0
 const client={init:async options=>{initializations++;assert.equal(options.notifyButton.enable,false);assert.equal(options.promptOptions.slidedown.prompts[0].autoPrompt,false)},User:{PushSubscription:{optIn:async()=>{},optOut:async()=>{},optedIn:true}},login:async()=>{},logout:async()=>{}}
 global.window={OneSignalDeferred:[]}
 global.document={createElement:()=>({remove(){}}),head:{appendChild:script=>{scripts.push(script)}}}
 t.after(()=>{global.window=oldWindow;global.document=oldDocument})
 const api=await load('lib/push-client.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}},'./browser-permissions':{deviceKind:()=> 'android',isInstalledApp:()=>false}})
 return {api,scripts,client,count:()=>initializations}
}
test('concurrent SDK callers initialize OneSignal only once without floating prompts',async t=>{
 const f=await browserFixture(t)
 const first=f.api.loadPush(),second=f.api.loadPush()
 await window.OneSignalDeferred[0](f.client)
 assert.equal(await first,f.client);assert.equal(await second,f.client)
 assert.equal(f.scripts.length,1);assert.equal(f.count(),1)
})
test('failed SDK download can be retried without duplicate callbacks',async t=>{
 const f=await browserFixture(t)
 const first=f.api.loadPush();f.scripts[0].onerror()
 await assert.rejects(first,/check your connection/)
 assert.equal(window.OneSignalDeferred.length,0)
 const second=f.api.loadPush();await window.OneSignalDeferred[0](f.client)
 assert.equal(await second,f.client);assert.equal(f.count(),1)
})

test('native push binds the authenticated alias and disconnects on sign-out',async t=>{
 const originalFetch=global.fetch,originalId=process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
 process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID='test-app'
 const calls=[]
 const client={
  initialize:async id=>calls.push(['initialize',id]),
  Notifications:{requestPermission:async()=>true,hasPermission:async()=>true},
  login:async alias=>calls.push(['login',alias]),logout:async()=>calls.push(['logout']),
  User:{pushSubscription:{optIn:async()=>calls.push(['optIn']),optOut:async()=>calls.push(['optOut']),getOptedInAsync:async()=>true}},
 }
 global.fetch=async(_url,options)=>options?.method==='POST'?{ok:true}:{ok:true,json:async()=>({alias:'opaque-alias',enabled:false})}
 t.after(()=>{global.fetch=originalFetch;if(originalId===undefined)delete process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;else process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID=originalId})
 const api=await load('lib/push-client.ts',{
  '@capacitor/core':{Capacitor:{isNativePlatform:()=>true}},
  '@onesignal/capacitor-plugin':{__esModule:true,default:client},
  './browser-permissions':{deviceKind:()=> 'ios',isInstalledApp:()=>true},
 })
 await api.setPushEnabled(true)
 await api.detachPush()
 assert.deepEqual(calls,[['initialize','test-app'],['login','opaque-alias'],['optIn'],['optOut'],['logout']])
})
