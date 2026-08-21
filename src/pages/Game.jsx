import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useGame } from '../lib/useGame.js'
import { isAdmin, myTeam, setMyTeam } from '../lib/session.js'
import {
  createTeam, joinTeam, startGame, updateScoreLimit, MAX_TEAM_MEMBERS,
} from '../lib/gameApi.js'
import CodeRing from './CodeRing.jsx'
import TableView from './TableView.jsx'

export default function Game() {
  const { code } = useParams()
  const { game, teams, placements, members, loading, notFound } = useGame(code)

  if (loading) return <div className="shell"><p className="dim">Kapcsolódás az asztalhoz…</p></div>
  if (notFound) {
    return (
      <div className="shell">
        <p className="error">Nincs ilyen szoba: {code}</p>
        <Link to="/"><button className="ghost">Vissza a főoldalra</button></Link>
      </div>
    )
  }

  const admin = isAdmin(game.id)
  if (game.status === 'lobby') {
    return <Lobby game={game} teams={teams} members={members} admin={admin} />
  }
  if (game.status === 'finished') {
    return <Results game={game} teams={teams} placements={placements} />
  }
  return <TableView game={game} teams={teams} placements={placements} admin={admin} />
}

/* ---------- Váró (lobby) ---------- */
function Lobby({ game, teams, members, admin }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const mine = admin ? null : myTeam(game.id) // mesteri fülön a tagság nem számít
  const counts = {}
  members.forEach((m) => { counts[m.team_id] = (counts[m.team_id] ?? 0) + 1 })

  const addTeam = async () => {
    setBusy(true)
    try {
      const t = await createTeam(game.id, name.trim(), teams.length)
      setMyTeam(game.id, t.id)
      setName('')
    } finally {
      setBusy(false)
    }
  }

  const join = async (teamId) => {
    setBusy(true)
    try {
      await joinTeam(game.id, teamId)
      setMyTeam(game.id, teamId)
    } catch (e) {
      alert(e.message === 'TELE'
        ? 'Ez a csapat már tele van (max ' + MAX_TEAM_MEMBERS + ' fő).'
        : 'Nem sikerült csatlakozni, próbáld újra.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="shell">
      <h1 style={{ textAlign: 'center' }}>Váróterem</h1>
      <p className="dim small" style={{ textAlign: 'center', marginTop: 0 }}>
        Ezt a kódot kell beírni a főoldalon a csatlakozáshoz
      </p>
      <CodeRing code={game.code} />

      <section className="panel">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Csapatok</h2>
          <span className="dim small">
            {game.score_limit ? `cél: ${game.score_limit} pont` : 'nincs pontlimit'}
          </span>
        </div>
        <div className="stack" style={{ marginTop: 12 }}>
          {teams.length === 0 && <p className="dim small">Még nincs csapat – alakítsatok!</p>}
          {teams.map((t) => {
            const n = counts[t.id] ?? 0
            const full = n >= MAX_TEAM_MEMBERS
            return (
              <div key={t.id} className={`team-chip ${t.id === mine ? 'mine' : ''}`}>
                <span className="swatch" style={{ background: t.color }} />
                <span className="name">{t.name}</span>
                <span className="tag">{n}/{MAX_TEAM_MEMBERS} fő</span>
                {t.id === mine ? (
                  <span className="tag" style={{ color: 'var(--cyan)' }}>ti</span>
                ) : (
                  !mine && !admin && (
                    <button
                      className="ghost join-btn"
                      disabled={busy || full}
                      onClick={() => join(t.id)}
                    >
                      {full ? 'Tele' : 'Csatlakozás'}
                    </button>
                  )
                )}
              </div>
            )
          })}
        </div>
      </section>

      {!mine && !admin && (
        <section className="panel">
          <h2>Csapat alakítása</h2>
          <p className="dim small" style={{ marginTop: 0 }}>
            Aki létrehozza, benne is lesz a csapatban – a többiek a Csatlakozás
            gombbal ülhetnek be mellé (max {MAX_TEAM_MEMBERS} fő csapatonként).
          </p>
          <div className="stack">
            <input
              type="text"
              placeholder="Csapatnév"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="primary wide" disabled={busy || !name.trim()} onClick={addTeam}>
              Csapat létrehozása
            </button>
          </div>
        </section>
      )}

      {admin && <AdminLobby game={game} teams={teams} />}
      {!admin && <p className="dim small" style={{ textAlign: 'center' }}>A játékmester indítja a játékot…</p>}
    </div>
  )
}

function AdminLobby({ game, teams }) {
  const [busy, setBusy] = useState(false)
  const [editLimit, setEditLimit] = useState(game.score_limit ?? '')

  const saveLimit = async () => {
    const v = editLimit === '' ? null : Math.max(1, Number(editLimit))
    await updateScoreLimit(game.id, v)
  }

  const start = async () => {
    setBusy(true)
    try {
      await startGame(game, teams)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" style={{ borderColor: 'var(--cyan)' }}>
      <h2>Játékmester</h2>
      <div className="stack">
        <div className="row">
          <input
            type="number"
            min={1}
            placeholder="Pontlimit (üresen: nincs)"
            value={editLimit}
            onChange={(e) => setEditLimit(e.target.value)}
          />
          <button className="ghost" onClick={saveLimit}>Mentés</button>
        </div>
        <button className="primary wide" disabled={busy || teams.length < 2} onClick={start}>
          {teams.length < 2 ? 'Legalább 2 csapat kell' : 'Játék indítása'}
        </button>
      </div>
    </section>
  )
}

/* ---------- Eredmény ---------- */
function Results({ game, teams, placements }) {
  const rows = teams
    .map((t) => ({
      ...t,
      cards: placements.filter((p) => p.team_id === t.id && p.correct).length,
    }))
    .map((t) => ({ ...t, total: t.cards + t.bonus_points }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="shell">
      <h1 style={{ textAlign: 'center' }}>Végeredmény</h1>
      <div className="stack" style={{ marginTop: 16 }}>
        {rows.map((t, i) => (
          <div key={t.id} className="team-chip">
            <span className="display" style={{ width: 28 }}>{i + 1}.</span>
            <span className="swatch" style={{ background: t.color }} />
            <span className="name">{t.name}</span>
            <b>{t.total} pont</b>
          </div>
        ))}
      </div>
      <Link to="/" style={{ marginTop: 20 }}>
        <button className="wide ghost">Új játék</button>
      </Link>
    </div>
  )
}
