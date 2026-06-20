import { useEffect, useRef } from 'react'
import { MicOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VideoTileProps {
  name: string
  stream: MediaStream | null
  isLocal: boolean
  isAudioMuted: boolean
  isVideoOff: boolean
  isActiveSpeaker: boolean
  connectionState?: RTCPeerConnectionState | null
}

export function VideoTile({
  name,
  stream,
  isLocal,
  isAudioMuted,
  isVideoOff,
  isActiveSpeaker,
  connectionState,
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
        'relative w-full h-full bg-gray-900 rounded-lg overflow-hidden',
        isActiveSpeaker && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-950'
      )}
    >
      {!isVideoOff && stream ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className={cn(
              'w-full h-full object-cover',
              isLocal && 'scale-x-[-1]' // Mirror local video
            )}
          />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
          <div className="text-center">
            {isConnecting ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                <p className="text-gray-400 text-sm">Connecting...</p>
              </div>
            ) : isReconnecting ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 text-amber-500 animate-spin" />
                <p className="text-amber-400 text-sm">Reconnecting...</p>
              </div>
            ) : (
              <>
                <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl font-bold text-white">{initials}</span>
                </div>
                <p className="text-gray-400 text-sm">{isVideoOff ? 'Camera off' : 'Waiting for video...'}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Name overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{name}</p>
            {isLocal && <span className="text-xs bg-blue-600 px-2 py-1 rounded text-white whitespace-nowrap">(You)</span>}
          </div>
          {isAudioMuted && (
            <div className="ml-2 flex-shrink-0">
              <MicOff className="w-4 h-4 text-red-400" />
            </div>
          )}
        </div>
      </div>

      {/* Active speaker indicator */}
      {isActiveSpeaker && (
        <div className="absolute top-3 right-3">
          <div className="flex gap-1">
            <div className="w-1.5 h-4 bg-green-500 rounded-full animate-pulse" />
            <div className="w-1.5 h-4 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
            <div className="w-1.5 h-4 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
          </div>
        </div>
      )}
    </div>
  )
}
