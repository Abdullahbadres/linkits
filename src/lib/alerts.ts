type AlertSnapshot = {
  errorCountLastWindow: number;
  slowCountLastWindow: number;
  errorThresholdBreached: boolean;
  slowThresholdBreached: boolean;
};

const WINDOW_MS = 5 * 60 * 1000;
const ERROR_THRESHOLD = 3;
const SLOW_MS_THRESHOLD = 1000;
const SLOW_COUNT_THRESHOLD = 3;

const errorEvents: number[] = [];
const slowEvents: number[] = [];

function cleanup(now: number) {
  const minTs = now - WINDOW_MS;
  while (errorEvents.length && errorEvents[0] < minTs) errorEvents.shift();
  while (slowEvents.length && slowEvents[0] < minTs) slowEvents.shift();
}

export function registerErrorEvent() {
  const now = Date.now();
  errorEvents.push(now);
  cleanup(now);
}

export function registerLatencyEvent(durationMs: number) {
  const now = Date.now();
  if (durationMs > SLOW_MS_THRESHOLD) {
    slowEvents.push(now);
  }
  cleanup(now);
}

export function getAlertSnapshot(): AlertSnapshot {
  const now = Date.now();
  cleanup(now);
  return {
    errorCountLastWindow: errorEvents.length,
    slowCountLastWindow: slowEvents.length,
    errorThresholdBreached: errorEvents.length > ERROR_THRESHOLD,
    slowThresholdBreached: slowEvents.length >= SLOW_COUNT_THRESHOLD,
  };
}
