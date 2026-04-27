import { Mic, MicOff, Video, VideoOff } from 'lucide-react'
import { useMeetingStore } from '@/store/meetingStore'

export function ParticipantsPanel() {
  const localName = useMeetingStore((s) => s.localName)
  const isAudioMuted = useMeetingStore((s) => s.isAudioMuted)
  const isVideoOff = useMeetingStore((s) => s.isVideoOff)
  const peers = useMeetingStore((s) => s.peers)

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-700">
      <div className="border-b border-gray-700 px-4 py-3">
        <h3 className="font-semibold text-white">
          Participants ({1 + Object.keys(peers).length})
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-gray-700 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-semibold text-sm">
                  {localName.split(' ').map((n) => n[0]).join('').toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {localName || 'You'} <span className="text-xs text-gray-400">(You)</span>
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0 ml-2">
              {isAudioMuted ? (
                <div className="p-1.5 rounded bg-gray-700">
                  <MicOff className="w-3 h-3 text-red-400" />
                </div>
              ) : (
                <div className="p-1.5 rounded bg-gray-700">
                  <Mic className="w-3 h-3 text-green-400" />
                </div>
              )}
              {isVideoOff ? (
                <div className="p-1.5 rounded bg-gray-700">
                  <VideoOff className="w-3 h-3 text-red-400" />
                </div>
              ) : (
                <div className="p-1.5 rounded bg-gray-700">
                  <Video className="w-3 h-3 text-green-400" />
                </div>
              )}
            </div>
          </div>
        </div>

        {Object.values(peers).map((peer) => (
          <div key={peer.uid} className="border-b border-gray-700 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
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
                            ? 'bg-green-500/20 text-green-400'
                            : peer.connectionState === 'connecting'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {peer.connectionState === 'connected' ? 'Connected' : peer.connectionState}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0 ml-2">
                {peer.isAudioMuted ? (
                  <div className="p-1.5 rounded bg-gray-700">
                    <MicOff className="w-3 h-3 text-red-400" />
                  </div>
                ) : (
                  <div className="p-1.5 rounded bg-gray-700">
                    <Mic className="w-3 h-3 text-green-400" />
                  </div>
                )}
                {peer.isVideoOff ? (
                  <div className="p-1.5 rounded bg-gray-700">
                    <VideoOff className="w-3 h-3 text-red-400" />
                  </div>
                ) : (
                  <div className="p-1.5 rounded bg-gray-700">
                    <Video className="w-3 h-3 text-green-400" />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {Object.keys(peers).length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500 p-4">
            <p className="text-sm text-center">Waiting for others to join...</p>
          </div>
        )}
      </div>
    </div>
  )
}
