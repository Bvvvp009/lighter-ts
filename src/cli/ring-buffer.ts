/**
 * Ring buffer for the CLI dashboard event log.
 * Keeps the last N items, discarding older ones.
 */
export class RingBuffer<T> {
  private buffer: T[];
  private head: number = 0;
  private _size: number = 0;
  private capacity: number;

  constructor(maxSize: number) {
    this.capacity = maxSize;
    this.buffer = new Array(maxSize);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
  }

  /** Returns the last n items, oldest first. */
  last(n: number): T[] {
    const count = Math.min(n, this._size);
    const result: T[] = [];
    const start = (this.head - count + this.capacity) % this.capacity;
    for (let i = 0; i < count; i++) {
      result.push(this.buffer[(start + i) % this.capacity]);
    }
    return result;
  }

  /** Returns all items, oldest first. */
  all(): T[] {
    return this.last(this._size);
  }

  clear(): void {
    this.head = 0;
    this._size = 0;
    this.buffer = new Array(this.capacity);
  }

  get size(): number {
    return this._size;
  }
}