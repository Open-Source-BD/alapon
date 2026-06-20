import { useMeetingStore } from '@/store/meetingStore'
import { VideoTile } from './VideoTile'

// Layout, Google Meet style:
//   0 remote  → your own video fills the stage
//   1 remote  → the other person fills the stage, you pin as a small PiP
//   2+ remote → gallery grid of everyone (auto-fit, wraps on mobile)
export function VideoGrid() {
  const localUid = useMeetingStore((s) => s.localUid)
  const localName = useMeetingStore((s) => s.localName)
  const localStream = useMeetingStore((s) => s.localStream)
  const isVideoOff = useMeetingStore((s) => s.isVideoOff)
  const isAudioMuted = useMeetingStore((s) => s.isAudioMuted)
  const isHandRaised = useMeetingStore((s) => s.isHandRaised)
  const peers = useMeetingStore((s) => s.peers)
  const activeSpeakerUid = useMeetingStore((s) => s.activeSpeakerUid)

  const peerList = Object.values(peers)

  const localTile = (compact: boolean) => (
    <VideoTile
      name={localName || 'You'}
      stream={localStream}
      isLocal
      isAudioMuted={isAudioMuted}
      isVideoOff={isVideoOff}
      isHandRaised={isHandRaised}
      isActiveSpeaker={activeSpeakerUid === localUid}
      compact={compact}
    />
  )

  // 1:1 — remote fills the screen, self pins as picture-in-picture.
  if (peerList.length === 1) {
    const peer = peerList[0]
    return (
      <div className="relative flex-1 bg-surface p-2 sm:p-4 min-h-0">
        <div className="h-full w-full">
          <VideoTile
            name={peer.name}
            stream={peer.stream}
            isLocal={false}
            isAudioMuted={peer.isAudioMuted}
            isVideoOff={peer.isVideoOff}
            isHandRaised={peer.isHandRaised}
            isActiveSpeaker={activeSpeakerUid === peer.uid}
            connectionState={peer.connectionState}
          />
        </div>
        <div className="absolute bottom-4 right-4 z-10 h-40 w-28 overflow-hidden rounded-lg shadow-xl ring-1 ring-white/15 sm:h-32 sm:w-44">
          {localTile(true)}
        </div>
      </div>
    )
  }

  // Alone — your own video fills the stage.
  if (peerList.length === 0) {
    return (
      <div className="flex-1 bg-surface p-2 sm:p-4 min-h-0">
        <div className="h-full w-full">{localTile(false)}</div>
      </div>
    )
  }

  // Group — gallery grid including self.
  return (
    <div className="flex-1 bg-surface p-2 sm:p-4 overflow-auto min-h-0">
      <div
        className="h-full grid gap-2"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          gridAutoRows: 'minmax(0, 1fr)',
          minHeight: '100%',
        }}
      >
        {localTile(false)}
        {peerList.map((peer) => (
          <VideoTile
            key={peer.uid}
            name={peer.name}
            stream={peer.stream}
            isLocal={false}
            isAudioMuted={peer.isAudioMuted}
            isVideoOff={peer.isVideoOff}
            isHandRaised={peer.isHandRaised}
            isActiveSpeaker={activeSpeakerUid === peer.uid}
            connectionState={peer.connectionState}
          />
        ))}
      </div>
    </div>
  )
}
