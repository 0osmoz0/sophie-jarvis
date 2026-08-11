/**
 * SophieEventBus — typed in-process signal bus.
 * Synchronous dispatch by default (listeners may return promises; not awaited for control flow).
 * No network. No Sophie UI dependency. Does not expose internal Brain events.
 */
import type {
  SophieEvent,
  SophieEventListener,
  SophieInputEventType,
  SophieOutputEventType,
} from "./types.js";

export type SophieBusEventType = SophieInputEventType | SophieOutputEventType | "*";

export class SophieEventBus {
  private readonly listeners = new Map<
    string,
    Set<SophieEventListener>
  >();

  emit(event: SophieEvent): number {
    const typed = this.listeners.get(event.type);
    const all = this.listeners.get("*");
    let count = 0;
    if (typed) {
      for (const listener of typed) {
        void listener(event);
        count += 1;
      }
    }
    if (all) {
      for (const listener of all) {
        void listener(event);
        count += 1;
      }
    }
    return count;
  }

  subscribe(
    eventType: SophieBusEventType,
    listener: SophieEventListener,
  ): void {
    let set = this.listeners.get(eventType);
    if (!set) {
      set = new Set();
      this.listeners.set(eventType, set);
    }
    set.add(listener);
  }

  unsubscribe(
    eventType: SophieBusEventType,
    listener: SophieEventListener,
  ): void {
    const set = this.listeners.get(eventType);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) this.listeners.delete(eventType);
  }

  listenerCount(eventType?: SophieBusEventType): number {
    if (eventType) return this.listeners.get(eventType)?.size ?? 0;
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }

  clear(): void {
    this.listeners.clear();
  }
}
