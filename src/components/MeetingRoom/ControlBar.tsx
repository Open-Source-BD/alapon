import { useEffect } from 'react'
import { Mic, MicOff, Video, VideoOff, Share2, Phone, MessageSquare, Users, MoreVertical } from 'lucide-react'
import { useMeetingStore } from '@/store/meetingStore'
import { useMediaStream } from '@/hooks/useMediaStream'

interface ControlBarProps {
  onLeave: () => void
}

export function ControlBar({ onLeave }: ControlBarProps) {
  const isAudioMuted = useMeetingStore((s) => s.isAudioMuted)
  const isVideoOff = useMeetingStore((s) => s.isVideoOff)
  const isScreenSharing = useMeetingStore((s) => s.isScreenSharing)
  const isChatOpen = useMeetingStore((s) => s.isChatOpen)
  const isParticipantsOpen = useMeetingStore((s) => s.isParticipantsOpen)
  const chatMessages = useMeetingStore((s) => s.chatMessages)
  const peers = useMeetingStore((s) => s.peers)

  const toggleChat = useMeetingStore((s) => s.toggleChat)
  const toggleParticipants = useMeetingStore((s) => s.toggleParticipants)

  const mediaStream = useMediaStream()

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        mediaStream.toggleAudio()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault()
        mediaStream.toggleVideo()
      }
      if (e.key === 'Escape') {
        onLeave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mediaStream, onLeave])

  const handleToggleMic = () => {
    mediaStream.toggleAudio()
  }

  const handleToggleCamera = () => {
    mediaStream.toggleVideo()
  }

  const handleToggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        await mediaStream.stopScreenShare()
      } else {
        await mediaStream.startScreenShare()
      }
    } catch (error) {
      console.error('Screen share error:', error)
    }
  }

  const unreadCount = chatMessages.length > 0 ? chatMessages.length : 0

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Left: Meeting info */}
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-gray-300 text-sm">Alapon</span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400 text-sm">{1 + Object.keys(peers).length} participants</span>
        </div>

        {/* Center: Media controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleMic}
            className={`p-3 rounded-full transition-colors ${
              isAudioMuted
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title="Ctrl+D: Toggle microphone"
          >
            {isAudioMuted ? (
              <MicOff className="w-5 h-5 text-white" />
            ) : (
              <Mic className="w-5 h-5 text-white" />
            )}
          </button>

          <button
            onClick={handleToggleCamera}
            className={`p-3 rounded-full transition-colors ${
              isVideoOff
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title="Ctrl+E: Toggle camera"
          >
            {isVideoOff ? (
              <VideoOff className="w-5 h-5 text-white" />
            ) : (
              <Video className="w-5 h-5 text-white" />
            )}
          </button>

          <button
            onClick={handleToggleScreenShare}
            className={`p-3 rounded-full transition-colors ${
              isScreenSharing
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title="Share screen"
          >
            <Share2 className="w-5 h-5 text-white" />
          </button>

          <button
            className="p-3 rounded-full bg-gray-700 hover:bg-gray-600"
            title="More options"
          >
            <MoreVertical className="w-5 h-5 text-white" />
          </button>

          <button
            onClick={onLeave}
            className="p-3 rounded-full bg-red-600 hover:bg-red-700"
            title="Leave meeting (Esc)"
          >
            <Phone className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Right: Sidebar toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleChat}
            className={`relative p-3 rounded-full transition-colors ${
              isChatOpen
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title="Toggle chat"
          >
            <MessageSquare className="w-5 h-5 text-white" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={toggleParticipants}
            className={`relative p-3 rounded-full transition-colors ${
              isParticipantsOpen
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title="Toggle participants"
          >
            <Users className="w-5 h-5 text-white" />
            <span className="absolute top-0 right-0 bg-gray-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {1 + Object.keys(peers).length}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
