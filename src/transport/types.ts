import type { GameConfig, Move, Seat } from '../engine/types'

export const PROTOCOL_VERSION = 1

export interface WireMove {
  seq: number
  actor: Seat
  move: Move
  /** publicHash of the full state AFTER applying this move. */
  hash: string
}

export interface LobbySeat {
  /** Persistent identity; null = seat open. */
  playerKey: string | null
  name: string
  ready: boolean
  connected: boolean
}

export type NetMsg =
  | {
      t: 'hello'
      playerKey: string
      name: string
      protocol: number
      creator: boolean
      haveGame: string | null
      haveSeq: number
    }
  | { t: 'lobby'; seats: LobbySeat[]; hostKey: string }
  | { t: 'claimSeat'; playerKey: string; name: string; ready: boolean }
  | { t: 'config'; gameId: string; cfg: GameConfig; seatOf: Record<string, Seat> }
  | { t: 'move'; wire: WireMove }
  | { t: 'resyncReq'; haveSeq: number }
  | { t: 'resync'; gameId: string; cfg: GameConfig; seatOf: Record<string, Seat>; log: WireMove[] }
  | { t: 'rematchReq' }
  | { t: 'roomFull' }

export interface Transport {
  /** This client's ephemeral peer id. */
  selfId: string
  /** Broadcast, or send to specific peer(s) when `to` is given. */
  send(msg: NetMsg, to?: string | string[]): void
  onMessage(fn: (msg: NetMsg, from: string) => void): void
  onPeerJoin(fn: (peerId: string) => void): void
  onPeerLeave(fn: (peerId: string) => void): void
  close(): void
  /** Number of currently-open signaling relay connections, if known. */
  relayCount?(): number
}
