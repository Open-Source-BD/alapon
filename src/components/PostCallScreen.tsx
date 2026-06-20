import { useMeetingStore } from '@/store/meetingStore'

export function PostCallScreen() {
  const joinedAt = useMeetingStore((s) => s.joinedAt)

  const duration = joinedAt
    ? Math.floor((Date.now() - joinedAt) / 1000)
    : 0

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`
    }
    return `${secs}s`
  }

  return (
    <div className="w-full h-screen bg-base flex items-center justify-center">
      <div className="text-center">
        <div className="mb-8">
          <svg className="w-20 h-20 mx-auto text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 className="font-display text-4xl font-bold text-text mb-2">You've left the meeting</h1>
        <p className="text-muted text-lg mb-2">Call duration: {formatDuration(duration)}</p>

        <div className="mt-8 flex gap-4 justify-center">
          <button
            onClick={() => { window.location.href = '/' }}
            className="px-6 py-2 bg-accent hover:bg-accent-hover text-accent-ink rounded-lg font-medium"
          >
            Return Home
          </button>
          <button
            onClick={() => { window.location.reload() }}
            className="px-6 py-2 bg-elevated hover:bg-border text-white rounded-lg font-medium"
          >
            Rejoin Meeting
          </button>
        </div>
      </div>
    </div>
  )
}
