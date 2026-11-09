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
