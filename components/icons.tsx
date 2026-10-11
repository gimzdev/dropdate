// The icons, one set of strokes on a 24px grid, and the mark (also drawn into the app icons and the link preview image).

const PATHS = {
  search: 'M20 20l-4.2-4.2M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  calendar: 'M8 3v3M16 3v3M4 9.5h16M6 5h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z',
  grid: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  external: 'M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 01-1 1H6a1 1 0 01-1-1V8a1 1 0 011-1h4',
  copy: 'M9 9h10v10H9zM15 9V5H5v10h4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  flag: 'M5.5 21V3.5M5.5 4.5h12.5l-2.8 4.2 2.8 4.3H5.5',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M9 5.5v13M15 5.5v13',
  trophy: 'M8 20h8M12 16v4M7 4h10v4a5 5 0 01-10 0zM17 5h3v1a3 3 0 01-3 3M7 5H4v1a3 3 0 003 3',
  user: 'M12 12.5a4 4 0 100-8 4 4 0 000 8zM4.5 20.5a7.5 7.5 0 0115 0',
  pad: 'M6.5 8h11a4.5 4.5 0 014.4 3.6l.8 4.2a2.4 2.4 0 01-4.2 2L16.4 15.5H7.6l-2.1 2.3a2.4 2.4 0 01-4.2-2l.8-4.2A4.5 4.5 0 016.5 8zM7.5 10.5v3M6 12h3M16 11.2h.01M18 13.2h.01',
  logout: 'M10 5H6.5A1.5 1.5 0 005 6.5v11A1.5 1.5 0 006.5 19H10M15 8l4 4-4 4M19 12H9.5',
}

export const Icon = ({ name, className = 'h-4 w-4', stroke = 2 }: { name: keyof typeof PATHS; className?: string; stroke?: number }) => (
  <svg className={className} fill={name === 'play' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[name]} /></svg>
)
export const Heart = ({ on, className = 'h-[18px] w-[18px]' }: { on: boolean; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.5-9.2C1.2 8.1 3 4.5 6.5 4.5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3 3.5 0 5.3 3.6 4 6.8-2 4.6-9.5 9.2-9.5 9.2z" /></svg>
)
/** The mark: a calendar page with a D, its binder rings in highlighter yellow. */
export const Logo = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <rect x="10" y="14" width="44" height="42" rx="9" fill="#f4f3ef" />
    <rect x="18" y="8" width="6" height="12" rx="3" fill="#ffd23f" />
    <rect x="40" y="8" width="6" height="12" rx="3" fill="#ffd23f" />
    <path d="M18.75 23h12.5c9.2 0 14 5 14 12s-4.8 12-14 12h-12.5zm7.6 6.2v11.6h4.4c4.4 0 6.8-2.2 6.8-5.8s-2.4-5.8-6.8-5.8z" fill="#000" fillRule="evenodd" />
  </svg>
)
