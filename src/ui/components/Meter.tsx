import { useEffect, useRef } from 'react';
import { onFrame } from '../frame';

/** Peak meter with falloff and peak-hold; `read` is polled every frame. */
export function Meter({ read, vertical = true, width = 10, height = 120 }: { read: () => number[]; vertical?: boolean; width?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const readRef = useRef(read);
  readRef.current = read;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    let levels: number[] = [];
    let holds: { v: number; t: number }[] = [];
    let last = performance.now();
    return onFrame((now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const raw = readRef.current();
      if (levels.length !== raw.length) {
        levels = raw.map(() => 0);
        holds = raw.map(() => ({ v: 0, t: 0 }));
      }
      ctx.clearRect(0, 0, width, height);
      const n = raw.length;
      const gap = 1;
      const bar = vertical ? (width - gap * (n - 1)) / n : (height - gap * (n - 1)) / n;
      const len = vertical ? height : width;
      raw.forEach((r, i) => {
        // Display on a dB scale from -60 dB to +6 dB.
        const db = r > 0 ? 20 * Math.log10(r) : -100;
        const target = Math.max(0, Math.min(1, (db + 60) / 66));
        levels[i] = target > levels[i] ? target : Math.max(target, levels[i] - dt * 1.2);
        if (levels[i] >= holds[i].v || now - holds[i].t > 1200) holds[i] = { v: levels[i], t: now };
        const v = levels[i];
        const off = i * (bar + gap);
        const zeroDb = 60 / 66;
        const grad = vertical ? ctx.createLinearGradient(0, height, 0, 0) : ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, '#2fbf71');
        grad.addColorStop(0.72, '#9bd34a');
        grad.addColorStop(zeroDb - 0.02, '#f0c43c');
        grad.addColorStop(zeroDb, '#ef5350');
        grad.addColorStop(1, '#ef5350');
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        if (vertical) ctx.fillRect(off, 0, bar, height);
        else ctx.fillRect(0, off, width, bar);
        ctx.fillStyle = grad;
        if (vertical) ctx.fillRect(off, height - v * len, bar, v * len);
        else ctx.fillRect(0, off, v * len, bar);
        const h = holds[i].v;
        if (h > 0.02) {
          ctx.fillStyle = h >= zeroDb ? '#ef5350' : '#e8edf2';
          if (vertical) ctx.fillRect(off, height - h * len, bar, 1.5);
          else ctx.fillRect(h * len - 1.5, off, 1.5, bar);
        }
      });
    });
  }, [vertical, width, height]);

  return <canvas ref={ref} className="meter" style={{ width, height }} />;
}
