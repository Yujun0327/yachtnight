import {
  applyMove,
  createGame,
  isFiveKind,
  legalMoves,
  publicHash,
  redact,
  ruleset,
  totalScore,
} from '../engine'
import type { GameConfig, GameState, Move, RulesetId, Seat } from '../engine'
import { PROTOCOL_VERSION } from '../transport/types'
import type { LobbySeat, NetMsg, Transport, WireMove } from '../transport/types'
import { connectRoom } from '../transport/trystero'
import { clearGame, loadGame, saveGame } from './persist'
import type { SavedGame } from './persist'

export type SfxEvent = 'score' | 'zero' | 'bigscore' | 'win' | 'lose'

export const RULES_VERSION = '1'

export abstract class BaseSession {
  cfg = $state<GameConfig>() as GameConfig
  state = $state<GameState>() as GameState
  events = $state<{ id: number; sfx: SfxEvent }[]>([])
  private eventId = 0

  constructor(cfg: GameConfig, initial: GameState) {
    this.cfg = cfg
    this.state = initial
  }

  abstract readonly mode: 'hotseat' | 'online'
  /** The seat this client plays; null = plays every seat (hotseat) or none (spectator). */
  abstract get mySeat(): Seat | null
  /** Whose blind reserves the UI may show right now. */
  abstract get viewer(): Seat | null

  get names(): string[] {
    return this.cfg.names
  }

  get visibleState(): GameState {
    return redact(this.state, this.viewer)
  }

  get actor(): Seat {
    return this.state.seatToAct
  }

  /** Can the local human act right now? */
  get myTurn(): boolean {
    return this.mySeat === null || this.actor === this.mySeat
  }

  myMoves(): Move[] {
    if (!this.myTurn || this.state.result) return []
    return legalMoves(this.state, this.actor)
  }

  protected emit(sfx: SfxEvent) {
    this.events = [...this.events.slice(-4), { id: this.eventId++, sfx }]
  }

  protected applyLocal(actor: Seat, move: Move): void {
    const before = this.state
    const after = applyMove(before, actor, move)
    this.state = after

    // Roll audio lives in the dice director (rattle/impacts track the sim);
    // session-level sfx cover the scorekeeping beats only.
    if (move.type === 'score') {
      const value = after.cards[actor].marks[move.category] ?? 0
      const bonus = after.cards[actor].fiveKindBonuses > before.cards[actor].fiveKindBonuses
      if (bonus || (move.category === 'fiveKind' && isFiveKind(before.dice))) this.emit('bigscore')
      else if (value === 0) this.emit('zero')
      else this.emit('score')
    }
    if (!before.result && after.result) {
      const won = this.mySeat === null || after.result.winners.includes(this.mySeat)
      this.emit(won ? 'win' : 'lose')
    }
  }

  abstract submit(move: Move): void
  destroy(): void {}
}

/* ------------------------------------------------------------------ */

export class HotseatSession extends BaseSession {
  readonly mode = 'hotseat'

  constructor(playerCount: 1 | 2 | 3 | 4, names: string[], rules: RulesetId) {
    const cfg: GameConfig = {
      playerCount,
      sharedSeed: crypto.getRandomValues(new Uint32Array(1))[0],
      startingSeat: playerCount === 1 ? 0 : Math.floor(Math.random() * playerCount),
      names: names.map((n, i) => n.trim() || `Player ${i + 1}`),
      rulesVersion: RULES_VERSION,
      ruleset: rules,
    }
    super(cfg, createGame(cfg))
  }

  get mySeat(): null {
    return null
  }

  /** On a shared screen only the acting player's blind reserves are shown. */
  get viewer(): Seat {
    return this.actor
  }

  submit(move: Move): void {
    this.applyLocal(this.actor, move)
  }
}

/** Running total for every seat, for scoreboards. */
export function scores(state: GameState): number[] {
  const rs = ruleset(state.ruleset)
  return state.cards.map((card) => totalScore(rs, card))
}

/* ------------------------------------------------------------------ */

export type OnlineStatus =
  | 'connecting' // joined the room, nobody else here yet
  | 'lobby' // gathering players, host holds the roster
  | 'playing'
  | 'desync'
  | 'room-full'

const MAX_SEATS = 4

function placeholderConfig(): GameConfig {
  return {
    playerCount: 2,
    sharedSeed: 0,
    startingSeat: 0,
    names: ['—', '—'],
    rulesVersion: RULES_VERSION,
    ruleset: 'yacht',
  }
}

