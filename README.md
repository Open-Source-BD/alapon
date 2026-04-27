# Alapon — Serverless P2P Video Meeting App

🎥 A free, open-source Google Meet alternative built with WebRTC, peer-to-peer connections, and end-to-end encryption.

## Features

✅ **No Backend Required** — Serverless architecture using Firebase Realtime Database for signaling only  
✅ **Peer-to-Peer Calls** — Direct WebRTC connections, no media relay  
✅ **End-to-End Encryption** — DTLS-SRTP + AES-GCM-256 (key in URL fragment)  
✅ **Google Meet UI** — Dark theme, responsive grid, control bar, participant list  
✅ **Screen Sharing** — Share your screen with participants  
✅ **In-Call Chat** — Text messaging via WebRTC DataChannel  
✅ **Active Speaker Detection** — Highlights who's speaking  
✅ **Room Codes** — Easy-to-share URLs like `abc-defg-hij`  
✅ **No Account Needed** — Join instantly with a URL  

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + React 18 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand + immer |
| Signaling | Firebase Realtime Database (free) |
| WebRTC | Raw RTCPeerConnection API |
| STUN | Google + Cloudflare public STUN servers |
| TURN | Metered.ca free tier |
| Encryption | Web Crypto API (AES-GCM-256) |
| Deployment | Cloudflare Pages |

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Firebase account (free Spark plan)

### Installation

```bash
# Install dependencies
npm install

# Create .env.local (copy from .env.example)
cp .env.example .env.local

# Fill in Firebase credentials
# Get from: https://console.firebase.google.com/
```

### Environment Variables (`.env.local`)

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_TURN_USERNAME=
VITE_TURN_CREDENTIAL=
```

[Get Firebase credentials](https://firebase.google.com/docs/database/web/start)  
[Get Metered.ca TURN credentials](https://metered.ca/dashboard)

### Development

```bash
npm run dev
# Open http://localhost:5173/
```

### Build

```bash
npm run build
npm run preview
```

## Architecture

### How It Works

1. **Create/Join a Meeting**
   - User enters name and clicks "Create Meeting" or shares a meeting URL
   - A room code (e.g., `abc-defg-hij`) is generated (or read from URL)
   - Encryption key is generated and embedded in URL fragment: `#key=passphrase`

2. **Peer Discovery**
   - Participants register presence in Firebase Realtime Database
   - `onDisconnect()` auto-removes presence when user leaves
   - Other participants are notified via Firebase listeners

3. **WebRTC Connection Establishment**
   - Peers exchange SDP offers/answers via Firebase
   - ICE candidates are trickled through Firebase
   - Direct P2P connection is established (mesh topology)
   - If behind NAT, TURN relay (Metered.ca) is used

4. **Media & Encryption**
   - Camera/microphone streams flow directly peer-to-peer
   - DTLS-SRTP encrypts media in transit (default)
   - Optional: Insertable Streams apply frame-level AES-GCM encryption
   - Chat messages are exchanged via WebRTC DataChannel

## Project Structure

```
src/
├── lib/
│   ├── firebase.ts          # Firebase app + ref factories
│   ├── iceServers.ts        # STUN + TURN config
│   ├── crypto.ts            # Key derivation + Insertable Streams
│   └── utils.ts             # Utilities
├── store/
│   └── meetingStore.ts      # Zustand store
├── hooks/
│   ├── useMediaStream.ts    # Camera/mic/screen
│   ├── useSignaling.ts      # Firebase signaling
│   ├── useWebRTC.ts         # Peer connections
│   └── useActiveSpeaker.ts  # Audio detection
├── components/
│   ├── PreJoinScreen/
│   ├── MeetingRoom/
│   │   ├── VideoGrid.tsx
│   │   ├── VideoTile.tsx
│   │   ├── ControlBar.tsx
│   │   └── SidePanel/
│   └── PostCallScreen.tsx
├── App.tsx
└── main.tsx
```

## Firebase Setup

1. Create a Firebase project: https://console.firebase.google.com/
2. Enable Realtime Database (Spark plan)
3. Add Security Rules from `firebase-rules.json`
4. Copy API key to `.env.local`

## Limitations

- **Max 4 participants** for P2P mesh
- **TURN bandwidth**: 500 MB/month (Metered.ca free)
- **Firebase Spark plan**: 100 concurrent connections
- **Insertable Streams**: Chrome/Edge 86+, Firefox 113+, Safari 17.4+

## License

MIT
