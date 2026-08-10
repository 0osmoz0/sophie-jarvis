/**
 * Typed EventBus for JARVIS Core.
 *
 * Initial events cover the task lifecycle. The architecture allows
 * adding future events (security_alert, file_changed, etc.) without
 * changing the bus internals — extend JarvisEventMap.
 */

export interface JarvisEventMap {
  task_created: { taskId: string; toolId: string; description: string };
  task_started: { taskId: string; toolId: string };
  task_waiting_confirmation: {
    taskId: string;
    toolId: string;
    riskLevel: string;
    reason: string;
  };
  task_completed: { taskId: string; toolId: string; result: unknown };
  task_failed: { taskId: string; toolId: string; error: string };
  /** Phase 2 — observation layer */
  observation_updated: { timestamp: string };
  user_activity_changed: {
    previous: string;
    current: string;
  };
  /** Phase 7 — aggregate idle signals (not security actions). */
  user_became_idle: {
    idleSeconds: number | null;
    observedAt: number;
  };
  user_returned: {
    idleSeconds: number | null;
    observedAt: number;
  };
  active_application_changed: {
    previous: string | null;
    current: string | null;
  };
}

export type JarvisEventName = keyof JarvisEventMap;

export type EventHandler<E extends JarvisEventName> = (
  payload: JarvisEventMap[E],
) => void;

export class EventBus {
  private readonly handlers = new Map<
    JarvisEventName,
    Set<EventHandler<JarvisEventName>>
  >();

  on<E extends JarvisEventName>(event: E, handler: EventHandler<E>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as EventHandler<JarvisEventName>);
    return () => {
      set!.delete(handler as EventHandler<JarvisEventName>);
    };
  }

  once<E extends JarvisEventName>(
    event: E,
    handler: EventHandler<E>,
  ): () => void {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  off<E extends JarvisEventName>(event: E, handler: EventHandler<E>): void {
    this.handlers.get(event)?.delete(handler as EventHandler<JarvisEventName>);
  }

  emit<E extends JarvisEventName>(event: E, payload: JarvisEventMap[E]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) {
      handler(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }

  listenerCount(event: JarvisEventName): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}
