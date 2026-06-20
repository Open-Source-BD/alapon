import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { EMOJI_CATEGORIES, ALL_EMOJIS } from '@/lib/emojiData'
import { cn } from '@/lib/utils'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  className?: string
}

// Dependency-free categorized + searchable emoji picker. Fixed width and square
// cells so emojis never crowd/overlap (the bug this replaces).
export function EmojiPicker({ onSelect, className }: EmojiPickerProps) {
  const [activeCat, setActiveCat] = useState(EMOJI_CATEGORIES[0].id)
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) {
      return ALL_EMOJIS.filter(
        (e) => e.keywords.includes(q) || e.char === q
      ).map((e) => e.char)
    }
    const cat = EMOJI_CATEGORIES.find((c) => c.id === activeCat)
    return (cat?.emojis ?? []).map((e) => e.char)
  }, [query, activeCat])

  return (
    <div
      className={cn(
        'w-72 rounded-lg border border-border bg-elevated shadow-xl',
        className
      )}
    >
      {/* Search */}
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji"
          aria-label="Search emoji"
          className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
        />
      </div>

      {/* Category tabs (hidden while searching) */}
      {!query && (
        <div className="flex items-center gap-1 border-b border-border px-1 py-1">
          {EMOJI_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              aria-label={c.label}
              title={c.label}
              className={cn(
                'rounded p-1 text-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                c.id === activeCat ? 'bg-accent/20' : 'hover:bg-border'
              )}
            >
              {c.icon}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="grid max-h-48 grid-cols-6 gap-1 overflow-y-auto p-2">
        {results.length === 0 ? (
          <p className="col-span-6 py-6 text-center text-sm text-muted">No emoji found</p>
        ) : (
          results.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              onClick={() => onSelect(emoji)}
              aria-label={`Emoji ${emoji}`}
              className="flex h-9 w-9 items-center justify-center rounded text-xl hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {emoji}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
