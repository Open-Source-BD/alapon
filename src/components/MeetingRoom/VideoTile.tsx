import { useEffect, useRef } from 'react'
import { MicOff, Loader2, Hand, Pin, PinOff, MonitorUp } from 'lucide-react'
import { useMeetingStore, type ConnectionQuality } from '@/store/meetingStore'
import { SignalBars } from './SignalBars'
import { cn } from '@/lib/utils'

interface VideoTileProps {
  name: string
  stream: MediaStream | null
  isLocal: boolean
  isAudioMuted: boolean
  isVideoOff: boolean
  isActiveSpeaker: boolean
  isHandRaised?: boolean
  connectionState?: RTCPeerConnectionState | null
  /** Picture-in-picture mode: smaller chrome for the pinned self-view. */
  compact?: boolean
  /** uid this tile represents — enables the pin control. */
  uid?: string
  pinnable?: boolean
  /** Remote connection quality (omit for the local tile). */
  quality?: ConnectionQuality
  /** This tile is showing a shared screen — letterbox it and don't mirror. */
  isScreen?: boolean
}

export function VideoTile({
  name,
  stream,
  isLocal,
  isAudioMuted,
  isVideoOff,
  isActiveSpeaker,
  isHandRaised,
  connectionState,
  compact,
  uid,
  pinnable,
  quality,
  isScreen,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pinnedUid = useMeetingStore((s) => s.pinnedUid)
  const setPinned = useMeetingStore((s) => s.setPinned)
  const isPinned = !!uid && pinnedUid === uid
  const showPin = pinnable && !compact && !!uid
  // Whole-tile tap toggles spotlight (Meet-style), reachable on touch. Works for the
  // stage, filmstrip and gallery tiles — not the self PiP (which passes no `pinnable`).
  const canSpotlight = pinnable && !!uid
  const toggleSpotlight = () => setPinned(isPinned ? null : uid!)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  // Generate initials avatar
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()

  // Remote peers only. 'completed' is an ICE state, not a peer-connection state,
  // so it is intentionally absent here.
  const isConnecting =
    !isLocal && (connectionState === 'new' || connectionState === 'connecting')
  const isReconnecting =
    !isLocal &&
    (connectionState === 'disconnected' || connectionState === 'failed')

  return (
    <div
      onClick={canSpotlight ? toggleSpotlight : undefined}
      title={canSpotlight ? `Spotlight ${name}` : undefined}
      aria-label={canSpotlight ? `Spotlight ${name}` : undefined}
      className={cn(
        'group relative w-full h-full bg-surface rounded-lg overflow-hidden',
        canSpotlight && 'cursor-pointer',
        isActiveSpeaker && 'ring-2 ring-accent ring-offset-2 ring-offset-base'
      )}
    >
      {/* Keep the media element mounted whenever a stream exists so its AUDIO
          keeps playing even when the camera is off. Previously the <video> was
          only rendered when video was on, so a peer with their camera off was
          inaudible ("no real voice"). Local is always muted to avoid hearing
          yourself (echo). Hidden visually (not unmounted) when video is off. */}
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={cn(
            'w-full h-full',
            // Screens are letterboxed (object-contain) and never mirrored; camera
            // tiles fill (object-cover) and the local camera is mirrored.
            isScreen ? 'object-contain bg-black' : 'object-cover',
            isLocal && !isScreen && 'scale-x-[-1]',
            // A shared screen stays visible even if the camera was off.
            isVideoOff && !isScreen && 'hidden'
          )}
        />
      )}

      {((isVideoOff && !isScreen) || !stream) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-elevated to-surface">
          <div className="text-center">
            {isConnecting ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 text-accent animate-spin" />
                <p className="text-muted text-sm">Connecting...</p>
              </div>
            ) : isReconnecting ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 text-warn animate-spin" />
                <p className="text-warn text-sm">Reconnecting...</p>
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    'rounded-full bg-elevated flex items-center justify-center mx-auto',
                    compact ? 'w-12 h-12' : 'w-20 h-20 mb-4'
                  )}
                >
                  <span className={cn('font-bold text-white', compact ? 'text-base' : 'text-3xl')}>
                    {initials}
                  </span>
                </div>
                {!compact && (
                  <p className="text-muted text-sm">
                    {isVideoOff ? 'Camera off' : 'Waiting for video...'}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Presenting badge */}
      {isScreen && !compact && (
        <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-ink shadow-lg">
          <MonitorUp className="w-3.5 h-3.5" />
          Presenting
        </div>
      )}

      {/* Raised hand */}
      {isHandRaised && (
        <div className="absolute top-2 left-2 flex items-center justify-center rounded-full bg-warn p-1.5 shadow-lg">
          <Hand className={cn('text-accent-ink', compact ? 'w-3 h-3' : 'w-4 h-4')} />
        </div>
      )}

      {/* Pin / spotlight control (shows on hover; always tappable on touch) */}
      {showPin && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleSpotlight()
          }}
          aria-label={isPinned ? 'Unpin from spotlight' : 'Pin to spotlight'}
          className={cn(
            'absolute top-2 right-2 rounded-full bg-black/50 p-1.5 text-white transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent hover:bg-black/70',
            isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          )}
        >
          {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
        </button>
      )}

      {/* Name overlay */}
      <div className={cn('absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent', compact ? 'p-1.5' : 'p-3')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <p className={cn('text-white font-medium truncate', compact ? 'text-xs' : 'text-sm')}>
              {isLocal ? `${name} (You)` : name}
            </p>
          </div>
          <div className="ml-2 flex flex-shrink-0 items-center gap-2">
            {!isLocal && quality && quality !== 'good' && <SignalBars quality={quality} />}
            {isAudioMuted && (
              <MicOff className={cn('text-danger', compact ? 'w-3 h-3' : 'w-4 h-4')} />
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
