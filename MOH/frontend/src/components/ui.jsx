import { useEffect, useMemo, useRef, useState } from 'react';
import { useSocketStatus } from '../hooks/useLiveActivity';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * Branded skeleton loaders — replaces plain "Loading…" text across the app.
 * `.vitals-pulse` (index.css) is reused here rather than a generic shimmer
 * so loading states share the same "system heartbeat" motif as the live
 * status indicator, instead of introducing a second, unrelated animation.
 */
export function Skeleton({ className = '' }) {
  return <div className={`bg-border/70 rounded vitals-pulse ${className}`} aria-hidden="true" />;
}

export function SkeletonRow({ columns = 4 }) {
  return (
    <div className="px-4 py-3 flex items-center gap-4">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-3 flex-1" />
      ))}
    </div>
  );
}

/** A skeleton shaped like a small list/table body — pass `rows` to match roughly what will load in. */
export function SkeletonList({ rows = 4, columns = 3 }) {
  return (
    <div className="divide-y divide-border" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} columns={columns} />
      ))}
    </div>
  );
}

/** A skeleton shaped like the KpiStat grid, for dashboard stat rows while data loads. */
export function SkeletonKpiRow({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-md border border-border bg-canvas-raised px-4 py-3">
          <Skeleton className="h-7 w-12 mb-2" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/**
 * A button that morphs idle → loading → success/error, instead of just
 * toggling a disabled state and swapping label text. `onClick` must return
 * a Promise; a resolved promise shows a checkmark morph for `successDuration`
 * ms before reverting, a rejected one shows the error inline (via
 * `onError`, since error copy is call-site-specific) and reverts
 * immediately so the user can retry.
 *
 * Respects prefers-reduced-motion: the checkmark still appears (state
 * change itself is information, not just decoration) but the morph/scale
 * transition is skipped in favor of an instant swap.
 */
/**
 * Animates a numeric display from its previous value to a new one over a
 * short duration, instead of the number just snapping — makes a stock
 * deduction or a live-updating count visibly registered as a change
 * rather than a silent re-render. Non-numeric values (e.g. '…' while
 * loading) render as-is with no animation.
 */
export function NumberRoll({ value, durationMs = 500, className = '' }) {
  const numericValue = typeof value === 'number' ? value : Number(value);
  const isNumeric = Number.isFinite(numericValue);

  const prevValueRef = useRef(isNumeric ? numericValue : 0);
  const [displayValue, setDisplayValue] = useState(isNumeric ? numericValue : value);
  const rafRef = useRef(null);

  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useEffect(() => {
    if (!isNumeric) {
      setDisplayValue(value);
      return;
    }
    const from = prevValueRef.current;
    const to = numericValue;
    prevValueRef.current = to;

    if (prefersReducedMotion || from === to) {
      setDisplayValue(to);
      return;
    }

    const start = performance.now();
    cancelAnimationFrame(rafRef.current);

    function tick(now) {
      const progress = Math.min(1, (now - start) / durationMs);
      // Ease-out cubic — fast start, gentle settle, matches how the rest
      // of this app's transitions (Tailwind's default ease) already feel.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(from + (to - from) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericValue, isNumeric]);

  return <span className={className}>{isNumeric ? displayValue.toLocaleString() : displayValue}</span>;
}

export function AsyncButton({
  onClick,
  onError,
  children,
  successLabel,
  loadingLabel,
  successDuration = 1400,
  className = '',
  disabled = false,
  variant = 'default',
}) {
  const [phase, setPhase] = useState('idle'); // idle | loading | success

  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  async function handleClick(e) {
    if (phase === 'loading') return;
    setPhase('loading');
    try {
      await onClick(e);
      setPhase('success');
      window.setTimeout(() => setPhase('idle'), prefersReducedMotion ? 200 : successDuration);
    } catch (err) {
      setPhase('idle');
      onError?.(err);
    }
  }

  const variantClass =
    variant === 'primary'
      ? 'bg-teal text-white hover:bg-teal-strong disabled:opacity-60'
      : 'border border-border text-ink-soft hover:text-ink disabled:opacity-60';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || phase === 'loading'}
      className={`relative inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${variantClass} ${className}`}
    >
      <span
        className={`inline-flex items-center gap-1.5 transition-all duration-150 ${
          phase === 'success' && !prefersReducedMotion ? 'scale-0 opacity-0 absolute' : 'scale-100 opacity-100'
        }`}
      >
        {phase === 'loading' && (
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {phase === 'loading' ? loadingLabel || children : children}
      </span>
      <span
        className={`inline-flex items-center gap-1 transition-all duration-150 ${
          phase === 'success' ? 'scale-100 opacity-100' : 'scale-0 opacity-0 absolute'
        }`}
        aria-live="polite"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {successLabel || 'Done'}
      </span>
    </button>
  );
}

export function ContrastToggleButton({ enabled, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      title="High-contrast mode (for bright ward lighting)"
      className={`flex items-center gap-1.5 text-xs font-medium rounded-md px-2 py-1 border transition-colors ${
        enabled ? 'bg-ink text-canvas-raised border-ink' : 'border-border text-ink-soft hover:text-ink'
      }`}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
      </svg>
      {enabled ? 'High contrast' : 'Contrast'}
    </button>
  );
}

export function Card({ title, action, children }) {
  return (
    <section className="bg-canvas-raised border border-border rounded-md overflow-hidden">
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          {title && <h2 className="font-display text-base text-ink">{title}</h2>}
          {action}
        </div>
      )}
      <div>{children}</div>
    </section>
  );
}

export function Pill({ tone = 'ink', children }) {
  const toneClass = {
    ink: 'bg-canvas text-ink-soft',
    teal: 'bg-teal-soft text-teal-strong',
    clay: 'bg-clay-soft text-clay',
    signal: 'bg-signal-soft text-signal',
    moss: 'bg-moss-soft text-moss',
  }[tone];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

export function LiveIndicator({ dark = false }) {
  const connected = useSocketStatus();
  const textClass = dark ? 'text-canvas/70' : 'text-ink-soft';
  const idleDotClass = dark ? 'bg-canvas/30' : 'bg-ink-soft/40';

  return (
    <div className="flex items-center gap-1.5" role="status" aria-label={connected ? 'Live updates connected' : 'Live updates reconnecting'}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-moss vitals-pulse' : idleDotClass}`}
        aria-hidden="true"
      />
      <span className={`font-mono text-[11px] uppercase tracking-wide ${textClass}`}>
        {connected ? 'Live' : 'Reconnecting'}
      </span>
    </div>
  );
}

export function OfflineBadge() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      className="flex items-center gap-1.5 bg-signal-soft px-2 py-1 rounded"
      role="status"
      aria-label="Device is offline"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
      <span className="font-mono text-[11px] uppercase tracking-wide text-signal">Offline</span>
    </div>
  );
}

export function BedIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M2 18v-7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 18v2M22 18v2" strokeLinecap="round" />
      <path d="M2 13v-4a2 2 0 0 1 2-2h5v6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="9" r="1.2" />
    </svg>
  );
}

