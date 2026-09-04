import { useEffect, useRef, useState } from 'react';
import { useLocation, Outlet } from 'react-router-dom';

/**
 * Wraps <Outlet/> so navigating between pages within a shell (Overview →
 * Staff → Inventory, etc.) gets a soft transition instead of an abrupt
 * content swap. Prefers the native View Transitions API
 * (document.startViewTransition) where the browser supports it — it
 * produces a genuinely smooth crossfade of the actual rendered DOM with
 * zero layout-thrash risk, which a CSS keyframe animation on a fixed
 * duration can't guarantee for content of varying height. Falls back to a
 * plain CSS fade+rise for browsers without it (Firefox, older Safari) so
 * the transition degrades to "still fine" rather than "broken".
 *
 * Respects prefers-reduced-motion by skipping the transition outright —
 * the route still changes instantly, only the animation is skipped.
 */
export default function PageTransition() {
  const location = useLocation();
  const [renderKey, setRenderKey] = useState(location.pathname);
  const previousPathRef = useRef(location.pathname);
  const containerRef = useRef(null);

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const supportsViewTransitions = typeof document !== 'undefined' && !!document.startViewTransition;

  useEffect(() => {
    if (location.pathname === previousPathRef.current) return;
    previousPathRef.current = location.pathname;

    if (prefersReducedMotion) {
      setRenderKey(location.pathname);
      return;
    }

    if (supportsViewTransitions) {
      document.startViewTransition(() => {
        setRenderKey(location.pathname);
      });
    } else {
      // CSS fallback: briefly mark the container as "leaving" so the fade-out
      // keyframe in index.css runs, then swap content and let the fade-in
      // keyframe (the default state) take over.
      const el = containerRef.current;
      if (el) {
        el.classList.add('page-transition-leaving');
        window.setTimeout(() => {
          setRenderKey(location.pathname);
        }, 120);
      } else {
        setRenderKey(location.pathname);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <div ref={containerRef} key={renderKey} className={supportsViewTransitions ? '' : 'page-transition-enter'}>
      <Outlet />
    </div>
  );
}
