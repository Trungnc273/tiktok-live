/**
 * Duplicate protection theo docs/architecture/REALTIME-ARCHITECTURE.md:
 * "message có sequence <= lastSequenceHandled bị bỏ qua".
 */
export class SequenceGuard {
  private last = 0;

  /** true nếu message NÊN được xử lý (sequence mới hơn); false nếu là duplicate/cũ hơn. */
  accept(sequence: number): boolean {
    if (sequence <= this.last) return false;
    this.last = sequence;
    return true;
  }

  get lastSequence(): number {
    return this.last;
  }
}