/**
 * N-player sync via turn-holder sequencing: Yacht Night never has concurrent
 * decisions — at any seq exactly one seat may act and every in-sync client
 * agrees which — so the actor self-stamps `seq = log.length + 1` and
 * broadcasts to the mesh. Out-of-order arrivals trigger a resync request;
 * a full-state hash mismatch after applying trips the desync flag. The host
 * (room creator) is authoritative only for the lobby roster, seat
 * assignment, game start, and rematch.
 */
export class OnlineSession extends BaseSession {
  readonly mode = 'online'
  readonly room: string
  readonly myKey: string

  status = $state<OnlineStatus>('connecting')
  seats = $state<LobbySeat[]>([])
  hostKey = $state<string | null>(null)
  seat = $state<Seat | null>(null)
  myName = $state('')
  rematchWanted = $state(false)
  /** Host's ruleset pick, applied when the game starts. */
  hostRuleset = $state<RulesetId>('yacht')
  /** playerKey → currently connected. */
  peersHere = $state<Record<string, boolean>>({})

  private transport: Transport
  private log: WireMove[] = []
  private gameId = ''
  private seatOf: Record<string, Seat> = {}
  private creator: boolean
  /**
   * Reactive on purpose: `playing` short-circuits on it, so if it were a
   * plain field the App-level `{#if online.playing}` would track no
   * dependencies while false and never notice the game starting.
   */
  private started = $state(false)
  private keyByPeer = new Map<string, string>()
  private hostPeerId: string | null = null

  constructor(
    room: string,
    creator: boolean,
    identity: { key: string; name: string },
    transport?: Transport,
  ) {
    const saved = loadGame(room, identity.key)
    if (saved) {
      super(saved.cfg, replayLog(saved))
      this.log = saved.log
      this.gameId = saved.gameId
      this.seatOf = saved.seatOf
      this.started = true
    } else {
      const cfg = placeholderConfig()
      super(cfg, createGame(cfg))
    }
    this.room = room
    this.creator = creator
    this.myKey = identity.key
    this.myName = identity.name.trim() || 'Guest'
    if (this.started) {
      this.seat = this.seatOf[this.myKey] ?? null
      this.status = 'playing'
      if (this.creator) this.hostKey = this.myKey
    } else if (creator) {
      this.hostKey = this.myKey
      this.seats = [{ playerKey: this.myKey, name: this.myName, ready: false, connected: true }]
      this.status = 'lobby'
    }

    this.transport = transport ?? connectRoom(room)
    this.transport.onPeerJoin((peerId) => this.sendHello(peerId))
    this.transport.onPeerLeave((peerId) => this.onPeerLeave(peerId))
    this.transport.onMessage((msg, from) => this.onMessage(msg, from))
  }

  /* ---------------- base overrides ---------------- */

  get mySeat(): Seat | null {
    return this.seat
  }

  get viewer(): Seat | null {
    return this.seat
  }

  /** Unlike hotseat, a null seat here is a spectator — never allowed to act. */
  get myTurn(): boolean {
    return this.seat !== null && this.actor === this.seat
  }

  get playing(): boolean {
    return this.started && (this.status === 'playing' || this.status === 'desync')
  }

  get spectator(): boolean {
    return this.started && this.seat === null
  }

  get isHost(): boolean {
    return this.hostKey === this.myKey
  }

  /** Name of the disconnected player the game is waiting on, if any. */
  get waitingOn(): string | null {
    if (!this.started || this.state.result) return null
    const actorKey = Object.keys(this.seatOf).find((k) => this.seatOf[k] === this.actor)
    if (!actorKey || actorKey === this.myKey) return null
    return this.peersHere[actorKey] === false ? this.cfg.names[this.actor] : null
  }

  submit(move: Move): void {
    if (!this.started || this.seat === null) return
    if (this.actor !== this.seat) throw new Error('not your seat')
    this.applyLocal(this.seat, move)
    const wire: WireMove = {
      seq: this.log.length + 1,
      actor: this.seat,
      move,
      hash: publicHash(this.state),
    }
    this.log.push(wire)
    this.persist()
    this.transport.send({ t: 'move', wire })
  }

  /* ---------------- lobby (host authoritative) ---------------- */

  setReady(ready: boolean): void {
    this.updateSelfSeat({ ready })
  }

  rename(name: string): void {
    this.myName = name.trim() || 'Guest'
    this.updateSelfSeat({ name: this.myName })
  }

