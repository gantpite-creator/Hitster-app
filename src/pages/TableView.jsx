import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { myTeam } from '../lib/session.js'
import {
  drawForTurn, playCard, reviewBonus, setPendingSlot, revealPlacement, nextTurn, setStatus, getSong,
} from '../lib/gameApi.js'
import { titleMatches, artistMatches } from '../lib/match.js'
import { useCardStyles } from '../lib/cardStyles.js'
import { complementOf } from '../lib/colors.js'
import ScannerModal from './ScannerModal.jsx'
import ConfirmModal from './ConfirmModal.jsx'
import PlayerPanel from './PlayerPanel.jsx'

// A gyűrűszínek – a Folytatás gomb csóvájához és a landolás-effekthez
const FX_COLORS = ['#e63946', '#2d7dd2', '#f77f00', '#ffd166', '#7b5ea7', '#00aeef']

// Egy kanyargós csík SVG-je véletlen mérettel, színnel, hajlítással
function buildStreak() {
  const h = 14 + Math.random() * 46
  const w = 10 + Math.random() * 12
  const sw = (1.6 + Math.random() * 2.4).toFixed(1)
  const c = FX_COLORS[(Math.random() * FX_COLORS.length) | 0]
  const x1 = (Math.random() * w).toFixed(1)
  const x2 = (Math.random() * w).toFixed(1)
  const xe = (w / 2 + (Math.random() * 6 - 3)).toFixed(1)
  const path =
    Math.random() < 0.45
      ? `M ${(w / 2).toFixed(1)} 1 Q ${x1} ${(h / 2).toFixed(1)} ${xe} ${(h - 1).toFixed(1)}`
      : `M ${(w / 2).toFixed(1)} 1 C ${x1} ${(h * 0.33).toFixed(1)}, ${x2} ${(h * 0.66).toFixed(1)}, ${xe} ${(h - 1).toFixed(1)}`
  const svg = `<svg width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}"><path d="${path}" stroke="${c}" stroke-width="${sw}" fill="none" stroke-linecap="round"/></svg>`
  return { w, h, svg }
}

// Kanyargós fénycsík rajzolása egy fix pozíciójú rétegre
function spawnStreak(layer, xc, y, opts = {}) {
  if (!layer) return
  const { w, h, svg } = buildStreak()
  const d = document.createElement('div')
  d.className = 'fx-streak'
  d.innerHTML = svg
  if (opts.rotate != null) d.firstChild.style.transform = `rotate(${opts.rotate.toFixed(0)}deg)`
  d.style.left = `${xc - w / 2}px`
  d.style.top = opts.mode === 'up' ? `${y - h + 3}px` : opts.mode === 'center' ? `${y - h / 2}px` : `${y - 3}px`
  layer.appendChild(d)
  setTimeout(() => d.remove(), 980)
}

// Diadal-konfetti felfelé, félkörívben (csak jó helyezésnél)
function spawnBurst(layer, rect) {
  if (!layer) return
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const n = 16
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI + (Math.random() - 0.5) * 0.24
    const { w, h, svg } = buildStreak()
    const d = document.createElement('div')
    d.className = 'fx-burst'
    d.innerHTML = svg
    d.style.left = `${cx + Math.cos(a) * (rect.width / 2) - w / 2}px`
    d.style.top = `${cy + Math.sin(a) * (rect.height / 2) - h / 2}px`
    const dist = 55 + Math.random() * 90
    d.style.setProperty('--tx', `${(Math.cos(a) * dist).toFixed(0)}px`)
    d.style.setProperty('--ty', `${(Math.sin(a) * dist).toFixed(0)}px`)
    d.style.setProperty('--rot', `${((a * 180) / Math.PI - 90).toFixed(0)}deg`)
    d.style.animationDuration = `${(0.6 + Math.random() * 0.45).toFixed(2)}s`
    layer.appendChild(d)
    setTimeout(() => d.remove(), 1150)
  }
}

