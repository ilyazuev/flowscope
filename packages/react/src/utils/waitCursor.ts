let activeWaitCursorCount = 0;

const WAIT_CURSOR_CLASS = 'app-wait-cursor';

export function acquireBodyWaitCursor(maxDurationMs?: number): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  let released = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  activeWaitCursorCount += 1;

  document.documentElement.classList.add(WAIT_CURSOR_CLASS);
  document.body.classList.add(WAIT_CURSOR_CLASS);

  const release = () => {
    if (released) return;

    released = true;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    activeWaitCursorCount = Math.max(0, activeWaitCursorCount - 1);

    if (activeWaitCursorCount === 0) {
      document.documentElement.classList.remove(WAIT_CURSOR_CLASS);
      document.body.classList.remove(WAIT_CURSOR_CLASS);
    }
  };

  if (maxDurationMs !== undefined) {
    timeoutId = setTimeout(release, maxDurationMs);
  }

  return release;
}