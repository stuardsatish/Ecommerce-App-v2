import { useCallback, useEffect, useState } from 'react';

import { listAddresses } from '@/services/addresses';

/**
 * The signed-in user's saved addresses, with a loading / ready / error status.
 *
 * `enabled` lets a bottom sheet (which stays mounted while closed) fetch only
 * when it opens. `refresh()` re-fetches quietly — the current list stays on
 * screen, which is what you want right after a save or delete — while
 * `reload()` goes back through the loading state for the Retry button.
 */
export function useAddresses({ enabled = true } = {}) {
  const [state, setState] = useState({ status: 'loading', addresses: [] });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    listAddresses()
      .then((addresses) => {
        if (active) setState({ status: 'ready', addresses });
      })
      .catch((err) => {
        console.error('Error loading addresses:', err);
        if (active) setState({ status: 'error', addresses: [] });
      });
    return () => {
      active = false;
    };
  }, [enabled, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading' }));
    setVersion((v) => v + 1);
  }, []);

  return { status: state.status, addresses: state.addresses, refresh, reload };
}