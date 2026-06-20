import { useEffect } from 'react'
import { useMeetingStore, type Reaction } from '@/store/meetingStore'

const LIFETIME_MS = 4000

function FloatingReaction({ reaction }: { reaction: Reaction }) {
  const removeReaction = useMeetingStore((s) => s.removeReaction)

  useEffect(() => {
    const id = setTimeout(() => removeReaction(reaction.id), LIFETIME_MS)
    return () => clearTimeout(id)
  }, [reaction.id, removeReaction])

  // Spread reactions horizontally using a stable hash of the id so concurrent
  // reactions don't stack on top of each other.
  const hash = reaction.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const leftPct = 10 + (hash % 80)

  return (
    <span
      className="absolute bottom-24 text-4xl select-none"
      style={{
        left: `${leftPct}%`,
        animation: `reaction-float ${LIFETIME_MS}ms ease-out forwards`,
      }}
    >
      {reaction.emoji}
    </span>
  )
}

// Renders the live floating reactions over the call stage. Pointer-events off so
// it never blocks the controls beneath it.
export function ReactionsOverlay() {
  const reactions = useMeetingStore((s) => s.reactions)

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {reactions.map((r) => (
        <FloatingReaction key={r.id} reaction={r} />
      ))}
    </div>
  )
}
