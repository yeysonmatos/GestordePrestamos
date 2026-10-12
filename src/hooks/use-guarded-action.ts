import { useCallback, useRef, useState } from "react";

/**
 * Bloquea doble clic / doble envío: un ref actúa de candado síncrono (inmediato,
 * antes del re-render) y `busy` sirve para deshabilitar el botón en la UI.
 */
export function useGuardedAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
