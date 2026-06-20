import { useEffect, useRef, useState } from 'react'
import { Send, X, Smile, CornerUpLeft, Copy, Trash2, SmilePlus, Check, CheckCheck } from 'lucide-react'
import { useMeetingStore, type ChatMessage, type ReplyRef } from '@/store/meetingStore'
import { EmojiPicker } from '../EmojiPicker'
import { REACTION_EMOJIS } from '@/lib/emoji'
import { cn } from '@/lib/utils'

interface ChatPanelProps {
  // Provided by MeetingRoom's single useWebRTC instance so chat uses the same
  // peer connections as the media (no second WebRTC stack).
  sendChatMessage: (text: string, replyTo?: ReplyRef) => void
  sendTyping: (typing: boolean) => void
  sendMessageReaction: (msgId: string, emoji: string) => void
  sendMessageDelete: (msgId: string) => void
  sendReceipt: (msgId: string, state: 'delivered' | 'seen') => void
}

// ✓ sent · ✓✓ delivered to everyone · ✓✓(accent) seen by everyone.
function ReceiptTicks({ msg, peerCount }: { msg: ChatMessage; peerCount: number }) {
  if (peerCount === 0) return <Check className="h-3 w-3 text-muted" />
  const seen = (msg.seenBy?.length ?? 0) >= peerCount
  const delivered = (msg.deliveredTo?.length ?? 0) >= peerCount
  if (seen) return <CheckCheck className="h-3 w-3 text-accent" />
  if (delivered) return <CheckCheck className="h-3 w-3 text-muted" />
  return <Check className="h-3 w-3 text-muted" />
}

const URL_RE = /(https?:\/\/[^\s]+)/g

// Render message text with clickable links. split() keeps captured URLs as
// separate segments; test each with a non-global regex (a /g regex's lastIndex
// makes .test() stateful/unreliable).
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

interface BubbleProps {
  msg: ChatMessage
  isOwn: boolean
  localUid: string
  peerCount: number
  onReply: (m: ChatMessage) => void
  onReact: (msgId: string, emoji: string) => void
  onDelete: (msgId: string) => void
  onCopy: (text: string) => void
}

function MessageBubble({ msg, isOwn, localUid, peerCount, onReply, onReact, onDelete, onCopy }: BubbleProps) {
  const [reactOpen, setReactOpen] = useState(false)

  const time = new Date(msg.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="group relative flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold text-accent">
          {isOwn ? 'You' : msg.fromName}
        </span>
        <span className="text-xs text-muted">{time}</span>
        {isOwn && !msg.deleted && <ReceiptTicks msg={msg} peerCount={peerCount} />}
      </div>

      {/* Quoted reply */}
      {msg.replyTo && (
        <div className="rounded border-l-2 border-accent/60 bg-elevated/60 px-2 py-1 text-xs text-muted">
          <span className="font-medium text-accent">{msg.replyTo.fromName}</span>
          <span className="ml-1 line-clamp-2">{msg.replyTo.text || '[deleted]'}</span>
        </div>
      )}

      {msg.deleted ? (
        <p className="text-sm italic text-muted">🚫 This message was deleted</p>
      ) : (
        <p className="text-sm text-text break-words whitespace-pre-wrap">{linkify(msg.text)}</p>
      )}

      {/* Reaction chips */}
      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {Object.entries(msg.reactions).map(([emoji, uids]) => (
            <button
              key={emoji}
              onClick={() => onReact(msg.id, emoji)}
              className={cn(
                'flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors',
                uids.includes(localUid)
                  ? 'border-accent bg-accent/20 text-text'
                  : 'border-border bg-elevated text-muted hover:bg-border'
              )}
            >
              <span>{emoji}</span>
              <span>{uids.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Hover actions */}
      {!msg.deleted && (
        <div className="absolute -top-2 right-0 hidden items-center gap-0.5 rounded-md border border-border bg-elevated px-1 py-0.5 shadow-lg group-hover:flex">
          <div className="relative">
            <button
              onClick={() => setReactOpen((o) => !o)}
              aria-label="React to message"
              className="rounded p-1 text-muted hover:text-text hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <SmilePlus className="h-4 w-4" />
            </button>
            {reactOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setReactOpen(false)} aria-hidden />
                <div className="absolute bottom-full right-0 z-30 mb-1 flex gap-0.5 rounded-full border border-border bg-elevated px-1.5 py-1 shadow-xl">
                  {REACTION_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        onReact(msg.id, e)
                        setReactOpen(false)
                      }}
                      aria-label={`React ${e}`}
                      className="rounded-full px-1 text-lg hover:scale-125 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => onReply(msg)}
            aria-label="Reply to message"
            className="rounded p-1 text-muted hover:text-text hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <CornerUpLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => onCopy(msg.text)}
            aria-label="Copy message"
            className="rounded p-1 text-muted hover:text-text hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Copy className="h-4 w-4" />
          </button>
          {isOwn && (
            <button
              onClick={() => onDelete(msg.id)}
              aria-label="Delete message"
              className="rounded p-1 text-muted hover:text-danger hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function ChatPanel({
  sendChatMessage,
  sendTyping,
  sendMessageReaction,
  sendMessageDelete,
  sendReceipt,
}: ChatPanelProps) {
  const [messageText, setMessageText] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [replyingTo, setReplyingTo] = useState<ReplyRef | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isTypingRef = useRef(false)
  const seenSentRef = useRef<Set<string>>(new Set())

  const chatMessages = useMeetingStore((s) => s.chatMessages)
  const localUid = useMeetingStore((s) => s.localUid)
  const peers = useMeetingStore((s) => s.peers)
  const peersTyping = useMeetingStore((s) => s.peersTyping)
  const toggleChat = useMeetingStore((s) => s.toggleChat)
  const addToast = useMeetingStore((s) => s.addToast)

  const peerCount = Object.keys(peers).length

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // The panel only mounts while open, so any others' message visible here counts
  // as seen — send a 'seen' receipt once per message.
  useEffect(() => {
    for (const m of chatMessages) {
      if (m.fromUid !== localUid && !m.deleted && !seenSentRef.current.has(m.id)) {
        seenSentRef.current.add(m.id)
        sendReceipt(m.id, 'seen')
      }
    }
  }, [chatMessages, localUid, sendReceipt])

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
    sendChatMessage(messageText, replyingTo ?? undefined)
    setMessageText('')
    setReplyingTo(null)
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

  const handleReply = (m: ChatMessage) => {
    setReplyingTo({ id: m.id, fromName: m.fromUid === localUid ? 'You' : m.fromName, text: m.text })
    inputRef.current?.focus()
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      addToast('Copied to clipboard', 'success')
    } catch {
      addToast('Could not copy', 'error')
    }
  }

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
              <MessageBubble
                key={msg.id}
                msg={msg}
                isOwn={msg.fromUid === localUid}
                localUid={localUid}
                peerCount={peerCount}
                onReply={handleReply}
                onReact={sendMessageReaction}
                onDelete={sendMessageDelete}
                onCopy={handleCopy}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Typing indicator */}
      <div className="h-5 px-4 text-xs text-muted">{typingLabel}</div>

      {/* Reply bar */}
      {replyingTo && (
        <div className="mx-4 mb-1 flex items-center justify-between gap-2 rounded border-l-2 border-accent bg-elevated px-2 py-1 text-xs">
          <div className="min-w-0">
            <span className="font-medium text-accent">Replying to {replyingTo.fromName}</span>
            <p className="truncate text-muted">{replyingTo.text}</p>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            aria-label="Cancel reply"
            className="rounded p-0.5 text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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
