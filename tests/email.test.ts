import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notificationEmail } from '../lib/email/templates.ts'

test('welcome contains themed HTML, plain text, and a working app link', () => {
  const email = notificationEmail('welcome_email', 'https://www.upcatch.co.uk')
  assert.match(email.html, /#ffc940/)
  assert.match(email.html, /#2b59ff/)
  assert.match(email.html, /Bricolage Grotesque/)
  assert.match(email.html, /Figtree/)
  assert.match(email.text, /https:\/\/www.upcatch.co.uk\/app/)
  assert.match(email.html, /href="https:\/\/www.upcatch.co.uk\/app"/)
})
test('pairing names and venues cannot inject HTML', () => {
  const email = notificationEmail('paired_email', 'https://www.upcatch.co.uk', {
    partner_name: '<img src=x onerror=alert(1)>', venue: 'A & B "Cafe"',
  })
  assert.ok(!email.html.includes('<img'))
  assert.match(email.html, /&lt;img/)
  assert.match(email.html, /A &amp; B &quot;Cafe&quot;/)
  assert.match(email.text, /both said yes/)
})
test('venue-free pairing does not invent a location', () => {
  const email = notificationEmail('paired_email', 'https://www.upcatch.co.uk')
  assert.match(email.text, /Pick a public meeting spot together/)
  assert.ok(!email.text.includes('undefined'))
})
test('trusted-contact details are escaped and do not ask the contact to open a member meetup', () => {
  const email = notificationEmail('trusted_email', 'https://www.upcatch.co.uk', { text: '<script>bad()</script>' })
  assert.ok(!email.html.includes('<script>'))
  assert.match(email.html, /&lt;script&gt;/)
  assert.ok(!email.text.includes('/app'))
})
test('unsafe URL schemes are rejected', () => {
  for (const url of ['javascript:alert(1)', 'http://example.com', 'ftp://localhost']) {
    assert.throws(() => notificationEmail('welcome_email', url))
  }
})