  private updateSelfSeat(patch: Partial<LobbySeat>): void {
    if (this.isHost) {
      this.seats = this.seats.map((s) => (s.playerKey === this.myKey ? { ...s, ...patch } : s))
      this.broadcastLobby()
    } else {
      const mine = this.seats.find((s) => s.playerKey === this.myKey)
      const claim = {
        t: 'claimSeat' as const,
        playerKey: this.myKey,
        name: patch.name ?? this.myName,
        ready: patch.ready ?? mine?.ready ?? false,
      }
      // optimistic: reflect my own toggle immediately; the host's next
      // lobby broadcast remains authoritative
      this.seats = this.seats.map((s) => (s.playerKey === this.myKey ? { ...s, ...patch } : s))
      this.transport.send(claim, this.hostPeerId ?? undefined)
    }
  }

  get canStart(): boolean {
    const filled = this.seats.filter((s) => s.playerKey !== null)
    return (
      this.isHost &&
      !this.started &&
      filled.length >= 2 &&
      filled.length <= MAX_SEATS &&
      filled.every((s) => s.ready && s.connected)
    )
  }

  startGame(): void {
    if (!this.canStart) return
    const filled = this.seats.filter((s) => s.playerKey !== null)
    const playerCount = filled.length as 2 | 3 | 4
    const cfg: GameConfig = {
      playerCount,
      sharedSeed: crypto.getRandomValues(new Uint32Array(1))[0],
      startingSeat: Math.floor(Math.random() * playerCount),
      names: filled.map((s) => s.name),
      rulesVersion: RULES_VERSION,
      ruleset: this.hostRuleset,
    }
    const seatOf: Record<string, Seat> = {}
    filled.forEach((s, i) => (seatOf[s.playerKey!] = i))
    const gameId = `${this.room}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`
    this.transport.send({ t: 'config', gameId, cfg, seatOf })
    this.adoptGame(gameId, cfg, seatOf, [])
  }

  requestRematch(): void {
    this.rematchWanted = true
    if (this.isHost) {
      this.startRematch()
    } else {
      this.transport.send({ t: 'rematchReq' }, this.hostPeerId ?? undefined)
    }
  }

  private startRematch(): void {
    if (!this.started || !this.state.result) return
    const cfg: GameConfig = {
      ...this.cfg,
      sharedSeed: crypto.getRandomValues(new Uint32Array(1))[0],
      startingSeat: (this.cfg.startingSeat + 1) % this.cfg.playerCount,
    }
    const gameId = `${this.room}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`
    this.transport.send({ t: 'config', gameId, cfg, seatOf: this.seatOf })
    this.adoptGame(gameId, cfg, this.seatOf, [])
  }

  /* ---------------- wire handling ---------------- */

  private sendHello(to?: string): void {
    this.transport.send(
      {
        t: 'hello',
        playerKey: this.myKey,
        name: this.myName,
        protocol: PROTOCOL_VERSION,
        creator: this.creator,
        haveGame: this.started ? this.gameId : null,
        haveSeq: this.log.length,
      },
      to,
    )
  }

  private onPeerLeave(peerId: string): void {
    const key = this.keyByPeer.get(peerId)
    if (!key) return
    this.keyByPeer.delete(peerId)
    this.peersHere = { ...this.peersHere, [key]: false }
    if (this.isHost && !this.started) {
      // pre-game, a vanished peer must not ghost-block the start: drop the
      // seat entirely — their hello re-seats them if they come back
      this.seats = this.seats.filter((s) => s.playerKey !== key)
      this.broadcastLobby()
    }
  }

  private onMessage(msg: NetMsg, from: string): void {
    switch (msg.t) {
      case 'hello':
        this.onHello(msg, from)
        return

      case 'lobby': {
        // only trust the host's roster
        this.hostKey = msg.hostKey
        this.hostPeerId = from
        this.seats = msg.seats
        if (!this.started && this.status !== 'room-full') this.status = 'lobby'
        return
      }

      case 'claimSeat': {
        if (!this.isHost || this.started) return
        if (this.seats.some((s) => s.playerKey === msg.playerKey)) {
          this.seats = this.seats.map((s) =>
            s.playerKey === msg.playerKey ? { ...s, name: msg.name, ready: msg.ready } : s,
          )
        } else if (this.seats.filter((s) => s.playerKey !== null).length < MAX_SEATS) {
          // the claim raced ahead of (or lost) the hello — seat them now
          this.seats = [
            ...this.seats,
            { playerKey: msg.playerKey, name: msg.name, ready: msg.ready, connected: true },
          ]
        }
        this.broadcastLobby()
        return
      }

      case 'config': {
        if (this.started && msg.gameId === this.gameId) return
        this.adoptGame(msg.gameId, msg.cfg, msg.seatOf, [])
        return
      }

      case 'move': {
        if (!this.started) return
        this.receiveMove(msg.wire)
        return
      }

      case 'resyncReq': {
        if (this.started && this.log.length > msg.haveSeq) this.sendResync(from)
        return
      }

      case 'resync': {
        if (!this.started) {
          this.adoptGame(msg.gameId, msg.cfg, msg.seatOf, msg.log)
          return
        }
        if (msg.gameId === this.gameId && msg.log.length > this.log.length) {
          this.rebuildFrom(msg.log)
        }
        if (this.status === 'desync' && msg.log.length >= this.log.length) this.status = 'playing'
        return
      }

      case 'rematchReq': {
        if (this.isHost && this.state.result) this.startRematch()
        return
      }

      case 'roomFull':
        this.status = 'room-full'
        return
    }
  }

