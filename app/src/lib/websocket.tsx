import { Loader2 } from 'lucide-react';
import type { WindowManagerApi, WindowId } from '@pondpilot/flowscope-react';

export type WebSocketLogItem = {
  id: number;
  kind: 'info' | 'html' | 'error' | 'result';
  text: string;
};

export type WebSocketUi = {
  manager: Pick<WindowManagerApi, 'openWindow' | 'updateWindow' | 'closeWindow'>;
  title: string;
  closeOnSuccess?: boolean;
  width?: number;
  height?: number;
};

export type RunWebSocketOptions<TResponse> = {
  wsUrl: string;
  path: string;
  ui?: WebSocketUi;
  reauthUrl?: string;
  reconnectOnceOn403?: boolean;
  /** Timeout for one WebSocket opening attempt. Default: 10000 ms. */
  connectionTimeoutMs?: number;
  /** Number of additional connection attempts after the initial one. Default: 1. */
  maxConnectRetries?: number;
  /** Delay before a connection retry. Default: 250 ms. */
  retryDelayMs?: number;
  isAuthError?: (message: string) => boolean;
  isResultMessage?: (message: string) => boolean;
  parseResult?: (message: string) => TResponse;
};

let windowSeq = 0;

function resolveWsUrl(configuredWsUrl: string) {
  if (/^wss?:\/\//i.test(configuredWsUrl)) return configuredWsUrl;

  const normalizedPath = configuredWsUrl.startsWith('/') ? configuredWsUrl : `/${configuredWsUrl}`;
  const protocol = 'wss:'; // window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}${normalizedPath}`;
}

function resolveHttpUrl(configuredHttpUrl: string) {
  if (/^https?:\/\//i.test(configuredHttpUrl)) return configuredHttpUrl;
  const normalizedPath = configuredHttpUrl.startsWith('/') ? configuredHttpUrl : `/${configuredHttpUrl}`;
  return `${window.location.origin}${normalizedPath}`;
}

function closeSocket(socket: WebSocket | null) {
  if (!socket) return;
  if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
    socket.close(1000, 'client finished');
  }
}

function connectionCloseReason(event: CloseEvent) {
  switch (event.code) {
    case 1000:
      return '';
    case 1001:
      return 'Endpoint is going away.';
    case 1002:
      return 'Protocol error.';
    case 1003:
      return 'Unsupported data type.';
    case 1005:
      return 'No close status code was present.';
    case 1006:
      return 'Connection was closed abnormally.';
    case 1007:
      return 'Message contained invalid data.';
    case 1008:
      return 'Message violates endpoint policy.';
    case 1009:
      return 'Message is too large.';
    case 1010:
      return `Expected WebSocket extension was not negotiated. ${event.reason || ''}`.trim();
    case 1011:
      return 'Server encountered an unexpected condition.';
    case 1015:
      return 'TLS handshake failed.';
    default:
      return event.reason || `Connection closed with code ${event.code}.`;
  }
}

function ProgressWindow({ items }: { items: WebSocketLogItem[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Backend action is running...
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/20 p-3 font-mono text-xs leading-5">
        {items.length === 0 ? (
          <div className="text-muted-foreground">Waiting for backend messages...</div>
        ) : (
          items.map((item) => {
            const className =
              item.kind === 'error'
                ? 'text-destructive whitespace-pre-wrap'
                : item.kind === 'result'
                  ? 'text-emerald-600 whitespace-pre-wrap'
                  : 'whitespace-nowrap';

            if (item.kind === 'html') {
              return (
                <div
                  key={item.id}
                  className="mb-2 rounded-md border bg-background p-2 font-sans text-sm"
                  dangerouslySetInnerHTML={{ __html: item.text }}
                />
              );
            }

            return (
              <div key={item.id} className={className}>
                {item.text}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function appendLog(
  items: WebSocketLogItem[],
  kind: WebSocketLogItem['kind'],
  text: string
) {
  return [{ id: Date.now() + items.length, kind, text }, ...items];
}

export async function runWebSocket<TResponse>({
  wsUrl,
  path,
  ui,
  reauthUrl,
  reconnectOnceOn403 = true,
  connectionTimeoutMs = import.meta.env.VITE_BACKEND_WS_CONNECT_TIMEOUT_MS ?? 10_000,
  maxConnectRetries = import.meta.env.VITE_BACKEND_WS_MAX_CONNECT_RETRIES ?? 1,
  retryDelayMs = import.meta.env.VITE_BACKEND_WS_RETRY_DELAY_MS ?? 5_000,
  isAuthError = (message) => message === 'error:403 access denied',
  isResultMessage = (message) => message.trimStart().startsWith('{'),
  parseResult = (message) => JSON.parse(message) as TResponse,
}: RunWebSocketOptions<TResponse>): Promise<TResponse> {
  const resolvedWsUrl = resolveWsUrl(wsUrl);
  const windowId: WindowId | undefined = ui ? `ws-${Date.now()}-${++windowSeq}` : undefined;
  let socket: WebSocket | null = null;
  let settled = false;
  let authReconnectAttempted = false;
  let activeAttemptId = 0;
  let connectAttemptCount = 0;
  let retryTimer: number | undefined;
  let logs: WebSocketLogItem[] = [];

  const updateProgress = (kind: WebSocketLogItem['kind'], text: string) => {
    logs = appendLog(logs, kind, text);
    if (!ui || !windowId) return;
    ui.manager.updateWindow(windowId, {
      content: <ProgressWindow items={logs} />,
    });
  };

  if (ui && windowId) {
    ui.manager.openWindow({
      id: windowId,
      title: ui.title,
      width: ui.width ?? 760,
      height: ui.height ?? 460,
      content: <ProgressWindow items={logs} />,
    });
  }

  async function reauthIfConfigured() {
    if (!reauthUrl) return;
    const response = await fetch(resolveHttpUrl(reauthUrl), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`Re-auth request failed: ${response.status} ${response.statusText}`);
    }
  }

  return new Promise<TResponse>((resolve, reject) => {
    const clearRetryTimer = () => {
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    };

    const finishSuccess = (value: TResponse) => {
      settled = true;
      clearRetryTimer();
      activeAttemptId += 1;
      closeSocket(socket);
      if (ui?.closeOnSuccess !== false && windowId) {
        ui?.manager.closeWindow(windowId);
      }
      resolve(value);
    };

    const finishError = (error: unknown) => {
      settled = true;
      clearRetryTimer();
      activeAttemptId += 1;
      closeSocket(socket);
      const message = error instanceof Error ? error.message : String(error);
      updateProgress('error', message);
      reject(error instanceof Error ? error : new Error(message));
    };

    const scheduleConnectRetry = (cause: string) => {
      if (settled) return;

      if (connectAttemptCount > maxConnectRetries) {
        finishError(new Error(cause));
        return;
      }

      const remainingRetries = maxConnectRetries - connectAttemptCount + 1;
      updateProgress(
        'info',
        `Retrying WebSocket connection in ${retryDelayMs} ms; remaining retries: ${remainingRetries}`
      );
      retryTimer = window.setTimeout(() => connect(), retryDelayMs);
    };

    const supersedeCurrentSocket = () => {
      activeAttemptId += 1;
      const oldSocket = socket;
      socket = null;
      closeSocket(oldSocket);
    };

    const connect = () => {
      if (settled) return;

      clearRetryTimer();
      const attemptNumber = ++connectAttemptCount;
      const attemptId = ++activeAttemptId;
      let openTimeoutTimer: number | undefined;
      let hasOpened = false;
      let hasTimedOut = false;
      const currentSocket = new WebSocket(resolvedWsUrl);
      socket = currentSocket;

      updateProgress(
        'info',
        `Trying to establish a WebSocket connection to ${resolvedWsUrl} ` +
          `(attempt ${attemptNumber}/${maxConnectRetries + 1}, timeout ${connectionTimeoutMs} ms)`
      );

      const clearOpenTimeout = () => {
        if (openTimeoutTimer !== undefined) {
          window.clearTimeout(openTimeoutTimer);
          openTimeoutTimer = undefined;
        }
      };

      const isActiveAttempt = () => !settled && attemptId === activeAttemptId && socket === currentSocket;

      const failOpeningAttempt = (cause: string) => {
        if (!isActiveAttempt()) return;
        clearOpenTimeout();
        activeAttemptId += 1;
        socket = null;
        scheduleConnectRetry(cause);
      };

      openTimeoutTimer = window.setTimeout(() => {
        if (!isActiveAttempt() || hasOpened) return;
        hasTimedOut = true;
        updateProgress('error', `WebSocket opening timed out after ${connectionTimeoutMs} ms`);

        // There is no real WebSocket.abort() for CONNECTING sockets.
        // To avoid Chrome's "closed before the connection is established" warning,
        // mark this attempt as stale and ignore it. If it eventually opens, close it then.
        failOpeningAttempt(`WebSocket opening timed out after ${connectionTimeoutMs} ms`);
      }, connectionTimeoutMs);

      currentSocket.onopen = () => {
        if (hasTimedOut || !isActiveAttempt()) {
          closeSocket(currentSocket);
          return;
        }

        clearOpenTimeout();
        hasOpened = true;
        updateProgress('info', 'Connection opened');
        currentSocket.send(path);
      };

      currentSocket.onerror = () => {
        if (!isActiveAttempt()) return;
        if (!hasOpened) {
          failOpeningAttempt('WebSocket connection error before open');
          return;
        }
        finishError(new Error('WebSocket connection error'));
      };

      currentSocket.onclose = (event) => {
        if (!isActiveAttempt()) return;
        clearOpenTimeout();
        const reason = connectionCloseReason(event);
        const message = reason || 'WebSocket connection closed before result was received';

        if (!hasOpened) {
          failOpeningAttempt(message);
          return;
        }

        finishError(new Error(message));
      };

      currentSocket.onmessage = async (event) => {
        if (!isActiveAttempt()) return;
        const message = typeof event.data === 'string' ? event.data : String(event.data);

        if (isAuthError(message)) {
          if (!reconnectOnceOn403 || authReconnectAttempted) {
            finishError(new Error(`${message}; session may have expired. Refresh the page and try again.`));
            return;
          }

          authReconnectAttempted = true;
          updateProgress('error', `${message}; trying to reconnect once`);
          supersedeCurrentSocket();

          try {
            await reauthIfConfigured();
            connectAttemptCount = 0;
            connect();
          } catch (error) {
            finishError(error);
          }
          return;
        }

        if (message.startsWith('html:')) {
          updateProgress('html', message.slice(5));
          return;
        }

        if (isResultMessage(message)) {
          let result: TResponse;
          try {
            result = parseResult(message);
          } catch (error) {
            finishError(error);
            return;
          }
          updateProgress('result', 'Result received');
          finishSuccess(result);
          return;
        }

        updateProgress('info', message);
      };
    };

    connect();
  });
}
