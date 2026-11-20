// One requestAnimationFrame loop shared by everything that animates
// (playheads, meters), so React never re-renders at frame rate.

type FrameCb = (now: number) => void;

const callbacks = new Set<FrameCb>();
let running = false;

function loop(now: number): void {
  for (const cb of callbacks) cb(now);
  if (callbacks.size) requestAnimationFrame(loop);
  else running = false;
}

export function onFrame(cb: FrameCb): () => void {
  callbacks.add(cb);
  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
  return () => callbacks.delete(cb);
}
