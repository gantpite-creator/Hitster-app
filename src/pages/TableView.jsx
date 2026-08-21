import { useEffect, useMemo, useRef, useState } from 'react'
import { myTeam } from '../lib/session.js'
import {
  drawForTurn, playCard, setPendingSlot, revealPlacement, nextTurn, setStatus, getSong,
} from '../lib/gameApi.js'
import { titleMatches, artistMatches } from '../lib/match.js'
import { useCardStyles } from '../lib/cardStyles.js'
import ScannerModal from './ScannerModal.jsx'
import ConfirmModal from './ConfirmModal.jsx'
import PlayerPanel from './PlayerPanel.jsx'

// A gyűrűszínek – a Folytatás gomb csóvájához és a landolás-effekthez
const FX_COLORS = ['#e63946', '#2d7dd2', '#f77f00', '#ffd166', '#7b5ea7', '#00aeef']

/* A kártyahát gyűrű-motívuma kicsiben */
function BackArt() {
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="33" stroke="#e63946" strokeWidth="2.5" fill="none"
        strokeDasharray="120 87" strokeLinecap="round" />
      <circle cx="40" cy="40" r="26" stroke="#2d7dd2" strokeWidth="2.5" fill="none"
        strokeDasharray="70 93" strokeLinecap="round" transform="rotate(140 40 40)" />
      <circle cx="40" cy="40" r="19" stroke="#f77f00" strokeWidth="2.5" fill="none"
        strokeDasharray="55 64" strokeLinecap="round" transform="rotate(250 40 40)" />
      <circle cx="40" cy="40" r="12" stroke="#7b5ea7" strokeWidth="2.5" fill="none"
        strokeDasharray="30 45" strokeLinecap="round" transform="rotate(40 40 40)" />
    </svg>
  )
}

function FrontFace({ song, styles }) {
  const st = styles?.[song.style]
  return (
    <div
      className="card card-front"
      style={{ background: st?.bg ?? 'var(--cyan)', color: st?.text_color ?? '#0b0b0d' }}
    >
      <div className="artist">{song.artists}</div>
      <div className="year">{song.year}</div>
      <div className="title">{song.title}</div>
    </div>
  )
}

