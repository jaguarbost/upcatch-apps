import { INTERESTS } from './upcatch-data'

export const LIVE_ONBOARDING_STEPS = ['welcome', 'name', 'permissions', 'photo', 'about'] as const
export function initialOnboardingStep(member?: { detailsSaved: boolean; photoSaved?: boolean; aboutPending?: boolean }) {
  if (!member) return 0
  return member.photoSaved && member.aboutPending ? 4 : member.detailsSaved ? 2 : 1
}
export function validateOnboardingAbout(bio: unknown, interests: unknown): { error: string } | { bio: string; interests: string[] } {
  if (typeof bio !== 'string' || !bio.trim() || Array.from(bio.trim()).length > 500)
    return { error: 'Write a short bio using 1 to 500 characters.' }
  if (!Array.isArray(interests) || interests.length < 3 || interests.length > 20 ||
    interests.some(item => typeof item !== 'string' || !INTERESTS.includes(item)) || new Set(interests).size !== interests.length)
    return { error: 'Choose at least 3 different interests.' }
  return { bio: bio.trim(), interests }
}
