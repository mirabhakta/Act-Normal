import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Copy, LockKeyhole, MessageCircle, ShieldQuestion, Sparkles, Users } from 'lucide-react'
import { createRoom as createSupabaseRoom, getLatestRound, getMyRole, getRoomPlayers, joinRoom as joinSupabaseRoom, startRound, subscribeToRoom } from './lib/gameService'
import type { RoomPlayer } from './lib/gameTypes'

type Screen = 'landing' | 'lobby' | 'game'

const avatars = ['🧑🏽‍🌾', '🧙🏻‍♀️', '🧑🏼‍🎨', '🧔🏽‍♂️', '👩🏻‍🔧', '🧑🏾‍🍳']

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message)
  return fallback
}

function App() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [roomCode, setRoomCode] = useState('')
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const createRoom = async () => {
    setBusy(true)
    setError(null)
    try {
      const room = await createSupabaseRoom(name.trim() || 'Wandering Villager')
      setRoomCode(room.code)
      setRoomId(room.id)
      setScreen('lobby')
    } catch (roomError) {
      setError(errorMessage(roomError, 'Could not create a room.'))
    } finally {
      setBusy(false)
    }
  }

  const joinRoom = async () => {
    if (roomCode.trim().length < 4) return
    setBusy(true)
    setError(null)
    try {
      const room = await joinSupabaseRoom(roomCode, name.trim() || 'Wandering Villager')
      setRoomCode(room.code)
      setRoomId(room.id)
      setScreen('lobby')
    } catch (roomError) {
      setError(errorMessage(roomError, 'Could not join that room.'))
    } finally {
      setBusy(false)
    }
  }

  const copyRoom = async () => {
    await navigator.clipboard?.writeText(roomCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const startGame = async () => {
    if (!roomId) return
    setBusy(true)
    setError(null)
    try {
      await startRound(roomId)
      setScreen('game')
    } catch (roundError) {
      setError(errorMessage(roundError, 'Could not start the round.'))
    } finally {
      setBusy(false)
    }
  }

  if (screen === 'lobby') return <Lobby roomId={roomId} roomCode={roomCode} name={name} onCopy={copyRoom} copied={copied} onStart={startGame} />
  if (screen === 'game') return <Game roomId={roomId} onLeave={() => setScreen('landing')} />

  return (
    <main className="shell landing-shell">
      <nav className="topbar">
        <div className="brand"><span className="brand-mark">✦</span><span>ROGUE NPC</span></div>
        <div className="status-pill"><span className="status-dot" /> DEMO BUILD</div>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={14} /> THE VILLAGE HAS A SECRET</div>
          <h1>Blend in.<br /><em>Break rules.</em><br />Get away with it.</h1>
          <p className="hero-subtitle">A social deduction party game where one player is secretly a corrupted NPC—and everyone else has to catch them in the act.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={createRoom} disabled={busy}>{busy ? 'Connecting…' : 'Create a room'} {!busy && <ArrowRight size={18} />}</button>
            <div className="join-row">
              <input aria-label="Room code" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength={8} />
              <button className="secondary-button" onClick={joinRoom} disabled={busy}>Join</button>
            </div>
          </div>
          <div className="microcopy"><LockKeyhole size={13} /> No account needed · 3–8 players · 5 minute rounds</div>
        </div>
        <div className="village-card" aria-label="A preview of the village game board">
          <div className="sun" />
          <div className="cloud cloud-one" /><div className="cloud cloud-two" />
          <div className="mountain mountain-back" /><div className="mountain mountain-front" />
          <div className="village-ground"><div className="path" /><div className="house house-one" /><div className="house house-two" /><div className="tree tree-one">🌳</div><div className="tree tree-two">🌲</div><div className="well">◉</div></div>
          <div className="floating-card role-card"><span className="card-label">YOUR SECRET ROLE</span><strong>?</strong><span>Someone here is not who they claim.</span></div>
          <div className="floating-card event-card"><span className="card-label">TODAY'S VILLAGE EVENT</span><strong>The Harvest Feast</strong><span>Everyone must defend one dish.</span></div>
        </div>
      </section>
      <section className="feature-strip">
        <div><ShieldQuestion size={20} /><span><strong>Read the rules.</strong> Spot the contradiction.</span></div>
        <div><MessageCircle size={20} /><span><strong>Question anyone.</strong> Trust nobody.</span></div>
        <div><Users size={20} /><span><strong>Play anywhere.</strong> Just share a code.</span></div>
      </section>
      {error && <div className="connection-error" role="alert">{error}<span>Run the Supabase migration before creating a live room.</span></div>}
      <div className="name-capture"><label htmlFor="name">Before you enter the village</label><input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Choose a villager name" /></div>
    </main>
  )
}

function Lobby({ roomId, roomCode, name, onCopy, copied, onStart }: { roomId: string | null; roomCode: string; name: string; onCopy: () => void; copied: boolean; onStart: () => void }) {
  const [players, setPlayers] = useState<RoomPlayer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!roomId) return
    let active = true
    let channel: ReturnType<typeof subscribeToRoom> | undefined
    const refresh = async () => {
      const nextPlayers = await getRoomPlayers(roomId)
      if (active) {
        setPlayers(nextPlayers)
        setLoading(false)
      }
    }
    refresh().catch(() => setLoading(false))
    channel = subscribeToRoom(roomId, () => refresh().catch(() => undefined))
    return () => {
      active = false
      if (channel) void channel.unsubscribe()
    }
  }, [roomId])

  const demoPlayers = useMemo(() => [{ display_name: name || 'You', player_id: 'local', is_host: true }, { display_name: 'MossyMoth', player_id: 'moss', is_host: false }, { display_name: 'Juniper', player_id: 'juniper', is_host: false }, { display_name: 'BrickBard', player_id: 'brick', is_host: false }], [name])
  const visiblePlayers = players.length > 0 ? players : demoPlayers
  return <main className="shell app-shell"><nav className="topbar"><div className="brand"><span className="brand-mark">✦</span><span>ROGUE NPC</span></div><div className="status-pill"><span className="status-dot" /> ROOM OPEN</div></nav><section className="lobby-layout"><div><div className="eyebrow"><Users size={14} /> GATHER YOUR VILLAGE</div><h2>Waiting for the<br /><em>usual suspects.</em></h2><p className="body-copy">Share the code. Once everyone arrives, the village rules will be revealed.</p><div className="room-code-card"><span>ROOM CODE</span><strong>{roomCode}</strong><button onClick={onCopy}>{copied ? 'Copied!' : <><Copy size={15} /> Copy code</>}</button></div><button className="primary-button start-button" onClick={onStart}>Start demo round <ArrowRight size={18} /></button></div><div className="players-panel"><div className="panel-heading"><span>VILLAGERS</span><span>{loading ? 'SYNCING…' : `${visiblePlayers.length}/8 READY`}</span></div>{visiblePlayers.map((player, index) => <div className="player-row" key={player.player_id}><span className="avatar">{avatars[index % avatars.length]}</span><span>{player.display_name}</span>{index === 0 && <span className="you-tag">{player.display_name === name ? 'YOU' : 'HOST'}</span>}<span className="ready-dot" /></div>)}<div className="waiting-row">+ Share the code to invite more players</div></div></section></main>
}

