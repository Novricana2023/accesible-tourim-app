export interface LatestWinsThrottle<T> {
  push(value: T, immediate?: boolean): void;
  flush(): void;
  cancel(): void;
}

export interface ThrottleScheduler {
  now(): number;
  schedule(fn: () => void, delayMs: number): { cancel: () => void };
}

function defaultScheduler(): ThrottleScheduler {
  return {
    now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
    schedule: (fn, delayMs) => {
      const id = window.setTimeout(fn, delayMs);
      return {
        cancel: () => {
          window.clearTimeout(id);
        },
      };
    },
  };
}

/**
 * Rate-limits UI updates. Perception/speech still run at full rate;
 * only the React store is coalesced. A later value always replaces an
 * earlier pending value (latest-frame-wins).
 */
export function createLatestWinsThrottle<T>(
  hz: number,
  deliver: (value: T) => void,
  scheduler: ThrottleScheduler = defaultScheduler(),
): LatestWinsThrottle<T> {
  const intervalMs = hz > 0 ? 1000 / hz : Number.POSITIVE_INFINITY;
  let lastEmit = Number.NEGATIVE_INFINITY;
  let pending: T | null = null;
  let hasPending = false;
  let timer: { cancel: () => void } | null = null;

  const emit = (value: T) => {
    lastEmit = scheduler.now();
    pending = null;
    hasPending = false;
    deliver(value);
  };

  const cancelTimer = () => {
    timer?.cancel();
    timer = null;
  };

  return {
    push(value: T, immediate = false) {
      if (immediate || !Number.isFinite(intervalMs)) {
        cancelTimer();
        emit(value);
        return;
      }
      pending = value;
      hasPending = true;
      const elapsed = scheduler.now() - lastEmit;
      if (elapsed >= intervalMs) {
        cancelTimer();
        emit(value);
        return;
      }
      if (!timer) {
        timer = scheduler.schedule(() => {
          timer = null;
          if (hasPending && pending !== null) {
            emit(pending);
          }
        }, Math.max(0, intervalMs - elapsed));
      }
    },
    flush() {
      cancelTimer();
      if (hasPending && pending !== null) {
        emit(pending);
      }
    },
    cancel() {
      cancelTimer();
      pending = null;
      hasPending = false;
    },
  };
}
