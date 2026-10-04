'use client'

import { Camera, Check, ChevronDown, ChevronLeft, MapPin, ScanFace, ShieldCheck, Smartphone } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { OnboardingPermissions } from '@/components/account/onboarding-permissions'
import { saveDetails, uploadPhoto } from '@/app/onboarding/actions'
import { prepareProfilePhoto } from '@/lib/prepare-profile-photo'
import { haptic } from '@/lib/haptics'
import { INTERESTS, PEOPLE } from '@/lib/upcatch-data'
import { cn } from '@/lib/utils'
import { useUpCatch } from './app-provider'
import { LogoMark } from './brand-badge'
import { LandingStory } from './landing-story'
import { Chip, PrimaryButton, Skeleton } from './primitives'

const STEPS = ['welcome', 'name', 'photo', 'interests', 'verify', 'location'] as const

export function Onboarding() {
  const { state, actions } = useUpCatch()
  const live = state.live
  const [step, setStep] = useState(live ? (live.detailsSaved ? 2 : 1) : 0)
  const [name, setName] = useState(live?.name ?? '')
  const [birthMonth,setBirthMonth]=useState('')
  const [birthYear,setBirthYear]=useState('')
  const age = birthMonth && birthYear ? new Date().getFullYear()-Number(birthYear)-(new Date().getMonth()+1<=Number(birthMonth)?1:0) : 0
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [interests, setInterests] = useState<string[]>(['Coffee', 'Design'])
  const [verify, setVerify] = useState<'idle' | 'scanning' | 'done'>('idle')
  const [locating, setLocating] = useState(false)

  const fileInput=useRef<HTMLInputElement>(null)
  const cameraInput=useRef<HTMLInputElement>(null)
  const photoSelection=useRef(0)
  const savingRef=useRef(false)
  const [photoFile,setPhotoFile]=useState<File|null>(null)
  const [saving,setSaving]=useState(false)
  const [saveError,setSaveError]=useState('')
  async function selectPhoto(file?:File){
    if(!file||savingRef.current)return
    const selection=++photoSelection.current
    setSaveError('');setPhotoLoading(true)
    try{
      const prepared=await prepareProfilePhoto(file)
      if(selection===photoSelection.current)setPhotoFile(prepared)
    }catch(error){if(selection===photoSelection.current)setSaveError(error instanceof Error?error.message:'This photo could not be prepared. Please choose another.')}
    finally{if(selection===photoSelection.current)setPhotoLoading(false)}
  }
  useEffect(()=>{
    if(!photoFile)return
    const url=URL.createObjectURL(photoFile);setPhoto(url)
    return()=>URL.revokeObjectURL(url)
  },[photoFile])
  const current = live ? (['welcome','name','permissions','photo'] as const)[step] : STEPS[step]
  const next = async () => {
    if(live){
      if(savingRef.current||photoLoading)return
      savingRef.current=true
      setSaving(true);setSaveError('')
      try{
        const form=new FormData()
        if(step===1){
          form.set('birthMonth',birthMonth);form.set('birthYear',birthYear);form.set('name',name);form.set('city',live.cityId)
          const result=await saveDetails({},form)
          if(result?.error){setSaveError(result.error);return}
          setStep(2)

        }else if(step===3&&photoFile){
          form.set('photo',photoFile)
          const result=await uploadPhoto({},form)
          if(result?.error)setSaveError(result.error)
          else if(result?.message)window.location.assign('/')
        }
      }catch{setSaveError(step===3?'We could not confirm the photo was saved. Your selected photo is still here; please retry.':'Your details could not be saved. Please retry.')}finally{savingRef.current=false;setSaving(false)}
      return
    }
    if(step===1&&(!birthMonth||!birthYear||age<18)){actions.showToast('UpCatch is for people aged 18 and over. Enter your birth month and year.');return}
    haptic('tap')
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }
  const back = () => {if(saving||photoLoading)return;setSaveError('');setStep((s) => Math.max(live ? (live.detailsSaved?2:1) : 0, s - 1))}

  const finish = () => {
    setLocating(true)
    window.setTimeout(() => {
      actions.completeOnboarding({
        name: name.trim() || 'Alex',
        age,
        photo: photo ?? '/people/alex.png',
        interests,
      })
    }, 900)
  }

  if (current === 'welcome') {
    return (
      <main className="uc-landing h-full overflow-y-auto bg-background pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="flex w-full flex-col">
          <header className="flex items-center justify-between border-b border-border/60 px-6 py-5 lg:px-[6vw] lg:py-6">
            <Link href="/" className="flex items-center gap-3 font-display text-2xl font-extrabold tracking-tight"><LogoMark size={38} /><span><span className="text-live">Up</span><span className="text-primary">Catch</span><span className="text-foreground">.</span></span></Link>
            <nav aria-label="Landing navigation" className="flex items-center gap-5 text-sm font-semibold lg:gap-8">
              <a href="#why" className="hidden text-muted-foreground hover:text-primary sm:block">Our story</a>
              <Link href="/auth/login" className="hover:text-primary">Log in</Link>
              <Link href="/auth/signup" className="press rounded-full bg-primary px-5 py-3 text-primary-foreground">Join UpCatch</Link>
            </nav>
          </header>
          <section className="flex min-h-[80dvh] flex-col lg:grid lg:min-h-[calc(100dvh-90px)] lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-8 lg:px-[6vw] lg:py-12">
            <div className="relative flex flex-1 items-center justify-center overflow-hidden lg:order-2 lg:aspect-square lg:max-h-[720px] lg:flex-none lg:rounded-[3rem] lg:bg-primary/5">
              <RingsHero />
            </div>
            <div className="flex flex-col gap-5 px-6 pb-8 lg:order-1 lg:gap-8 lg:px-0 lg:pb-0">
              <div className="flex flex-col gap-2 lg:gap-4">
                <p className="flex items-center gap-2 self-start rounded-full bg-primary/10 px-4 py-2 text-xs font-bold tracking-wide text-primary uppercase"><MapPin className="size-3.5" aria-hidden="true" /> Starting in Manchester</p>
                <h1 className="font-display text-4xl leading-[1.05] font-extrabold text-balance lg:text-[clamp(3.75rem,5.5vw,6.75rem)] lg:tracking-[-0.045em]">
                  Your next friend<br className="hidden lg:block" /> is closer than<br className="hidden lg:block" /> you think.
                </h1>
                <p className="leading-relaxed text-pretty text-muted-foreground lg:max-w-md lg:text-lg">
                  Make room for a coffee, a conversation, and someone new. Meet people nearby who want to get out into the real world.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/auth/signup" className="press flex h-16 items-center justify-center rounded-2xl bg-primary px-8 font-display text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20">Find your people</Link>
              <a
                href="#why"
                className="press flex items-center justify-center gap-2 self-center rounded-full bg-card px-5 py-3 text-sm font-semibold shadow-sm lg:self-start"
              >
                See how it works
                <ChevronDown className="size-4" aria-hidden="true" />
              </a>
              </div>
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground lg:justify-start">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                Verified people · Public venues · Approx. location only
              </p>
            </div>
          </section>

          <div className="mx-auto w-full max-w-[1440px] scroll-mt-8 px-6 pt-16 lg:px-[6vw] lg:pt-24">
            <LandingStory />
          </div>

          <section aria-labelledby="cta-title" className="mt-20 flex flex-col items-center gap-5 bg-primary/5 px-6 py-16 text-center lg:mt-28 lg:gap-7 lg:px-[6vw] lg:py-24">
            <h2 id="cta-title" className="font-display text-4xl leading-[1.05] font-extrabold text-balance lg:text-6xl">
              Put the phone down. Go catch someone.
            </h2>
            <div className="flex w-full flex-col gap-3 lg:max-w-md">
              <Link
                href="/auth/signup"
                className="press flex h-16 items-center justify-center gap-2 rounded-2xl bg-primary px-6 font-display text-lg font-bold text-primary-foreground shadow-lg shadow-primary/30"
              >
                Create free account
              </Link>
              <PrimaryButton onClick={next} variant="soft" className="w-full">
                Preview the app
              </PrimaryButton>
            </div>
            <p className="text-sm text-muted-foreground">
              Already a member?{' '}
              <Link href="/auth/login" className="font-semibold text-primary underline-offset-4 hover:underline">
                Log in
              </Link>
            </p>
          </section>
        </div>
        <nav aria-label="Join UpCatch" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur">
          <div className="mx-auto flex w-full max-w-md gap-3">
            <Link href="/auth/signup" className="press flex h-12 flex-1 items-center justify-center rounded-2xl bg-primary px-5 font-display font-bold text-primary-foreground shadow-lg shadow-primary/20">Sign up</Link>
            <Link href="/auth/login" className="press flex h-12 flex-1 items-center justify-center rounded-2xl bg-secondary px-5 font-display font-bold text-foreground">Sign in</Link>
          </div>
        </nav>
      </main>
    )
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-lg flex-col bg-background lg:py-6">
      <header className="flex items-center gap-3 px-4 pt-4">
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="press grid size-11 place-items-center rounded-full bg-card shadow-sm"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={live ? 3 : 5} aria-valuenow={step}>
          {(live ? ['name','permissions','photo'] : STEPS.slice(1)).map((s, i) => (
            <span
              key={s}
              className={cn('h-1.5 flex-1 rounded-full transition-colors duration-300', i < step ? 'bg-primary' : 'bg-muted')}
            />
          ))}
        </div>
        <span className="w-11 text-right text-sm font-semibold text-muted-foreground tabular-nums">{step}/{live ? 3 : 5}</span>
      </header>

      <div key={current} className="flex flex-1 flex-col overflow-y-auto px-6 pt-8 animate-in fade-in slide-in-from-right-6 duration-300">
        {current === 'name' && (
          <StepShell title="First, what should people call you?" hint="Only your first name and initials are shown.">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-muted-foreground">First name</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && name.trim()) next()
                }}
                placeholder="Alex"
                autoComplete="given-name"
                className="h-16 rounded-2xl border-2 border-transparent bg-card px-5 font-display text-2xl font-bold outline-none focus:border-primary"
              />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-muted-foreground">Birth month and year</span>
              <div className="flex gap-3 rounded-2xl bg-card p-2">
                <label className="flex-1 text-sm"><span className="sr-only">Birth month</span><select aria-label="Birth month" value={birthMonth} onChange={e=>setBirthMonth(e.target.value)} className="h-14 w-full rounded-xl bg-muted px-3 font-semibold"><option value="">Month</option>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{new Date(2000,i,1).toLocaleString('en-GB',{month:'long'})}</option>)}</select></label>
                <label className="flex-1 text-sm"><span className="sr-only">Birth year</span><input aria-label="Birth year" type="number" inputMode="numeric" placeholder="Year" min={1900} max={new Date().getFullYear()} value={birthYear} onChange={e=>setBirthYear(e.target.value)} className="h-14 w-full rounded-xl bg-muted px-3 font-semibold"/></label>
              </div>
              <p className="text-sm text-muted-foreground">UpCatch is 18+. Eligibility begins the month after your 18th birthday month. Your birth details stay private. <Link href="/privacy" className="text-primary underline">Privacy notice</Link></p>
            </div>
          </StepShell>
        )}

        {current === 'permissions' && <StepShell title="Find your people nearby" hint="One quick step to find your area."><OnboardingPermissions onLocation={()=>setStep(3)}/></StepShell>}
        {current === 'photo' && (
          <StepShell title="Add a clear photo" hint="A real, recent face photo helps people recognise you at the venue.">
            {live && <>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose profile photo" onChange={e=>{void selectPhoto(e.target.files?.[0]);e.target.value=''}}/>
              <input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="sr-only" aria-label="Take a profile photo" onChange={e=>{void selectPhoto(e.target.files?.[0]);e.target.value=''}}/>
            </>}
            <button
              type="button"
              onClick={() => {
                if(live){if(!saving&&!photoLoading)fileInput.current?.click();return}
                haptic('select')
                setPhotoLoading(true)
                window.setTimeout(() => {
                  setPhoto('/people/alex.png')
                  setPhotoLoading(false)
                  haptic('success')
                }, 900)
              }}
              className="press relative mx-auto grid size-56 place-items-center overflow-hidden rounded-full bg-card shadow-sm"
              aria-label={photo ? 'Change photo' : 'Add photo'}
            >
              {photoLoading ? (
                <Skeleton className="size-full rounded-full" />
              ) : photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo || '/placeholder.svg'} alt="Your profile photo" className="size-full object-cover uc-pop" />
              ) : (
                <span className="flex flex-col items-center gap-3 text-muted-foreground">
                  <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Camera className="size-7" aria-hidden="true" />
                  </span>
                  <span className="font-semibold">Tap to add</span>
                </span>
              )}
            </button>