// Lebegő háttér-gyűrűk: halványan úsznak srégen jobbra-fel, alulról újratöltődve
function RingField() {
  const rings = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        left: Math.random() * 110 - 15,
        size: 60 + Math.random() * 130,
        opacity: 0.05 + Math.random() * 0.08,
        dur: 34 + Math.random() * 36,
        delay: -Math.random() * 70,
      })),
    []
  )
  return (
    <div className="bg-rings" aria-hidden="true">
      {rings.map((r) => (
        <span
          key={r.id}
          style={{
            left: `${r.left}%`,
            width: r.size,
            height: r.size,
            opacity: r.opacity,
            animationDuration: `${r.dur}s`,
            animationDelay: `${r.delay}s`,
          }}
        >
          <BackArt />
        </span>
      ))}
    </div>
  )
}

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
  // A mester sosem játékos: mesteri fülön a csapattagság nem ad húzási jogot
  const isMyTurn = !admin && mineId != null && mineId === game.current_team_id

  // az épp játékban lévő lap már beírt sora (felfordítás után létezik)
  const revealedRow = placements.find((p) => p.card_number === game.current_card)

  // a soron lévő csapat idővonala, az aktuális lap nélkül, év szerint
  const groups = useMemo(() => {
    const flat = placements
      .filter((p) => p.team_id === game.current_team_id && p.correct && p.card_number !== game.current_card)
      .sort(
        (a, b) =>
          a.songs.year - b.songs.year || new Date(a.created_at) - new Date(b.created_at)
      )
    const g = []
    for (const pl of flat) {
      const last = g[g.length - 1]
      if (last && last.year === pl.songs.year) last.cards.push(pl)
      else g.push({ year: pl.songs.year, cards: [pl] })
    }
    return g
  }, [placements, game.current_team_id, game.current_card])

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
  const [flight, setFlight] = useState(null)      // elengedés utáni "odarepülés"
  const [hoverSlot, setHoverSlot] = useState(null)
  const [localSlot, setLocalSlot] = useState(game.pending_slot)
  useEffect(() => { setLocalSlot(game.pending_slot) }, [game.pending_slot, game.current_card])
  const slot = localSlot                           // azonnali (optimista) lehelyezés

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

  const panStrip = (e) => {
    if (e.pointerType !== 'mouse') return // mobilon a natív görgetés intézi
    if (e.target.closest('.card-back') && !e.target.closest('.card-back.static')) return
    const strip = stripRef.current
    const sx = e.clientX
    const sl = strip.scrollLeft
    const move = (ev) => { strip.scrollLeft = sl - (ev.clientX - sx) }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startDrag = (e) => {
    if (!isMyTurn || game.card_revealed) return
    e.preventDefault()
    dragActiveRef.current = true
    const noFx = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let lastPos = { x: e.clientX, y: e.clientY }
    let lastFx = 0
    let lastCast = 0
    const move = (ev) => {
      const x = ev.clientX, y = ev.clientY
      setDrag({ x, y })
      const hs = nearestGap(x, y)
      setHoverSlot(hs)
      const stripEl = stripRef.current
      if (stripEl && ev.timeStamp - lastCast > 40) {
        const sr = stripEl.getBoundingClientRect()
        dragChanRef.current?.send({
          type: 'broadcast',
          event: 'drag',
          payload: { x: stripEl.scrollLeft + x - sr.left, y: y - sr.top, slot: hs },
        })
        lastCast = ev.timeStamp
      }
      if (!noFx && ev.timeStamp - lastFx > 30) {
        const dx = x - lastPos.x
        const dy = y - lastPos.y
        if (Math.hypot(dx, dy) > 4) {
          const ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90
          spawnStreak(tableFxRef.current, x - dx * 1.6, y - dy * 1.6, { mode: 'center', rotate: ang })
          lastFx = ev.timeStamp
        }
      }
      lastPos = { x, y }
      const strip = stripRef.current
      if (strip) {
        const r = strip.getBoundingClientRect()
        if (x < r.left + 56) strip.scrollLeft -= 11
        else if (x > r.right - 56) strip.scrollLeft += 11
      }
    }
    const up = (ev) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      dragActiveRef.current = false
      dragChanRef.current?.send({ type: 'broadcast', event: 'drag_end', payload: {} })
      const target = nearestGap(ev.clientX, ev.clientY)
      setHoverSlot(null)
      if (target != null) {
        setDrag(null)
        setLocalSlot(target) // azonnal a helyére, nem várunk a szerverre
        if (target !== slot) {
          setPendingSlot(game.id, target).catch(() => setLocalSlot(game.pending_slot))
        }
      } else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setDrag(null)
      } else {
        // nincs cél: a lap szépen visszarepül oda, ahonnan felvették
        const anchor = document.querySelector('.pending-anchor')
        if (!anchor) {
          setDrag(null)
          return
        }
        const r = anchor.getBoundingClientRect()
        setDrag(null)
        setFlight({
          x: ev.clientX,
          y: ev.clientY,
          dx: r.left + r.width / 2 - ev.clientX,
          dy: r.top + r.height / 2 - ev.clientY,
        })
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
  const [zoomCards, setZoomCards] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const guessRows = useMemo(
    () =>
      placements
        .filter((p) => p.title_guess || p.artist_guess)
        .sort((a, b) => (a.bonus_reviewed === b.bonus_reviewed ? new Date(b.created_at) - new Date(a.created_at) : a.bonus_reviewed ? 1 : -1)),
    [placements]
  )
  const pendingCount = guessRows.filter((p) => !p.bonus_reviewed).length
  const [remoteActive, setRemoteActive] = useState(false)

  // A távoli (másik eszközön húzott) lap pozicionálása a sáv tartalmi koordinátáiból
  const placeRemote = (p) => {
    const el = remoteGhostRef.current
    if (!el) return
    const tx = p.x - 48
    const ty = Math.max(0, Math.min(p.y - 60, 34))
    el.style.transform = `translate(${tx.toFixed(0)}px, ${ty.toFixed(0)}px)`
  }

  // Élő húzás-közvetítés: broadcast csatornán, adatbázis-írás nélkül
  useEffect(() => {
    const ch = supabase.channel(`dragcast-${game.id}`)
    ch.on('broadcast', { event: 'drag' }, ({ payload }) => {
      if (dragActiveRef.current) return // aki maga húz, annak nem kell tükör
      lastRemoteRef.current = payload
      setRemoteActive(true)
      placeRemote(payload)
      setHoverSlot(payload.slot ?? null)
      clearTimeout(remoteTimerRef.current)
      remoteTimerRef.current = setTimeout(() => {
        setRemoteActive(false)
        setHoverSlot(null)
      }, 1300) // biztonsági takarítás, ha a küldő eltűnne
    })
    ch.on('broadcast', { event: 'drag_end' }, () => {
      if (dragActiveRef.current) return
      clearTimeout(remoteTimerRef.current)
      setRemoteActive(false)
      setHoverSlot(null)
    })
    ch.subscribe()
    dragChanRef.current = ch
    return () => {
      clearTimeout(remoteTimerRef.current)
      supabase.removeChannel(ch)
      dragChanRef.current = null
    }
  }, [game.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (remoteActive && lastRemoteRef.current) placeRemote(lastRemoteRef.current)
  }, [remoteActive])
  const [shakeBad, setShakeBad] = useState(false)
  useEffect(() => { setShakeBad(false) }, [game.current_card])

  // Húzáskor/beolvasáskor a lefordított lap a pakliból húzódik a helyére
  useLayoutEffect(() => {
    const prev = prevCardRef.current
    prevCardRef.current = game.current_card
    if (prev != null || game.current_card == null) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const deck = deckRef.current
    const tray = trayCardRef.current
    if (!deck || !tray) return
    const dr = deck.getBoundingClientRect()
    const tr = tray.getBoundingClientRect()
    const dx = dr.left + dr.width / 2 - (tr.left + tr.width / 2)
    const dy = dr.top + dr.height / 2 - (tr.top + tr.height / 2)
    tray.style.transition = 'none'
    tray.style.transform = `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px) scale(${(dr.width / tr.width).toFixed(2)}) rotate(-6deg)`
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        tray.style.transition = 'transform 0.6s cubic-bezier(0.3, 1.05, 0.35, 1)'
        tray.style.transform = ''
      })
    )
    const t = setTimeout(() => {
      if (trayCardRef.current) trayCardRef.current.style.transition = ''
    }, 700)
    return () => clearTimeout(t)
  }, [game.current_card])

  // Konfetti pontosan a "letevés" pillanatában: az animáció végéhez kötve
  useEffect(() => {
    if (!game.card_revealed || !revealedRow) return
    if (burstDoneRef.current === revealedRow.card_number) return
    burstDoneRef.current = revealedRow.card_number
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = revealFlipRef.current
    if (!el) return
    let fired = false
    const fire = () => {
      if (fired) return
      fired = true
      if (revealedRow.correct) spawnBurst(tableFxRef.current, el.getBoundingClientRect())
      else setShakeBad(true)
    }
    const onEnd = (e) => {
      if (e.animationName === 'cardFlip') fire()
    }
    el.addEventListener('animationend', onEnd) // az .inner-ről felbuborékol
    const t = setTimeout(fire, 1400) // biztonsági háló, ha az esemény elveszne
    return () => {
      el.removeEventListener('animationend', onEnd)
      clearTimeout(t)
    }
  }, [game.card_revealed, revealedRow?.card_number]) // sorszámhoz kötve: a realtime-frissítések nem zavarják
  const [pauseBtnHidden, setPauseBtnHidden] = useState(game.status === 'paused')
  useEffect(() => {
    if (game.status === 'paused') {
      setPauseBtnHidden(true)
      return
    }
    const t = setTimeout(() => setPauseBtnHidden(false), 1300) // a landolás után nő vissza
    return () => clearTimeout(t)
  }, [game.status])

  /* ---- Folytatás-gomb csóva + landolás-effekt ---- */
  const fxRef = useRef(null)
  const tableFxRef = useRef(null)
  const dragChanRef = useRef(null)
  const dragActiveRef = useRef(false)
  const remoteGhostRef = useRef(null)
  const remoteTimerRef = useRef(null)
  const lastRemoteRef = useRef(null)
  const revealFlipRef = useRef(null)
  const deckRef = useRef(null)
  const trayCardRef = useRef(null)
  const prevCardRef = useRef(game.current_card)
  const burstDoneRef = useRef(undefined)
  if (burstDoneRef.current === undefined) {
    // betöltéskor már rég felfordult lapra ne menjen utólag konfetti
    burstDoneRef.current = game.card_revealed && revealedRow ? revealedRow.card_number : null
  }
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
        const xc = r.left + Math.random() * r.width
        if (paused) spawnStreak(layer, xc, r.bottom, { mode: 'down' })
        else spawnStreak(layer, xc, r.top, { mode: 'up' })
      }
      if (now - t0 < 1240) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
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
      const left = groups[slot - 1]?.year
      const right = groups[slot]?.year
      const correct =
        (left == null || song.year >= left) && (right == null || song.year <= right)
      await revealPlacement(game, current, song, {
        correct,
        titleOk: titleMatches(titleGuess, song.title),
        artistOk: artistMatches(artistGuess, song.artists),
        titleGuess,
        artistGuess,
      })
    } finally {
      setBusy(false)
    }
  }

  /* ---- megjelenítés ---- */
  const waiting = game.current_card == null
  const placing = !waiting && !game.card_revealed
  const revealed = !waiting && game.card_revealed && revealedRow

  const pendingCard = (interactive, inGap = false) =>
    revealed ? (
      <div
        ref={revealFlipRef}
        className={`flip flipped zoomable ${revealedRow.correct ? 'good' : 'bad'} ${shakeBad ? 'shaking' : ''}`}
        onClick={() => setZoomCards([revealedRow])}
      >
        <div className="inner">
          <div className="face"><div className="card card-back static"><BackArt /></div></div>
          <div className="face front"><FrontFace song={revealedRow.songs} styles={styles} /></div>
        </div>
      </div>
    ) : (
      <div
        className={`card card-back pending-anchor ${inGap ? 'placed-pop' : ''} ${interactive ? '' : 'static'}`}
        onPointerDown={interactive ? startDrag : undefined}
        style={drag || flight ? { opacity: 0.25 } : undefined}
      >
        <BackArt />
      </div>
    )

  return (
    <div className="shell">
      <RingField />
      <div className={`pause-overlay ${game.status === 'paused' ? 'show' : ''}`}>
        <div className="pause-backdrop" />
        <div className="pause-content" style={{ textAlign: 'center' }}>
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

      <div
        className="turn-banner"
        style={{ background: current?.color ?? 'var(--cyan)', '--orbit': complementOf(current?.color) }}
      >
        <div className="label">{isMyTurn ? 'Ti jöttök!' : 'Most jön'}</div>
        <div className="team">{current?.name}</div>
      </div>

      <div className="scoreboard">
        {[...teams].sort((a, b) => (a.turn_order ?? 0) - (b.turn_order ?? 0)).map((t) => (
          <span className="score-pill" key={t.id} style={{ '--orbit': t.color }}>
            <span className="dot" style={{ background: t.color }} />
            {t.name}: {scores[t.id]}
            {game.score_limit ? ` / ${game.score_limit}` : ''}
          </span>
        ))}
      </div>

      {/* ---- idővonal ---- */}
      <div className="strip-wrap">
        <div
          className="strip"
          ref={stripRef}
          onPointerDown={panStrip}
          onWheel={(e) => { stripRef.current.scrollLeft += e.deltaY }}
        >
          <Gap idx={0} hover={hoverSlot === 0} filled={slot === 0 && !drag}>
            {slot === 0 && !drag ? pendingCard(isMyTurn, true) : null}
          </Gap>
          {groups.map((grp, i) => (
            <Fragment key={grp.cards[0].id}>
              <CardStack cards={grp.cards} styles={styles} onZoom={setZoomCards} />
              <Gap idx={i + 1} hover={hoverSlot === i + 1} filled={slot === i + 1 && !drag}>
                {slot === i + 1 && !drag ? pendingCard(isMyTurn, true) : null}
              </Gap>
            </Fragment>
          ))}
          {remoteActive && !drag && (
            <div ref={remoteGhostRef} className="remote-ghost">
              <div className="card card-back static"><BackArt /></div>
            </div>
          )}
        </div>
        <p className="timeline-hint">
          {groups.length === 0
            ? 'Az első lap bárhova tehető'
            : '← régebbi · újabb →'}
        </p>
      </div>

      {/* ---- pakli + tálca ---- */}
      <div className="deck-row">
        <div className="deck" ref={deckRef} aria-hidden="true">
          <div className="card card-back static deck-c d1"><BackArt /></div>
          <div className="card card-back static deck-c d2"><BackArt /></div>
          <div className="card card-back static deck-c d3"><BackArt /></div>
        </div>
        {waiting &&
          (admin ? (
            <div className="action-grid" style={{ flex: 1 }}>
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
          ))}
        {placing && slot == null && (
          <>
            <div ref={trayCardRef} className="tray-card">{pendingCard(isMyTurn)}</div>
            <div className="hint">
              {isMyTurn
                ? 'Tartsátok rajta az ujjatokat és húzzátok az idővonalra!'
                : `A(z) ${current?.name} csapat épp helyezkedik…`}
            </div>
          </>
        )}
      </div>

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
          {admin ? (
            <GuessReview
              row={revealedRow}
              team={teams.find((t) => t.id === revealedRow.team_id)}
              inline
            />
          ) : (
            <>
              <BonusLine label="Cím" field="title_correct" guess={revealedRow.title_guess} row={revealedRow} />
              <BonusLine label="Előadó" field="artist_correct" guess={revealedRow.artist_guess} row={revealedRow} />
            </>
          )}
        </div>
      )}

      {/* ---- admin ---- */}
      {admin && !waiting && <AdminPlayer cardNumber={game.current_card} />}
      {admin && (
        <div className="admin-bar">
          <button
            className={`next-btn ${game.card_revealed ? 'ready' : ''}`}
            onClick={() => nextTurn(game, teams, placements)}
            disabled={!game.card_revealed}
          >
            Következő kör
          </button>
          <button
            className={`ghost pause-toggle ${pauseBtnHidden ? 'collapsed' : ''}`}
            onClick={() => setStatus(game.id, 'paused')}
          >
            Szünet
          </button>
          <button className="danger" onClick={() => setConfirmEnd(true)}>
            Vége
          </button>
        </div>
      )}


      {admin && guessRows.length > 0 && (
        <button className={`review-pill ${pendingCount ? 'has' : ''}`} onClick={() => setReviewOpen(true)}>
          📝 Tippek{pendingCount ? <span className="badge">{pendingCount}</span> : ' ✓'}
        </button>
      )}
      {admin && reviewOpen && (
        <div className="modal-overlay" onClick={() => setReviewOpen(false)}>
          <div className="modal review-modal" onClick={(e) => e.stopPropagation()}>
            <div className="spread">
              <h2 style={{ margin: 0 }}>Tippek bírálata</h2>
              <button className="ghost" onClick={() => setReviewOpen(false)}>Bezár</button>
            </div>
            <p className="dim small" style={{ margin: '6px 0 12px' }}>
              A gép javaslata már be van számolva – itt véglegesíted vagy felülírod.
            </p>
            <div className="stack">
              {guessRows.map((p) => (
                <GuessReview key={p.id} row={p} team={teams.find((t) => t.id === p.team_id)} />
              ))}
            </div>
          </div>
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

      {zoomCards && (
        <div className="zoom-overlay" onClick={() => setZoomCards(null)}>
          <div className="zoom-grid">
            {zoomCards.map((p, i) => (
              <div
                key={p.id}
                className="zoom-slot"
                style={{ transform: `rotate(${(i - (zoomCards.length - 1) / 2) * 3}deg)` }}
              >
                <FrontFace song={p.songs} styles={styles} />
              </div>
            ))}
          </div>
          <p className="dim small" style={{ textAlign: 'center' }}>Koppints bárhova a bezáráshoz</p>
        </div>
      )}

      <div className="table-fx" ref={tableFxRef} />

      {/* húzás közbeni "szellem" kártya az ujj alatt */}
      {(drag || flight) && (
        <div
          className={`drag-ghost ${flight ? 'flying' : ''}`}
          style={
            flight
              ? { left: flight.x, top: flight.y, '--fdx': `${flight.dx}px`, '--fdy': `${flight.dy}px` }
              : { left: drag.x, top: drag.y }
          }
          onTransitionEnd={() => setFlight(null)}
        >
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

// Azonos évszámú lapok paklija: enyhén elcsúsztatva, srégen egymáson
function CardStack({ cards, styles, onZoom }) {
  const n = cards.length
  return (
    <div
      className="card-stack"
      style={{ width: 96 + (n - 1) * 13, height: 120 + (n - 1) * 11 }}
      onClick={() => onZoom(cards)}
    >
      {cards.map((p, i) => (
        <div
          key={p.id}
          className="stack-item"
          style={{
            left: i * 13,
            top: i * 11,
            zIndex: i,
            transform: i === 0 ? 'none' : `rotate(${i % 2 ? 4 : -3}deg)`,
          }}
        >
          <FrontFace song={p.songs} styles={styles} />
        </div>
      ))}
    </div>
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

// Bónusz-sor a játékosoknak: a tippjük, az ítélet és hogy a mester elbírálta-e már
function BonusLine({ label, field, guess, row }) {
  const ok = row[field]
  const waiting = guess && row.bonus_reviewed === false
  return (
    <div className="bonus-line">
      <span className="dim">{label}:</span>
      <span className="bonus-guess">{guess ? `„${guess}”` : '—'}</span>
      <span className={`bonus-verdict ${ok ? 'on' : ''}`}>
        {ok ? '+1 pont ✓' : 'nincs pont'}
        {waiting && <span className="dim"> · a mester bírálja…</span>}
      </span>
    </div>
  )
}

// Mesteri bírálókártya: tipp vs. helyes válasz, a gép javaslata, Jár / Nem jár
function GuessReview({ row, team, inline }) {
  const fields = [
    { f: 'title_correct', label: 'Cím', guess: row.title_guess, answer: row.songs?.title },
    { f: 'artist_correct', label: 'Előadó', guess: row.artist_guess, answer: row.songs?.artists },
  ]
  const initial = () => Object.fromEntries(fields.filter((x) => x.guess).map((x) => [x.f, !!row[x.f]]))
  const [pick, setPick] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { setPick(initial()) }, [row.title_correct, row.artist_correct, row.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const changed = fields.some((x) => x.guess && pick[x.f] !== !!row[x.f])
  const reviewed = row.bonus_reviewed === true
  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      await reviewBonus(row, team, pick)
    } catch (e) {
      setErr(String(e.message || e).includes('bonus_reviewed') ? 'Futtasd le a schema_phase9.sql-t!' : 'Mentési hiba, próbáld újra.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`review-card ${inline ? 'inline' : ''} ${reviewed ? 'done' : ''}`}>
      {!inline && (
        <div className="review-head">
          <span className="dot" style={{ background: team?.color }} />
          <b>{team?.name}</b>
          <span className="dim small">#{row.card_number}</span>
          <span className="review-state">{reviewed ? 'elbírálva ✓' : 'bírálatra vár'}</span>
        </div>
      )}
      {fields.map((x) => (
        <div className="review-row" key={x.f}>
          <div className="review-text">
            <span className="dim small">{x.label}</span>
            <span className="review-guess">{x.guess ? `„${x.guess}”` : <i className="dim">nem tippeltek</i>}</span>
            <span className="small dim">helyes: <b className="answer">{x.answer}</b></span>
          </div>
          {x.guess && (
            <div className="verdict-seg">
              <button className={pick[x.f] ? 'on yes' : ''} onClick={() => setPick((p) => ({ ...p, [x.f]: true }))}>
                ✓ Jár{row[x.f] && !reviewed ? <small> gép</small> : null}
              </button>
              <button className={!pick[x.f] ? 'on no' : ''} onClick={() => setPick((p) => ({ ...p, [x.f]: false }))}>
                ✗ Nem jár{!row[x.f] && !reviewed ? <small> gép</small> : null}
              </button>
            </div>
          )}
        </div>
      ))}
      {(row.title_guess || row.artist_guess) && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary tiny" disabled={busy || (reviewed && !changed)} onClick={save}>
            {reviewed ? (changed ? 'Módosítás mentése' : 'Elbírálva ✓') : 'Elfogadom'}
          </button>
          {err && <span className="error small">{err}</span>}
        </div>
      )}
    </div>
  )
}
