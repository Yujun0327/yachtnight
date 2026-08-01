/** What every input adapter drives — the director, behind a thin seam. */
export interface RollInputSink {
  /** Player grabbed the cup. */
  begin(): void
  /** Per-frame-ish: shake intensity 0..1 and normalized cup steer 0..1. */
  update(intensity: number, pointerX: number): void
  /** Let it fly: horizontal world direction + gesture energy 0..1. */
  commit(dir: [number, number], speed: number): void
  cancel(): void
}
