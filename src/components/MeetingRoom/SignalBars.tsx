import { type ConnectionQuality } from '@/store/meetingStore'
import { cn } from '@/lib/utils'

// Three-bar signal-strength indicator driven by connection quality.
// good = 3 green bars, fair = 2 amber, poor = 1 red.
export function SignalBars({
  quality,
  className,
}: {
  quality: ConnectionQuality
  className?: string
}) {
  const level = quality === 'good' ? 3 : quality === 'fair' ? 2 : 1
  const color =
    quality === 'good' ? 'bg-success' : quality === 'fair' ? 'bg-warn' : 'bg-danger'

  return (
    <div
      className={cn('flex items-end gap-0.5', className)}
      title={`Connection: ${quality}`}
      aria-label={`Connection ${quality}`}
      role="img"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn('w-1 rounded-sm', i < level ? color : 'bg-white/20')}
          style={{ height: `${(i + 1) * 4}px` }}
        />
      ))}
    </div>
  )
}
