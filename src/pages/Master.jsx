import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { createGame } from '../lib/gameApi.js'
import { setAdmin } from '../lib/session.js'

const PIN_KEY = 'hitster-muhely-pin' // ugyanaz a PIN, mint a Műhelyben

// A játékmester oldala: innen indul minden játék. A nyilvános főoldalon
// szándékosan nincs "új játék" – azt csak a csapatok használják belépésre.
export default function Master() {
  const nav = useNavigate()
  const [pin, setPin] = useState(localStorage.getItem(PIN_KEY) ?? '')
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(!!pin)
  const [useLimit, setUseLimit] = useState(false)
  const [limit, setLimit] = useState(10)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState([])

  useEffect(() => {
    if (!pin) return
    supabase.rpc('admin_check_pin', { p_pin: pin }).then(({ data }) => {
      setAuthed(!!data)
      setChecking(false)
      if (data) localStorage.setItem(PIN_KEY, pin)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authed) return
    supabase
      .from('games')
      .select('id, code, status, created_at')
      .in('status', ['lobby', 'active', 'paused'])
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => setRunning(data ?? []))
  }, [authed])

  const tryPin = async () => {
    setChecking(true)
    const { data } = await supabase.rpc('admin_check_pin', { p_pin: pin })
    setChecking(false)
    if (data) {
      localStorage.setItem(PIN_KEY, pin)
      setAuthed(true)
    } else {
      alert('Hibás PIN')
    }
  }

  const create = async () => {
    setBusy(true)
    try {
      const game = await createGame(useLimit ? Number(limit) : null)
      setAdmin(game.id)
      nav(`/jatek/${game.code}`)
    } finally {
      setBusy(false)
    }
  }

  const enterAsAdmin = (g) => {
    setAdmin(g.id) // erről az eszközről is te vagy a játékmester
    nav(`/jatek/${g.code}`)
  }

  if (!authed) {
    return (
      <div className="shell">
        <h1>Játékmester</h1>
        <div className="panel stack">
          <p className="dim small" style={{ margin: 0 }}>Add meg a PIN-t:</p>
          <input
            type="text"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && tryPin()}
          />
          <button className="primary wide" disabled={checking || !pin} onClick={tryPin}>
            Belépés
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="shell">
      <h1>Játékmester</h1>

      <section className="panel">
        <h2>Új játék indítása</h2>
        <div className="stack">
          <label className="row" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useLimit}
              onChange={(e) => setUseLimit(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            <span>Pontlimit (e nélkül addig megy, amíg jólesik)</span>
          </label>
          {useLimit && (
            <input type="number" min={1} max={50} value={limit}
              onChange={(e) => setLimit(e.target.value)} />
          )}
          <button className="primary wide" disabled={busy} onClick={create}>
            Szoba nyitása
          </button>
        </div>
      </section>

      {running.length > 0 && (
        <section className="panel">
          <h2>Futó játékok</h2>
          <p className="dim small" style={{ marginTop: 0 }}>
            Belépéskor ez az eszköz is játékmesteri jogot kap.
          </p>
          <div className="stack">
            {running.map((g) => (
              <button key={g.id} className="result-row" onClick={() => enterAsAdmin(g)}>
                <b className="display">{g.code}</b>
                <span style={{ flex: 1, textAlign: 'left' }} className="dim">
                  {g.status === 'lobby' ? 'váróterem' : g.status === 'paused' ? 'szünetel' : 'játékban'}
                </span>
                <span className="dim small">
                  {new Date(g.created_at).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
