export type FormState = { error?: string; message?: string }
export function emailValue(form: FormData) {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.')
  return email
}
export function passwordValue(form: FormData) {
  const value = String(form.get('password') ?? '')
  if (value.length < 12 || value.length > 128) throw new Error('Use a password between 12 and 128 characters.')
  return value
}
