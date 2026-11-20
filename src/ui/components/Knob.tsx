import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { formatParam, fromNormalized, toNormalized, type NumberParamSpec } from '../../core/params';
import type { AutomationTarget } from '../../core/types';
import { createAutomationClip } from '../../state/actions';
import { askText, openMenu } from '../../state/app';

let gestureSeq = 0;

export interface DragControlProps {
  spec: NumberParamSpec;
  value: number;
  onChange: (value: number, coalesce: string) => void;
  automation?: AutomationTarget;
  format?: (v: number) => string;
  label?: string;
  title?: string;
}

/** Shared pointer/wheel/keyboard/context-menu behaviour for knobs and faders. */
export function useDragControl({ spec, value, onChange, automation, format }: DragControlProps, axis: 'y' | 'x' = 'y', pixels = 180) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const state = useRef({ start: 0, norm: 0, key: '', moved: false, longPress: 0 as number | 0 });
  const latest = useRef({ spec, value, onChange });
  latest.current = { spec, value, onChange };

  const set = (n: number, key: string) => {
    const { spec: s, onChange: cb } = latest.current;
    cb(fromNormalized(s, Math.min(1, Math.max(0, n))), key);
  };

  const showMenu = (x: number, y: number) => {
    const items = [
      { label: 'Сбросить', action: () => set(toNormalized(spec, spec.default), `reset-${++gestureSeq}`) },
      {
        label: 'Ввести значение…',
        action: async () => {
          const v = await askText(`${spec.label}: ${spec.min}…${spec.max}${spec.unit ? ' ' + spec.unit : ''}`, String(Math.round(value * 1000) / 1000));
          const n = v === null ? NaN : parseFloat(v.replace(',', '.'));
          if (Number.isFinite(n)) latest.current.onChange(Math.min(spec.max, Math.max(spec.min, n)), `type-${++gestureSeq}`);
        },
      },
    ];
    if (automation) items.push({ label: 'Создать клип автоматизации', action: () => void createAutomationClip(automation) });
    openMenu(x, y, items);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const { spec: s, value: v } = latest.current;
      const stepN = s.step ? s.step / (s.max - s.min) : 0.02;
      const dir = e.deltaY < 0 || e.deltaX > 0 ? 1 : -1;
      set(toNormalized(s, v) + dir * Math.max(stepN, e.shiftKey ? 0.004 : 0.02), 'wheel');
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const handlers = {
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const st = state.current;
      st.start = axis === 'y' ? e.clientY : e.clientX;
      st.norm = toNormalized(spec, value);
      st.key = `drag-${++gestureSeq}`;
      st.moved = false;
      setDragging(true);
      const { clientX, clientY } = e;
      if (e.pointerType !== 'mouse') {
        st.longPress = window.setTimeout(() => {
          if (!st.moved) {
            setDragging(false);
            showMenu(clientX, clientY);
          }
        }, 550);
      }
    },
    onPointerMove: (e: RPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const st = state.current;
      const pos = axis === 'y' ? e.clientY : e.clientX;
      const delta = axis === 'y' ? st.start - pos : pos - st.start;
      if (Math.abs(delta) > 3) {
        st.moved = true;
        clearTimeout(st.longPress);
      }
      if (!st.moved) return;
      const sens = e.shiftKey || e.altKey ? pixels * 6 : pixels;
      set(st.norm + delta / sens, st.key);
    },
    onPointerUp: () => {
      clearTimeout(state.current.longPress);
      setDragging(false);
    },
    onPointerCancel: () => {
      clearTimeout(state.current.longPress);
      setDragging(false);
    },
    onDoubleClick: () => set(toNormalized(spec, spec.default), `reset-${++gestureSeq}`),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      const stepN = spec.step ? spec.step / (spec.max - spec.min) : e.shiftKey ? 0.005 : 0.02;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(toNormalized(spec, value) + stepN, 'key');
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(toNormalized(spec, value) - stepN, 'key');
      else return;
      e.preventDefault();
    },
  };

  const text = format ? format(value) : formatParam(spec, value);
  return { ref, handlers, dragging, text };
}

interface KnobProps extends DragControlProps {
  size?: number;
  color?: string;
  bipolar?: boolean;
  compact?: boolean;
}

export function Knob(props: KnobProps) {
  const { spec, value, size = 34, color, bipolar, label, compact, title } = props;
  const { ref, handlers, dragging, text } = useDragControl(props);
  const n = toNormalized(spec, value);
  const a0 = -135;
  const a1 = 135;
  const ang = a0 + n * (a1 - a0);
  const r = size / 2 - 3;
  const c = size / 2;
  const pt = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [c + r * Math.cos(rad), c + r * Math.sin(rad)];
  };
  const arc = (from: number, to: number) => {
    const [x0, y0] = pt(from);
    const [x1, y1] = pt(to);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    const sweep = to > from ? 1 : 0;
    return `M${x0} ${y0}A${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
  };
  const zero = bipolar ? 0 : a0;
  const [px, py] = pt(ang);
  return (
    <div className={`knob ${compact ? 'knob-compact' : ''} ${dragging ? 'is-dragging' : ''}`} title={title ?? `${label ?? spec.label}: ${text}`}>
      <div
        ref={ref}
        className="knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={label ?? spec.label}
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={value}
        aria-valuetext={text}
        style={{ width: size, height: size }}
        {...handlers}
      >
        <svg width={size} height={size}>
          <path d={arc(a0, a1)} className="knob-track" />
          {Math.abs(ang - zero) > 0.5 && <path d={arc(Math.min(zero, ang), Math.max(zero, ang))} className="knob-value" style={color ? { stroke: color } : undefined} />}
          <circle cx={c} cy={c} r={r - 5} className="knob-cap" />
          <line x1={c + (px - c) * 0.25} y1={c + (py - c) * 0.25} x2={c + (px - c) * 0.78} y2={c + (py - c) * 0.78} className="knob-pointer" />
        </svg>
      </div>
      {!compact && <div className="knob-label">{dragging ? text : (label ?? spec.label)}</div>}
      {compact && dragging && <div className="knob-bubble">{text}</div>}
    </div>
  );
}

interface FaderProps extends DragControlProps {
  height?: number;
}

export function Fader(props: FaderProps) {
  const { spec, value, height = 120, label, title } = props;
  const { ref, handlers, dragging, text } = useDragControl(props, 'y', height);
  const n = toNormalized(spec, value);
  return (
    <div className={`fader ${dragging ? 'is-dragging' : ''}`} title={title ?? `${label ?? spec.label}: ${text}`}>
      <div
        ref={ref}
        className="fader-track"
        role="slider"
        tabIndex={0}
        aria-label={label ?? spec.label}
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={value}
        aria-valuetext={text}
        style={{ height }}
        {...handlers}
      >
        <div className="fader-fill" style={{ height: `${n * 100}%` }} />
        <div className="fader-thumb" style={{ bottom: `calc(${n * 100}% - 7px)` }} />
      </div>
      <div className="fader-value">{text}</div>
    </div>
  );
}
