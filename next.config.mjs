// What a page may load: its own scripts and styles (Next inlines a few), images and video from any https address (the game
// sources) and trailers from YouTube, nothing else. Production only: the development server needs more.
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' https:; frame-src https://www.youtube-nocookie.com; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
const security = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  ...(process.env.NODE_ENV === 'production' && { 'Content-Security-Policy': csp }),
}

/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  agentRules: false, // otherwise next dev writes AGENTS.md and CLAUDE.md into the project
  staticPageGenerationTimeout: 180, // a first build fetches every source
  typescript: { ignoreBuildErrors: !!process.env.VERCEL }, // --deploy type-checks this exact code first
  headers: async () => [{ source: '/(.*)', headers: Object.entries(security).map(([key, value]) => ({ key, value })) }],
}
