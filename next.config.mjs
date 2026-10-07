const security = [
  ['X-Content-Type-Options', 'nosniff'], ['Referrer-Policy', 'strict-origin-when-cross-origin'], ['X-Frame-Options', 'DENY'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'], ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
]

/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  agentRules: false, // otherwise next dev writes AGENTS.md and CLAUDE.md into the project
  staticPageGenerationTimeout: 180, // the first build fetches every source: give slow upstreams room
  typescript: { ignoreBuildErrors: !!process.env.VERCEL }, // --deploy type-checks this exact code before uploading it, so the Vercel build skips a second check
  headers: async () => [{ source: '/(.*)', headers: security.map(([key, value]) => ({ key, value })) }],
}
