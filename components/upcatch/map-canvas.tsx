'use client'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { Briefcase, Coffee, Trees, UtensilsCrossed, Wine } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import { ME_APPROX, type LatLng, type Venue, type VenueKind } from '@/lib/upcatch-data'

export type MapMode = 'explore' | 'free' | 'pick' | 'hosting' | 'live'

export interface MapCanvasProps {
  partner?:{position:LatLng;initials:string;updatedAt:string|null}|null
  recenterKey?:number
  center?: LatLng
  hideUserLocation?: boolean
  mode: MapMode
  userPhoto: string
  venues: Venue[]
  selectedVenueId?: string | null
  onSelectVenue?: (id: string) => void
  radiusKm: number
  blobs: { id: string; initials: string; position: LatLng }[]
  live?: {
    venue: Venue
    themStart: LatLng
    themInitials: string
    meProgress: number
    themProgress: number
  }
}

const KIND_ICON: Record<VenueKind, string> = {
  cafe: renderToStaticMarkup(<Coffee size={14} strokeWidth={2.5} />),
  park: renderToStaticMarkup(<Trees size={14} strokeWidth={2.5} />),
  restaurant: renderToStaticMarkup(<UtensilsCrossed size={14} strokeWidth={2.5} />),
  bar: renderToStaticMarkup(<Wine size={14} strokeWidth={2.5} />),
  lounge: renderToStaticMarkup(<Briefcase size={14} strokeWidth={2.5} />),
}

const lerp = (a: LatLng, b: LatLng, t: number): LatLng => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

function ViewController({ mode, points, fitKey }: { mode: MapMode; points: LatLng[]; fitKey: string }) {
  const map = useMap()
  useEffect(() => {
    const bottom = mode === 'live' ? 440 : mode === 'pick' ? 380 : mode === 'hosting' ? 360 : 300
    const top = mode === 'live' ? 150 : 110
    map.invalidateSize()
    map.flyToBounds(L.latLngBounds(points), {
      paddingTopLeft: [28, top],
      paddingBottomRight: [28, bottom],
      duration: 0.8,
      maxZoom: 17,
    })
    // fitKey intentionally drives re-fitting instead of every progress tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map])
  return null
}

export default function MapCanvas({
  partner,
  recenterKey = 0,
  center = ME_APPROX,
  hideUserLocation = false,
  mode,
  userPhoto,
  venues,
  selectedVenueId,
  onSelectVenue,
  radiusKm,
  blobs,
  live,
}: MapCanvasProps) {
  const isLive = mode === 'live' && live
  const mePos = isLive ? lerp(center, live.venue.position, live.meProgress * 0.92) : center
  const themPos = isLive ? lerp(live.themStart, live.venue.position, live.themProgress * 0.92) : null

  const meIcon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: `<div class="uc-me ${mode === 'free' ? 'is-free' : ''}"><img src="${userPhoto}" alt="" /></div>`,
        iconSize: [52, 52],
        iconAnchor: [26, 26],
      }),
    [mode, userPhoto],
  )

  const pulseIcon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html:
          mode === 'hosting'
            ? '<div style="position:relative;width:0;height:0"><div class="uc-radar"></div><div class="uc-ping"></div><div class="uc-ping"></div></div>'
            : '<div style="position:relative;width:0;height:0"><div class="uc-ping is-live"></div><div class="uc-ping is-live"></div><div class="uc-ping is-live"></div></div>',
        iconSize: [0, 0],
      }),
    [mode],
  )

  const points: LatLng[] = useMemo(() => {
    if (isLive) return [center, live.themStart, live.venue.position]
    if(partner)return [center,partner.position]
    if (mode === 'pick') return [center, ...venues.map((v) => v.position)]
    const d = 0.0042 * Math.max(0.7, radiusKm)
    return [
      [center[0] - d, center[1] - d * 1.4],
      [center[0] + d, center[1] + d * 1.4],
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, radiusKm, venues.length, live?.venue.id,center[0],center[1],partner?.position[0],partner?.position[1]])

  const fitKey = `${recenterKey}-${center.join(',')}-${partner?.position.join(',')??''}-${mode}-${radiusKm}-${venues.map((v) => v.id).join(',')}-${live?.venue.id ?? ''}`
  const showRings = mode === 'explore' || mode === 'free' || mode === 'hosting' || mode === 'pick'
  const showBlobs = mode === 'explore' || mode === 'free' || mode === 'hosting'
  const ringColor = mode === 'free' ? '#e0a820' : '#2b59ff'

  return (
    <MapContainer
      center={center}
      zoom={16}
      zoomControl={false}
      attributionControl
      className="size-full"
      aria-label="Live map of approximate nearby activity"
    >
      <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          maxNativeZoom={16}
      />
      <ViewController mode={mode} points={points} fitKey={fitKey} />

      {showRings &&
        [0.33, 0.66, 1].map((f) => (
          <Circle
            key={f}
            center={center}
            radius={radiusKm * 1000 * f * 0.5}
            pathOptions={{ color: ringColor, weight: 1.5, opacity: 0.45, dashArray: '3 7', fill: f === 1, fillOpacity: 0.04, fillColor: ringColor }}
            interactive={false}
          />
        ))}

      {!isLive && !hideUserLocation && (
        <>
          <Circle
            center={center}
            radius={140}
            pathOptions={{ stroke: false, fillColor: mode === 'free' ? '#ffc940' : '#2b59ff', fillOpacity: 0.18 }}
            interactive={false}
          />
          {(mode === 'free' || mode === 'hosting') && <Marker position={center} icon={pulseIcon} interactive={false} />}
          <Marker position={center} icon={meIcon} interactive={false} zIndexOffset={500} />
        </>
      )}

      {partner && <>
        <Circle center={partner.position} radius={800} pathOptions={{color:'#0e1726',weight:1.5,dashArray:'4 8',fillColor:'#ffc940',fillOpacity:0.12}} interactive={false} />
        <PersonMarker position={partner.position} initials={partner.initials} variant="partner" />
      </>}

      {showBlobs &&
        blobs.map((b) => (
          <BlobMarker key={b.id} initials={b.initials} position={b.position} dim={mode === 'hosting'} />
        ))}

      {!isLive &&
        venues.map((v) => (
          <VenueMarker
            key={v.id}
            venue={v}
            label={mode === 'pick' || v.id === selectedVenueId}
            selected={v.id === selectedVenueId}
            dim={mode === 'explore' || mode === 'free'}
            onSelect={mode === 'pick' ? onSelectVenue : undefined}
          />
        ))}

      {isLive && themPos && (
        <>
          <Polyline positions={[center, live.venue.position]} pathOptions={{ color: '#2b59ff', weight: 5, opacity: 0.35, dashArray: '2 10', lineCap: 'round' }} />
          <Polyline positions={[live.themStart, live.venue.position]} pathOptions={{ color: '#0e1726', weight: 5, opacity: 0.3, dashArray: '2 10', lineCap: 'round' }} />
          <Circle center={themPos} radius={110} pathOptions={{ stroke: false, fillColor: '#0e1726', fillOpacity: 0.1 }} interactive={false} />
          <Circle center={mePos} radius={110} pathOptions={{ stroke: false, fillColor: '#2b59ff', fillOpacity: 0.12 }} interactive={false} />
          <PersonMarker position={themPos} initials={live.themInitials} variant="partner" />
          <Marker position={mePos} icon={meIcon} interactive={false} zIndexOffset={500} />
          <VenueMarker venue={live.venue} label selected destination />
        </>
      )}
    </MapContainer>
  )
}

