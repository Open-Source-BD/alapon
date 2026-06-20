import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type Phase = 'idle' | 'prejoin' | 'joining' | 'inmeeting' | 'left'

export type ConnectionQuality = 'good' | 'fair' | 'poor'

export interface PeerState {
  uid: string
  name: string
  stream: MediaStream | null
  isAudioMuted: boolean
  isVideoOff: boolean
  isHandRaised: boolean
  connectionState: RTCPeerConnectionState | null
  quality: ConnectionQuality
}

export interface ReplyRef {
  id: string
  fromName: string
  text: string
}

export interface ChatMessage {
  id: string
  fromUid: string
  fromName: string
  text: string
  timestamp: number
  reactions?: Record<string, string[]> // emoji -> uids who reacted
  replyTo?: ReplyRef
  deleted?: boolean
}

export interface Reaction {
  id: string
  uid: string
  emoji: string
  ts: number
}

export type Layout = 'auto' | 'grid'

export type ToastType = 'info' | 'success' | 'error'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

export interface MeetingState {
  // Identity
  localUid: string
  localName: string
  setLocalUid: (uid: string) => void
  setLocalName: (name: string) => void

  // Room
  roomId: string | null
  phase: Phase
  joinedAt: number | null
  setRoomId: (roomId: string | null) => void
  setPhase: (phase: Phase) => void
  setJoinedAt: (timestamp: number | null) => void

  // Media
  localStream: MediaStream | null
  isAudioMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean
  isHandRaised: boolean
  setLocalStream: (stream: MediaStream | null) => void
  setAudioMuted: (muted: boolean) => void
  setVideoOff: (off: boolean) => void
  setScreenSharing: (sharing: boolean) => void
  toggleHandRaise: () => void

  // Peers
  peers: Record<string, PeerState>
  addPeer: (uid: string, name: string) => void
  removePeer: (uid: string) => void
  updatePeer: (uid: string, patch: Partial<PeerState>) => void
  setPeerStream: (uid: string, stream: MediaStream | null) => void

  // UI
  activeSpeakerUid: string | null
  setActiveSpeaker: (uid: string | null) => void
  isChatOpen: boolean
  isParticipantsOpen: boolean
  toggleChat: () => void
  toggleParticipants: () => void

  // Layout / pinning
  pinnedUid: string | null
  setPinned: (uid: string | null) => void
  layout: Layout
  setLayout: (layout: Layout) => void

  // Reactions (ephemeral floating emoji)
  reactions: Reaction[]
  addReaction: (uid: string, emoji: string, id?: string) => void
  removeReaction: (id: string) => void

  // Chat
  chatMessages: ChatMessage[]
  unreadChatCount: number
  peersTyping: Record<string, boolean>
  addChatMessage: (message: ChatMessage) => void
  clearChatMessages: () => void
  setPeerTyping: (uid: string, typing: boolean) => void
  toggleMessageReaction: (msgId: string, emoji: string, uid: string) => void
  setMessageDeleted: (msgId: string) => void

  // Toasts (transient user feedback)
  toasts: Toast[]
  addToast: (message: string, type?: ToastType) => void
  removeToast: (id: string) => void

  // Encryption
  encryptionKey: CryptoKey | null
  isEncrypted: boolean
  setEncryptionKey: (key: CryptoKey | null) => void
  setIsEncrypted: (encrypted: boolean) => void

  // Errors (surfaced to the user)
  signalingError: string | null
  setSignalingError: (error: string | null) => void

  // Reset
  reset: () => void
}

const initialState = {
  localUid: '',
  localName: '',
  roomId: null,
  phase: 'idle' as const,
  joinedAt: null,
  localStream: null,
  isAudioMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  isHandRaised: false,
  peers: {},
  activeSpeakerUid: null,
  isChatOpen: false,
  isParticipantsOpen: false,
  pinnedUid: null,
  layout: 'auto' as Layout,
  reactions: [] as Reaction[],
  chatMessages: [],
  unreadChatCount: 0,
  peersTyping: {} as Record<string, boolean>,
  toasts: [] as Toast[],
  encryptionKey: null,
  isEncrypted: false,
  signalingError: null,
}

// Monotonic id source for toasts/messages. Date.now()+counter avoids collisions
// when several toasts fire in the same millisecond.
let _toastSeq = 0
let _reactionSeq = 0

