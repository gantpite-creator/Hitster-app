import { useEffect, useMemo, useState } from 'react'
import FitText from '../lib/FitText.jsx'
import { supabase } from '../lib/supabase.js'
import {
  DIRECTIONS, RADIAL_ORIGINS, specToBg, bgToSpec, autoTextColor, putStyle, dropStyle,
} from '../lib/cardStyles.js'
import ConfirmModal from './ConfirmModal.jsx'

const NEW_SPEC = {
  type: 'linear', angle: 135, at: 'center', text: '#000000',
  stops: [{ color: '#38eeff', pos: 0 }, { color: '#ff8008', pos: 100 }],
}

// Word-szerű színvilág-szerkesztő.
// base: kiinduló stílus (másoláshoz vagy szerkesztéshez), editId: saját stílus azonosítója szerkesztéskor
export default function StyleEditor({ pin, base, editId, sample, onClose, onSaved }) {
  const [spec, setSpec] = useState(() => {
    if (base?.spec) return structuredClone(base.spec)
    if (base) return bgToSpec(base.bg, base.text_color)
    return structuredClone(NEW_SPEC)
  })
  const [name, setName] = useState(editId ? base?.name ?? '' : '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  const bg = useMemo(() => specToBg(spec), [spec])
  const set = (patch) => setSpec((s) => ({ ...s, ...patch }))
  const setStop = (i, patch) => set({ stops: spec.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const addStop = () => {
    if (spec.stops.length >= 4) return
    // az új pont a legnagyobb rés közepére kerül
    const sorted = [...spec.stops].sort((a, b) => a.pos - b.pos)
    let gi = 0, gap = -1
    for (let i = 0; i < sorted.length - 1; i++) {
      const g = sorted[i + 1].pos - sorted[i].pos
      if (g > gap) { gap = g; gi = i }
    }
    const pos = Math.round((sorted[gi].pos + sorted[gi + 1].pos) / 2)
    set({ stops: [...spec.stops, { color: '#ffffff', pos }] })
  }

  const errText = (e) => {
    const m = e?.message ?? ''
    if (m.includes('PIN')) return 'Hibás PIN – lépj be újra.'
    if (m.includes('HASZNALATBAN')) return 'Ezt a színvilágot még zenék használják, előbb állítsd át őket.'
    if (m.includes('NEM_SZERKESZTHETO')) return 'Gyári színvilág nem írható felül – mentsd újként.'
    return 'Mentési hiba: ' + m
  }

  const save = async () => {
    setBusy(true)
    setMsg('')
    try {
      const { data, error } = await supabase.rpc('admin_save_style', {
        p_pin: pin, p_id: editId ?? null, p_name: name, p_text_color: spec.text.toLowerCase(), p_bg: bg, p_spec: spec,
      })
      if (error) throw error
      const saved = { id: data, text_color: spec.text.toLowerCase(), bg, name: name.trim() || null, spec, custom: true }
      putStyle(saved)
      onSaved(saved)
    } catch (e) {
      setMsg(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setConfirmDel(false)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('admin_delete_style', { p_pin: pin, p_id: editId })
      if (error) throw error
      dropStyle(editId)
      onSaved(null)
    } catch (e) {
      setMsg(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal style-editor" onClick={(e) => e.stopPropagation()}>
        <div className="spread">
          <h2 style={{ margin: 0 }}>{editId ? 'Színvilág szerkesztése' : 'Új színvilág'}</h2>
          <button className="ghost" onClick={onClose}>Bezár</button>
        </div>

        <div className="se-body">
          {/* élő előnézet */}
          <div className="se-preview">
            <div className="card card-front se-card" style={{ background: bg, color: spec.text }}>
              <FitText className="artist" text={sample?.artists || 'Előadó'} />
              <div className="year">{sample?.year || '1999'}</div>
              <FitText className="title" text={sample?.title || 'Cím'} />
            </div>
          </div>

          <div className="se-controls">
            <div className="se-label">Kitöltés</div>
            <div className="seg">
              {[['solid', 'Egyszínű'], ['linear', 'Színátmenet'], ['radial', 'Körkörös']].map(([t, l]) => (
                <button key={t} className={spec.type === t ? 'on' : ''} onClick={() => set({ type: t })}>{l}</button>
              ))}
            </div>

            {spec.type === 'linear' && (
              <>
                <div className="se-label">Irány</div>
                <div className="dir-pad">
                  {DIRECTIONS.map((d, i) =>
                    d ? (
                      <button
                        key={i}
                        className={Math.round(spec.angle) % 360 === d.angle ? 'on' : ''}
                        title={d.label}
                        onClick={() => set({ angle: d.angle })}
                      >
                        {d.arrow}
                      </button>
                    ) : (
                      <span key={i} className="dir-deg">{Math.round(spec.angle)}°</span>
                    )
                  )}
                </div>
                <input
                  type="range" min={0} max={359} value={spec.angle}
                  onChange={(e) => set({ angle: Number(e.target.value) })}
                  aria-label="Szög"
                />
              </>
            )}

            {spec.type === 'radial' && (
              <>
                <div className="se-label">Kiindulópont</div>
                <div className="seg wrap">
                  {RADIAL_ORIGINS.map((o) => (
                    <button key={o.at} className={spec.at === o.at ? 'on' : ''} onClick={() => set({ at: o.at })}>{o.label}</button>
                  ))}
                </div>
              </>
            )}

            <div className="se-label">{spec.type === 'solid' ? 'Háttérszín' : 'Színpontok'}</div>
            {(spec.type === 'solid' ? spec.stops.slice(0, 1) : spec.stops).map((s, i) => (
              <div className="stop-row" key={i}>
                <input type="color" value={s.color} onChange={(e) => setStop(i, { color: e.target.value })} aria-label="Szín" />
                <input
                  className="hex" type="text" value={s.color} maxLength={7}
                  onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setStop(i, { color: e.target.value })}
                />
                {spec.type !== 'solid' && (
                  <>
                    <input
                      type="range" min={0} max={100} value={s.pos}
                      onChange={(e) => setStop(i, { pos: Number(e.target.value) })}
                      aria-label="Pozíció"
                    />
                    <span className="pos">{Math.round(s.pos)}%</span>
                    <button
                      className="ghost tiny" disabled={spec.stops.length <= 2}
                      onClick={() => set({ stops: spec.stops.filter((_, j) => j !== i) })}
                      title="Színpont törlése"
                    >✕</button>
                  </>
                )}
              </div>
            ))}
            {spec.type !== 'solid' && spec.stops.length < 4 && (
              <button className="ghost tiny" onClick={addStop}>+ Színpont</button>
            )}

            <div className="se-label">Szöveg színe</div>
            <div className="stop-row wrap">
              <input type="color" value={spec.text} onChange={(e) => set({ text: e.target.value })} aria-label="Szövegszín" />
              <input
                className="hex" type="text" value={spec.text} maxLength={7}
                onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && set({ text: e.target.value })}
              />
              <button className="ghost tiny" onClick={() => set({ text: '#000000' })}>Fekete</button>
              <button className="ghost tiny" onClick={() => set({ text: '#ffffff' })}>Fehér</button>
              <button className="ghost tiny" onClick={() => set({ text: autoTextColor(spec) })}>Automatikus</button>
            </div>

            <div className="se-label">Név (nem kötelező)</div>
            <input type="text" placeholder="pl. Nyári slágerek" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <div className="row" style={{ marginTop: 16, flexWrap: 'wrap' }}>
          <button
            className="primary" disabled={busy || !/^#[0-9a-fA-F]{6}$/.test(spec.text) || spec.stops.some((s) => !/^#[0-9a-fA-F]{6}$/.test(s.color))}
            onClick={save}
          >
            {editId ? 'Mentés' : 'Mentés új színvilágként'}
          </button>
          {editId && <button className="danger" disabled={busy} onClick={() => setConfirmDel(true)}>Törlés</button>}
          {msg && <span className="small" style={{ fontWeight: 700 }}>{msg}</span>}
        </div>
      </div>

      <div onClick={(e) => e.stopPropagation()}>
      <ConfirmModal
        open={confirmDel}
        title="Színvilág törlése"
        text="Csak akkor törölhető, ha egyetlen zene sem használja."
        confirmLabel="Törlés"
        onConfirm={remove}
        onCancel={() => setConfirmDel(false)}
      />
      </div>
    </div>
  )
}
