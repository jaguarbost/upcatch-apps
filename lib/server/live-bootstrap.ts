import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LiveBootstrap } from '@/lib/live-model'

type MemberProfile = {
  id: string
  display_name: string
  photo_path: string | null
  home_city_id: string | null
  onboarding_completed_at: string | null
}

// Keep web and native bootstrap data aligned without touching the approved UI.
export async function loadLiveBootstrap(supabase: SupabaseClient, profile: MemberProfile): Promise<LiveBootstrap> {
  const { data: city } = profile.home_city_id
    ? await supabase.from('cities').select('id,name,latitude,longitude,timezone').eq('id', profile.home_city_id).single()
    : await supabase.from('cities').select('id,name,latitude,longitude,timezone').eq('slug', 'manchester').eq('status', 'active').single()
  if (!city) throw new Error('Your city is unavailable.')

  const [venueResult, photoResult, accessResult, preferenceResult, birthResult] = await Promise.all([
    supabase.from('venues').select('id,name,address,latitude,longitude,status').eq('city_id', city.id).in('status', ['listed', 'approved']).order('name'),
    profile.photo_path ? supabase.storage.from('profile-photos').createSignedUrl(profile.photo_path, 3600) : Promise.resolve({ data: null }),
    supabase.rpc('my_meetup_access'),
    supabase.from('notification_preferences').select('push_enabled').eq('user_id', profile.id).maybeSingle(),
    supabase.rpc('my_birth_eligibility'),
  ])
  if (venueResult.error) throw new Error('Venues could not be loaded.')
  if (birthResult.error) throw new Error('Birth eligibility is unavailable. Check database migrations.')

  return {
    memberId: profile.id,
    pushEnabled: preferenceResult.data?.push_enabled ?? false,
    name: profile.display_name,
    photo: photoResult.data?.signedUrl ?? null,
    completed: Boolean(profile.onboarding_completed_at && birthResult.data),
    detailsSaved: Boolean(birthResult.data && profile.display_name),
    cityId: city.id,
    cityName: city.name,
    timezone: city.timezone,
    center: [city.latitude, city.longitude],
    idApproved: accessResult.data?.[0]?.id_status === 'approved',
    completedMeetups: accessResult.data?.[0]?.completed_meetups ?? 0,
    venues: (venueResult.data ?? []).map(venue => ({
      id: venue.id,
      name: venue.name,
      address: venue.address,
      kind: 'restaurant' as const,
      kindLabel: 'Restaurant',
      position: [venue.latitude ?? NaN, venue.longitude ?? NaN] as [number, number],
      image: '/venues/bistro.png',
      walkMin: 0,
      driveMin: 0,
      distanceKm: 0,
      safety: venue.status === 'approved' ? 'Reviewed public venue' : 'Public venue · review pending',
      intents: ['coffee', 'lunch', 'walk', 'drink'] as const,
      verified: venue.status === 'approved',
    })),
  }
}
