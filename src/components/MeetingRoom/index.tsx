import { useEffect, useRef, useState } from 'react'
import { Lock, Link2, Check, Users } from 'lucide-react'
import { useMeetingStore } from '@/store/meetingStore'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useMediaStream } from '@/hooks/useMediaStream'
import { VideoGrid } from './VideoGrid'
import { ControlBar } from './ControlBar'
import { ChatPanel } from './SidePanel/ChatPanel'
import { ParticipantsPanel } from './SidePanel/ParticipantsPanel'
import { ReactionsOverlay } from './ReactionsOverlay'
import { Toaster } from '../Toaster'
import { MAX_PARTICIPANTS } from '@/lib/constants'

export function MeetingRoom() {
  const roomId = useMeetingStore((s) => s.roomId)
  const isChatOpen = useMeetingStore((s) => s.isChatOpen)
  const isParticipantsOpen = useMeetingStore((s) => s.isParticipantsOpen)
  const phase = useMeetingStore((s) => s.phase)
  const isEncrypted = useMeetingStore((s) => s.isEncrypted)
  const peers = useMeetingStore((s) => s.peers)
  const signalingError = useMeetingStore((s) => s.signalingError)
  const setSignalingError = useMeetingStore((s) => s.setSignalingError)
  const addToast = useMeetingStore((s) => s.addToast)

  const setPhase = useMeetingStore((s) => s.setPhase)
  const setJoinedAt = useMeetingStore((s) => s.setJoinedAt)
  const reset = useMeetingStore((s) => s.reset)

  // useWebRTC is the single owner of peer connections, signaling, and the chat
  // data channel. It also drives active-speaker detection internally. Anything
  // that needs to send chat (ChatPanel) gets it from here via props — calling
  // useWebRTC again would spin up a second, competing WebRTC stack.
  const {
    sendChatMessage,
    sendReaction,
    sendTyping,
    sendMessageReaction,
    sendMessageDelete,
    sendReceipt,
    sendFile,
  } = useWebRTC(roomId)
  const mediaStream = useMediaStream()
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [linkCopied, setLinkCopied] = useState(false)

  const participantCount = 1 + Object.keys(peers).length
  const nearFullToastedRef = useRef(false)

  useEffect(() => {
    if (phase !== 'inmeeting') {
      return
    }

    useMeetingStore.getState().setJoinedAt(Date.now())
  }, [phase])

  // One-time heads-up when the room is one slot from full.
  useEffect(() => {
    if (participantCount >= MAX_PARTICIPANTS - 1 && !nearFullToastedRef.current) {
      nearFullToastedRef.current = true
      addToast(`Room is almost full (${participantCount}/${MAX_PARTICIPANTS})`, 'info')
    }
  }, [participantCount, addToast])

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setLinkCopied(true)
      addToast('Invite link copied to clipboard', 'success')
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      addToast('Could not copy — copy the URL from the address bar', 'error')
    }
  }

  const handleLeave = async () => {
    try {
      // Preserve joinedAt so PostCallScreen can show the real call duration:
      // reset() wipes it (and would reset phase to 'idle', hiding PostCallScreen
      // entirely), so capture it first and restore phase/joinedAt afterward.
      const joinedAt = useMeetingStore.getState().joinedAt
      mediaStream.stopMedia()
      reset()
      setJoinedAt(joinedAt)
      setPhase('left')

      leaveTimeoutRef.current = setTimeout(() => {
        window.location.href = '/'
      }, 1000)
    } catch (error) {
      console.error('Failed to leave meeting:', error)
    }
  }

  useEffect(() => {
    return () => {
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current)
      }
    }
  }, [])

  const isPanelOpen = isChatOpen || isParticipantsOpen

  return (
    <div className="flex h-screen flex-col bg-base text-white overflow-hidden">
      <Toaster />

      {/* Top bar — app identity, encryption status, participant count, and the
          invite action (always visible, including on mobile). */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display font-semibold text-text">Alapon</span>
          {isEncrypted && (
            <span title="End-to-end key in URL fragment" className="hidden sm:inline-flex items-center">
              <Lock className="w-3.5 h-3.5 text-success" />
            </span>
          )}
          <span className="text-muted">|</span>
          <span className="inline-flex items-center gap-1 text-sm text-muted whitespace-nowrap">
            <Users className="w-3.5 h-3.5" />
            {participantCount} / {MAX_PARTICIPANTS}
          </span>
        </div>
        <button
          onClick={handleCopyInvite}
          aria-label="Copy invite link"
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            linkCopied ? 'bg-success text-accent-ink' : 'bg-accent hover:bg-accent-hover text-accent-ink'
          }`}
        >
          {linkCopied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
          <span>{linkCopied ? 'Copied' : 'Invite'}</span>
        </button>
      </header>

      {/* Body: stage on the left, panel docked right (desktop) or as a bottom
          sheet (mobile). */}
      <div className="relative flex flex-1 min-h-0">
        <div className="flex flex-1 flex-col min-w-0">
          {signalingError && (
            <div className="flex items-center justify-between gap-4 bg-danger/10 border-b border-danger/40 px-4 py-2 text-sm text-danger">
              <span>{signalingError}</span>
              <button
                onClick={() => setSignalingError(null)}
                className="text-danger hover:text-white text-xs underline whitespace-nowrap"
              >
                Dismiss
              </button>
            </div>
          )}
          <div className="relative flex flex-1 min-h-0">
            <VideoGrid />
            <ReactionsOverlay />
          </div>
          <ControlBar onLeave={handleLeave} onReaction={sendReaction} />
        </div>

        {isPanelOpen && (
          <div
            className="absolute inset-x-0 bottom-0 top-auto z-20 flex h-[72%] rounded-t-2xl border-t border-border bg-surface shadow-2xl
                       sm:static sm:h-auto sm:w-80 sm:rounded-none sm:border-t-0 sm:border-l sm:shadow-none"
          >
            {isChatOpen ? (
              <ChatPanel
              sendChatMessage={sendChatMessage}
              sendTyping={sendTyping}
              sendMessageReaction={sendMessageReaction}
              sendMessageDelete={sendMessageDelete}
              sendReceipt={sendReceipt}
              sendFile={sendFile}
            />
            ) : (
              <ParticipantsPanel />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
