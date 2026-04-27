import { useEffect, useRef, useState } from 'react'
import { Video, VideoOff, Mic, MicOff } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useMeetingStore } from '@/store/meetingStore'
import { useMediaStream } from '@/hooks/useMediaStream'
import { deriveRoomKey } from '@/lib/crypto'

interface PreJoinScreenProps {
  roomId?: string
}

function generateRoomCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz'
  const segment = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * 26)]).join('')
  return `${segment(3)}-${segment(4)}-${segment(3)}`
}

export function PreJoinScreen({ roomId: initialRoomId }: PreJoinScreenProps) {
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaStream = useMediaStream()

  const setLocalName = useMeetingStore((s) => s.setLocalName)
  const setRoomId = useMeetingStore((s) => s.setRoomId)
  const setPhase = useMeetingStore((s) => s.setPhase)
  const setEncryptionKey = useMeetingStore((s) => s.setEncryptionKey)
  const setIsEncrypted = useMeetingStore((s) => s.setIsEncrypted)
  const cameraMuted = useMeetingStore((s) => s.isVideoOff)
  const micMuted = useMeetingStore((s) => s.isAudioMuted)
  const localStream = useMeetingStore((s) => s.localStream)

  useEffect(() => {
    const initMedia = async () => {
      try {
        await mediaStream.startMedia()
      } catch (err) {
        setError('Failed to access camera/microphone. Please check permissions.')
        console.error(err)
      }
    }

    initMedia()
  }, [mediaStream])

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream
    }
  }, [localStream])

  const handleJoin = async (isCreating: boolean) => {
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const roomIdToUse = isCreating ? generateRoomCode() : initialRoomId
      if (!roomIdToUse) {
        setError('Invalid room code')
        return
      }

      const passphrase = isCreating ? nanoid(20) : ''
      if (passphrase || !isCreating) {
        const key = await deriveRoomKey(
          passphrase || nanoid(20),
          roomIdToUse
        )
        setEncryptionKey(key)
        setIsEncrypted(true)

        if (isCreating && passphrase) {
          const newUrl = `/${roomIdToUse}#key=${passphrase}`
          window.history.replaceState({}, '', newUrl)
        }
      }

      setLocalName(name)
      setRoomId(roomIdToUse)
      setPhase('joining')

      setTimeout(() => {
        setPhase('inmeeting')
      }, 500)
    } catch (err) {
      setError('Failed to setup meeting. Please try again.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const isJoining = !!initialRoomId

  return (
    <div className="w-full h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-2 gap-8">
        <div className="flex flex-col gap-4">
          <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
            {error ? (
              <div className="w-full h-full flex items-center justify-center bg-red-900/20">
                <p className="text-red-400 text-sm text-center px-4">{error}</p>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={mediaStream.toggleAudio}
              className={`flex-1 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                micMuted
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              <span className="text-sm">{micMuted ? 'Mic Off' : 'Mic On'}</span>
            </button>
            <button
              onClick={mediaStream.toggleVideo}
              className={`flex-1 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                cameraMuted
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {cameraMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              <span className="text-sm">{cameraMuted ? 'Camera Off' : 'Camera On'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-bold mb-2">Alapon</h1>
            <p className="text-gray-400">Encrypted video meetings</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Your name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:outline-none focus:border-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleJoin(isJoining ? false : true)
                }
              }}
            />
          </div>

          <button
            onClick={() => handleJoin(isJoining ? false : true)}
            disabled={isLoading || !name.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
          >
            {isLoading ? 'Joining...' : isJoining ? 'Join Meeting' : 'Create & Start Meeting'}
          </button>

          {isJoining && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-2">Meeting link:</p>
              <div className="bg-gray-900 px-3 py-2 rounded text-sm text-gray-300 break-all font-mono">
                {window.location.href}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(window.location.href)}
                className="mt-2 w-full text-xs py-1 bg-gray-700 hover:bg-gray-600 rounded"
              >
                Copy Link
              </button>
            </div>
          )}

          <div className="text-xs text-gray-500 space-y-1">
            <p>✓ Peer-to-peer encrypted calls</p>
            <p>✓ No accounts needed</p>
            <p>✓ Screen sharing & chat included</p>
          </div>
        </div>
      </div>
    </div>
  )
}
