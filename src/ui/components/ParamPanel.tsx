import type { ParamSpec } from '../../core/params';
import type { AutomationTarget, ParamMap, ParamValue } from '../../core/types';
import { Knob } from './Knob';

interface Props {
  specs: ParamSpec[];
  values: ParamMap;
  onChange: (key: string, value: ParamValue, coalesce?: string) => void;
  /** Automation target for a param key, if it can be automated. */
  automation?: (key: string) => AutomationTarget | undefined;
  color?: string;
  hide?: string[];
}

/** Renders a parameter list as grouped knobs, selects and toggles. */
export function ParamPanel({ specs, values, onChange, automation, color, hide = [] }: Props) {
  const groups = new Map<string, ParamSpec[]>();
  for (const s of specs) {
    if (hide.includes(s.key)) continue;
    const g = s.group ?? '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(s);
  }
  return (
    <div className="param-panel">
      {[...groups.entries()].map(([group, list]) => (
        <section key={group || 'main'} className="param-group">
          {group && <h4>{group}</h4>}
          <div className="param-row">
            {list.map((s) => {
              const v = values[s.key];
              if (s.kind === 'number') {
                return (
                  <Knob
                    key={s.key}
                    spec={s}
                    value={typeof v === 'number' ? v : s.default}
                    onChange={(nv, c) => onChange(s.key, nv, c)}
                    automation={automation?.(s.key)}
                    color={color}
                    bipolar={s.min < 0 && s.max > 0}
                  />
                );
              }
              if (s.kind === 'choice') {
                return (
                  <label key={s.key} className="param-select">
                    <span>{s.label}</span>
                    <select value={typeof v === 'string' ? v : s.default} onChange={(e) => onChange(s.key, e.target.value)}>
                      {s.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              const on = typeof v === 'boolean' ? v : s.default;
              return (
                <button key={s.key} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(s.key, !on)} aria-pressed={on}>
                  {s.label}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
