import { useEffect, useRef, useState } from 'react';
import { onActivity, onStatusChange } from '../lib/socket';

/**
 * Subscribes to real-time activity signals and calls onSignal whenever one
 * arrives (optionally filtered). Signals are deliberately just a refresh
 * hint — { action, targetType, actorRole, occurredAt } — never the record
 * itself, so callers refetch over REST rather than trusting socket payload
 * as source of truth.
 *
 * @param {(signal: object) => boolean} [filter] - return true to react to this signal
 * @param {(signal: object) => void} onSignal - called for each matching signal
 */
function useLiveActivity(filter, onSignal) {
  const filterRef = useRef(filter);
  const onSignalRef = useRef(onSignal);
  filterRef.current = filter;
  onSignalRef.current = onSignal;

  useEffect(() => {
    return onActivity((signal) => {
      if (!filterRef.current || filterRef.current(signal)) {
        onSignalRef.current?.(signal);
      }
    });
  }, []);
}

/**
 * Live "connected/reconnecting" status for a small header indicator.
 * Subscribes via onStatusChange rather than reading the socket directly, so
 * it works regardless of whether AuthContext has connected the socket yet.
 */
function useSocketStatus() {
  const [connected, setConnected] = useState(false);

  useEffect(() => onStatusChange(setConnected), []);

  return connected;
}

export { useLiveActivity, useSocketStatus };