<button type="button" hidden={!live} disabled={saving||photoLoading} onClick={()=>cameraInput.current?.click()} className="self-center text-sm font-semibold text-primary disabled:opacity-50">Take a photo instead</button>
            {photo && (
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-primary">
                <Check className="size-4" aria-hidden="true" /> {live ? 'Photo selected' : 'Face detected · looks great'}
              </p>
            )}
          </StepShell>
        )}

        {current === 'interests' && (
          <StepShell title="What are you into?" hint="Pick 3 or more. We use these to suggest great matches.">
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((i) => (
                <Chip
                  key={i}
                  active={interests.includes(i)}
                  onClick={() => setInterests((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))}
                >
                  {interests.includes(i) && <Check className="size-4" aria-hidden="true" />}
                  {i}
                </Chip>
              ))}
            </div>
          </StepShell>
        )}

        {current === 'verify' && (
          <StepShell title="Quick verification" hint="Everyone on UpCatch is a verified, real person. Takes 3 seconds.">
            <div className="relative mx-auto grid size-56 place-items-center overflow-hidden rounded-[2.5rem] bg-foreground">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo ?? '/people/alex.png'}
                alt=""
                className={cn('size-full object-cover transition-opacity', verify === 'idle' ? 'opacity-40' : 'opacity-90')}
              />
              {verify === 'scanning' && (
                <span className="absolute inset-x-6 h-1 animate-[uc-float_1s_ease-in-out_infinite] rounded-full bg-live shadow-[0_0_24px_4px_var(--live)]" />
              )}
              <span className="absolute inset-6 rounded-[2rem] border-2 border-dashed border-live/80" aria-hidden="true" />
              {verify === 'done' && (
                <span className="uc-pop absolute grid size-20 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-10" strokeWidth={3} aria-hidden="true" />
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              <VerifyRow icon={<ScanFace className="size-5" />} label="Live selfie match" done={verify === 'done'} />
              <VerifyRow icon={<Smartphone className="size-5" />} label="Phone number" done />
              <VerifyRow icon={<ShieldCheck className="size-5" />} label="Age 18+ confirmed" done={verify === 'done'} />
            </ul>
          </StepShell>
        )}

        {current === 'location' && (
          <StepShell title="Show what’s nearby" hint="UpCatch only ever uses your approximate area. Nobody sees where you are — only the public venue you agree on.">
            <div className="relative mx-auto grid size-60 place-items-center">
              <span className="absolute inset-0 rounded-full bg-primary/10" />
              <span className="absolute inset-8 rounded-full border-2 border-dashed border-primary/40" />
              <span className="absolute inset-16 rounded-full bg-primary/15 blur-sm" />
              <span className="relative grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/40">
                <MapPin className="size-7" aria-hidden="true" />
              </span>
              <span className="absolute bottom-2 rounded-full bg-card px-3 py-1 text-xs font-bold shadow-sm">~300 m fuzzy zone</span>
            </div>
          </StepShell>
        )}
      </div>

      <footer className="flex flex-col gap-3 px-6 pt-4 pb-8">
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        {current === 'name' && (
          <PrimaryButton onClick={next} disabled={!name.trim() || saving} className="w-full">
            Continue
          </PrimaryButton>
        )}
        {current === 'photo' && (
          <PrimaryButton onClick={next} disabled={!photo || saving || photoLoading} className="w-full">
            {saving?'Saving your photo?':photoLoading?'Preparing your photo?':live?'Save photo and finish':'Continue'}
          </PrimaryButton>
        )}
        {current === 'interests' && (
          <PrimaryButton onClick={next} disabled={interests.length < 3} className="w-full">
            {interests.length < 3 ? `Pick ${3 - interests.length} more` : 'Continue'}
          </PrimaryButton>
        )}
        {current === 'verify' &&
          (verify === 'done' ? (
            <PrimaryButton onClick={next} className="w-full">
              Continue
            </PrimaryButton>
          ) : (
            <PrimaryButton
              onClick={() => {
                setVerify('scanning')
                window.setTimeout(() => {
                  setVerify('done')
                  haptic('success')
                }, 1600)
              }}
              disabled={verify === 'scanning'}
              className="w-full"
            >
              {verify === 'scanning' ? 'Scanning…' : 'Verify me'}
            </PrimaryButton>
          ))}
        {current === 'location' && (
          <PrimaryButton onClick={finish} disabled={locating} className="w-full">
            {locating ? 'Finding your area…' : 'Allow approximate location'}
          </PrimaryButton>
        )}
      </footer>
    </main>
  )
}

