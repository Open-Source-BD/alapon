import { useEffect, useRef, useState } from 'react'
import { Send, X, Smile } from 'lucide-react'
import { useMeetingStore } from '@/store/meetingStore'
import { EmojiPicker } from '../EmojiPicker'

interface ChatPanelProps {
  // Provided by MeetingRoom's single useWebRTC instance so chat uses the same
  // peer connections as the media (no second WebRTC stack).
  sendChatMessage: (text: string) => void
  sendTyping: (typing: boolean) => void
}

const URL_RE = /(https?:\/\/[^\s]+)/g

// Render message text with clickable links. Plain string segments stay as text.
// split() keeps the captured URLs as separate segments; test each with a
// non-global regex (a /g regex's lastIndex makes .test() stateful/unreliable).
function linkify(text: string) {
  return text.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline break-all"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export function ChatPanel({ sendChatMessage, sendTyping }: ChatPanelProps) {
  const [messageText, setMessageText] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isTypingRef = useRef(false)

  const chatMessages = useMeetingStore((s) => s.chatMessages)
  const localUid = useMeetingStore((s) => s.localUid)
  const peers = useMeetingStore((s) => s.peers)
  const peersTyping = useMeetingStore((s) => s.peersTyping)
  const toggleChat = useMeetingStore((s) => s.toggleChat)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Tell peers we stopped typing if the panel unmounts mid-compose.
  useEffect(() => {
    return () => {
      if (isTypingRef.current) sendTyping(false)
      clearTimeout(typingTimeoutRef.current)
    }
  }, [sendTyping])

  const setTyping = (typing: boolean) => {
    if (typing === isTypingRef.current) return
    isTypingRef.current = typing
    sendTyping(typing)
  }

  const handleChange = (value: string) => {
    setMessageText(value)
    if (value.trim()) {
      setTyping(true)
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => setTyping(false), 2000)
    } else {
      setTyping(false)
    }
  }

  const handleSendMessage = () => {
    if (!messageText.trim()) return
    sendChatMessage(messageText)
    setMessageText('')
    setTyping(false)
    clearTimeout(typingTimeoutRef.current)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const insertEmoji = (emoji: string) => {
    setMessageText((t) => t + emoji)
    setEmojiOpen(false)
    inputRef.current?.focus()
  }

  // Who's typing (excluding ourselves).
  const typingNames = Object.keys(peersTyping)
    .filter((uid) => peersTyping[uid] && uid !== localUid)
    .map((uid) => peers[uid]?.name || 'Someone')
  const typingLabel =
    typingNames.length === 0
      ? ''
      : typingNames.length === 1
        ? `${typingNames[0]} is typing…`
        : typingNames.length === 2
          ? `${typingNames[0]} and ${typingNames[1]} are typing…`
          : 'Several people are typing…'

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
                <p className="text-sm text-text break-words">{linkify(msg.text)}</p>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Typing indicator */}
      <div className="h-5 px-4 text-xs text-muted">{typingLabel}</div>

      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <div className="relative">
            <button
              onClick={() => setEmojiOpen((o) => !o)}
              aria-label="Insert emoji"
              className="p-2 rounded-lg bg-elevated hover:bg-border text-muted hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Smile className="w-4 h-4" />
            </button>
            {emojiOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setEmojiOpen(false)} aria-hidden />
                <div className="absolute bottom-full left-0 z-30 mb-2">
                  <EmojiPicker onSelect={insertEmoji} />
                </div>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={messageText}
            onChange={(e) => handleChange(e.target.value)}
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
