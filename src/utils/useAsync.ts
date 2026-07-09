// src/utils/useAsync.ts — standardizes the loading → (error | loaded) lifecycle so every data
// view can render the four states honestly. Every await is wrapped; errors set a real error state.
// Reloads are stale-while-refresh: once data has loaded we keep showing it (with refreshing: true)
// instead of dropping back to a full loading state, and a failed refresh keeps the stale data
// (the failure is surfaced non-intrusively via refreshError for callers that want it).
import { useCallback, useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "error"; data: null; error: string }
  | { status: "loaded"; data: T; error: null; refreshing?: boolean; refreshError?: string | null };

export function useAsync<T>(loader: () => Promise<T>, deps: ReadonlyArray<unknown> = []): {
  state: AsyncState<T>;
  reload: () => void;
} {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading", data: null, error: null });
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    // First load shows the full loading state; later loads keep the stale data on screen.
    setState((prev) =>
      prev.status === "loaded"
        ? { ...prev, refreshing: true, refreshError: null }
        : { status: "loading", data: null, error: null }
    );
    loader()
      .then((data) => {
        if (active) setState({ status: "loaded", data, error: null });
      })
      .catch((err: unknown) => {
        if (active) {
          const message = err instanceof Error ? err.message : "Something went wrong.";
          // A failed refresh keeps the stale data; only a failed first load shows the error state.
          setState((prev) =>
            prev.status === "loaded"
              ? { ...prev, refreshing: false, refreshError: message }
              : { status: "error", data: null, error: message }
          );
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { state, reload };
}
