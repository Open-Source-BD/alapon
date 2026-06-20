import { useMeetingStore, type ConnectionQuality } from '@/store/meetingStore'
import { VideoTile } from './VideoTile'

interface TileData {
  uid: string
  name: string
  stream: MediaStream | null
  isLocal: boolean
  isAudioMuted: boolean
  isVideoOff: boolean
  isHandRaised: boolean
  connectionState: RTCPeerConnectionState | null
  quality?: ConnectionQuality
}

// Layout:
//   layout 'grid'           → gallery of everyone
//   pinnedUid set           → pinned fills the stage, others in a filmstrip
//   else (auto): 0 remote   → you fill the stage
//                1 remote   → other fills the stage, you pin as a PiP
//                2+ remote  → gallery grid
export function VideoGrid() {
  const localUid = useMeetingStore((s) => s.localUid)
  const localName = useMeetingStore((s) => s.localName)
  const localStream = useMeetingStore((s) => s.localStream)
  const isVideoOff = useMeetingStore((s) => s.isVideoOff)
  const isAudioMuted = useMeetingStore((s) => s.isAudioMuted)
  const isHandRaised = useMeetingStore((s) => s.isHandRaised)
  const peers = useMeetingStore((s) => s.peers)
  const activeSpeakerUid = useMeetingStore((s) => s.activeSpeakerUid)
  const pinnedUid = useMeetingStore((s) => s.pinnedUid)
  const presentingUid = useMeetingStore((s) => s.presentingUid)
  const layout = useMeetingStore((s) => s.layout)

  const localData: TileData = {
    uid: localUid,
    name: localName || 'You',
    stream: localStream,
    isLocal: true,
    isAudioMuted,
    isVideoOff,
    isHandRaised,
    connectionState: null,
  }
  const peerData: TileData[] = Object.values(peers).map((p) => ({
    uid: p.uid,
    name: p.name,
    stream: p.stream,
    isLocal: false,
    isAudioMuted: p.isAudioMuted,
    isVideoOff: p.isVideoOff,
    isHandRaised: p.isHandRaised,
    connectionState: p.connectionState,
    quality: p.quality,
  }))
  const allTiles = [localData, ...peerData]

  const tile = (t: TileData, opts: { compact?: boolean; pinnable?: boolean } = {}) => (
    <VideoTile
      key={t.uid}
      uid={t.uid}
      name={t.name}
      stream={t.stream}
      isLocal={t.isLocal}
      isAudioMuted={t.isAudioMuted}
      isVideoOff={t.isVideoOff}
      isHandRaised={t.isHandRaised}
      isActiveSpeaker={activeSpeakerUid === t.uid}
      connectionState={t.connectionState}
      quality={t.quality}
      isScreen={presentingUid === t.uid}
      compact={opts.compact}
      pinnable={opts.pinnable}
    />
  )

  const wrap = (children: React.ReactNode, scroll = false) => (
    <div className={`flex-1 bg-surface p-2 sm:p-4 min-h-0 ${scroll ? 'overflow-auto' : ''}`}>
      {children}
    </div>
  )

  // Spotlight: an explicit pin wins; otherwise the active presenter (screen share)
  // fills the stage and everyone else sits in a filmstrip.
  const spotlightUid = pinnedUid ?? presentingUid
  const pinned = spotlightUid ? allTiles.find((t) => t.uid === spotlightUid) : undefined
  if (pinned && layout !== 'grid') {
    const others = allTiles.filter((t) => t.uid !== pinned.uid)
    return wrap(
      <div className="relative h-full w-full">
        <div className="h-full w-full">{tile(pinned, { pinnable: true })}</div>
        {others.length > 0 && (
          <div className="absolute bottom-3 right-3 z-10 flex max-w-[70%] gap-2 overflow-x-auto">
            {others.map((t) => (
              <div
                key={t.uid}
                className="h-24 w-32 flex-shrink-0 overflow-hidden rounded-lg shadow-xl ring-1 ring-white/15"
              >
                {tile(t, { compact: true, pinnable: true })}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Auto 1:1 — remote fills the screen, self pins as picture-in-picture.
  if (layout !== 'grid' && peerData.length === 1) {
    return wrap(
      <div className="relative h-full w-full">
        <div className="h-full w-full">{tile(peerData[0], { pinnable: true })}</div>
        <div className="absolute bottom-4 right-4 z-10 h-40 w-28 overflow-hidden rounded-lg shadow-xl ring-1 ring-white/15 sm:h-32 sm:w-44">
          {tile(localData, { compact: true })}
        </div>
      </div>
    )
  }

  // Auto alone — your own video fills the stage.
  if (layout !== 'grid' && peerData.length === 0) {
    return wrap(<div className="h-full w-full">{tile(localData)}</div>)
  }

  // Gallery grid (forced 'grid' layout, or 2+ peers in auto).
  return wrap(
    <div
      className="h-full grid gap-2"
      style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        gridAutoRows: 'minmax(0, 1fr)',
        minHeight: '100%',
      }}
    >
      {allTiles.map((t) => tile(t, { pinnable: true }))}
    </div>,
    true
  )
}
