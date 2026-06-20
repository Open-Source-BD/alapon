import { useEffect, useRef, useState } from 'react'
import { Video, VideoOff, Mic, MicOff, RefreshCw } from 'lucide-react'
import { nanoid } from 'nanoid'
import { get, child } from 'firebase/database'
import { useMeetingStore } from '@/store/meetingStore'
import { useMediaStream } from '@/hooks/useMediaStream'
import { deriveRoomKey } from '@/lib/crypto'
import { roomRef } from '@/lib/firebase'
import { MAX_PARTICIPANTS } from '@/lib/constants'

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

      // Soft capacity cap: don't let people walk into a full mesh room (it would
      // degrade the call for everyone). Best-effort — a race for the last slot can
      // let two through; that's acceptable for a graceful cap. Creating is always ok.
      if (!isCreating) {
        const snap = await get(child(roomRef(roomIdToUse), 'participants'))
        const count = snap.exists() ? Object.keys(snap.val()).length : 0
        if (count >= MAX_PARTICIPANTS) {
          setError(
            `This room is full (max ${MAX_PARTICIPANTS} for call quality). Ask the host to start a new one.`
          )
          return
        }
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
    <div className="w-full min-h-screen bg-base text-text flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="flex flex-col gap-4">
          <div className="relative aspect-video bg-surface rounded-lg overflow-hidden border border-border">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {/* Non-destructive error overlay with retry — keeps the layout. */}
            {mediaError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/90 px-4 text-center">
                <p className="text-danger text-sm">{mediaError}</p>
                <button
                  onClick={startMedia}
                  className="flex items-center gap-2 rounded-lg bg-elevated hover:bg-border px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
              className={`flex-1 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                micMuted ? 'bg-danger hover:bg-danger-hover' : 'bg-elevated hover:bg-border'
              }`}
            >
              {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              <span className="text-sm">{micMuted ? 'Mic Off' : 'Mic On'}</span>
            </button>
            <button
              onClick={mediaStream.toggleVideo}
              aria-pressed={cameraOff}
              aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
              className={`flex-1 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                cameraOff ? 'bg-danger hover:bg-danger-hover' : 'bg-elevated hover:bg-border'
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
                <label className="text-xs text-muted">
                  Camera
                  <select
                    value={selectedCamera}
                    onChange={(e) => handleCameraChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                <label className="text-xs text-muted">
                  Microphone
                  <select
                    value={selectedMic}
                    onChange={(e) => handleMicChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
            <h1 className="font-display text-4xl font-bold mb-2">Alapon</h1>
            <p className="text-muted">Encrypted video meetings</p>
          </div>

          <div>
            <label htmlFor="prejoin-name" className="block text-sm font-medium text-text mb-2">
              Your name
            </label>
            <input
              id="prejoin-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full bg-elevated text-white rounded-lg px-4 py-3 border border-border focus:outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleJoin(isJoining ? false : true)
                }
              }}
            />
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          </div>

          <button
            onClick={() => handleJoin(isJoining ? false : true)}
            disabled={isLoading || !name.trim()}
            className="w-full py-3 bg-accent text-accent-ink hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {isLoading ? 'Joining...' : isJoining ? 'Join Meeting' : 'Create & Start Meeting'}
          </button>

          {isJoining && (
            <div className="bg-elevated border border-border rounded-lg p-4">
              <p className="text-xs text-muted mb-2">Meeting link:</p>
              <div className="bg-surface px-3 py-2 rounded text-sm text-text break-all font-mono">
                {window.location.href}
              </div>
              <button
                onClick={handleCopyLink}
                className={`mt-2 w-full text-xs py-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  copied ? 'bg-success text-accent-ink' : 'bg-elevated hover:bg-border'
                }`}
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          )}

          <div className="text-xs text-muted space-y-1">
            <p>✓ Peer-to-peer encrypted calls</p>
            <p>✓ No accounts needed</p>
            <p>✓ Screen sharing & chat included</p>
          </div>
        </div>
      </div>
    </div>
  )
}
