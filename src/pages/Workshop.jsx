import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase.js'
import { useCardStyles } from '../lib/cardStyles.js'
import StyleEditor from './StyleEditor.jsx'
import { strip } from '../lib/match.js'

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

const PAGE = 100

// Az összes zene betöltése (a Supabase egyszerre max. 1000 sort ad, ezért lapozunk)
async function fetchAllSongs() {
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('songs')
      .select()
      .order('card_number')
      .range(from, from + 999)
    if (error) throw error
    all.push(...data)
    if (data.length < 1000) break
  }
  return all
}

const SORTS = {
  num: { label: 'Sorszám ↑', fn: (a, b) => a.card_number - b.card_number },
  numDesc: { label: 'Legújabbak elöl', fn: (a, b) => b.card_number - a.card_number },
  year: { label: 'Évszám', fn: (a, b) => a.year - b.year || a.card_number - b.card_number },
  artist: { label: 'Előadó', fn: (a, b) => a.artists.localeCompare(b.artists, 'hu') },
  title: { label: 'Cím', fn: (a, b) => a.title.localeCompare(b.title, 'hu') },
}

function downloadCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [['Sorszám', 'Előadók', 'Év', 'Cím', 'Link', 'Stílus'].map(esc).join(';')]
  for (const s of rows) lines.push([s.card_number, s.artists, s.year, s.title, s.url, s.style].map(esc).join(';'))
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `zenetar-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

function WorkshopInner({ pin }) {
  const styles = useCardStyles()
  const [songs, setSongs] = useState(null)       // null = töltés
  const [loadErr, setLoadErr] = useState('')
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState('num')
  const [shown, setShown] = useState(PAGE)
  const [editing, setEditing] = useState(null)   // null = nincs form; {} = új zene
  const [printSong, setPrintSong] = useState(null)
  const [standaloneEditor, setStandaloneEditor] = useState(false)

  const load = async () => {
    setLoadErr('')
    try {
      setSongs(await fetchAllSongs())
    } catch {
      setLoadErr('Nem sikerült betölteni a zenéket. Ha a Supabase szüneteltetve van, a dashboardon nyomd meg a Restore-t.')
    }
  }
  useEffect(() => { load() }, [])
  useEffect(() => setShown(PAGE), [term, sort])

  const stats = useMemo(() => {
    if (!songs?.length) return null
    const last = songs.reduce((m, s) => (s.card_number > m.card_number ? s : m), songs[0])
    const years = songs.map((s) => s.year)
    return {
      total: songs.length,
      last,
      minYear: Math.min(...years),
      maxYear: Math.max(...years),
      soundcloud: songs.filter((s) => s.source_type === 'soundcloud').length,
    }
  }, [songs])

  const filtered = useMemo(() => {
    if (!songs) return []
    const t = strip(term.trim())
    let list = songs
    if (/^\d+$/.test(t)) {
      const n = Number(t)
      list = songs.filter((s) => s.card_number === n || s.year === n)
    } else if (t) {
      const words = t.split(/[\s,]+/).filter(Boolean)
      list = songs.filter((s) => {
        const hay = strip(`${s.artists} ${s.title}`)
        return words.every((w) => hay.includes(w))
      })
    }
    return [...list].sort(SORTS[sort].fn)
  }, [songs, term, sort])

  const openSong = (s) => {
    setEditing(s)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="shell">
      <div className="spread">
        <h1>Műhely</h1>
        <div className="row">
          <button className="ghost" onClick={() => setStandaloneEditor(true)}>🎨 Új színvilág</button>
          <button className="primary" onClick={() => openSong({})}>+ Új zene</button>
        </div>
      </div>

      {/* ---- Zenetár összesítő ---- */}
      <div className="lib-stats">
        <div className="lib-tile">
          <span className="lib-label">Összesen</span>
          <span className="lib-big">{stats ? stats.total.toLocaleString('hu-HU') : '…'}</span>
          <span className="dim small">zene</span>
        </div>
        <div className="lib-tile wide" onClick={() => stats && openSong(stats.last)} role="button">
          <span className="lib-label">Utolsó lap</span>
          <span className="lib-big">{stats ? `#${stats.last.card_number}` : '…'}</span>
          <span className="small lib-last">{stats ? `${stats.last.artists} – ${stats.last.title} (${stats.last.year})` : ''}</span>
        </div>
        <div className="lib-tile">
          <span className="lib-label">Évek</span>
          <span className="lib-big">{stats ? `${stats.minYear}–${stats.maxYear}` : "…"}</span>
          <span className="dim small">{stats ? `${stats.soundcloud} SoundCloud` : ''}</span>
        </div>
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
            setSongs((all) => {
              const rest = (all ?? []).filter((x) => x.card_number !== saved.card_number)
              return [...rest, { ...(all ?? []).find((x) => x.card_number === saved.card_number), ...saved }]
            })
          }}
          onPrint={(s) => setPrintSong(s)}
        />
      )}

      {/* ---- teljes lista ---- */}
      <h2 style={{ margin: '20px 0 8px' }}>Zenetár</h2>
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          type="text"
          placeholder="Szűrés: előadó, cím, sorszám vagy évszám"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      <div className="row lib-tools">
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Rendezés">
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="dim small" style={{ flex: 1 }}>
          {songs ? `${filtered.length.toLocaleString('hu-HU')} találat` : 'Betöltés…'}
        </span>
        <button className="ghost tiny" disabled={!songs} onClick={() => downloadCsv(filtered)} title="Excelben megnyitható">
          ⬇ CSV
        </button>
        <button className="ghost tiny" onClick={load} title="Újratöltés">↻</button>
      </div>
      {loadErr && <p className="error small">{loadErr}</p>}

      <div className="stack">
        {filtered.slice(0, shown).map((s) => (
          <button key={s.card_number} className="result-row" onClick={() => openSong(s)}>
            <span
              className="lib-swatch"
              style={{ background: styles?.[s.style]?.bg ?? 'var(--cyan)' }}
              aria-hidden="true"
            />
            <b className="lib-num">#{s.card_number}</b>
            <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
              {s.artists} – {s.title}
            </span>
            <span className="dim">{s.year}</span>
          </button>
        ))}
      </div>
      {filtered.length > shown && (
        <button className="ghost wide" style={{ marginTop: 10 }} onClick={() => setShown((n) => n + PAGE * 3)}>
          Továbbiak ({(filtered.length - shown).toLocaleString('hu-HU')} még)
        </button>
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