function BlobMarker({ initials, position, dim }: { initials: string; position: LatLng; dim?: boolean }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: `<div class="uc-person" style="opacity:${dim ? 0.5 : 1}">${initials}</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
    [initials, dim],
  )
  return (
    <>
      <Circle center={position} radius={90} pathOptions={{ stroke: false, fillColor: '#ffc940', fillOpacity: dim ? 0.12 : 0.28 }} interactive={false} />
      <Marker position={position} icon={icon} interactive={false} />
    </>
  )
}

function PersonMarker({ position, initials, variant }: { position: LatLng; initials: string; variant: 'partner' | 'self' }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: `<div class="uc-person is-${variant}">${initials}</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
    [initials, variant],
  )
  return <Marker position={position} icon={icon} interactive={false} zIndexOffset={400} />
}

function VenueMarker({
  venue,
  label,
  selected,
  dim,
  destination,
  onSelect,
}: {
  venue: Venue
  label?: boolean
  selected?: boolean
  dim?: boolean
  destination?: boolean
  onSelect?: (id: string) => void
}) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: `<div class="uc-venue ${selected ? 'is-selected' : ''} ${dim && !selected ? 'is-dim' : ''} ${destination ? 'is-destination' : ''}"><span class="uc-venue-dot">${KIND_ICON[venue.kind]}</span>${label ? `<span class="uc-venue-label">${venue.name}</span>` : ''}</div>`,
        iconSize: [0, 0],
      }),
    [venue, label, selected, dim, destination],
  )
  return (
    <Marker
      position={venue.position}
      icon={icon}
      interactive={!!onSelect}
      zIndexOffset={selected ? 800 : 100}
      eventHandlers={onSelect ? { click: () => onSelect(venue.id) } : undefined}
      keyboard={!!onSelect}
      title={venue.name}
    />
  )
}