function Game({ roomId, onLeave }: { roomId: string | null; onLeave: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [voted, setVoted] = useState(false)
  const [roundTitle, setRoundTitle] = useState('Harvest Feast')
  const [roundPrompt, setRoundPrompt] = useState('Every villager must defend one dish.')
  const [secretInstruction, setSecretInstruction] = useState('Watch for one player breaking a village rule.')
  const [phase, setPhase] = useState('investigation')
  const [roundNumber, setRoundNumber] = useState(1)

  useEffect(() => {
    if (!roomId) return
    let active = true
    const loadRound = async () => {
      const round = await getLatestRound(roomId)
      const role = await getMyRole(round.id)
      if (!active) return
      const rules = round.public_rules as { title?: string; prompt?: string }
      setRoundTitle(rules.title ?? 'Harvest Feast')
      setRoundPrompt(rules.prompt ?? 'Every villager must defend one dish.')
      setSecretInstruction(role?.secret_rule?.instruction ?? 'Watch for one player breaking a village rule.')
      setPhase(round.phase)
      setRoundNumber(round.round_number)
    }
    loadRound().catch(() => undefined)
    return () => { active = false }
  }, [roomId])

  const suspects = ['MossyMoth', 'Juniper', 'BrickBard']
  return <main className="shell app-shell"><nav className="topbar"><div className="brand"><span className="brand-mark">✦</span><span>ROGUE NPC</span></div><div className="round-meta"><span>ROUND {String(roundNumber).padStart(2, '0')}</span><span className="timer">LIVE</span><button className="quiet-button" onClick={onLeave}>Leave</button></div></nav><div className="phase-bar"><div className="phase active"><span>01</span> Secret roles</div><div className={`phase ${phase === 'investigation' ? 'current' : 'active'}`}><span>02</span> Ask around</div><div className={`phase ${phase === 'voting' ? 'current' : ''}`}><span>03</span> Make your call</div></div><section className="game-layout"><div className="rules-card"><div className="card-label">THE VILLAGE HANDBOOK</div><h2>{roundTitle}</h2><p>{roundPrompt} Keep your answer to one sentence. Do not say the word “maybe.”</p><div className="rule-note"><LockKeyhole size={15} /><span>Your secret: <strong>{secretInstruction}</strong></span></div></div><div className="vote-card"><div className="vote-heading"><div><div className="card-label">FINAL CALL</div><h2>Who is the Rogue NPC?</h2></div><span className="vote-count">{phase === 'voting' ? (voted ? 'VOTE LOCKED' : 'SELECT ONE') : 'VOTING SOON'}</span></div><div className="suspect-list">{suspects.map((suspect, index) => <button className={`suspect ${selected === suspect ? 'selected' : ''}`} key={suspect} disabled={phase !== 'voting' || voted} onClick={() => setSelected(suspect)}><span className="avatar">{avatars[index + 1]}</span><span><strong>{suspect}</strong><small>{index === 0 ? '“Pumpkin soup. Obviously.”' : index === 1 ? '“Bread is a meal and a mood.”' : '“I would rather not say.”'}</small></span><span className="radio">{selected === suspect ? '●' : '○'}</span></button>)}</div><button className="primary-button vote-button" disabled={phase !== 'voting' || !selected || voted} onClick={() => setVoted(true)}>{voted ? 'Vote submitted' : phase === 'voting' ? 'Lock in my vote' : 'Investigation in progress'} <ArrowRight size={18} /></button></div><aside className="chat-card"><div className="panel-heading"><span><MessageCircle size={15} /> VILLAGE CHAT</span><span className="live-label">LIVE</span></div><div className="messages"><p><strong>System</strong> The round is live. Question anyone.</p><p><strong>Village rule</strong> Keep each answer to one sentence.</p></div><div className="chat-input">Ask a question… <ArrowRight size={15} /></div></aside></section></main>
}

export default App
