'use client'

import { type ReactNode, useMemo, useState } from 'react'

type Block = { t: 'lead' | 'p' | 'h' | 'ul'; text?: string; items?: string[] }

const BULLET = /^\s*(?:[•·▪●◦*]|-\s)\s*/

/** Plain description text into a lead paragraph, headings, bullet lists and short paragraphs. */
function parse(raw: string): Block[] {
  const text = raw.replace(/\r/g, '').split(/\n\s*(?:Español|Español:|Spanish)\s*\n/i)[0] // RAWG often appends a translation
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const out: Block[] = []
  lines.forEach((line, n) => {
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, '').trim()
      const last = out[out.length - 1]
      if (last?.t === 'ul') last.items?.push(item)
      else out.push({ t: 'ul', items: [item] })
      return
    }
    const letters = line.replace(/[^A-Za-z]/g, '')
    const caps = letters.length > 3 && line === line.toUpperCase()
    const head = line.length <= 60 && (/:$/.test(line) || caps || (n < lines.length - 1 && !/[.!?,;]$/.test(line) && line.split(' ').length <= 7 && !out.every((b) => b.t !== 'p' && b.t !== 'lead')))
    if (head) out.push({ t: 'h', text: line.replace(/:$/, '') })
    else out.push({ t: out.some((b) => b.t === 'lead') ? 'p' : 'lead', text: line })
  })
  // long paragraphs are easier to read split at sentence boundaries
  return out.flatMap((b): Block[] => {
    if ((b.t !== 'p' && b.t !== 'lead') || !b.text || b.text.length < 420) return [b]
    const sentences = b.text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [b.text]
    const parts: string[] = []
    let cur = ''
    for (const s of sentences) {
      if (cur && cur.length + s.length > 320) { parts.push(cur.trim()); cur = '' }
      cur += s
    }
    if (cur.trim()) parts.push(cur.trim())
    return parts.map((text, k) => ({ t: b.t === 'lead' && k === 0 ? 'lead' : 'p', text }))
  })
}

export function About({ text, title }: { text: string; title: string }): ReactNode {
  const blocks = useMemo(() => parse(text), [text])
  const long = text.length > 900
  const [open, setOpen] = useState(false)
  const collapsed = long && !open
  return (
    <div>
      <div className={`relative space-y-4 overflow-hidden transition-[max-height] duration-500 ${collapsed ? 'max-h-[24rem]' : 'max-h-[400rem]'}`}>
        {blocks.map((b, n) => {
          if (b.t === 'lead') return <p key={n} className="text-lg leading-relaxed font-medium text-fg/90 md:text-xl">{b.text}</p>
          if (b.t === 'h') return <h3 key={n} className="pt-3 text-sm font-semibold tracking-wider text-fg uppercase">{b.text}</h3>
          if (b.t === 'ul') return (
            <ul key={n} className="space-y-2 rounded-xl border border-line/10 bg-surface2/60 p-4">
              {b.items?.map((it, k) => <li key={k} className="flex gap-3 text-[15px] leading-relaxed text-muted"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{it}</li>)}
            </ul>
          )
          return <p key={n} className="max-w-[68ch] leading-relaxed text-muted">{b.text}</p>
        })}
        {collapsed && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-bg to-transparent" />}
      </div>
      {long && (
        <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? `Show less about ${title}` : `Read more about ${title}`} className="btn-ghost mt-4">
          {open ? 'Show less' : 'Read more'} <span aria-hidden>{open ? '↑' : '↓'}</span>
        </button>
      )}
    </div>
  )
}
