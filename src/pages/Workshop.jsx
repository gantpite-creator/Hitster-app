import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase.js'
import { useCardStyles } from '../lib/cardStyles.js'
import StyleEditor from './StyleEditor.jsx'

const PIN_KEY = 'hitster-muhely-pin'

// A Műhely: zenék keresése, szerkesztése, új zene felvétele és
// nyomtatható QR-kártya generálása. Csak PIN-nel használható.
export default function Workshop() {
  const [pin, setPin] = useState(localStorage.getItem(PIN_KEY) ?? '')
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(!!pin)

  useEffect(() => {
    if (!pin) return
    supabase.rpc('admin_check_pin', { p_pin: pin }).then(({ data }) => {
      setAuthed(!!data)
      setChecking(false)
      if (data) localStorage.setItem(PIN_KEY, pin)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  if (!authed) {
    return (
      <div className="shell">
        <h1>Műhely</h1>
        <div className="panel stack">
          <p className="dim small" style={{ margin: 0 }}>
            Ez a játékmester karbantartó felülete. Add meg a PIN-t:
          </p>
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

  return <WorkshopInner pin={pin} />
}

function WorkshopInner({ pin }) {
  const styles = useCardStyles()
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [editing, setEditing] = useState(null)   // null = nincs form; {} = új zene
  const [printSong, setPrintSong] = useState(null)
  const [standaloneEditor, setStandaloneEditor] = useState(false)

  const search = async () => {
    const t = term.trim().replace(/,/g, ' ')
    if (!t) return setResults([])
    let q = supabase.from('songs').select().limit(25).order('card_number')
    if (/^\d+$/.test(t)) q = q.eq('card_number', Number(t))
    else q = q.or(`title.ilike.%${t}%,artists.ilike.%${t}%`)
    const { data } = await q
    setResults(data ?? [])
  }

  return (
    <div className="shell">
      <div className="spread">
        <h1>Műhely</h1>
        <div className="row">
          <button className="ghost" onClick={() => setStandaloneEditor(true)}>🎨 Új színvilág</button>
          <button className="primary" onClick={() => setEditing({})}>+ Új zene</button>
        </div>
      </div>
      <p className="dim small" style={{ marginTop: 0 }}>
        Keresés cím, előadó vagy sorszám alapján, aztán koppints a találatra.
      </p>

      <div className="row" style={{ marginBottom: 14 }}>
        <input
          type="text"
          placeholder="pl. Papa · Azariah · 612"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button className="ghost" onClick={search}>Keresés</button>
      </div>

      <div className="stack">
        {results.map((s) => (
          <button key={s.card_number} className="result-row" onClick={() => setEditing(s)}>
            <b>#{s.card_number}</b>
            <span style={{ flex: 1, textAlign: 'left' }}>
              {s.artists} – {s.title}
            </span>
            <span className="dim">{s.year}</span>
          </button>
        ))}
      </div>

      {editing !== null && (
        <SongForm
          key={editing.card_number ?? 'new'}
          pin={pin}
          song={editing.card_number ? editing : null}
          styles={styles}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(saved)
            setResults((r) =>
              r.some((x) => x.card_number === saved.card_number)
                ? r.map((x) => (x.card_number === saved.card_number ? saved : x))
                : r
            )
          }}
          onPrint={(s) => setPrintSong(s)}
        />
      )}

      {printSong && (
        <PrintSheet song={printSong} styles={styles} onClose={() => setPrintSong(null)} />
      )}

      {standaloneEditor && (
        <StyleEditor
          pin={pin}
          onClose={() => setStandaloneEditor(false)}
          onSaved={() => setStandaloneEditor(false)}
        />
      )}
    </div>
  )
}

function SongForm({ pin, song, styles, onClose, onSaved, onPrint }) {
  const [artists, setArtists] = useState(song?.artists ?? '')
  const [title, setTitle] = useState(song?.title ?? '')
  const [year, setYear] = useState(song?.year ?? '')
  const [url, setUrl] = useState(song?.url ?? '')
  const [style, setStyle] = useState(song?.style ?? 's1381')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const [editor, setEditor] = useState(null) // { base, editId }
  const styleList = styles
    ? Object.values(styles).sort((a, b) => (a.custom === b.custom ? a.id.localeCompare(b.id) : a.custom ? 1 : -1))
    : []
  const st = styles?.[style]

  const save = async () => {
    setMsg('')
    if (!artists.trim() || !title.trim() || !url.trim() || !year) {
      return setMsg('Minden mező kell: előadók, cím, év, link.')
    }
    const y = Number(year)
    if (y < 1900 || y > 2100) return setMsg('Az évszám 1900 és 2100 között legyen.')
    if (!/^https?:\/\//.test(url.trim())) return setMsg('A link https://-sel kezdődjön.')

    setBusy(true)
    try {
      // duplikált link előszűrése: ugyanaz a link ne legyen két lapon
      const { data: dupe } = await supabase
        .from('songs')
        .select('card_number')
        .eq('url', url.trim())
        .maybeSingle()
      if (dupe && dupe.card_number !== song?.card_number) {
        setMsg(`Ez a link már a #${dupe.card_number} lapon szerepel!`)
        return
      }
      const { data, error } = await supabase.rpc('admin_save_song', {
        p_pin: pin,
        p_card: song?.card_number ?? null,
        p_artists: artists.trim(),
        p_year: y,
        p_title: title.trim(),
        p_url: url.trim(),
        p_style: style,
      })
      if (error) throw error
      const saved = {
        card_number: data, artists: artists.trim(), title: title.trim(),
        year: y, url: url.trim(), style,
        source_type: url.includes('soundcloud') ? 'soundcloud' : 'youtube',
      }
      setMsg(`Elmentve: #${data} ✓`)
      onSaved(saved)
    } catch (e) {
      setMsg(e.message?.includes('PIN') ? 'Hibás PIN – lépj be újra.' : 'Mentési hiba: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel" style={{ marginTop: 16, borderColor: 'var(--cyan)' }}>
      <div className="spread">
        <h2 style={{ margin: 0 }}>
          {song ? `#${song.card_number} szerkesztése` : 'Új zene (a következő szabad sorszámot kapja)'}
        </h2>
        <button className="ghost" onClick={onClose}>Bezár</button>
      </div>

      <div className="row" style={{ alignItems: 'flex-start', marginTop: 12 }}>
        <div className="stack" style={{ flex: 1 }}>
          <input type="text" placeholder="Előadók (vesszővel)" value={artists}
            onChange={(e) => setArtists(e.target.value)} />
          <input type="text" placeholder="Cím" value={title}
            onChange={(e) => setTitle(e.target.value)} />
          <input type="number" placeholder="Év" value={year}
            onChange={(e) => setYear(e.target.value)} />
          <input type="text" placeholder="YouTube / SoundCloud link" value={url}
            onChange={(e) => setUrl(e.target.value)} />
        </div>
        {/* élő előnézet */}
        <div className="card card-front" style={{
          background: st?.bg ?? 'var(--cyan)', color: st?.text_color ?? '#0b0b0d',
        }}>
          <div className="artist">{artists || 'Előadó'}</div>
          <div className="year">{year || '20??'}</div>
          <div className="title">{title || 'Cím'}</div>
        </div>
      </div>

      <p className="small dim" style={{ margin: '12px 0 6px' }}>Kártyastílus:</p>
      <div className="swatch-grid">
        {styleList.map((s) => (
          <button
            key={s.id}
            className={`swatch-pick ${s.id === style ? 'sel' : ''} ${s.custom ? 'custom' : ''}`}
            style={{ background: s.bg }}
            title={s.name || (s.custom ? 'saját színvilág' : s.id)}
            onClick={() => setStyle(s.id)}
          />
        ))}
        <button className="swatch-pick swatch-new" title="Új színvilág" onClick={() => setEditor({ base: null })}>+</button>
      </div>
      <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        {st && (
          <button className="ghost tiny" onClick={() => setEditor({ base: st })}>
            Másolat erről → szerkesztés
          </button>
        )}
        {st?.custom && (
          <button className="ghost tiny" onClick={() => setEditor({ base: st, editId: st.id })}>
            ✎ Ennek a szerkesztése
          </button>
        )}
        {st?.name && <span className="small dim">{st.name}</span>}
      </div>

      {editor && (
        <StyleEditor
          pin={pin}
          base={editor.base}
          editId={editor.editId}
          sample={{ artists, title, year }}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            setEditor(null)
            setStyle(saved ? saved.id : 's1381')
          }}
        />
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="primary" disabled={busy} onClick={save}>Mentés</button>
        {song && (
          <button className="ghost" onClick={() => onPrint(song)}>
            🖨 Nyomtatható kártya
          </button>
        )}
        {msg && <span className="small" style={{ fontWeight: 700 }}>{msg}</span>}
      </div>
    </div>
  )
}

function PrintSheet({ song, styles, onClose }) {
  const [qr, setQr] = useState(null)
  const st = styles?.[song.style]

  useEffect(() => {
    QRCode.toDataURL(song.url, { margin: 1, width: 640, color: { dark: '#0b0b0dff', light: '#ffffffff' } })
      .then(setQr)
  }, [song.url])

  return (
    <div className="modal-overlay">
      <div className="modal print-area">
        <div className="print-cards">
          <div className="print-card" style={{
            background: st?.bg ?? 'var(--cyan)', color: st?.text_color ?? '#0b0b0d',
          }}>
            <div className="p-artist">{song.artists}</div>
            <div className="p-year">{song.year}</div>
            <div className="p-title">{song.title}</div>
          </div>
          <div className="print-card back">
            <svg viewBox="0 0 100 100" className="rings" aria-hidden="true">
              <circle cx="50" cy="50" r="46" stroke="#e63946" strokeWidth="1.6" fill="none"
                strokeDasharray="180 109" strokeLinecap="round" />
              <circle cx="50" cy="50" r="42" stroke="#2d7dd2" strokeWidth="1.6" fill="none"
                strokeDasharray="120 144" strokeLinecap="round" transform="rotate(150 50 50)" />
              <circle cx="50" cy="50" r="38" stroke="#f77f00" strokeWidth="1.6" fill="none"
                strokeDasharray="90 149" strokeLinecap="round" transform="rotate(260 50 50)" />
            </svg>
            {qr && <img className="qr" src={qr} alt="QR-kód" />}
          </div>
        </div>
        <div className="row no-print" style={{ marginTop: 14 }}>
          <button className="primary" onClick={() => window.print()}>Nyomtatás</button>
          <button className="ghost" onClick={onClose}>Bezár</button>
        </div>
        <p className="small dim no-print" style={{ marginBottom: 0 }}>
          #{song.card_number} · A kártya 6,5 × 6,5 cm-esre van méretezve.
        </p>
      </div>
    </div>
  )
}
