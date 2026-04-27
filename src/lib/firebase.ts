import { initializeApp } from 'firebase/app'
import { getDatabase, ref } from 'firebase/database'
import type { DatabaseReference } from 'firebase/database'
import { nanoid } from 'nanoid'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getDatabase(app)

export function generateUID(): string {
  return nanoid(10)
}

export function roomRef(roomId: string): DatabaseReference {
  return ref(db, `rooms/${roomId}`)
}

export function participantRef(roomId: string, uid: string): DatabaseReference {
  return ref(db, `rooms/${roomId}/participants/${uid}`)
}

export function signalingRef(roomId: string, fromId: string, toId: string): DatabaseReference {
  return ref(db, `rooms/${roomId}/signaling/${fromId}_${toId}`)
}

export function offerRef(roomId: string, fromId: string, toId: string): DatabaseReference {
  return ref(db, `rooms/${roomId}/signaling/${fromId}_${toId}/offer`)
}

export function answerRef(roomId: string, fromId: string, toId: string): DatabaseReference {
  return ref(db, `rooms/${roomId}/signaling/${fromId}_${toId}/answer`)
}

export function offerCandidatesRef(roomId: string, fromId: string, toId: string): DatabaseReference {
  return ref(db, `rooms/${roomId}/signaling/${fromId}_${toId}/offerCandidates`)
}

export function answerCandidatesRef(roomId: string, fromId: string, toId: string): DatabaseReference {
  return ref(db, `rooms/${roomId}/signaling/${fromId}_${toId}/answerCandidates`)
}
