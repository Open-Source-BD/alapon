import { useEffect, useRef, useState } from 'react'
import { Send, X } from 'lucide-react'
import { useMeetingStore } from '@/store/meetingStore'

interface ChatPanelProps {
  // Provided by MeetingRoom's single useWebRTC instance so chat uses the same
  // peer connections as the media (no second WebRTC stack).
  sendChatMessage: (text: string) => void
}

export function ChatPanel({ sendChatMessage }: ChatPanelProps) {
  const [messageText, setMessageText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const chatMessages = useMeetingStore((s) => s.chatMessages)
  const localUid = useMeetingStore((s) => s.localUid)
  const toggleChat = useMeetingStore((s) => s.toggleChat)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSendMessage = () => {
    if (!messageText.trim()) return
    sendChatMessage(messageText)
    setMessageText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="flex flex-1 min-w-0 flex-col h-full bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-semibold text-white">Chat</h3>
        <button
          onClick={toggleChat}
          aria-label="Close chat panel"
          className="p-1 rounded text-muted hover:text-white hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted">
            <p className="text-sm">No messages yet</p>
          </div>
        ) : (
          <>
            {chatMessages.map((msg) => (
              <div key={msg.id} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-accent">
                    {msg.fromUid === localUid ? 'You' : msg.fromName}
                  </span>
                  <span className="text-xs text-muted">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm text-text break-words">{msg.text}</p>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-elevated text-white text-sm rounded-lg px-3 py-2 border border-border focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleSendMessage}
            aria-label="Send message"
            className="p-2 bg-accent hover:bg-accent-hover rounded-lg text-accent-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted mt-2">Press Shift+Enter for new line</p>
      </div>
    </div>
  )
}