export default function TableView({ game, teams, placements, admin }) {
  const styles = useCardStyles()
  const current = teams.find((t) => t.id === game.current_team_id)
  const mineId = myTeam(game.id)
  const isMyTurn = mineId != null && mineId === game.current_team_id

  // az épp játékban lévő lap már beírt sora (felfordítás után létezik)
  const revealedRow = placements.find((p) => p.card_number === game.current_card)

  // a soron lévő csapat idővonala, az aktuális lap nélkül, év szerint
  const timeline = useMemo(
    () =>
      placements
        .filter((p) => p.team_id === game.current_team_id && p.correct && p.card_number !== game.current_card)
        .sort((a, b) => a.songs.year - b.songs.year || a.songs.card_number - b.songs.card_number),
    [placements, game.current_team_id, game.current_card]
  )

  const scores = useMemo(() => {
    const m = {}
    teams.forEach((t) => {
      const cards = placements.filter((p) => p.team_id === t.id && p.correct).length
      m[t.id] = cards + t.bonus_points
    })
    return m
  }, [teams, placements])

  /* ---- húzás ---- */
  const stripRef = useRef(null)
  const [drag, setDrag] = useState(null)          // {x, y} húzás közben
  const [hoverSlot, setHoverSlot] = useState(null)
  const slot = game.pending_slot                   // szinkronizált lehelyezés

  const nearestGap = (x, y) => {
    const strip = stripRef.current
    if (!strip) return null
    const r = strip.getBoundingClientRect()
    if (y < r.top - 60 || y > r.bottom + 60) return null
    let best = null
    strip.querySelectorAll('[data-gap]').forEach((el) => {
      const g = el.getBoundingClientRect()
      const d = Math.abs((g.left + g.right) / 2 - x)
      if (best == null || d < best.d) best = { d, idx: Number(el.dataset.gap) }
    })
    return best ? best.idx : null
  }

  const startDrag = (e) => {
    if (!isMyTurn || game.card_revealed) return
    e.preventDefault()
    const move = (ev) => {
      const x = ev.clientX, y = ev.clientY
      setDrag({ x, y })
      setHoverSlot(nearestGap(x, y))
      const strip = stripRef.current
      if (strip) {
        const r = strip.getBoundingClientRect()
        if (x < r.left + 56) strip.scrollLeft -= 11
        else if (x > r.right - 56) strip.scrollLeft += 11
      }
    }
    const up = async (ev) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const target = nearestGap(ev.clientX, ev.clientY)
      setDrag(null)
      setHoverSlot(null)
      if (target != null && target !== slot) {
        await setPendingSlot(game.id, target)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    move(e)
  }

  /* ---- tippek + pipa ---- */
  const [titleGuess, setTitleGuess] = useState('')
  const [artistGuess, setArtistGuess] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)

  /* ---- Folytatás-gomb csóva + landolás-effekt ---- */
  const fxRef = useRef(null)
  const resumeRef = useRef(null)
  const prevPausedRef = useRef(game.status === 'paused')

  useEffect(() => {
    const paused = game.status === 'paused'
    if (prevPausedRef.current === paused) return
    prevPausedRef.current = paused
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const layer = fxRef.current
    const btn = resumeRef.current
    if (!layer || !btn) return
    let raf
    const t0 = performance.now()
    let last = 0
    const tick = (now) => {
      if (now - last > 26) {
        last = now
        const r = btn.getBoundingClientRect()
        const d = document.createElement('div')
        d.className = 'fx-streak'
        const h = 10 + Math.random() * 40
        d.style.left = `${r.left + 4 + Math.random() * (r.width - 10)}px`
        d.style.top = `${paused ? r.bottom - 2 : r.top - h + 2}px`
        d.style.height = `${h}px`
        d.style.background = FX_COLORS[(Math.random() * FX_COLORS.length) | 0]
        layer.appendChild(d)
        setTimeout(() => d.remove(), 520)
      }
      if (now - t0 < 580) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [game.status])

  useEffect(() => {
    const btn = resumeRef.current
    const layer = fxRef.current
    if (!btn || !layer) return
    const onEnd = (e) => {
      if (e.target !== btn || e.propertyName !== 'transform') return
      if (game.status !== 'paused') return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const r = btn.getBoundingClientRect()
      ;[r.top - 1, r.bottom - 2].forEach((y) => {
        ;['left', 'right'].forEach((side) => {
          const d = document.createElement('div')
          d.className = `fx-sweep ${side}`
          d.style.top = `${y}px`
          d.style.left = side === 'left' ? `${r.left}px` : `${r.left + r.width / 2}px`
          d.style.width = `${r.width / 2}px`
          d.style.background = FX_COLORS[(Math.random() * FX_COLORS.length) | 0]
          layer.appendChild(d)
          setTimeout(() => d.remove(), 620)
        })
      })
    }
    btn.addEventListener('transitionend', onEnd)
    return () => btn.removeEventListener('transitionend', onEnd)
  }, [game.status])
  useEffect(() => {
    setTitleGuess('')
    setArtistGuess('')
  }, [game.current_card])

  const check = async () => {
    if (slot == null || busy) return
    setBusy(true)
    try {
      const song = await getSong(game.current_card)
      const left = timeline[slot - 1]?.songs.year
      const right = timeline[slot]?.songs.year
      const correct =
        (left == null || song.year >= left) && (right == null || song.year <= right)
      await revealPlacement(game, current, song, {
        correct,
        titleOk: titleMatches(titleGuess, song.title),
        artistOk: artistMatches(artistGuess, song.artists),
      })
    } finally {
      setBusy(false)
    }
  }

  /* ---- megjelenítés ---- */
  const waiting = game.current_card == null
  const placing = !waiting && !game.card_revealed
  const revealed = !waiting && game.card_revealed && revealedRow

  const pendingCard = (interactive) =>
    revealed ? (
      <div className={`flip flipped ${revealedRow.correct ? 'good' : 'bad'}`}>
        <div className="inner">
          <div className="face"><div className="card card-back static"><BackArt /></div></div>
          <div className="face front"><FrontFace song={revealedRow.songs} styles={styles} /></div>
        </div>
      </div>
    ) : (
      <div
        className={`card card-back ${interactive ? '' : 'static'}`}
        onPointerDown={interactive ? startDrag : undefined}
        style={drag ? { opacity: 0.25 } : undefined}
      >
        <BackArt />
      </div>
    )

  return (
    <div className="shell">
      <div className={`pause-overlay ${game.status === 'paused' ? 'show' : ''}`}>
        <div style={{ textAlign: 'center' }}>
          <div className="display pause-title">SZÜNET</div>
          <p className="dim pause-title">A játékmester megállította a játékot</p>
          {admin && (
            <button ref={resumeRef} className="primary pause-resume" onClick={() => setStatus(game.id, 'active')}>
              ▶ Folytatás
            </button>
          )}
        </div>
        <div className="fx-layer" ref={fxRef} />
      </div>

      <div className="turn-banner" style={{ background: current?.color ?? 'var(--cyan)' }}>
        <div className="label">{isMyTurn ? 'Ti jöttök!' : 'Most jön'}</div>
        <div className="team">{current?.name}</div>
      </div>

      <div className="scoreboard">
        {[...teams].sort((a, b) => (a.turn_order ?? 0) - (b.turn_order ?? 0)).map((t) => (
          <span className="score-pill" key={t.id}>
            <span className="dot" style={{ background: t.color }} />
            {t.name}: {scores[t.id]}
            {game.score_limit ? ` / ${game.score_limit}` : ''}
          </span>
        ))}
      </div>

      {/* ---- idővonal ---- */}
      <div className="strip-wrap">
        <div className="strip" ref={stripRef}>
          <Gap idx={0} hover={hoverSlot === 0} filled={slot === 0 && !drag}>
            {slot === 0 && !drag ? pendingCard(isMyTurn) : null}
          </Gap>
          {timeline.map((p, i) => (
            <FragmentPair
              key={p.id}
              song={p.songs}
              styles={styles}
              idx={i + 1}
              hover={hoverSlot === i + 1}
              filled={slot === i + 1 && !drag}
            >
              {slot === i + 1 && !drag ? pendingCard(isMyTurn) : null}
            </FragmentPair>
          ))}
        </div>
        <p className="timeline-hint">
          {timeline.length === 0
            ? 'Az első lap bárhova tehető'
            : '← régebbi · újabb →'}
        </p>
      </div>

      {/* ---- tálca / állapot ---- */}
      {waiting && (
        <div className="panel" style={{ textAlign: 'center', marginTop: 14 }}>
          {admin ? (
            <div className="action-grid">
              <button className="primary" onClick={() => setScanning(true)}>
                📷 Beolvasás
              </button>
              <button onClick={() => drawForTurn(game, placements)}>
                🎲 Húzás a pakliból
              </button>
            </div>
          ) : (
            <p className="dim" style={{ margin: 0 }}>
              A játékmester mindjárt indítja a zenét…
            </p>
          )}
        </div>
      )}

      {scanning && (
        <ScannerModal
          placements={placements}
          onClose={() => setScanning(false)}
          onPlay={async (song) => {
            setScanning(false)
            await playCard(game, song.card_number)
          }}
        />
      )}

      {placing && slot == null && (
        <div className="tray">
          {pendingCard(isMyTurn)}
          <div className="hint">
            {isMyTurn
              ? 'Tartsátok rajta az ujjatokat és húzzátok az idővonalra!'
              : `A(z) ${current?.name} csapat épp helyezkedik…`}
          </div>
        </div>
      )}

      {placing && slot != null && isMyTurn && (
        <div className="panel guess-panel" style={{ marginTop: 14 }}>
          <p className="small dim" style={{ margin: '0 0 10px' }}>
            Bónuszért tippelhettek (nem kötelező):
          </p>
          <div className="stack">
            <input
              type="text"
              placeholder="A szám címe (+1 pont)"
              value={titleGuess}
              onChange={(e) => setTitleGuess(e.target.value)}
            />
            <input
              type="text"
              placeholder="Egy előadó (+1 pont)"
              value={artistGuess}
              onChange={(e) => setArtistGuess(e.target.value)}
            />
            <button className="primary wide" disabled={busy} onClick={check}>
              ✓ Ellenőrzés
            </button>
          </div>
        </div>
      )}

      {revealed && (
        <div className={`result-banner ${revealedRow.correct ? 'good' : 'bad'}`}>
          {revealedRow.correct ? 'Jó helyre került! +1 lap' : 'Nem talált – ez a lap kiesik'}
          <div className="sub">
            Cím: {revealedRow.title_correct ? '+1 pont ✓' : 'nincs pont'} ·{' '}
            Előadó: {revealedRow.artist_correct ? '+1 pont ✓' : 'nincs pont'}
          </div>
        </div>
      )}

      {/* ---- admin ---- */}
      {admin && !waiting && <AdminPlayer cardNumber={game.current_card} />}
      {admin && (
        <div className="admin-bar">
          <button onClick={() => nextTurn(game, teams, placements)} disabled={!game.card_revealed}>
            Következő kör
          </button>
          <button
            className={`ghost pause-toggle ${game.status === 'paused' ? 'collapsed' : ''}`}
            onClick={() => setStatus(game.id, 'paused')}
          >
            Szünet
          </button>
          <button className="danger" onClick={() => setConfirmEnd(true)}>
            Vége
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmEnd}
        title="Játék lezárása"
        text="Mindenki a végeredmény-képernyőt kapja. Ez nem vonható vissza."
        confirmLabel="Játék vége"
        onConfirm={() => { setConfirmEnd(false); setStatus(game.id, 'finished') }}
        onCancel={() => setConfirmEnd(false)}
      />

      {/* húzás közbeni "szellem" kártya az ujj alatt */}
      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          <div className="card card-back"><BackArt /></div>
        </div>
      )}
    </div>
  )
}

function Gap({ idx, hover, filled, children }) {
  return (
    <div className={`gap ${hover ? 'hover' : ''} ${filled ? 'filled' : ''}`} data-gap={idx}>
      {children}
    </div>
  )
}

function FragmentPair({ song, styles, idx, hover, filled, children }) {
  return (
    <>
      <FrontFace song={song} styles={styles} />
      <Gap idx={idx} hover={hover} filled={filled}>{children}</Gap>
    </>
  )
}

function AdminPlayer({ cardNumber }) {
  const [song, setSong] = useState(null)
  useEffect(() => {
    let live = true
    getSong(cardNumber).then((s) => live && setSong(s))
    return () => { live = false }
  }, [cardNumber])
  if (!song) return null
  return <PlayerPanel song={song} />
}
