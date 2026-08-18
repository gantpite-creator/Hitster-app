import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGame, getGameByCode } from '../lib/gameApi.js'
import { setAdmin } from '../lib/session.js'

export default function Home() {
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [useLimit, setUseLimit] = useState(false)
  const [limit, setLimit] = useState(10)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const join = async () => {
    setError('')
    setBusy(true)
    try {
      const game = await getGameByCode(code.trim())
      if (!game) {
        setError('Nincs ilyen kódú szoba. Nézd meg a kivetített/mutatott kódot!')
      } else {
        nav(`/jatek/${game.code}`)
      }
    } catch {
      setError('Nem sikerült csatlakozni. Van internet?')
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    setError('')
    setBusy(true)
    try {
      const game = await createGame(useLimit ? Number(limit) : null)
      setAdmin(game.id)
      nav(`/jatek/${game.code}`)
    } catch {
      setError('Nem sikerült szobát nyitni. Van internet?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="shell">
      <header style={{ textAlign: 'center', margin: '28px 0 30px' }}>
        <h1 style={{ fontSize: '2rem' }}>HITSTER</h1>
        <p className="dim small" style={{ margin: 0 }}>házi kiadás · 1404 zene</p>
      </header>

      <section className="panel">
        <h2>Csatlakozás szobához</h2>
        <div className="stack">
          <input
            className="code-input"
            type="text"
            maxLength={4}
            placeholder="KÓD"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && code.length === 4 && join()}
          />
          <button className="primary wide" disabled={busy || code.length !== 4} onClick={join}>
            Belépés
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Új játék indítása</h2>
        <p className="dim small" style={{ marginTop: 0 }}>
          Ezt a játékmester nyitja – ez az eszköz lesz az admin.
        </p>
        <div className="stack">
          <label className="row" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useLimit}
              onChange={(e) => setUseLimit(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            <span>Pontlimit beállítása (e nélkül addig megy, amíg jólesik)</span>
          </label>
          {useLimit && (
            <input
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          )}
          <button className="wide" disabled={busy} onClick={create}>
            Szoba nyitása
          </button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}
    </div>
  )
}
