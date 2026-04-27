import { useMeetingStore } from '@/store/meetingStore'
import { VideoTile } from './VideoTile'

function getGridDimensions(count: number) {
  if (count === 0) return { cols: 1, rows: 1 }
  if (count === 1) return { cols: 1, rows: 1 }
  if (count === 2) return { cols: 2, rows: 1 }
  if (count <= 4) return { cols: 2, rows: 2 }
  if (count <= 6) return { cols: 3, rows: 2 }
  if (count <= 9) return { cols: 3, rows: 3 }
  return { cols: 4, rows: Math.ceil(count / 4) }
}

export function VideoGrid() {
  const localUid = useMeetingStore((s) => s.localUid)
  const localName = useMeetingStore((s) => s.localName)
  const localStream = useMeetingStore((s) => s.localStream)
  const isVideoOff = useMeetingStore((s) => s.isVideoOff)
  const isAudioMuted = useMeetingStore((s) => s.isAudioMuted)
  const peers = useMeetingStore((s) => s.peers)
  const activeSpeakerUid = useMeetingStore((s) => s.activeSpeakerUid)

  const peerList = Object.values(peers)
  const totalParticipants = 1 + peerList.length // Self + peers
  const { cols, rows } = getGridDimensions(totalParticipants)

  return (
    <div className="flex-1 bg-gray-900 p-4 overflow-auto">
      <div
        className="h-full grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
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
          />
        ))}
      </div>
    </div>
  )
}
