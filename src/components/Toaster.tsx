import { useEffect } from 'react'
import { Check, Info, AlertTriangle, X } from 'lucide-react'
import { useMeetingStore, type Toast } from '@/store/meetingStore'
import { cn } from '@/lib/utils'

const ICONS = {
  success: Check,
  info: Info,
  error: AlertTriangle,
} as const

const STYLES = {
  success: 'border-success/60 bg-surface text-text',
  info: 'border-border bg-surface text-text',
  error: 'border-danger/60 bg-surface text-text',
} as const

const ICON_COLOR = {
  success: 'text-success',
  info: 'text-accent',
  error: 'text-danger',
} as const

function ToastRow({ toast }: { toast: Toast }) {
  const removeToast = useMeetingStore((s) => s.removeToast)
  const Icon = ICONS[toast.type]

  // Auto-dismiss. Errors linger a little longer than success/info.
  useEffect(() => {
    const ms = toast.type === 'error' ? 5000 : 3000
    const id = setTimeout(() => removeToast(toast.id), ms)
    return () => clearTimeout(id)
  }, [toast.id, toast.type, removeToast])

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur transition-opacity',
        STYLES[toast.type]
      )}
    >
      <Icon className={cn('w-4 h-4 shrink-0', ICON_COLOR[toast.type])} />
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function Toaster() {
  const toasts = useMeetingStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed top-4 left-1/2 z-50 flex w-[min(92vw,24rem)] -translate-x-1/2 flex-col gap-2">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
