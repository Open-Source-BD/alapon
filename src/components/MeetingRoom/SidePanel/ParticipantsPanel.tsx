import { Mic, MicOff, Video, VideoOff, X, Hand } from 'lucide-react'
import { useMeetingStore } from '@/store/meetingStore'
import { SignalBars } from '../SignalBars'
import { cn } from '@/lib/utils'

export function ParticipantsPanel() {
  const localName = useMeetingStore((s) => s.localName)
  const isAudioMuted = useMeetingStore((s) => s.isAudioMuted)
  const isVideoOff = useMeetingStore((s) => s.isVideoOff)
  const isHandRaised = useMeetingStore((s) => s.isHandRaised)
  const peers = useMeetingStore((s) => s.peers)
  const toggleParticipants = useMeetingStore((s) => s.toggleParticipants)
  const localUid = useMeetingStore((s) => s.localUid)
  const pinnedUid = useMeetingStore((s) => s.pinnedUid)
  const setPinned = useMeetingStore((s) => s.setPinned)

  // Tap a row to spotlight that person (toggle).
  const spotlight = (uid: string) => setPinned(pinnedUid === uid ? null : uid)

  return (
    <div className="flex flex-1 min-w-0 flex-col h-full bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-semibold text-white">
          Participants ({1 + Object.keys(peers).length})
        </h3>
        <button
          onClick={toggleParticipants}
          aria-label="Close participants panel"
          className="p-1 rounded text-muted hover:text-white hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div
          onClick={() => spotlight(localUid)}
          aria-pressed={pinnedUid === localUid}
          title="Spotlight yourself"
          className={cn(
            'cursor-pointer border-b border-border px-4 py-3 transition-colors hover:bg-elevated',
            pinnedUid === localUid && 'bg-accent/10'
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                <span className="text-accent-ink font-semibold text-sm">
                  {localName.split(' ').map((n) => n[0]).join('').toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {localName || 'You'} <span className="text-xs text-muted">(You)</span>
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0 ml-2">
              {isHandRaised && (
                <div className="p-1.5 rounded bg-warn/20">
                  <Hand className="w-3 h-3 text-warn" />
                </div>
              )}
              {isAudioMuted ? (
                <div className="p-1.5 rounded bg-elevated">
                  <MicOff className="w-3 h-3 text-danger" />
                </div>
              ) : (
                <div className="p-1.5 rounded bg-elevated">
                  <Mic className="w-3 h-3 text-success" />
                </div>
              )}
              {isVideoOff ? (
                <div className="p-1.5 rounded bg-elevated">
                  <VideoOff className="w-3 h-3 text-danger" />
                </div>
              ) : (
                <div className="p-1.5 rounded bg-elevated">
                  <Video className="w-3 h-3 text-success" />
                </div>
              )}
            </div>
          </div>
        </div>

        {Object.values(peers).map((peer) => (
          <div
            key={peer.uid}
            onClick={() => spotlight(peer.uid)}
            aria-pressed={pinnedUid === peer.uid}
            title={`Spotlight ${peer.name}`}
            className={cn(
              'cursor-pointer border-b border-border px-4 py-3 transition-colors hover:bg-elevated',
              pinnedUid === peer.uid && 'bg-accent/10'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-semibold text-sm">
                    {peer.name.split(' ').map((n) => n[0]).join('').toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">{peer.name}</p>
                    {peer.connectionState && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          peer.connectionState === 'connected'
                            ? 'bg-success/20 text-success'
                            : peer.connectionState === 'connecting'
                              ? 'bg-warn/20 text-warn'
                              : 'bg-danger/20 text-danger'
                        }`}
                      >
                        {peer.connectionState === 'connected' ? 'Connected' : peer.connectionState}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                {peer.quality !== 'good' && (
                  <div className="flex h-6 items-center px-1">
                    <SignalBars quality={peer.quality} />
                  </div>
                )}
                {peer.isHandRaised && (
                  <div className="p-1.5 rounded bg-warn/20">
                    <Hand className="w-3 h-3 text-warn" />
                  </div>
                )}
                {peer.isAudioMuted ? (
                  <div className="p-1.5 rounded bg-elevated">
                    <MicOff className="w-3 h-3 text-danger" />
                  </div>
                ) : (
                  <div className="p-1.5 rounded bg-elevated">
                    <Mic className="w-3 h-3 text-success" />
                  </div>
                )}
                {peer.isVideoOff ? (
                  <div className="p-1.5 rounded bg-elevated">
                    <VideoOff className="w-3 h-3 text-danger" />
                  </div>
                ) : (
                  <div className="p-1.5 rounded bg-elevated">
                    <Video className="w-3 h-3 text-success" />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {Object.keys(peers).length === 0 && (
          <div className="flex items-center justify-center h-full text-muted p-4">
            <p className="text-sm text-center">Waiting for others to join...</p>
          </div>
        )}
      </div>
    </div>
  )
}
