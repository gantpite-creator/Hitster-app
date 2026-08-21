import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGameByCode } from '../lib/gameApi.js'

export default function Home() {
  const nav = useNavigate()
  const [code, setCode] = useState('')
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

  return (
    <div className="shell">
      <header style={{ textAlign: 'center', margin: '48px 0 34px' }}>
        <h1 style={{ fontSize: '2rem' }}>SLÁGERSOR</h1>
        <p className="dim small" style={{ margin: 0 }}>házi kiadás · 1404+ zene</p>
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

      {error && <p className="error">{error}</p>}
    </div>
  )
}
