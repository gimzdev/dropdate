'use client'

// The last resort, for when the layout itself breaks: it replaces the whole document, so it brings its own page and styles.
export default function GlobalFailed({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset: () => void }) {
  const button = { font: 'inherit', fontWeight: 600, height: 44, padding: '0 22px', borderRadius: 999, border: 0, cursor: 'pointer', background: '#ffd23f', color: '#000' } as const
  const link = { ...button, display: 'inline-flex', alignItems: 'center', background: 'transparent', color: '#f4f3ef', boxShadow: 'inset 0 0 0 1px rgba(244,243,238,.25)', textDecoration: 'none' } as const
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100svh', display: 'grid', placeItems: 'center', padding: 24, background: '#000', color: '#f4f3ef', font: '16px/1.5 system-ui, sans-serif', textAlign: 'center' }}>
        <title>Something broke | Dropdate</title>
        <main id="main">
          <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.1 }}>Something broke on our side</h1>
          <p style={{ margin: '16px auto 28px', maxWidth: 420, color: '#a3a29c' }}>That was not you. Try again, and if it keeps happening, come back in a little while.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => (retry ?? reset)()} style={button}>Try again</button>
            <a href="/" style={link}>Back to the calendar</a>
          </div>
          {error.digest && <p style={{ marginTop: 28, fontSize: 13, color: '#807f7a' }}>Reference <code>{error.digest}</code></p>}
        </main>
      </body>
    </html>
  )
}
