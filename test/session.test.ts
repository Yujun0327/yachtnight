// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { Mesh } from '@yujun/game-net/mesh'
import { OnlineSession, scores } from '../src/app/session.svelte'
import { publicHash } from '../src/engine'
import type { Move } from '../src/engine'

const ROOM = 'TESTROOM'
const NONE = [false, false, false, false, false]
let clock = 1_000_000
const now = () => clock

/** Deterministic room: an in-memory broadcast mesh plus a manual clock. */
class World {
  mesh = new Mesh<never>()
  sessions: OnlineSession[] = []

  add(i: number, creator = false): OnlineSession {
    const s = new OnlineSession(
      ROOM,
      creator,
      { key: `key-${i}`, name: `P${i}` },
      { transport: this.mesh.peer(`peer-${i}`), now, timers: false },
    )
    this.sessions.push(s)
    return s
  }

  second(times = 1): void {
    for (let i = 0; i < times; i++) {
      clock += 1000
      for (const s of this.sessions) s.net.tick()
      this.mesh.flush()
    }
  }

  flush(): void {
    this.mesh.flush()
  }

  remove(s: OnlineSession): void {
    s.destroy()
    this.sessions = this.sessions.filter((x) => x !== s)
  }

  /** Host + n-1 joiners, everyone ready, host starts with a ruleset. */
  start(n: number, ruleset: 'yacht' | 'yahtzee' = 'yacht'): OnlineSession[] {
    const host = this.add(0, true)
    for (let i = 1; i < n; i++) this.add(i)
    this.second(2)
    host.hostRuleset = ruleset
    for (const s of this.sessions) s.setReady(true)
    this.flush()
    host.startGame()
    this.flush()
    return this.sessions
  }

  acting(): OnlineSession {
    return this.sessions.find((s) => s.myTurn)!
  }
}

beforeEach(() => {
  localStorage.clear()
  clock = 1_000_000
})

describe('lobby', () => {
  it('seats joiners, gates start on ready, and starts with the host ruleset', () => {
    const w = new World()
    const [host, b] = w.start(2, 'yahtzee')
    expect(host.playing).toBe(true)
    expect(b.playing).toBe(true)
    expect(host.cfg.ruleset).toBe('yahtzee')
    expect(b.cfg.ruleset).toBe('yahtzee')
    expect(publicHash(b.state)).toBe(publicHash(host.state))
  })

  it('rejects a fifth player', () => {
    const w = new World()
    w.add(0, true)
    for (let i = 1; i < 5; i++) w.add(i)
    w.second(3)
    expect(w.sessions[4].status).toBe('room-full')
    expect(w.sessions[0].seats).toHaveLength(4)
  })
})

describe('moves', () => {
  it('rolls and scores stay hash-identical across the mesh', () => {
    const w = new World()
    const sessions = w.start(3)
    for (let turn = 0; turn < 6; turn++) {
      const actor = w.acting()
      actor.submit({ type: 'roll', held: NONE })
      w.flush()
      const moves = actor.myMoves().filter((m): m is Move & { type: 'score' } => m.type === 'score')
      actor.submit(moves[turn % moves.length])
      w.flush()
      const h = publicHash(sessions[0].state)
      for (const s of sessions) expect(publicHash(s.state)).toBe(h)
    }
    expect(scores(sessions[0].state)).toHaveLength(3)
  })

  it('faces are identical on every client (derived, not trusted)', () => {
    const w = new World()
    const sessions = w.start(2)
    const actor = w.acting()
    actor.submit({ type: 'roll', held: NONE })
    w.flush()
    const other = sessions.find((s) => s !== actor)!
    expect(other.state.dice).toEqual(actor.state.dice)
    expect(other.state.dice.every((d) => d >= 1 && d <= 6)).toBe(true)
  })

  it('dropped beacons recover on the next one', () => {
    const w = new World()
    const sessions = w.start(2)
    const actor = w.acting()
    const other = sessions.find((s) => s !== actor)!
    const otherIdx = sessions.indexOf(other)

    // the roll never reaches the other side; the score does (with the full log)
    w.mesh.filter = (_m, _from, to) => to !== `peer-${otherIdx}`
    actor.submit({ type: 'roll', held: NONE })
    w.flush()
    expect(publicHash(other.state)).not.toBe(publicHash(actor.state))
    w.mesh.filter = () => true
    actor.submit({ type: 'score', category: 'choice' })
    w.second(2)

    expect(publicHash(other.state)).toBe(publicHash(actor.state))
    expect(other.status).toBe('playing')
  })
})

describe('refresh & rejoin', () => {
  it('replays the saved log after a refresh and reclaims the seat', () => {
    const w = new World()
    const sessions = w.start(2)
    const actor = w.acting()
    actor.submit({ type: 'roll', held: NONE })
    w.flush()
    const hashBefore = publicHash(actor.state)
    const seatBefore = actor.mySeat
    const idx = sessions.indexOf(actor)

    w.remove(actor)
    const revived = w.add(idx, idx === 0)
    // saved-game replay restores state before any network traffic
    expect(publicHash(revived.state)).toBe(hashBefore)
    expect(revived.mySeat).toBe(seatBefore)
    w.second()
    expect(revived.playing).toBe(true)
  })

  it('a latecomer with no saved game is a spectator', () => {
    const w = new World()
    const actor = w.start(2).find((s) => s.myTurn)!
    actor.submit({ type: 'roll', held: NONE })
    w.flush()

    const late = w.add(7)
    w.second(2)
    expect(late.playing).toBe(true)
    expect(late.spectator).toBe(true)
    expect(publicHash(late.state)).toBe(publicHash(actor.state))
  })

  it('marks the table as waiting when the acting player disconnects', () => {
    const w = new World()
    const sessions = w.start(2)
    const acting = w.acting()
    const waiting = sessions.find((s) => s !== acting)!
    w.remove(acting)
    w.second(16)
    expect(waiting.waitingOn).toBe(acting.myName)
  })
})
