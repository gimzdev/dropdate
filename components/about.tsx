'use client'

import { type ReactNode, useMemo, useState } from 'react'

type Block = { t: 'lead' | 'p' | 'h' | 'ul'; text?: string; items?: string[] }

const BULLET = /^\s*(?:[•·▪●◦*]|-\s)\s*/

/** Plain description text into a lead paragraph, headings, bullet lists and short paragraphs. */
function parse(raw: string): Block[] {
  const text = raw.replace(/\r/g, '').split(/\n\s*(?:Español|Español:|Spanish)\s*\n/i)[0] // RAWG often appends a translation
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (/^about( (this|the) game)?:?$/i.test(lines[0] ?? '')) lines.shift() // the section already says "About"
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
    const hasLead = out.some((b) => b.t === 'lead')
    const label = /:$/.test(line) || caps // "KEY FEATURES" or "Features:"
    const title = hasLead && n < lines.length - 1 && !/[.!?,;]$/.test(line) && line.split(' ').length <= 7 // a short unpunctuated line between paragraphs
    const head = line.length <= 60 && (label || title)
    if (head) out.push({ t: 'h', text: line.replace(/:$/, '') })
    else out.push({ t: hasLead ? 'p' : 'lead', text: line })
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

// Sentence case for shouted headings: "KEY FEATURES" reads as "Key features"
const tidy = (s: string) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s)

export function About({ text, title }: { text: string; title: string }): ReactNode {
  const blocks = useMemo(() => parse(text), [text])
  const [open, setOpen] = useState(false)
  // the preview is whole blocks: the lead and, if it is short, the next paragraph. Never a half-cut line.
  let cut = 0, chars = 0
  while (cut < blocks.length && cut < 3 && (chars < 380 || blocks[cut - 1]?.t === 'h')) { chars += blocks[cut].text?.length ?? (blocks[cut].items?.join('').length ?? 0); cut++ }
  if (blocks[cut - 1]?.t === 'h') cut--
  const long = blocks.length > cut && text.length > 700
  const shown = open || !long ? blocks : blocks.slice(0, cut)
  return (
    <div className="max-w-[68ch]">
      <div className="space-y-5">
        {shown.map((b, n) => {
          if (b.t === 'lead') return <p key={n} className="text-[19px] leading-relaxed text-fg md:text-xl">{b.text}</p>
          if (b.t === 'h') return <h3 key={n} className="pt-4 text-[17px] font-semibold text-fg">{tidy(b.text ?? '')}</h3>
          if (b.t === 'ul') return (
            <ul key={n} className="space-y-2.5">
              {b.items?.map((it, k) => <li key={k} className="flex gap-3 leading-relaxed text-muted"><span className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-fg/50" />{it}</li>)}
            </ul>
          )
          return <p key={n} className="leading-relaxed text-muted">{b.text}</p>
        })}
      </div>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? `Show less about ${title}` : `Read more about ${title}`} className="btn btn-line mt-6">
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}
