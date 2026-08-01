<script lang="ts">
  import type { RulesetId } from './engine'
  import { loadPlayerName, playerKey } from './app/persist'
  import { HotseatSession, OnlineSession } from './app/session.svelte'
  import { makeRoomCode } from './transport/trystero'
  import GameScreen from './ui/GameScreen.svelte'
  import Home from './ui/Home.svelte'
  import Lab from './ui/Lab.svelte'
  import Lobby from './ui/Lobby.svelte'

  let hash = $state(location.hash)
  let hotseat = $state<HotseatSession | null>(null)
  let online = $state<OnlineSession | null>(null)
  let hotseatConfig: { playerCount: 1 | 2 | 3 | 4; names: string[]; ruleset: RulesetId } | null =
    null

  function roomFromHash(): string | null {
    const m = location.hash.match(/room=([A-Za-z0-9]{4,})/)
    return m ? m[1].toUpperCase() : null
  }

  function syncFromHash() {
    const room = roomFromHash()
    if (room && online?.room !== room) {
      online?.destroy()
      const creator = sessionStorage.getItem(`yachtnight:creator:${room}`) !== null
      online = new OnlineSession(room, creator, { key: playerKey(), name: loadPlayerName() })
    } else if (!room && online) {
      online.destroy()
      online = null
    }
  }

  syncFromHash()
  $effect(() => {
    const handler = () => {
      hash = location.hash
      syncFromHash()
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  })

  // #lab: the dice sandbox — kept in production; it is the game's practice table
  const showLab = $derived(hash === '#lab')

  // debugging handle (harmless in prod; used by the E2E harness)
  $effect(() => {
    ;(window as unknown as Record<string, unknown>).__yachtnight = online ?? hotseat
  })

  function startHotseat(playerCount: 1 | 2 | 3 | 4, names: string[], ruleset: RulesetId) {
    hotseatConfig = { playerCount, names, ruleset }
    hotseat = new HotseatSession(playerCount, names, ruleset)
  }

  function createRoom() {
    const code = makeRoomCode()
    sessionStorage.setItem(`yachtnight:creator:${code}`, '1')
    location.hash = `room=${code}`
  }

  function joinRoom(code: string) {
    location.hash = `room=${code.toUpperCase()}`
  }

  function exitToHome() {
    hotseat = null
    if (online) {
      online.leave()
      online = null
    }
    if (location.hash) location.hash = ''
  }

  function rematch() {
    if (hotseat && hotseatConfig) {
      hotseat = new HotseatSession(
        hotseatConfig.playerCount,
        hotseatConfig.names,
        hotseatConfig.ruleset,
      )
    } else if (online) {
      online.requestRematch()
    }
  }
</script>

{#if showLab}
  <Lab />
{:else if online}
  {#if online.playing}
    <GameScreen session={online} onExit={exitToHome} onRematch={rematch} />
  {:else}
    <Lobby session={online} onExit={exitToHome} />
  {/if}
{:else if hotseat}
  <GameScreen session={hotseat} onExit={exitToHome} onRematch={rematch} />
{:else}
  <Home onHotseat={startHotseat} onCreateRoom={createRoom} onJoinRoom={joinRoom} />
{/if}
