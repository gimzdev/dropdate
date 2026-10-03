// The mark: a calendar page with a D. Used by the header, the footer and the link preview image.
export function Logo({ size = 36, id = 'dd-logo' }: { size?: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0a0a0a" /><stop offset="1" stopColor="#0a0a0a" /></linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id})`} />
      <rect x="18" y="8" width="6" height="12" rx="3" fill="#f2f2ee" />
      <rect x="40" y="8" width="6" height="12" rx="3" fill="#f2f2ee" />
      <rect x="10" y="14" width="44" height="42" rx="9" fill="#f2f2ee" />
      <path d="M18.75 23h12.5c9.2 0 14 5 14 12s-4.8 12-14 12h-12.5zm7.6 6.2v11.6h4.4c4.4 0 6.8-2.2 6.8-5.8s-2.4-5.8-6.8-5.8z" fill="#0a0a0a" fillRule="evenodd" />
    </svg>
  )
}
