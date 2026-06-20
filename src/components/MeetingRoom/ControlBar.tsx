import { useEffect } from 'react'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Share2,
  Phone,
  MessageSquare,
  Users,
  Hand,
} from 'lucide-react'
import { useMeetingStore } from '@/store/meetingStore'
import { useMediaStream } from '@/hooks/useMediaStream'
import { cn } from '@/lib/utils'

interface ControlBarProps {
  onLeave: () => void
}

interface ControlButtonProps {
  onClick: () => void
  label: string
  active?: boolean // toggled-on / attention state (red or accent)
  accent?: 'red' | 'green' | 'amber' | 'blue'
  badge?: number
  className?: string
  children: React.ReactNode
}

function ControlButton({
  onClick,
  label,
  active,
  accent = 'red',
  badge,
  className,
  children,
}: ControlButtonProps) {
  const activeBg = {
    red: 'bg-red-600 hover:bg-red-700',
    green: 'bg-green-600 hover:bg-green-700',
    amber: 'bg-amber-500 hover:bg-amber-600',
    blue: 'bg-blue-600 hover:bg-blue-700',
  }[accent]

  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'relative rounded-full p-3 text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
        active ? activeBg : 'bg-gray-700 hover:bg-gray-600',
        className
      )}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

export function ControlBar({ onLeave }: ControlBarProps) {
  const isAudioMuted = useMeetingStore((s) => s.isAudioMuted)
  const isVideoOff = useMeetingStore((s) => s.isVideoOff)
  const isScreenSharing = useMeetingStore((s) => s.isScreenSharing)
  const isHandRaised = useMeetingStore((s) => s.isHandRaised)
  const isChatOpen = useMeetingStore((s) => s.isChatOpen)
  const isParticipantsOpen = useMeetingStore((s) => s.isParticipantsOpen)
  const unreadChatCount = useMeetingStore((s) => s.unreadChatCount)

  const toggleChat = useMeetingStore((s) => s.toggleChat)
  const toggleParticipants = useMeetingStore((s) => s.toggleParticipants)
  const toggleHandRaise = useMeetingStore((s) => s.toggleHandRaise)
  const addToast = useMeetingStore((s) => s.addToast)

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

  const handleToggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        await mediaStream.stopScreenShare()
      } else {
        await mediaStream.startScreenShare()
      }
    } catch (error) {
      console.error('Screen share error:', error)
      addToast('Could not start screen sharing', 'error')
    }
  }

  const handleToggleHand = () => {
    const raising = !isHandRaised
    toggleHandRaise()
    addToast(raising ? 'Hand raised' : 'Hand lowered', 'info')
  }

  return (
    <div className="shrink-0 bg-gray-900 border-t border-gray-700 px-2 py-3 sm:px-6">
      <div className="flex items-center justify-center gap-2 sm:gap-3">
        <ControlButton
          onClick={mediaStream.toggleAudio}
          label={isAudioMuted ? 'Unmute microphone (Ctrl+D)' : 'Mute microphone (Ctrl+D)'}
          active={isAudioMuted}
          accent="red"
        >
          {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </ControlButton>

        <ControlButton
          onClick={mediaStream.toggleVideo}
          label={isVideoOff ? 'Turn camera on (Ctrl+E)' : 'Turn camera off (Ctrl+E)'}
          active={isVideoOff}
          accent="red"
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </ControlButton>

        <ControlButton
          onClick={handleToggleHand}
          label={isHandRaised ? 'Lower hand' : 'Raise hand'}
          active={isHandRaised}
          accent="amber"
        >
          <Hand className="w-5 h-5" />
        </ControlButton>

        {/* Screen share is desktop-only (getDisplayMedia is unreliable on mobile) */}
        <ControlButton
          onClick={handleToggleScreenShare}
          label={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
          active={isScreenSharing}
          accent="green"
          className="hidden sm:inline-flex"
        >
          <Share2 className="w-5 h-5" />
        </ControlButton>

        <ControlButton onClick={onLeave} label="Leave meeting (Esc)" active accent="red">
          <Phone className="w-5 h-5 rotate-[135deg]" />
        </ControlButton>

        <ControlButton
          onClick={toggleChat}
          label="Toggle chat"
          active={isChatOpen}
          accent="blue"
          badge={unreadChatCount}
        >
          <MessageSquare className="w-5 h-5" />
        </ControlButton>

        <ControlButton
          onClick={toggleParticipants}
          label="Toggle participants"
          active={isParticipantsOpen}
          accent="blue"
        >
          <Users className="w-5 h-5" />
        </ControlButton>
      </div>
    </div>
  )
}
