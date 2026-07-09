// src/utils/useAsync.ts — standardizes the loading → (error | loaded) lifecycle so every data
// view can render the four states honestly. Every await is wrapped; errors set a real error state.
import { useCallback, useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "error"; data: null; error: string }
  | { status: "loaded"; data: T; error: null };

export function useAsync<T>(loader: () => Promise<T>, deps: ReadonlyArray<unknown> = []): {
  state: AsyncState<T>;
  reload: () => void;
} {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading", data: null, error: null });
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null, error: null });
    loader()
      .then((data) => {
        if (active) setState({ status: "loaded", data, error: null });
      })
      .catch((err: unknown) => {
        if (active) {
          const message = err instanceof Error ? err.message : "Something went wrong.";
          setState({ status: "error", data: null, error: message });
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { state, reload };
}