export function BoxIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 8l9 5 9-5M12 13v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClockIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

export function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DropletIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path
        d="M12 3s7 7.6 7 12a7 7 0 1 1-14 0c0-4.4 7-12 7-12Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EmptyState({ message, icon, title, description, action }) {
  // Backward-compatible: existing call sites pass just `message` and get
  // the old plain-text treatment. New call sites can pass icon/title/
  // description/action for a properly designed empty state instead of a
  // blank table with one gray line of text.
  if (!icon && !title && !description) {
    return <p className="text-sm text-ink-soft px-4 py-8 text-center">{message}</p>;
  }

  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      {icon && (
        <div className="h-11 w-11 rounded-full bg-canvas flex items-center justify-center text-ink-soft mb-3">
          {icon}
        </div>
      )}
      {title && <p className="text-sm font-medium text-ink">{title}</p>}
      {(description || message) && (
        <p className="text-sm text-ink-soft mt-1 max-w-xs">{description || message}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Large dashboard KPI numeral — the one deliberate serif exception in this
 * otherwise fully sans-serif theme (see --font-kpi in index.css).
 * `tabular-nums` keeps digit widths equal so a live-updating count doesn't
 * visually jitter as digits change.
 */
export function KpiStat({ label, value, tone = 'ink' }) {
  const toneClass = {
    ink: 'text-ink',
    signal: 'text-signal',
    clay: 'text-clay',
    moss: 'text-moss',
  }[tone];

  const containerToneClass =
    tone === 'signal'
      ? 'border-signal/40 bg-signal-soft'
      : tone === 'clay'
      ? 'border-clay/40 bg-clay-soft'
      : 'border-border bg-canvas-raised';

  return (
    <div className={`rounded-md border px-4 py-3 ${containerToneClass}`}>
      <p className={`font-kpi text-2xl font-semibold tabular-nums ${toneClass}`}>
        <NumberRoll value={value} />
      </p>
      <p className="text-xs text-ink-soft mt-0.5">{label}</p>
    </div>
  );
}

export function ErrorState({ message }) {
  return (
    <p className="text-sm text-signal bg-signal-soft px-4 py-3 rounded m-4">{message}</p>
  );
}
