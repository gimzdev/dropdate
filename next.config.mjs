// What a page may load: its own scripts and styles (Next writes a few inline ones), pictures and video from any https address (the game
// sources' servers), and nothing else. Only in production builds: the development server needs more.
const csp = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "media-src 'self' https:",
  "font-src 'self' data:", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ')
const security = [
  ['X-Content-Type-Options', 'nosniff'], ['Referrer-Policy', 'strict-origin-when-cross-origin'], ['X-Frame-Options', 'DENY'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'], ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ...(process.env.NODE_ENV === 'production' ? [['Content-Security-Policy', csp]] : []),
]

/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  agentRules: false, // otherwise next dev writes AGENTS.md and CLAUDE.md into the project
  staticPageGenerationTimeout: 180, // the first build fetches every source: give slow upstreams room
  typescript: { ignoreBuildErrors: !!process.env.VERCEL }, // --deploy type-checks this exact code before uploading it, so the Vercel build skips a second check
  headers: async () => [{ source: '/(.*)', headers: security.map(([key, value]) => ({ key, value })) }],
}
