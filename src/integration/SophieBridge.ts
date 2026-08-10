/**
 * SophieBridge — future integration adapter.
 *
 * Intended flow:
 *   JARVIS → SophieBridge → Sophie (external event bus / API)
 *
 * Phase 1:
 *   - Interface + no-op / recording adapter only
 *   - No dependency on the Sophie repository
 *   - No animations or Sophie behavioral state manipulation
 */

export type SophieBridgeMessageType =
  | "task_update"
  | "permission_request"
  | "result"
  | "status";

export interface SophieBridgeMessage {
  type: SophieBridgeMessageType;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface SophieBridge {
  /** Send a message toward Sophie (future). Phase 1: may record only. */
  notify(message: SophieBridgeMessage): Promise<void> | void;

  /** Whether the bridge is connected to a live Sophie instance. */
  isConnected(): boolean;
}

/**
 * NullSophieBridge — decoupled stub. Records messages in memory for tests.
 * Never imports Sophie code.
 */
export class NullSophieBridge implements SophieBridge {
  readonly sent: SophieBridgeMessage[] = [];

  notify(message: SophieBridgeMessage): void {
    this.sent.push(message);
  }

  isConnected(): boolean {
    return false;
  }

  clear(): void {
    this.sent.length = 0;
  }
}

export function createSophieBridgeMessage(
  type: SophieBridgeMessageType,
  payload: Record<string, unknown>,
): SophieBridgeMessage {
  return {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
}
