// Hairline icons, 24×24 grid, stroke = currentColor.

type P = { size?: number; className?: string };

const base = (size = 16) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const ArrowUpRight = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);
export const ArrowRight = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
);
export const ArrowDown = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 4v15M6 13l6 6 6-6" />
  </svg>
);
export const ChevronLeft = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m15 5-7 7 7 7" />
  </svg>
);
export const ChevronRight = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);
export const Close = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const Play = ({ size, className }: P) => (
  <svg {...base(size)} className={className} fill="currentColor" stroke="none">
    <path d="M8 5.5v13l10.5-6.5z" />
  </svg>
);
export const Pause = ({ size, className }: P) => (
  <svg {...base(size)} className={className} fill="currentColor" stroke="none">
    <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
  </svg>
);
export const Plus = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const Minus = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 12h14" />
  </svg>
);
export const Label = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h16M4 12h10M4 17h13" />
  </svg>
);
export const Target = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);
export const Menu = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 8h16M4 16h16" />
  </svg>
);
export const Shuffle = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h3c4 0 6 10 10 10h3M17 14l3 3-3 3M4 17h3c1.5 0 2.7-1.4 3.7-3.2M17 4l3 3-3 3M13.3 10.2C14.3 8.4 15.5 7 17 7h3" />
  </svg>
);
export const Sort = ({ size, className, dir }: P & { dir: 'asc' | 'desc' | null }) => (
  <svg {...base(size)} className={className}>
    <path d="M8 10l4-4 4 4" opacity={dir === 'asc' ? 1 : 0.3} />
    <path d="M8 14l4 4 4-4" opacity={dir === 'desc' ? 1 : 0.3} />
  </svg>
);

/** SOLAR mark: a star, one orbit, one world. */
export const LogoMark = ({ size = 26 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <ellipse cx="16" cy="16" rx="13" ry="5.4" transform="rotate(-24 16 16)" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
    <circle cx="16" cy="16" r="4.2" fill="#c7ff3d" />
    <circle cx="16" cy="16" r="7" fill="#c7ff3d" opacity="0.12" />
    <circle cx="26.6" cy="11.4" r="1.7" fill="currentColor" />
  </svg>
);
