// Original line icons (24×24, stroke = currentColor).

const PATHS: Record<string, string> = {
  play: 'M7 5l12 7-12 7z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  stop: 'M6 6h12v12H6z',
  record: 'M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z',
  loop: 'M4 12a6 6 0 0 1 6-6h8m-3-3l3 3-3 3M20 12a6 6 0 0 1-6 6H6m3 3l-3-3 3-3',
  metronome: 'M9 3h6l4 18H5zM12 17l5-11M8 14h8',
  undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2',
  redo: 'M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h2',
  menu: 'M4 7h16M4 12h16M4 17h16',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  folder: 'M3 7h6l2 2h10v10H3z',
  browser: 'M4 4h6v16H4zM12 4h8v7h-8zM12 13h8v7h-8z',
  playlist: 'M3 6h8v4H3zM13 6h8v4h-8zM6 14h12v4H6z',
  rack: 'M4 5h16v3H4zM4 10.5h16v3H4zM4 16h16v3H4z',
  piano: 'M3 5h18v14H3zM8 5v8M13 5v8M18 5v8M8 13v6M13 13v6M18 13v6',
  mixer: 'M6 4v16M12 4v16M18 4v16M4 14h4M10 8h4M16 12h4',
  pencil: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  cursor: 'M5 3l14 8-6 2-2 6z',
  eraser: 'M8 20h12M5 15l9-9 5 5-9 9H8z',
  hand: 'M8 13V6a1.5 1.5 0 0 1 3 0v5V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8c0 4-3 7-6.5 7S5 18 4 15l-1.5-3a1.4 1.4 0 0 1 2.4-1.4L8 13',
  scissors: 'M6 7a2.5 2.5 0 1 0 0-.01M6 17a2.5 2.5 0 1 0 0 .01M8 8l12 9M8 16L20 7',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  midi: 'M4 6h16v12H4zM8 10v4M12 10v4M16 10v4',
  keyboard: 'M3 7h18v10H3zM6 10h1M9 10h1M12 10h1M15 10h1M18 10h1M7 14h10',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  zoomIn: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20M10.5 7.5v6M7.5 10.5h6',
  zoomOut: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20M7.5 10.5h6',
  split: 'M4 4h16v16H4zM4 12h16',
  wave: 'M2 12h3l2-6 3 12 3-9 2 5 2-2h5',
  copy: 'M8 8h11v12H8zM5 16V4h11',
  magnet: 'M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4zM6 8h4M14 8h4',
  ghost: 'M6 20V10a6 6 0 0 1 12 0v10l-2-2-2 2-2-2-2 2-2-2zM10 10h.01M14 10h.01',
  chevronUp: 'M6 15l6-6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  dots: 'M12 6h.01M12 12h.01M12 18h.01',
  power: 'M12 3v8M7 6a7 7 0 1 0 10 0',
  automation: 'M3 17l5-6 4 3 4-7 5 5',
  music: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z',
  drum: 'M4 8c0-2 3.6-3 8-3s8 1 8 3v8c0 2-3.6 3-8 3s-8-1-8-3zM4 8c0 2 3.6 3 8 3s8-1 8-3',
  synth: 'M3 18c3 0 3-12 6-12s3 12 6 12 3-12 6-12',
  sample: 'M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2',
  fx: 'M5 19L19 5M6 6h4v4H6zM14 14h4v4h-4z',
  check: 'M5 12l5 5 9-10',
};

const FILLED = new Set(['play', 'pause', 'stop', 'record']);

export function Icon({ name, size = 18, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  const d = PATHS[name] ?? PATHS.dots;
  const filled = FILLED.has(name);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
