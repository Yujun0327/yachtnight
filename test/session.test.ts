// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { OnlineSession, scores } from '../src/app/session.svelte'
import { legalMoves, publicHash } from '../src/engine'
import type { Move } from '../src/engine'
import { Mesh } from './mesh'

const ROOM = 'TESTROOM'
const NONE = [false, false, false, false, false]

function addPeer(mesh: Mesh, i: number, creator = false): OnlineSession {
  const transport = mesh.createPeer(`peer-${i}`)
  const session = new OnlineSession(
    ROOM,
    creator,
    { key: `key-${i}`, name: `P${i}` },
    transport,
  )
  mesh.announce(`peer-${i}`)
  return session
}

/** Host + n-1 joiners through the full lobby handshake, everyone ready, start. */
function startGame(mesh: Mesh, n: number, ruleset: 'yacht' | 'yahtzee' = 'yacht'): OnlineSession[] {
  const sessions = [addPeer(mesh, 0, true)]
  mesh.flush()
  for (let i = 1; i < n; i++) {
    sessions.push(addPeer(mesh, i))
    mesh.flush()
  }
  sessions[0].hostRuleset = ruleset
  for (const s of sessions) {
    s.setReady(true)
    mesh.flush()
  }
  sessions[0].startGame()
  mesh.flush()
  return sessions
}

/** The session whose seat is currently to act. */
function actorSession(sessions: OnlineSession[]): OnlineSession {
  return sessions.find((s) => s.myTurn)!
}

beforeEach(() => {
  localStorage.clear()
})

describe('lobby', () => {
  it('seats joiners, gates start on ready, and starts with the host ruleset', () => {
    const mesh = new Mesh()
    const [host, b] = startGame(mesh, 2, 'yahtzee')
    expect(host.playing).toBe(true)
    expect(b.playing).toBe(true)
    expect(host.cfg.ruleset).toBe('yahtzee')
    expect(b.cfg.ruleset).toBe('yahtzee')
    expect(publicHash(b.state)).toBe(publicHash(host.state))
  })

  it('rejects a fifth player', () => {
    const mesh = new Mesh()
    const sessions = [addPeer(mesh, 0, true)]
    mesh.flush()
    for (let i = 1; i < 5; i++) {
      sessions.push(addPeer(mesh, i))
      mesh.flush()
    }
    expect(sessions[4].status).toBe('room-full')
    expect(sessions[0].seats.filter((s) => s.playerKey !== null)).toHaveLength(4)
  })
})

describe('moves', () => {
  it('rolls and scores stay hash-identical across the mesh', () => {
    const mesh = new Mesh()
    const sessions = startGame(mesh, 3)
    for (let turn = 0; turn < 6; turn++) {
      const actor = actorSession(sessions)
      actor.submit({ type: 'roll', held: NONE })
      mesh.flush()
      const moves = actor.myMoves().filter((m): m is Move & { type: 'score' } => m.type === 'score')
      actor.submit(moves[turn % moves.length])
      mesh.flush()
      const h = publicHash(sessions[0].state)
      for (const s of sessions) expect(publicHash(s.state)).toBe(h)
    }
    expect(scores(sessions[0].state)).toHaveLength(3)
  })

  it('faces are identical on every client (derived, not trusted)', () => {
    const mesh = new Mesh()
    const sessions = startGame(mesh, 2)
    const actor = actorSession(sessions)
    actor.submit({ type: 'roll', held: NONE })
    mesh.flush()
    const other = sessions.find((s) => s !== actor)!
    expect(other.state.dice).toEqual(actor.state.dice)
    expect(other.state.dice.every((d) => d >= 1 && d <= 6)).toBe(true)
  })

  it('dropped packets recover via resync', () => {
    const mesh = new Mesh()
    const sessions = startGame(mesh, 2)
    const actor = actorSession(sessions)
    const other = sessions.find((s) => s !== actor)!

    // swallow the first move entirely, deliver the second: seq gap → resyncReq
    let dropped = 0
    mesh.filter = (msg) => {
      if (msg.t === 'move' && dropped === 0) {
        dropped++
        return false
      }
      return true
    }
    actor.submit({ type: 'roll', held: NONE })
    mesh.flush()
    mesh.filter = () => true
    actor.submit({ type: 'score', category: 'choice' })
    mesh.flush()
    mesh.flush() // resync round-trip

    expect(publicHash(other.state)).toBe(publicHash(actor.state))
    expect(other.status).toBe('playing')
  })
})

describe('refresh & rejoin', () => {
  it('replays the saved log after a refresh and reclaims the seat', () => {
    const mesh = new Mesh()
    const sessions = startGame(mesh, 2)
    const actor = actorSession(sessions)
    actor.submit({ type: 'roll', held: NONE })
    mesh.flush()
    const hashBefore = publicHash(actor.state)
    const seatBefore = actor.mySeat
    const idx = sessions.indexOf(actor)

    actor.destroy()
    mesh.drop(`peer-${idx}`)
    const transport = mesh.createPeer(`peer-${idx}-again`)
    const revived = new OnlineSession(
      ROOM,
      idx === 0,
      { key: `key-${idx}`, name: `P${idx}` },
      transport,
    )
    // saved-game replay restores state before any network traffic
    expect(publicHash(revived.state)).toBe(hashBefore)
    expect(revived.mySeat).toBe(seatBefore)
    mesh.announce(`peer-${idx}-again`)
    mesh.flush()
    expect(revived.playing).toBe(true)
  })

  it('a latecomer with no saved game is a spectator after resync', () => {
    const mesh = new Mesh()
    const sessions = startGame(mesh, 2)
    const actor = actorSession(sessions)
    actor.submit({ type: 'roll', held: NONE })
    mesh.flush()

    const late = addPeer(mesh, 7)
    mesh.flush()
    mesh.flush()
    expect(late.playing).toBe(true)
    expect(late.spectator).toBe(true)
    expect(publicHash(late.state)).toBe(publicHash(actor.state))
  })
})
