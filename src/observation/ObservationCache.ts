/**
 * In-memory observation cache — temporary, non-persistent.
 * Never stores screenshots, key history, or personal content.
 */
export class ObservationCache<T> {
  private value: T | null = null;
  private storedAt = 0;
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = Math.max(0, ttlMs);
  }

  get(): T | null {
    if (this.value === null) return null;
    if (this.ttlMs === 0) return null;
    if (Date.now() - this.storedAt > this.ttlMs) {
      this.value = null;
      return null;
    }
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    this.storedAt = Date.now();
  }

  clear(): void {
    this.value = null;
    this.storedAt = 0;
  }

  isFresh(): boolean {
    return this.get() !== null;
  }
}
