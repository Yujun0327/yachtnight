import { getRelaySockets, joinRoom, selfId, type Room } from 'trystero'
import type { NetMsg, Transport } from './types'

const APP_ID = 'yachtnight-v1'

/**
 * Pinned signaling relays, all verified reachable — trystero's default is a
 * random subset of a long list that includes several dead/blocked relays,
 * which can strand players on disjoint (or dead) relays forever.
 */
const RELAY_URLS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://relay.mostr.pub',
  'wss://offchain.pub',
  'wss://nostr.data.haus',
  'wss://purplerelay.com',
]

export function connectRoom(code: string): Transport {
  const room: Room = joinRoom(
    {
      appId: APP_ID,
      relayConfig: { urls: RELAY_URLS, redundancy: RELAY_URLS.length },
      // free public TURN fallback so strict/carrier-grade NATs can still connect
      turnConfig: [
        {
          urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
    },
    code.toUpperCase(),
    { onJoinError: (err) => console.warn('[yachtnight] room join error', err) },
  )

  const messageHandlers: ((msg: NetMsg, from: string) => void)[] = []
  const joinHandlers: ((peerId: string) => void)[] = []
  const leaveHandlers: ((peerId: string) => void)[] = []

  // Payloads travel as JSON strings — simplest fit for trystero's DataPayload.
  const action = room.makeAction<string>('msg', {
    onMessage: (data, context) => {
      try {
        const msg = JSON.parse(data) as NetMsg
        for (const fn of messageHandlers) fn(msg, context.peerId)
      } catch (err) {
        console.warn('bad message', err)
      }
    },
  })

  room.onPeerJoin = (peerId) => {
    for (const fn of joinHandlers) fn(peerId)
  }
  room.onPeerLeave = (peerId) => {
    for (const fn of leaveHandlers) fn(peerId)
  }

  return {
    selfId,
    send: (msg, to) =>
      void action
        .send(JSON.stringify(msg), to === undefined ? undefined : { target: to })
        .catch((err) => console.warn('send failed', err)),
    onMessage: (fn) => void messageHandlers.push(fn),
    onPeerJoin: (fn) => void joinHandlers.push(fn),
    onPeerLeave: (fn) => void leaveHandlers.push(fn),
    close: () => void room.leave().catch(() => {}),
    relayCount: countOpenRelays,
  }
}

/** How many signaling relays this client is currently connected to. */
export function countOpenRelays(): number {
  try {
    const sockets = getRelaySockets() as Record<string, { readyState?: number }>
    return Object.values(sockets).filter((s) => s?.readyState === 1).length
  } catch {
    return 0
  }
}

export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O/1/I/L
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}
