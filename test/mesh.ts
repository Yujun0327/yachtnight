import type { NetMsg, Transport } from '../src/transport/types'

/**
 * Deterministic in-memory full mesh standing in for Trystero: messages queue
 * centrally and deliver on flush(), a filter hook lets tests drop or observe
 * deliveries, and peers can leave and rejoin to exercise reconnect flows.
 */
export class Mesh {
  private peers = new Map<string, MeshPeer>()
  private queue: { to: string; from: string; msg: NetMsg }[] = []
  /** Return false to drop a delivery (for reorder/loss tests). */
  filter: (msg: NetMsg, from: string, to: string) => boolean = () => true

  /** Create a transport but do not announce it yet (handlers attach first). */
  createPeer(id: string): Transport {
    const peer = new MeshPeer(this, id)
    this.peers.set(id, peer)
    return peer
  }

  /** Fire join events between the new peer and everyone already present. */
  announce(id: string): void {
    const peer = this.peers.get(id)!
    for (const [otherId, other] of this.peers) {
      if (otherId === id) continue
      other.fireJoin(id)
      peer.fireJoin(otherId)
    }
  }

  drop(id: string): void {
    this.peers.delete(id)
    this.queue = this.queue.filter((d) => d.to !== id && d.from !== id)
    for (const other of this.peers.values()) other.fireLeave(id)
  }

  enqueue(from: string, msg: NetMsg, to?: string | string[]): void {
    const targets = to === undefined ? [...this.peers.keys()].filter((p) => p !== from) : [to].flat()
    for (const t of targets) this.queue.push({ to: t, from, msg })
  }

  /** Deliver every queued message (including ones enqueued while flushing). */
  flush(): void {
    while (this.queue.length > 0) {
      const d = this.queue.shift()!
      if (!this.filter(d.msg, d.from, d.to)) continue
      this.peers.get(d.to)?.deliver(d.msg, d.from)
    }
  }
}

class MeshPeer implements Transport {
  private messageHandlers: ((msg: NetMsg, from: string) => void)[] = []
  private joinHandlers: ((peerId: string) => void)[] = []
  private leaveHandlers: ((peerId: string) => void)[] = []

  constructor(
    private mesh: Mesh,
    readonly selfId: string,
  ) {}

  send(msg: NetMsg, to?: string | string[]): void {
    // JSON round-trip like the real wire, so nothing structurally shared leaks
    this.mesh.enqueue(this.selfId, JSON.parse(JSON.stringify(msg)) as NetMsg, to)
  }

  onMessage(fn: (msg: NetMsg, from: string) => void): void {
    this.messageHandlers.push(fn)
  }

  onPeerJoin(fn: (peerId: string) => void): void {
    this.joinHandlers.push(fn)
  }

  onPeerLeave(fn: (peerId: string) => void): void {
    this.leaveHandlers.push(fn)
  }

  close(): void {}

  deliver(msg: NetMsg, from: string): void {
    for (const fn of this.messageHandlers) fn(msg, from)
  }

  fireJoin(peerId: string): void {
    for (const fn of this.joinHandlers) fn(peerId)
  }

  fireLeave(peerId: string): void {
    for (const fn of this.leaveHandlers) fn(peerId)
  }
}
