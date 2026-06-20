import { useEffect, useRef } from 'react'
import { MicOff, Loader2, Hand } from 'lucide-react'
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
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

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
      className={cn(
        'relative w-full h-full bg-surface rounded-lg overflow-hidden',
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
            'w-full h-full object-cover',
            isLocal && 'scale-x-[-1]', // Mirror local video
            isVideoOff && 'hidden'
          )}
        />
      )}

      {(isVideoOff || !stream) && (
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

      {/* Raised hand */}
      {isHandRaised && (
        <div className="absolute top-2 left-2 flex items-center justify-center rounded-full bg-warn p-1.5 shadow-lg">
          <Hand className={cn('text-white', compact ? 'w-3 h-3' : 'w-4 h-4')} />
        </div>
      )}

      {/* Name overlay */}
      <div className={cn('absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent', compact ? 'p-1.5' : 'p-3')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <p className={cn('text-white font-medium truncate', compact ? 'text-xs' : 'text-sm')}>
              {isLocal ? `${name} (You)` : name}
            </p>
          </div>
          {isAudioMuted && (
            <div className="ml-2 flex-shrink-0">
              <MicOff className={cn('text-danger', compact ? 'w-3 h-3' : 'w-4 h-4')} />
            </div>
          )}
        </div>
      </div>

      {/* Active speaker indicator */}
      {isActiveSpeaker && (
        <div className="absolute top-3 right-3">
          <div className="flex gap-1">
            <div className="w-1.5 h-4 bg-success rounded-full animate-pulse" />
            <div className="w-1.5 h-4 bg-success rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
            <div className="w-1.5 h-4 bg-success rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
          </div>
        </div>
      )}
    </div>
  )
}
