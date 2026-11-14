import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source=await readFile('lib/message-time.ts','utf8')
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const exports={}
new Function('exports',js)(exports)
const {persistedMessageDate}=exports

test('chat timestamps keep the exact persisted instant',()=>{
 const saved='2026-11-14T20:12:34.456Z'
 assert.equal(persistedMessageDate(saved).toISOString(),saved)
})
test('chat timestamps preserve offset timestamps without substituting receipt time',()=>{
 assert.equal(persistedMessageDate('2026-11-14T21:12:34+01:00').toISOString(),'2026-11-14T20:12:34.000Z')
})
test('old Go Live snapshots and malformed timestamps have no fabricated time',()=>{
 for(const saved of [undefined,null,'','invalid'])assert.equal(persistedMessageDate(saved),null)
})
