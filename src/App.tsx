import { useEffect, useState } from 'react'
import { nanoid } from 'nanoid'
import { useMeetingStore } from '@/store/meetingStore'
import { MeetingRoom } from '@/components/MeetingRoom'
import { PreJoinScreen } from '@/components/PreJoinScreen'
import { PostCallScreen } from '@/components/PostCallScreen'

function App() {
  const [mounted, setMounted] = useState(false)
  const phase = useMeetingStore((s) => s.phase)
  const setLocalUid = useMeetingStore((s) => s.setLocalUid)

  useEffect(() => {
    setLocalUid(nanoid(10))
    setMounted(true)
  }, [setLocalUid])

  if (!mounted) {
    return (
      <div className="w-full h-screen bg-base flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-5xl font-bold text-text mb-4">Alapon</h1>
          <p className="text-muted text-lg">Initializing...</p>
        </div>
      </div>
    )
  }

  // Parse URL to get room ID
  const pathMatch = window.location.pathname.match(/\/([a-z0-9]+-[a-z0-9]+-[a-z0-9]+)\/?$/i)
  const roomIdFromUrl = pathMatch?.[1]

  // Determine which screen to show
  switch (phase) {
    case 'inmeeting':
      return <MeetingRoom />

    case 'left':
      return <PostCallScreen />

    case 'prejoin':
    case 'joining':
    case 'idle':
    default:
      return <PreJoinScreen roomId={roomIdFromUrl ?? undefined} />
  }
}

export default App
