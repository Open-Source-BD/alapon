import { useEffect, useRef } from 'react'
import { useMeetingStore } from '@/store/meetingStore'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useMediaStream } from '@/hooks/useMediaStream'
import { VideoGrid } from './VideoGrid'
import { ControlBar } from './ControlBar'
import { ChatPanel } from './SidePanel/ChatPanel'
import { ParticipantsPanel } from './SidePanel/ParticipantsPanel'

export function MeetingRoom() {
  const roomId = useMeetingStore((s) => s.roomId)
  const isChatOpen = useMeetingStore((s) => s.isChatOpen)
  const isParticipantsOpen = useMeetingStore((s) => s.isParticipantsOpen)
  const phase = useMeetingStore((s) => s.phase)
  const signalingError = useMeetingStore((s) => s.signalingError)
  const setSignalingError = useMeetingStore((s) => s.setSignalingError)

  const setPhase = useMeetingStore((s) => s.setPhase)
  const setJoinedAt = useMeetingStore((s) => s.setJoinedAt)
  const reset = useMeetingStore((s) => s.reset)

  // useWebRTC is the single owner of peer connections, signaling, and the chat
  // data channel. It also drives active-speaker detection internally. Anything
  // that needs to send chat (ChatPanel) gets it from here via props — calling
  // useWebRTC again would spin up a second, competing WebRTC stack.
  const { sendChatMessage } = useWebRTC(roomId)
  const mediaStream = useMediaStream()
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (phase !== 'inmeeting') {
      return
    }

    useMeetingStore.getState().setJoinedAt(Date.now())
  }, [phase])

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
    <div className="relative flex h-screen bg-gray-950 text-white overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        {signalingError && (
          <div className="flex items-center justify-between gap-4 bg-red-900/40 border-b border-red-700 px-4 py-2 text-sm text-red-200">
            <span>{signalingError}</span>
            <button
              onClick={() => setSignalingError(null)}
              className="text-red-300 hover:text-white text-xs underline whitespace-nowrap"
            >
              Dismiss
            </button>
          </div>
        )}
        <VideoGrid />
        <ControlBar onLeave={handleLeave} />
      </div>

      {/* Side panel: hidden entirely when closed (no wasted column). On phones
          it overlays the call full-width; on larger screens it docks at 320px. */}
      {isPanelOpen && (
        <div className="absolute inset-0 z-20 bg-gray-900 sm:static sm:inset-auto sm:w-80 border-l border-gray-700 flex">
          {isChatOpen ? (
            <ChatPanel sendChatMessage={sendChatMessage} />
          ) : (
            <ParticipantsPanel />
          )}
        </div>
      )}
    </div>
  )
}
