/**
 * SophieAPI — public façade for Sophie ↔ JARVIS.
 * Signals + read-only snapshot only. No execute / shell / performAction.
 */
import type { SophieEventBus, SophieBusEventType } from "./SophieEventBus.js";
import type { SophieIntegration } from "./SophieIntegration.js";
import type {
  SophieEmitResult,
  SophieEventListener,
  SophiePublicSnapshot,
} from "./types.js";

export class SophieAPI {
  private readonly integration: SophieIntegration;
  private readonly bus: SophieEventBus;

  constructor(integration: SophieIntegration) {
    this.integration = integration;
    this.bus = integration.bus;
  }

  /** Sophie → JARVIS signal. Never executes system actions. */
  emit(event: unknown): SophieEmitResult {
    return this.integration.handleInput(event);
  }

  subscribe(
    eventType: SophieBusEventType,
    listener: SophieEventListener,
  ): void {
    this.bus.subscribe(eventType, listener);
  }

  unsubscribe(
    eventType: SophieBusEventType,
    listener: SophieEventListener,
  ): void {
    this.bus.unsubscribe(eventType, listener);
  }

  /** Read-only high-level snapshot — no internals. */
  getSnapshot(): SophiePublicSnapshot {
    return this.integration.getSnapshot();
  }
}
