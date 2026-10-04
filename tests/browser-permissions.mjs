import test from 'node:test'
import assert from 'node:assert/strict'
import { observeLocationPermission } from '../lib/browser-permissions.ts'

test('focus and visibility checks report only actual location permission changes',async()=>{
 const originals=new Map(['window','document','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 const permission=new EventTarget()
 permission.state='granted'
 const win=new EventTarget(),doc=new EventTarget()
 doc.visibilityState='visible'
 let queries=0
 Object.defineProperty(globalThis,'window',{configurable:true,value:win})
 Object.defineProperty(globalThis,'document',{configurable:true,value:doc})
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{permissions:{query:async()=>{queries++;return permission}}}})
 const seen=[]
 let stop
 try{
   stop=observeLocationPermission(state=>seen.push(state))
   await new Promise(setImmediate)
   win.dispatchEvent(new Event('focus'))
   await new Promise(setImmediate)
   doc.dispatchEvent(new Event('visibilitychange'))
   await new Promise(setImmediate)
   assert.equal(queries,3)
   assert.deepEqual(seen,['granted'])
   permission.state='denied';permission.dispatchEvent(new Event('change'))
   permission.state='granted';permission.dispatchEvent(new Event('change'))
   assert.deepEqual(seen,['granted','denied','granted'])
   stop()
   permission.state='denied';permission.dispatchEvent(new Event('change'))
   assert.equal(seen.length,3)
 }finally{
   stop?.()
   for(const [key,descriptor] of originals){
     if(descriptor)Object.defineProperty(globalThis,key,descriptor)
     else delete globalThis[key]
   }
 }
})
