import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type Phase = 'idle' | 'prejoin' | 'joining' | 'inmeeting' | 'left'

export interface PeerState {
  uid: string
  name: string
  stream: MediaStream | null
  isAudioMuted: boolean
  isVideoOff: boolean
  isHandRaised: boolean
  connectionState: RTCPeerConnectionState | null
}

export interface ChatMessage {
  id: string
  fromUid: string
  fromName: string
  text: string
  timestamp: number
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
  setLocalStream: (stream: MediaStream | null) => void
  setAudioMuted: (muted: boolean) => void
  setVideoOff: (off: boolean) => void
  setScreenSharing: (sharing: boolean) => void

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

  // Chat
  chatMessages: ChatMessage[]
  unreadChatCount: number
  addChatMessage: (message: ChatMessage) => void
  clearChatMessages: () => void

  // Hand raise
  handRaisedUids: Set<string>
  toggleHandRaise: (uid: string) => void
  clearHandRaise: () => void

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
  peers: {},
  activeSpeakerUid: null,
  isChatOpen: false,
  isParticipantsOpen: false,
  chatMessages: [],
  unreadChatCount: 0,
  handRaisedUids: new Set<string>(),
  encryptionKey: null,
  isEncrypted: false,
  signalingError: null,
}

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
          }
        }
      }),

    removePeer: (uid: string) =>
      set((state) => {
        delete state.peers[uid]
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

    addChatMessage: (message: ChatMessage) =>
      set((state) => {
        state.chatMessages.push(message)
        // Count as unread only if the chat panel isn't currently open.
        if (!state.isChatOpen) state.unreadChatCount += 1
      }),

    clearChatMessages: () => set({ chatMessages: [], unreadChatCount: 0 }),

    toggleHandRaise: (uid: string) =>
      set((state) => {
        if (state.handRaisedUids.has(uid)) {
          state.handRaisedUids.delete(uid)
        } else {
          state.handRaisedUids.add(uid)
        }
      }),

    clearHandRaise: () => set({ handRaisedUids: new Set() }),

    setEncryptionKey: (key: CryptoKey | null) => set({ encryptionKey: key }),
    setIsEncrypted: (encrypted: boolean) => set({ isEncrypted: encrypted }),

    setSignalingError: (error: string | null) => set({ signalingError: error }),

    reset: () => set(initialState),
  }))
)
