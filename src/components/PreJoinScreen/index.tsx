import { useEffect, useRef, useState } from 'react'
import { Video, VideoOff, Mic, MicOff, RefreshCw } from 'lucide-react'
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
  const [error, setError] = useState('') // form/setup errors
  const [mediaError, setMediaError] = useState('') // camera/mic errors (overlay)
  const [copied, setCopied] = useState(false)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [selectedCamera, setSelectedCamera] = useState('')
  const [selectedMic, setSelectedMic] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaStream = useMediaStream()

  const setLocalName = useMeetingStore((s) => s.setLocalName)
  const setRoomId = useMeetingStore((s) => s.setRoomId)
  const setPhase = useMeetingStore((s) => s.setPhase)
  const setEncryptionKey = useMeetingStore((s) => s.setEncryptionKey)
  const setIsEncrypted = useMeetingStore((s) => s.setIsEncrypted)
  const cameraOff = useMeetingStore((s) => s.isVideoOff)
  const micMuted = useMeetingStore((s) => s.isAudioMuted)
  const localStream = useMeetingStore((s) => s.localStream)

  const startMedia = async () => {
    setMediaError('')
    try {
      await mediaStream.startMedia()
    } catch (err) {
      setMediaError('Camera/mic blocked. Check permissions, then retry.')
      console.error(err)
    }
  }

  // Acquire camera/mic once on mount. mediaStream is a fresh object every render,
  // so depending on it would re-run this effect constantly. startMedia is also
  // idempotent as a second guard.
  useEffect(() => {
    startMedia()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream
    }
  }, [localStream])

  // Populate device lists once we have a stream (labels are only available after
  // permission is granted).
  useEffect(() => {
    if (!localStream) return
    let cancelled = false
    mediaStream.getDevices().then(({ audioInputs, videoInputs }) => {
      if (cancelled) return
      setCameras(videoInputs)
      setMics(audioInputs)
      const activeVideo = localStream.getVideoTracks()[0]?.getSettings().deviceId
      const activeAudio = localStream.getAudioTracks()[0]?.getSettings().deviceId
      setSelectedCamera(activeVideo || videoInputs[0]?.deviceId || '')
      setSelectedMic(activeAudio || audioInputs[0]?.deviceId || '')
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream])

  const handleCameraChange = async (deviceId: string) => {
    setSelectedCamera(deviceId)
    try {
      await mediaStream.switchDevices({ videoDeviceId: deviceId, audioDeviceId: selectedMic || undefined })
    } catch {
      setMediaError('Could not switch camera.')
    }
  }

  const handleMicChange = async (deviceId: string) => {
    setSelectedMic(deviceId)
    try {
      await mediaStream.switchDevices({ audioDeviceId: deviceId, videoDeviceId: selectedCamera || undefined })
    } catch {
      setMediaError('Could not switch microphone.')
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy link. Copy it from the address bar.')
    }
  }

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

      const hashKey = new URLSearchParams(window.location.hash.slice(1)).get('key') ?? ''
      const passphrase = isCreating ? nanoid(20) : hashKey
      if (passphrase) {
        const key = await deriveRoomKey(passphrase, roomIdToUse)
        setEncryptionKey(key)
        setIsEncrypted(true)

        if (isCreating) {
          window.history.replaceState({}, '', `/${roomIdToUse}#key=${passphrase}`)
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
    <div className="w-full min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="flex flex-col gap-4">
          <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {/* Non-destructive error overlay with retry — keeps the layout. */}
            {mediaError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900/90 px-4 text-center">
                <p className="text-red-400 text-sm">{mediaError}</p>
                <button
                  onClick={startMedia}
                  className="flex items-center gap-2 rounded-lg bg-gray-700 hover:bg-gray-600 px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <RefreshCw className="w-4 h-4" /> Retry
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={mediaStream.toggleAudio}
              aria-pressed={micMuted}
              aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
              className={`flex-1 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                micMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              <span className="text-sm">{micMuted ? 'Mic Off' : 'Mic On'}</span>
            </button>
            <button
              onClick={mediaStream.toggleVideo}
              aria-pressed={cameraOff}
              aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
              className={`flex-1 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                cameraOff ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {cameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              <span className="text-sm">{cameraOff ? 'Camera Off' : 'Camera On'}</span>
            </button>
          </div>

          {/* Device pickers (shown once devices are known) */}
          {(cameras.length > 1 || mics.length > 1) && (
            <div className="grid grid-cols-1 gap-2">
              {cameras.length > 1 && (
                <label className="text-xs text-gray-400">
                  Camera
                  <select
                    value={selectedCamera}
                    onChange={(e) => handleCameraChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {cameras.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || 'Camera'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {mics.length > 1 && (
                <label className="text-xs text-gray-400">
                  Microphone
                  <select
                    value={selectedMic}
                    onChange={(e) => handleMicChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {mics.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || 'Microphone'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-bold mb-2">Alapon</h1>
            <p className="text-gray-400">Encrypted video meetings</p>
          </div>

          <div>
            <label htmlFor="prejoin-name" className="block text-sm font-medium text-gray-300 mb-2">
              Your name
            </label>
            <input
              id="prejoin-name"
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
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          </div>

          <button
            onClick={() => handleJoin(isJoining ? false : true)}
            disabled={isLoading || !name.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
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
                onClick={handleCopyLink}
                className={`mt-2 w-full text-xs py-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  copied ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {copied ? 'Copied!' : 'Copy Link'}
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
