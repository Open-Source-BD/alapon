import { useEffect, useRef, useState } from 'react'
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
  Smile,
  LayoutGrid,
  PictureInPicture2,
  Circle,
  Sparkles,
} from 'lucide-react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useMeetingStore } from '@/store/meetingStore'
import { useMediaStream } from '@/hooks/useMediaStream'
import { useRecording } from '@/hooks/useRecording'
import { REACTION_EMOJIS } from '@/lib/emoji'
import { cn } from '@/lib/utils'

interface ControlBarProps {
  onLeave: () => void
  onReaction: (emoji: string) => void
  // Screen share is owned by MeetingRoom's useWebRTC instance (it holds the peer
  // senders + data channel). ControlBar just triggers it.
  startScreenShare: () => Promise<void>
  stopScreenShare: () => Promise<void>
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
    red: 'bg-danger hover:bg-danger-hover',
    green: 'bg-success hover:bg-success',
    amber: 'bg-warn hover:bg-warn',
    blue: 'bg-accent hover:bg-accent-hover',
  }[accent]

  // The accent surfaces (cyan/green/amber) are light, so their icon must be dark
  // ink for contrast. Danger (red) and the inactive elevated surface take white.
  const iconColor = !active
    ? 'text-text'
    : accent === 'red'
      ? 'text-white'
      : 'text-accent-ink'

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'relative rounded-full p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            iconColor,
            active ? activeBg : 'bg-elevated hover:bg-border',
            className
          )}
        >
          {children}
          {badge !== undefined && badge > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-xs text-white">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={8}
          className="z-50 rounded-md border border-border bg-elevated px-2 py-1 text-xs font-medium text-text shadow-xl select-none"
        >
          {label}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function ControlBar({ onLeave, onReaction, startScreenShare, stopScreenShare }: ControlBarProps) {
  const isAudioMuted = useMeetingStore((s) => s.isAudioMuted)
  const isVideoOff = useMeetingStore((s) => s.isVideoOff)
  const isScreenSharing = useMeetingStore((s) => s.isScreenSharing)
  const videoEffect = useMeetingStore((s) => s.videoEffect)
  const setVideoEffect = useMeetingStore((s) => s.setVideoEffect)
  const isHandRaised = useMeetingStore((s) => s.isHandRaised)
  const isChatOpen = useMeetingStore((s) => s.isChatOpen)
  const isParticipantsOpen = useMeetingStore((s) => s.isParticipantsOpen)
  const unreadChatCount = useMeetingStore((s) => s.unreadChatCount)
  const layout = useMeetingStore((s) => s.layout)

  const toggleChat = useMeetingStore((s) => s.toggleChat)
  const toggleParticipants = useMeetingStore((s) => s.toggleParticipants)
  const toggleHandRaise = useMeetingStore((s) => s.toggleHandRaise)
  const setLayout = useMeetingStore((s) => s.setLayout)
  const setPinned = useMeetingStore((s) => s.setPinned)
  const addToast = useMeetingStore((s) => s.addToast)

  const mediaStream = useMediaStream()
  const isRecording = useMeetingStore((s) => s.isRecording)
  const { startRecording, stopRecording } = useRecording()
  const canRecord = typeof MediaRecorder !== 'undefined'
  const [reactionsOpen, setReactionsOpen] = useState(false)

  // Gate screen share on actual browser support, not viewport width. getDisplayMedia
  // is absent on iOS Safari and insecure origins (where navigator.mediaDevices itself
  // is undefined), but present on desktop browsers at any window size.
  const canScreenShare = typeof navigator.mediaDevices?.getDisplayMedia === 'function'

  const handleReaction = (emoji: string) => {
    onReaction(emoji)
    setReactionsOpen(false)
  }

  const handleToggleLayout = () => {
    // Grid forces the gallery; auto returns to the spotlight/PiP behavior. Either
    // way, clear any manual pin so the layout choice takes effect.
    setPinned(null)
    setLayout(layout === 'grid' ? 'auto' : 'grid')
  }

  // Keyboard shortcuts + push-to-talk (hold Space to unmute while muted)
  const pttActiveRef = useRef(false)
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
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
      // Push-to-talk: hold Space to temporarily unmute (only when muted).
      if (e.code === 'Space' && !e.repeat && !isTypingTarget(e.target)) {
        if (useMeetingStore.getState().isAudioMuted && !pttActiveRef.current) {
          e.preventDefault()
          pttActiveRef.current = true
          mediaStream.toggleAudio() // unmute for the hold
        }
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && pttActiveRef.current) {
        pttActiveRef.current = false
        if (!useMeetingStore.getState().isAudioMuted) mediaStream.toggleAudio() // re-mute
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [mediaStream, onLeave])

  // Browser Picture-in-Picture: pop the largest playing video into a floating window.
  const canPiP =
    typeof document !== 'undefined' && (document as Document).pictureInPictureEnabled
  const handlePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
        return
      }
      const target = [...document.querySelectorAll('video')]
        .filter((v) => v.videoWidth > 0)
        .sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight)[0]
      if (target) await target.requestPictureInPicture()
      else addToast('No active video to pop out', 'info')
    } catch {
      addToast('Picture-in-Picture unavailable', 'error')
    }
  }

  const handleToggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        await stopScreenShare()
      } else {
        await startScreenShare()
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
    <Tooltip.Provider delayDuration={250} skipDelayDuration={400}>
    <div className="shrink-0 bg-surface border-t border-border px-2 py-3 sm:px-6">
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
          onClick={() => setVideoEffect(videoEffect === 'blur' ? 'none' : 'blur')}
          label={videoEffect === 'blur' ? 'Turn off background blur' : 'Blur background'}
          active={videoEffect === 'blur'}
          accent="blue"
        >
          <Sparkles className="w-5 h-5" />
        </ControlButton>

        <ControlButton
          onClick={handleToggleHand}
          label={isHandRaised ? 'Lower hand' : 'Raise hand'}
          active={isHandRaised}
          accent="amber"
        >
          <Hand className="w-5 h-5" />
        </ControlButton>

        {/* Reactions: button opens an emoji popover above the bar. */}
        <div className="relative">
          <ControlButton
            onClick={() => setReactionsOpen((o) => !o)}
            label="Send a reaction"
            active={reactionsOpen}
            accent="blue"
          >
            <Smile className="w-5 h-5" />
          </ControlButton>
          {reactionsOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setReactionsOpen(false)}
                aria-hidden
              />
              <div className="absolute bottom-full left-1/2 z-30 mb-2 flex -translate-x-1/2 gap-1 rounded-full border border-border bg-elevated px-2 py-1.5 shadow-xl">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    aria-label={`React ${emoji}`}
                    className="rounded-full px-1.5 text-2xl transition-transform hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <ControlButton
          onClick={handleToggleLayout}
          label={layout === 'grid' ? 'Switch to spotlight layout' : 'Switch to grid layout'}
          active={layout === 'grid'}
          accent="blue"
        >
          <LayoutGrid className="w-5 h-5" />
        </ControlButton>

        {canPiP && (
          <ControlButton onClick={handlePiP} label="Picture-in-Picture" accent="blue">
            <PictureInPicture2 className="w-5 h-5" />
          </ControlButton>
        )}

        {canRecord && (
          <ControlButton
            onClick={() => (isRecording ? stopRecording() : startRecording())}
            label={isRecording ? 'Stop recording' : 'Record meeting (saves to your device)'}
            active={isRecording}
            accent="red"
          >
            <Circle className={cn('w-5 h-5', isRecording && 'fill-current')} />
          </ControlButton>
        )}

        {/* Shown only where the browser actually supports screen capture (any desktop
            width); hidden on iOS Safari / insecure origins to avoid a dead button. */}
        {canScreenShare && (
          <ControlButton
            onClick={handleToggleScreenShare}
            label={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
            active={isScreenSharing}
            accent="green"
          >
            <Share2 className="w-5 h-5" />
          </ControlButton>
        )}

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
    </Tooltip.Provider>
  )
}
