import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { closeMenu, patchUi, ui, useUi } from '../../state/app';

export function ContextMenu() {
  const menu = useUi((u) => u.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)),
      y: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 4)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      closeMenu();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu();
    const t = setTimeout(() => {
      window.addEventListener('pointerdown', close);
      window.addEventListener('keydown', key);
      window.addEventListener('resize', closeMenu);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menu]);

  if (!menu) return null;
  return (
    <div className="context-menu" ref={ref} style={{ left: pos.x, top: pos.y }} role="menu">
      {menu.items.map((it, i) =>
        it.separator ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`menu-item ${it.danger ? 'danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              closeMenu();
              it.action?.();
            }}
          >
            <span className="menu-check">{it.checked ? '✓' : ''}</span>
            <span className="menu-label">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}

export function PromptDialog() {
  const prompt = useUi((u) => u.prompt);
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prompt) {
      setValue(prompt.value);
      setTimeout(() => input.current?.select(), 0);
    }
  }, [prompt]);

  if (!prompt) return null;
  const finish = (v: string | null) => {
    patchUi({ prompt: null });
    prompt.resolve(v);
  };
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && finish(null)}>
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          finish(value);
        }}
      >
        <h3>{prompt.title}</h3>
        <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && finish(null)} autoFocus />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => finish(null)}>
            Отмена
          </button>
          <button type="submit" className="btn primary">
            OK
          </button>
        </div>
      </form>
    </div>
  );
}

export function Toasts() {
  const toasts = useUi((u) => u.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => patchUi({ toasts: ui.get().toasts.filter((x) => x.id !== t.id) })}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
