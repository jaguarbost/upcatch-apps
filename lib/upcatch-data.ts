import {
  Briefcase,
  Coffee,
  Compass,
  Footprints,
  MessageCircle,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from 'lucide-react'

export type LatLng = [number, number]

export type IntentId = 'coffee' | 'walk' | 'lunch' | 'drink' | 'networking' | 'explore' | 'chat'

export interface Intent {
  id: IntentId
  label: string
  icon: LucideIcon
  blurb: string
}

export const INTENTS: Intent[] = [
  { id: 'coffee', label: 'Coffee', icon: Coffee, blurb: 'Quick flat white' },
  { id: 'walk', label: 'Walk', icon: Footprints, blurb: 'Stretch the legs' },
  { id: 'lunch', label: 'Dine', icon: UtensilsCrossed, blurb: 'Grab a bite' },
  { id: 'drink', label: 'Drink', icon: Wine, blurb: 'One after work' },
  { id: 'networking', label: 'Networking', icon: Briefcase, blurb: 'Talk shop' },
  { id: 'explore', label: 'Explore', icon: Compass, blurb: 'See somewhere new' },
  { id: 'chat', label: 'Just Chat', icon: MessageCircle, blurb: 'Good conversation' },
]

export const intentById = (id: IntentId) => INTENTS.find((i) => i.id === id) ?? INTENTS[0]

export type VenueKind = 'cafe' | 'park' | 'restaurant' | 'bar' | 'lounge'

export interface Venue {
  id: string
  name: string
  kind: VenueKind
  kindLabel: string
  address: string
  position: LatLng
  image: string
  walkMin: number
  driveMin: number
  distanceKm: number
  safety: string
  intents: IntentId[]
  verified: boolean
}

export const VENUES: Venue[] = [
  {
    id: 'kin',
    name: 'Kin & Grain Coffee',
    kind: 'cafe',
    kindLabel: 'Café',
    address: '14 Brewer St, Soho',
    position: [51.5142, -0.1327],
    image: '/venues/cafe.png',
    walkMin: 4,
    driveMin: 2,
    distanceKm: 0.3,
    safety: 'Busy · staff on site · well lit',
    intents: ['coffee', 'chat', 'networking'],
    verified: true,
  },
  {
    id: 'golden',
    name: 'Golden Square Gardens',
    kind: 'park',
    kindLabel: 'Public square',
    address: 'Golden Square, Soho',
    position: [51.5118, -0.1368],
    image: '/venues/park.png',
    walkMin: 3,
    driveMin: 2,
    distanceKm: 0.2,
    safety: 'Open public space · CCTV',
    intents: ['walk', 'explore', 'chat', 'coffee'],
    verified: true,
  },
  {
    id: 'common',
    name: 'Common Table Bistro',
    kind: 'restaurant',
    kindLabel: 'Restaurant',
    address: '22 Old Compton St',
    position: [51.5123, -0.1312],
    image: '/venues/bistro.png',
    walkMin: 6,
    driveMin: 3,
    distanceKm: 0.45,
    safety: 'Communal tables · busy at lunch',
    intents: ['lunch', 'networking', 'chat'],
    verified: true,
  },
  {
    id: 'marlow',
    name: 'Marlow Wine Room',
    kind: 'bar',
    kindLabel: 'Bar',
    address: '8 Beak St, Soho',
    position: [51.5151, -0.1376],
    image: '/venues/bistro.png',
    walkMin: 5,
    driveMin: 3,
    distanceKm: 0.4,
    safety: 'Door staff · verified partner',
    intents: ['drink', 'networking', 'chat'],
    verified: true,
  },
  {
    id: 'soho-sq',
    name: 'Soho Square',
    kind: 'park',
    kindLabel: 'Public park',
    address: 'Soho Square, W1D',
    position: [51.5155, -0.1318],
    image: '/venues/park.png',
    walkMin: 7,
    driveMin: 4,
    distanceKm: 0.55,
    safety: 'Open public park · daylight',
    intents: ['walk', 'explore', 'chat'],
    verified: true,
  },
  {
    id: 'workroom',
    name: 'The Workroom Lounge',
    kind: 'lounge',
    kindLabel: 'Co-work café',
    address: '3 Rupert St',
    position: [51.5106, -0.1336],
    image: '/venues/cafe.png',
    walkMin: 5,
    driveMin: 3,
    distanceKm: 0.35,
    safety: 'Reception · staffed 8am–10pm',
    intents: ['networking', 'coffee', 'lunch'],
    verified: true,
  },
]

export const venueById = (id: string) => VENUES.find((v) => v.id === id) ?? VENUES[0]

export interface Person {
  id: string
  name: string
  initials: string
  age: number
  photo: string
  bio: string
  interests: string[]
  distanceKm: number
  approx: LatLng
  walkMin: number
  driveMin: number
  rating: number
  showUpPercent?: number | null
  ratingReceived?: number | null
  meetups: number
  verified: { id: boolean; photo: boolean; phone: boolean }
  compatibility: number
  lookFor: string
}

export const PEOPLE: Person[] = [
  {
    id: 'maya',
    name: 'Maya',
    initials: 'MR',
    age: 28,
    photo: '/people/maya.png',
    bio: 'Product designer, between meetings',
    interests: ['Design', 'Coffee', 'Film', 'Running'],
    distanceKm: 0.6,
    approx: [51.5172, -0.1292],
    walkMin: 8,
    driveMin: 4,
    rating: 4.9,
    meetups: 23,
    verified: { id: true, photo: true, phone: true },
    compatibility: 92,
    lookFor: 'Denim jacket, by the window',
  },
  {
    id: 'jordan',
    name: 'Jordan',
    initials: 'JK',
    age: 31,
    photo: '/people/jordan.png',
    bio: 'Founder, new to Soho',
    interests: ['Startups', 'Coffee', 'Jazz', 'Cycling'],
    distanceKm: 0.9,
    approx: [51.5093, -0.1402],
    walkMin: 11,
    driveMin: 5,
    rating: 4.8,
    meetups: 12,
    verified: { id: true, photo: true, phone: true },
    compatibility: 86,
    lookFor: 'Grey sweater, near the counter',
  },
  {
    id: 'priya',
    name: 'Priya',
    initials: 'PS',
    age: 32,
    photo: '/people/priya.png',
    bio: 'Strategy consultant, loves a long walk',
    interests: ['Design', 'Books', 'Running', 'Startups'],
    distanceKm: 0.5,
    approx: [51.5166, -0.1402],
    walkMin: 7,
    driveMin: 4,
    rating: 5.0,
    meetups: 41,
    verified: { id: true, photo: true, phone: true },
    compatibility: 94,
    lookFor: 'Cream blazer, outside',
  },
  {
    id: 'sam',
    name: 'Sam',
    initials: 'SO',
    age: 26,
    photo: '/people/sam.png',
    bio: 'Music producer on a break',
    interests: ['Music', 'Film', 'Coffee', 'Photography'],
    distanceKm: 0.8,
    approx: [51.5098, -0.129],
    walkMin: 10,
    driveMin: 5,
    rating: 4.7,
    meetups: 8,
    verified: { id: true, photo: true, phone: false },
    compatibility: 81,
    lookFor: 'Navy overshirt, headphones',
  },
]

export const personById = (id: string) => PEOPLE.find((p) => p.id === id) ?? PEOPLE[0]

/** Approximate blobs of other free people — intentionally jittered, never exact. */
export const NEARBY_BLOBS: { id: string; initials: string; position: LatLng }[] = [
  { id: 'b1', initials: 'MR', position: [51.5168, -0.1298] },
  { id: 'b2', initials: 'JK', position: [51.5096, -0.1396] },
  { id: 'b3', initials: 'PS', position: [51.5162, -0.1398] },
  { id: 'b4', initials: 'SO', position: [51.5101, -0.1294] },
  { id: 'b5', initials: 'LT', position: [51.5139, -0.1418] },
  { id: 'b6', initials: 'AN', position: [51.5176, -0.1352] },
]

export const INTERESTS = [
  'Coffee',
  'Design',
  'Startups',
  'Running',
  'Film',
  'Books',
  'Music',
  'Photography',
  'Food',
  'Tech',
  'Art',
  'Cycling',
  'Jazz',
  'Travel',
  'Languages',
  'Yoga',
]

export const ME_APPROX: LatLng = [51.5131, -0.1352]

export interface Offer {
  person: Person
  intent: IntentId
  venueId: string
  durationMin: number
  startsInMin: number
  note: string
}

export const INCOMING_OFFERS: Offer[] = [
  {
    person: personById('maya'),
    intent: 'coffee',
    venueId: 'kin',
    durationMin: 30,
    startsInMin: 10,
    note: 'Have 30 mins before my next call — would love a design chat.',
  },
  {
    person: personById('jordan'),
    intent: 'walk',
    venueId: 'golden',
    durationMin: 45,
    startsInMin: 12,
    note: 'New to the area, keen to explore a bit.',
  },
]

export interface OpenUpCatch {
  id: string
  host: Person
  intent: IntentId
  venueId: string
  durationMin: number
  startsInMin: number
  note: string
}

export const OPEN_UPCATCHES: OpenUpCatch[] = [
  {
    id: 'o1',
    host: personById('priya'),
    intent: 'walk',
    venueId: 'soho-sq',
    durationMin: 40,
    startsInMin: 8,
    note: 'Lunch-break loop around the square.',
  },
  {
    id: 'o2',
    host: personById('jordan'),
    intent: 'networking',
    venueId: 'workroom',
    durationMin: 45,
    startsInMin: 15,
    note: 'Swap startup war stories?',
  },
  {
    id: 'o3',
    host: personById('sam'),
    intent: 'coffee',
    venueId: 'kin',
    durationMin: 30,
    startsInMin: 5,
    note: 'Need a caffeine break from the studio.',
  },
  {
    id: 'o4',
    host: personById('maya'),
    intent: 'lunch',
    venueId: 'common',
    durationMin: 60,
    startsInMin: 20,
    note: 'Their lunch special is great.',
  },
]

export function sharedInterests(a: string[], b: string[]) {
  const set = new Set(a.map((x) => x.toLowerCase()))
  return b.filter((x) => set.has(x.toLowerCase()))
}

export function clockIn(minutes: number) {
  const d = new Date(Date.now() + minutes * 60_000)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
