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
  success: 'border-green-600 bg-green-950/90 text-green-100',
  info: 'border-gray-600 bg-gray-900/95 text-gray-100',
  error: 'border-red-600 bg-red-950/90 text-red-100',
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
      <Icon className="w-4 h-4 shrink-0" />
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
