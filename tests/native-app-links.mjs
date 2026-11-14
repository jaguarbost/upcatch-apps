import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile('lib/app-links.ts', 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const exports = {}
new Function('exports', compiled)(exports)
const { parseUpCatchAppLink } = exports

test('native nudge links resolve to the app screen without accepting foreign origins', () => {
  assert.equal(parseUpCatchAppLink('uk.co.upcatch.app://app/nudges'), '/app?view=nudges')
  assert.equal(parseUpCatchAppLink('https://www.upcatch.uk/app?view=nudges'), '/app?view=nudges')
  assert.equal(parseUpCatchAppLink('uk.co.upcatch.app://app/notifications'), '/app?view=notifications')
  assert.equal(parseUpCatchAppLink('https://evil.example/app?view=nudges'), null)
  assert.equal(parseUpCatchAppLink('uk.co.upcatch.app://app/unknown'), null)
})

test('native notification links retain the selected friend and scheduled conversation',()=>{
  const id='11111111-1111-4111-8111-111111111111'
  assert.equal(parseUpCatchAppLink(`uk.co.upcatch.app://app/messages?chat=friend&peer=${id}`),`/app?view=messages&chat=friend&peer=${id}`)
  assert.equal(parseUpCatchAppLink(`uk.co.upcatch.app://app/messages?chat=scheduled&post=${id}`),`/app?view=messages&chat=scheduled&post=${id}`)
  assert.equal(parseUpCatchAppLink('uk.co.upcatch.app://app/messages?chat=live'),'/app?view=messages&chat=live')
})

test('native notification links reject invalid conversation identifiers and embedded credentials',()=>{
  assert.equal(parseUpCatchAppLink('uk.co.upcatch.app://app/messages?chat=friend&peer=invalid'),null)
  assert.equal(parseUpCatchAppLink('uk.co.upcatch.app://app/messages?chat=scheduled'),null)
  assert.equal(parseUpCatchAppLink('https://user:password@www.upcatch.uk/app?view=notifications'),null)
})
