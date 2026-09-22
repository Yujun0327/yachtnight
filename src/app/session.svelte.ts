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
import {
  BeaconSession,
  brokersFromEnv,
  type Beacon,
  type GameAdapter,
  type Transport,
} from '@yujun/game-net'
import { WalletSession, defaultLedger, loadIdentity, type Identity, type Ledger, type LockState, type Payout } from '@yujun/game-net/wallet'
import { APP } from './persist'

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
    this.emitFor(before, after, actor, move)
  }

  /** Derive sound effects from one applied transition. */
  protected emitFor(before: GameState, after: GameState, actor: Seat, move: Move): void {
    void before
    void actor

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
      stake: 0,
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
  | 'connecting' // in the room, nobody else heard from yet
  | 'lobby' // gathering players
  | 'playing'
  | 'desync'
  | 'room-full'
  | 'version-mismatch'

export interface LobbySeat {
  playerKey: string
  name: string
  ready: boolean
  connected: boolean
}

function placeholderConfig(): GameConfig {
  return {
    playerCount: 2,
    sharedSeed: 0,
    startingSeat: 0,
    names: ['—', '—'],
    rulesVersion: RULES_VERSION,
    ruleset: 'yacht',
    stake: 0,
  }
}

type Core = BeaconSession<GameConfig, GameState, Move>

/**
 * yachtnight on the shared beacon session (see @yujun/game-net). Turn-holder
 * sequencing is valid because the game never has concurrent decisions: at
 * any seq exactly one seat may act and every in-sync client agrees which.
 * `host` gives the adapter the host's lobby options at start time.
 */
function makeAdapter(host: () => OnlineSession | null): GameAdapter<GameConfig, GameState, Move> {
  return {
    app: APP,
    protocol: 3,
    rulesVersion: RULES_VERSION,
    minSeats: 2,
    maxSeats: 4,
    makeConfig: (players, prev) => {
      if (players.length < 2) return placeholderConfig()
      const playerCount = players.length as 2 | 3 | 4
      return {
        ...placeholderConfig(),
        playerCount,
        sharedSeed: crypto.getRandomValues(new Uint32Array(1))[0],
        startingSeat: prev ? (prev.startingSeat + 1) % playerCount : Math.floor(Math.random() * playerCount),
        names: players.map((p, i) => p.name.trim() || `Player ${i + 1}`),
        rulesVersion: RULES_VERSION,
      ruleset: prev ? prev.ruleset : (host()?.hostRuleset ?? 'yacht'),
      stake: prev ? (prev.stake ?? 0) : (host()?.hostStake ?? 0),
      }
    },
    create: (cfg) => ({ state: createGame(cfg) }),
    apply: applyMove,
    hash: publicHash,
    actor: (s) => s.seatToAct,
    isOver: (s) => s.result !== null,
    winners: (s) => s.result?.winners ?? [],
    stake: (cfg) => cfg.stake ?? 0,
  }
}

export interface OnlineTestHooks {
  ledger?: Ledger
  identity?: Identity
  transport?: Transport<Beacon<GameConfig, Move>>
  now?: () => number
  timers?: boolean
}

export class OnlineSession extends BaseSession {
  readonly mode = 'online'
  readonly room: string
  readonly myKey: string
  /** Host's lobby pick (ruleset + stake), mirrored to guests through the beacon. */
  private pick = $state<{ ruleset: RulesetId; stake: number }>({ ruleset: 'yacht', stake: 0 })
  /** Cash balance per seated player key, for the stake gate in the lobby. */
  balances = $state<Record<string, number>>({})
  private balanceKeys = ''

  get hostRuleset(): RulesetId {
    return this.pick.ruleset
  }

  set hostRuleset(v: RulesetId) {
    this.pick = { ...this.pick, ruleset: v }
    this.announcePick()
  }

  get hostStake(): number {
    return this.pick.stake
  }

  set hostStake(v: number) {
    this.pick = { ...this.pick, stake: v }
    this.announcePick()
  }

  private announcePick(): void {
    if (this.core.isHost && !this.core.started) this.core.setExtra({ pick: $state.snapshot(this.pick) })
  }

  /** Can this player afford the table's stake? */
  get canAfford(): boolean {
    if (!this.pick.stake || !this.wallet) return true
    const mine = this.balances[this.myKey]
    return mine === undefined ? true : mine >= this.pick.stake
  }

  private refreshBalances(): void {
    const ledger = this.ledger
    if (!ledger) return
    const keys = this.core.players.map((p) => p.key)
    const sig = keys.join(',')
    if (sig === this.balanceKeys) return
    this.balanceKeys = sig
    for (const key of keys) {
      void ledger.readPlayer(key).then((p) => {
        if (p) this.balances = { ...this.balances, [key]: p.balance }
      })
    }
  }

  private readonly core: Core
  private wallet: WalletSession<GameConfig, GameState, Move, undefined> | null = null
  /**
   * Reactive revision, bumped on every core change. Every getter reads it
   * first, so templates track it even when the rest short-circuits — if
   * they tracked nothing while `playing` was false, they would never
   * notice the game starting.
   */
  private rev = $state(0)
  private gameId = ''
  private seenLog = 0
  private prev: GameState

  constructor(room: string, creator: boolean, identity: { key: string; name: string }, test: OnlineTestHooks = {}) {
    const self: { s: OnlineSession | null } = { s: null }
    const core: Core = new BeaconSession(makeAdapter(() => self.s), {
      room,
      creator,
      identity,
      transport: test.transport,
      brokers: test.transport ? undefined : brokersFromEnv(import.meta.env as Record<string, string | undefined>),
      now: test.now,
      timers: test.timers,
      log: (t) => console.log(`[${APP}] ${t}`),
    })
    super(core.cfg ?? placeholderConfig(), core.state)
    self.s = this
    this.core = core
    this.room = core.room
    this.myKey = core.myKey
    this.prev = core.state
    this.seenLog = core.logLength
    this.gameId = core.snapshot?.gameId ?? ''
    core.subscribe(() => this.sync())
    // the platform wallet: locks stakes, signs and posts settlements, reports payouts
    const ledger = test.ledger ?? (test.transport ? null : defaultLedger())
    if (ledger) {
      this.wallet = new WalletSession(core, APP, test.identity ?? loadIdentity(), ledger, test.now)
      this.wallet.subscribe(() => this.rev++)
    }
  }

  /** The core, read through the reactive revision. */
  private get c(): Core {
    void this.rev
    return this.core
  }

  /** Mirror the core into reactive fields and derive sound effects. */
  private sync(): void {
    const core = this.core
    if (core.snapshot && core.snapshot.gameId !== this.gameId) {
      this.gameId = core.snapshot.gameId
      this.seenLog = 0
      this.prev = createGame(core.snapshot.cfg)
    }
    this.cfg = core.cfg ?? placeholderConfig()
    this.state = core.state
    const log = core.snapshot?.log ?? []
    const fresh = log.length - this.seenLog
    if (fresh > 0 && fresh <= 2) {
      // replay just the new moves to derive the transition sounds
      let st = this.prev
      for (const wire of log.slice(this.seenLog)) {
        const next = applyMove(st, wire.actor, wire.move)
        this.emitFor(st, next, wire.actor, wire.move)
        st = next
      }
    }
    this.seenLog = log.length
    this.prev = core.state
    if (!core.started) {
      if (!core.isHost) {
        const host = core.livePeers.find((p) => p.key === core.hostKey)
        const pick = (host?.extra as { pick?: { ruleset: RulesetId; stake: number } } | undefined)?.pick
        if (pick) this.pick = pick
      } else if (core.isHost && !core.extra) this.announcePick()
      this.refreshBalances()
    }
    this.rev++
  }

  /* ---------------- base overrides ---------------- */

  get mySeat(): Seat | null {
    return this.c.seat
  }

  get viewer(): Seat | null {
    return this.c.seat
  }

  /** Unlike hotseat, a null seat here is a spectator — never allowed to act. */
  get myTurn(): boolean {
    const seat = this.c.seat
    return seat !== null && this.actor === seat
  }

  submit(move: Move): void {
    this.core.submit(move)
  }

  /* ---------------- lobby & status ---------------- */

  get status(): OnlineStatus {
    return this.c.status
  }

  get playing(): boolean {
    return this.c.playing
  }

  get spectator(): boolean {
    return this.c.spectator
  }

  get isHost(): boolean {
    return this.c.isHost
  }

  get hostKey(): string {
    return this.c.hostKey
  }

  get seat(): Seat | null {
    return this.c.seat
  }

  get myName(): string {
    return this.c.name
  }

  get seats(): LobbySeat[] {
    return this.c.players.map((p) => ({ playerKey: p.key, name: p.name, ready: p.ready, connected: p.connected }))
  }

  get canStart(): boolean {
    return this.c.canStart
  }

  get rematchWanted(): boolean {
    return this.c.wantRematch
  }

  /** Name of the disconnected player the game is waiting on, if any. */
  get waitingOn(): string | null {
    const key = this.c.waitingOn
    if (!key || !this.core.snapshot) return null
    return this.cfg.names[this.core.snapshot.seats[key]] ?? this.core.nameOf(key)
  }

  setReady(ready: boolean): void {
    if (ready && !this.canAfford) return
    this.core.setReady(ready)
  }

  rename(name: string): void {
    this.core.setName(name)
  }

  startGame(): void {
    this.core.startGame()
  }

  requestRematch(): void {
    this.core.requestRematch()
  }

  /** Open broker connections (diagnostics for the lobby). */
  relayCount(): number {
    return this.c.channelCount()
  }

  /** Brokers configured for this build. */
  brokerCount(): number {
    return this.core.channels().length
  }

  rescan(): void {
    this.core.rescan()
  }

  /** Test/diagnostic access to the shared core. */
  get net(): Core {
    return this.core
  }

  /** Wallet outcome of the current game (null when this build has no wallet). */
  get payout(): Payout | null {
    void this.rev
    return this.wallet?.payout ?? null
  }

  get lockState(): LockState | null {
    void this.rev
    return this.wallet?.lock ?? null
  }

  get ledger(): Ledger | null {
    return this.wallet ? (this.wallet as unknown as { ledger: Ledger }).ledger : null
  }

  leave(): void {
    this.core.leave()
  }

  destroy(): void {
    this.wallet?.destroy()
    this.core.destroy()
  }
}