  private onHello(msg: NetMsg & { t: 'hello' }, from: string): void {
    this.keyByPeer.set(from, msg.playerKey)
    this.peersHere = { ...this.peersHere, [msg.playerKey]: true }
    if (msg.creator) {
      this.hostKey ??= msg.playerKey
      if (msg.playerKey === this.hostKey) this.hostPeerId = from
    }
    if (msg.protocol !== PROTOCOL_VERSION) {
      console.warn('[yachtnight] protocol mismatch', msg.protocol)
      this.status = 'desync'
      return
    }

    if (this.started) {
      // resume path: whoever is ahead pushes their log to the newcomer
      if (msg.haveGame !== this.gameId || msg.haveSeq < this.log.length) {
        this.sendResync(from)
      }
      return
    }

    if (this.isHost) {
      const known = this.seats.find((s) => s.playerKey === msg.playerKey)
      if (known) {
        this.seats = this.seats.map((s) =>
          s.playerKey === msg.playerKey ? { ...s, name: msg.name, connected: true } : s,
        )
      } else if (this.seats.filter((s) => s.playerKey !== null).length < MAX_SEATS) {
        this.seats = [
          ...this.seats,
          { playerKey: msg.playerKey, name: msg.name, ready: false, connected: true },
        ]
      } else {
        this.transport.send({ t: 'roomFull' }, from)
        return
      }
      this.status = 'lobby'
      this.broadcastLobby()
    }
  }

  private broadcastLobby(): void {
    this.transport.send({ t: 'lobby', seats: $state.snapshot(this.seats), hostKey: this.myKey })
  }

  private sendResync(to: string): void {
    this.transport.send(
      { t: 'resync', gameId: this.gameId, cfg: this.cfg, seatOf: this.seatOf, log: this.log },
      to,
    )
  }

  private adoptGame(
    gameId: string,
    cfg: GameConfig,
    seatOf: Record<string, Seat>,
    log: WireMove[],
  ): void {
    this.cfg = cfg
    this.gameId = gameId
    this.seatOf = seatOf
    this.seat = seatOf[this.myKey] ?? null
    this.log = []
    this.rematchWanted = false
    this.state = createGame(cfg)
    this.started = true
    this.status = 'playing'
    for (const wire of log) this.receiveMove(wire)
    this.persist()
  }

  private rebuildFrom(log: WireMove[]): void {
    this.state = createGame(this.cfg)
    this.log = []
    this.status = 'playing'
    for (const wire of log) this.receiveMove(wire)
    this.persist()
  }

  private receiveMove(wire: WireMove): void {
    if (wire.seq !== this.log.length + 1) {
      if (wire.seq > this.log.length + 1) {
        this.transport.send({ t: 'resyncReq', haveSeq: this.log.length })
      }
      return // duplicate or out of order
    }
    try {
      this.applyLocal(wire.actor, wire.move)
    } catch (err) {
      console.error('rejected remote move', wire, err)
      this.status = 'desync'
      this.transport.send({ t: 'resyncReq', haveSeq: 0 })
      return
    }
    if (publicHash(this.state) !== wire.hash) {
      this.status = 'desync'
      this.transport.send({ t: 'resyncReq', haveSeq: 0 })
      return
    }
    this.log.push(wire)
    this.persist()
  }

  private persist(): void {
    saveGame(this.room, this.myKey, {
      gameId: this.gameId,
      cfg: $state.snapshot(this.cfg) as GameConfig,
      seatOf: this.seatOf,
      log: this.log,
    } satisfies SavedGame)
  }

  /** Open signaling-relay connections (diagnostics for the lobby). */
  relayCount(): number {
    return this.transport.relayCount?.() ?? 0
  }

  leave(): void {
    clearGame(this.room, this.myKey)
    this.destroy()
  }

  destroy(): void {
    this.transport.close()
  }
}

function replayLog(saved: SavedGame): GameState {
  let state = createGame(saved.cfg)
  for (const wire of saved.log) {
    state = applyMove(state, wire.actor, wire.move)
  }
  return state
}
