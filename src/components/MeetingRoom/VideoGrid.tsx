import { useMeetingStore } from '@/store/meetingStore'
import { VideoTile } from './VideoTile'

export function VideoGrid() {
  const localUid = useMeetingStore((s) => s.localUid)
  const localName = useMeetingStore((s) => s.localName)
  const localStream = useMeetingStore((s) => s.localStream)
  const isVideoOff = useMeetingStore((s) => s.isVideoOff)
  const isAudioMuted = useMeetingStore((s) => s.isAudioMuted)
  const peers = useMeetingStore((s) => s.peers)
  const activeSpeakerUid = useMeetingStore((s) => s.activeSpeakerUid)

  const peerList = Object.values(peers)

  return (
    <div className="flex-1 bg-gray-900 p-4 overflow-auto">
      <div
        className="h-full grid gap-2"
        style={{
          // Auto-fit so tiles wrap responsively: a single column on phones,
          // more columns as width allows. No manual breakpoint math needed.
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          gridAutoRows: 'minmax(0, 1fr)',
          minHeight: '100%',
        }}
      >
        {/* Local video */}
        <VideoTile
          key={localUid}
          name={localName || 'You'}
          stream={localStream}
          isLocal
          isAudioMuted={isAudioMuted}
          isVideoOff={isVideoOff}
          isActiveSpeaker={activeSpeakerUid === localUid}
        />

        {/* Remote videos */}
        {peerList.map((peer) => (
          <VideoTile
            key={peer.uid}
            name={peer.name}
            stream={peer.stream}
            isLocal={false}
            isAudioMuted={peer.isAudioMuted}
            isVideoOff={peer.isVideoOff}
            isActiveSpeaker={activeSpeakerUid === peer.uid}
            connectionState={peer.connectionState}
          />
        ))}
      </div>
    </div>
  )
}