function StepShell({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-3xl leading-tight font-extrabold text-balance">{title}</h2>
        <p className="leading-relaxed text-pretty text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  )
}

function VerifyRow({ icon, label, done }: { icon: React.ReactNode; label: string; done: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card p-3">
      <span className="grid size-10 place-items-center rounded-xl bg-muted" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 font-semibold">{label}</span>
      <span
        className={cn(
          'grid size-7 place-items-center rounded-full transition-colors',
          done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        <Check className="size-4" aria-hidden="true" />
        <span className="sr-only">{done ? 'Done' : 'Pending'}</span>
      </span>
    </li>
  )
}

function RingsHero() {
  const spots = [
    { p: PEOPLE[0], x: '72%', y: '18%', s: 64 },
    { p: PEOPLE[1], x: '14%', y: '32%', s: 56 },
    { p: PEOPLE[2], x: '78%', y: '66%', s: 58 },
    { p: PEOPLE[3], x: '22%', y: '78%', s: 50 },
  ]
  return (
    <div className="relative aspect-square w-[118%] max-w-none">
      {[92, 66, 40].map((size) => (
        <span
          key={size}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-primary/25"
          style={{ width: `${size}%`, height: `${size}%` }}
          aria-hidden="true"
        />
      ))}
      <span className="uc-ping is-live" aria-hidden="true" />
      <span className="uc-ping is-live" aria-hidden="true" />
      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        <span className="grid size-24 place-items-center rounded-full bg-live font-display text-lg font-extrabold text-live-foreground shadow-xl shadow-live/50">
          You
        </span>
      </div>
      {spots.map(({ p, x, y, s }, i) => (
        <div
          key={p.id}
          className="uc-float absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: x, top: y, animationDelay: `${i * 0.5}s` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.photo || '/placeholder.svg'}
            alt=""
            width={s}
            height={s}
            className="rounded-full border-4 border-card object-cover shadow-lg"
            style={{ width: s, height: s }}
          />
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-background">
            ~{p.distanceKm} km
          </span>
        </div>
      ))}
    </div>
  )
}
