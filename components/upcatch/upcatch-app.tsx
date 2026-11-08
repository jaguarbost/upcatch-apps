'use client'

import styles from './desktop.module.css'
import { BrandBadge } from './brand-badge'
import { AlertsButton, MessagesButton } from './alerts-button'
import { LocationPermission } from './location-permission'
import { InstallAppProvider } from '@/components/account/install-app'
import { HowItWorksProvider } from './how-it-works'

import dynamic from 'next/dynamic'
import type { LiveBootstrap } from '@/lib/live-model'
import { NEARBY_BLOBS, VENUES, venueById } from '@/lib/upcatch-data'
import { ActivityScreen } from './activity-screen'
import { UpCatchProvider, useUpCatch, useVenueLookup } from './app-provider'
import { BottomNav } from './bottom-nav'
import { CreateFlow, venuesForIntent } from './create-flow'
import { FriendAlert } from './friend-alert'
import { FriendsSheet } from './friends-sheet'
import { LiveFriendsSheet } from './live-friends-sheet'
import { LiveMeetup } from './live-meetup'
import type { MapMode } from './map-canvas'
import { MapHome } from './map-home'
import { MeetupsScreen, WallScreen } from './meetups-screen'
import { MessagesScreen } from './messages-screen'
import { NudgeFriendsScreen } from './nudge-friends-screen'
import { Onboarding } from './onboarding'
import { ProfileScreen } from './profile-screen'
import { PushOptInPrompt } from './push-opt-in-prompt'
import { MatchOverlay, RatingScreen, ScheduledPairOverlay } from './rating-screen'
import { WaitingPanel } from './waiting-panel'

const MapCanvas = dynamic(() => import('./map-canvas'), {
  ssr: false,
  loading: () => <div className="uc-skeleton size-full rounded-none" aria-label="Loading map" />,
})

export function UpCatchApp({ initial }: { initial?: LiveBootstrap }) {
  return (
    <UpCatchProvider initial={initial}>
      <InstallAppProvider><HowItWorksProvider>
      <div className="flex min-h-dvh justify-center bg-secondary p-0 lg:p-4 has-[.uc-landing]:bg-background has-[.uc-landing]:p-0">
        <div className={`${styles.app} relative h-dvh w-full overflow-hidden bg-background shadow-none lg:h-[calc(100dvh-2rem)] lg:max-w-[1440px] lg:rounded-[2rem] lg:shadow-2xl has-[.uc-landing]:h-dvh has-[.uc-landing]:max-w-none has-[.uc-landing]:rounded-none has-[.uc-landing]:shadow-none`}>
          <Shell />
          <AppToast />
        </div>
      </div>
      </HowItWorksProvider></InstallAppProvider>
    </UpCatchProvider>
  )
}

function Shell() {
  const { state, actions } = useUpCatch()
  const lookupVenue=useVenueLookup()

  if (!state.onboarded) return <Onboarding />

  const picking = state.createStep === 3
  const inJourney = state.phase === 'live' || state.phase === 'arrived'
  const mode: MapMode = picking
    ? 'pick'
    : inJourney
      ? 'live'
      : state.phase === 'hosting'
        ? 'hosting'
        : state.phase === 'free'
          ? 'free'
          : 'explore'

  const hostVenue = state.hosting?.venueId ? [lookupVenue(state.hosting.venueId)] : []
  const venues = state.liveVenues ?? (picking ? venuesForIntent(state.draft.intent) : mode === 'hosting' ? hostVenue : VENUES)
  const showMapUi = state.tab === 'map' && !picking

  return (
    <>
      <div className="absolute inset-0 z-0">
        <MapCanvas
          recenterKey={state.recenterKey}
          center={state.locationCenter}
          hideUserLocation={Boolean(state.live && !state.locationCenter)}
          mode={mode}
          userPhoto={state.user.photo ?? '/people/alex.png'}
          venues={venues.filter(v=>v.position.every(Number.isFinite))}
          selectedVenueId={picking ? state.draft.venueId : state.hosting?.venueId}
          onSelectVenue={(id) => actions.updateDraft({ venueId: id })}
          radiusKm={picking ? state.draft.radiusKm : (state.hosting?.radiusKm ?? 1)}
          blobs={state.live ? [] : NEARBY_BLOBS}
          live={
            !state.live && inJourney && state.meetup
              ? {
                  venue: lookupVenue(state.meetup.venueId),
                  meProgress: state.progress.me,
                }
              : undefined
          }
        />
      </div>

      {showMapUi && (state.phase === 'idle' || state.phase === 'free') && <MapHome />}
      {showMapUi && state.phase === 'hosting' && <WaitingPanel />}
      {showMapUi && inJourney && <LiveMeetup />}

      {state.tab === 'messages' && !picking && <MessagesScreen />}
      {state.tab === 'activity' && !picking && <ActivityScreen />}
      {state.tab === 'meetups' && !picking && <MeetupsScreen />}
      {state.tab === 'wall' && !picking && <WallScreen />}
      {state.tab === 'profile' && !picking && <ProfileScreen />}
      {state.tab === 'nudges' && !picking && <NudgeFriendsScreen />}

      {state.createStep > 0 && <CreateFlow />}
      {state.createStep === 0 && state.phase !== 'rating' && <BottomNav />}
      {state.phase === 'rating' && <RatingScreen />}
      {state.tab==='map' && inJourney && state.createStep===0 && <div className="absolute left-4 top-[max(env(safe-area-inset-top),1rem)] z-35 hidden lg:block"><BrandBadge /></div>}
      {state.createStep===0 && state.phase!=='rating' && <><MessagesButton /><AlertsButton /></>}
      <MatchOverlay />
      <ScheduledPairOverlay />
      {state.live && state.locationPrompt && <LocationPermission />}
      {state.friendsSheet && (state.live ? <LiveFriendsSheet key={state.friendsSheet.mode} /> : <FriendsSheet key={`${state.friendsSheet.mode}-${state.friendsSheet.target.id}`} />)}
      {state.tab === 'map' && !state.friendsSheet && <FriendAlert />}
      <PushOptInPrompt />


    </>
  )
}

function AppToast(){
 const {state}=useUpCatch()
 return <>      {state.toast && (
        <div
          role="status"
          className="absolute inset-x-4 top-[max(env(safe-area-inset-top),1rem)] z-[70] rounded-2xl bg-foreground px-4 py-3 text-center text-sm font-semibold text-background shadow-xl animate-in fade-in slide-in-from-top-4"
        >
          {state.toast}
        </div>
      )}</>
}