export const useMeetingStore = create<MeetingState>()(
  immer((set) => ({
    ...initialState,

    setLocalUid: (uid: string) => set({ localUid: uid }),
    setLocalName: (name: string) => set({ localName: name }),
    setRoomId: (roomId: string | null) => set({ roomId }),
    setPhase: (phase: Phase) => set({ phase }),
    setJoinedAt: (timestamp: number | null) => set({ joinedAt: timestamp }),

    setLocalStream: (stream: MediaStream | null) => set({ localStream: stream }),
    setAudioMuted: (muted: boolean) => set({ isAudioMuted: muted }),
    setVideoOff: (off: boolean) => set({ isVideoOff: off }),
    setScreenSharing: (sharing: boolean) => set({ isScreenSharing: sharing }),
    toggleHandRaise: () =>
      set((state) => {
        state.isHandRaised = !state.isHandRaised
      }),

    addPeer: (uid: string, name: string) =>
      set((state) => {
        if (!state.peers[uid]) {
          state.peers[uid] = {
            uid,
            name,
            stream: null,
            isAudioMuted: false,
            isVideoOff: false,
            isHandRaised: false,
            connectionState: null,
            quality: 'good',
          }
        }
      }),

    removePeer: (uid: string) =>
      set((state) => {
        delete state.peers[uid]
        delete state.peersTyping[uid]
        if (state.pinnedUid === uid) state.pinnedUid = null
      }),

    updatePeer: (uid: string, patch: Partial<PeerState>) =>
      set((state) => {
        if (state.peers[uid]) {
          state.peers[uid] = { ...state.peers[uid], ...patch }
        }
      }),

    setPeerStream: (uid: string, stream: MediaStream | null) =>
      set((state) => {
        if (state.peers[uid]) {
          state.peers[uid].stream = stream
        }
      }),

    setActiveSpeaker: (uid: string | null) => set({ activeSpeakerUid: uid }),
    toggleChat: () =>
      set((state) => {
        state.isChatOpen = !state.isChatOpen
        // Opening chat marks everything as read; close participants so only one
        // panel shows at a time.
        if (state.isChatOpen) {
          state.unreadChatCount = 0
          state.isParticipantsOpen = false
        }
      }),
    toggleParticipants: () =>
      set((state) => {
        state.isParticipantsOpen = !state.isParticipantsOpen
        if (state.isParticipantsOpen) state.isChatOpen = false
      }),

    setPinned: (uid: string | null) => set({ pinnedUid: uid }),
    setLayout: (layout: Layout) => set({ layout }),

    addReaction: (uid: string, emoji: string, id?: string) =>
      set((state) => {
        _reactionSeq += 1
        state.reactions.push({
          id: id ?? `r-${Date.now()}-${_reactionSeq}`,
          uid,
          emoji,
          ts: Date.now(),
        })
        // Cap so a spam burst can't grow unbounded before the overlay expires them.
        if (state.reactions.length > 30) state.reactions.shift()
      }),
    removeReaction: (id: string) =>
      set((state) => {
        state.reactions = state.reactions.filter((r) => r.id !== id)
      }),

    setPeerTyping: (uid: string, typing: boolean) =>
      set((state) => {
        if (typing) state.peersTyping[uid] = true
        else delete state.peersTyping[uid]
      }),

    addChatMessage: (message: ChatMessage) =>
      set((state) => {
        state.chatMessages.push(message)
        // Count as unread only if the chat panel isn't currently open.
        if (!state.isChatOpen) state.unreadChatCount += 1
      }),

    clearChatMessages: () => set({ chatMessages: [], unreadChatCount: 0 }),

    toggleMessageReaction: (msgId: string, emoji: string, uid: string) =>
      set((state) => {
        const msg = state.chatMessages.find((m) => m.id === msgId)
        if (!msg) return
        if (!msg.reactions) msg.reactions = {}
        const list = msg.reactions[emoji] ?? []
        if (list.includes(uid)) {
          const next = list.filter((u) => u !== uid)
          if (next.length) msg.reactions[emoji] = next
          else delete msg.reactions[emoji]
        } else {
          msg.reactions[emoji] = [...list, uid]
        }
      }),

    setMessageDeleted: (msgId: string) =>
      set((state) => {
        const msg = state.chatMessages.find((m) => m.id === msgId)
        if (msg) {
          msg.deleted = true
          msg.text = ''
          msg.reactions = {}
        }
      }),

    addToast: (message: string, type: ToastType = 'info') =>
      set((state) => {
        _toastSeq += 1
        const id = `t-${Date.now()}-${_toastSeq}`
        state.toasts.push({ id, message, type })
        // Cap the stack so a flurry of events can't pile up off-screen.
        if (state.toasts.length > 4) state.toasts.shift()
      }),

    removeToast: (id: string) =>
      set((state) => {
        state.toasts = state.toasts.filter((t) => t.id !== id)
      }),

    setEncryptionKey: (key: CryptoKey | null) => set({ encryptionKey: key }),
    setIsEncrypted: (encrypted: boolean) => set({ isEncrypted: encrypted }),

    setSignalingError: (error: string | null) => set({ signalingError: error }),

    reset: () => set(initialState),
  }))
)
