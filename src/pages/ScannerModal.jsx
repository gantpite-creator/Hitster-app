import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { findSongByScan } from '../lib/lookup.js'

// Kamerás QR-olvasó a játékmesternek. HTTPS (vagy localhost) alatt működik.
export default function ScannerModal({ placements, onPlay, onClose }) {
  const videoRef = useRef(null)
  const [msg, setMsg] = useState('Tartsd a kártya QR-oldalát a keretbe')
  const [err, setErr] = useState('')
  const holdRef = useRef(false) // találat feldolgozása közben ne olvassunk újra

  useEffect(() => {
    let stream
    let raf
    let live = true
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let lastCheck = 0

    const tick = async (ts) => {
      if (!live) return
      raf = requestAnimationFrame(tick)
      const video = videoRef.current
      if (!video || video.readyState < 2 || holdRef.current) return
      if (ts - lastCheck < 160) return // ~6 ellenőrzés/mp bőven elég
      lastCheck = ts

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })
      if (!qr?.data) return

      holdRef.current = true
      setMsg('Kód beolvasva, keresem a zenét…')
      try {
        const song = await findSongByScan(qr.data)
        if (!song) {
          setMsg('Ismeretlen QR-kód – ez nincs az adatbázisban')
        } else if (placements.some((p) => p.card_number === song.card_number)) {
          setMsg(`A #${song.card_number} lap már kijátszva ebben a játékban`)
        } else {
          onPlay(song)
          return // a szülő bezárja a modalt
        }
      } catch {
        setMsg('Hálózati hiba a kereséskor, próbáld újra')
      }
      setTimeout(() => {
        holdRef.current = false
        setMsg('Tartsd a kártya QR-oldalát a keretbe')
      }, 1800)
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (!live) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const video = videoRef.current
        video.srcObject = s
        video.play()
        raf = requestAnimationFrame(tick)
      })
      .catch(() => {
        setErr(
          'Nem érem el a kamerát. Engedélyezd a böngészőben, és figyelj rá, hogy ' +
          'HTTPS-en (vagy localhost-on) fusson az app – http://192.168… címen a kamera le van tiltva.'
        )
      })

    return () => {
      live = false
      if (raf) cancelAnimationFrame(raf)
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [placements, onPlay])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Kártya beolvasása</h2>
        {err ? (
          <p className="error small">{err}</p>
        ) : (
          <>
            <div className="scan-frame">
              <video ref={videoRef} playsInline muted />
            </div>
            <p className="small dim" style={{ textAlign: 'center' }}>{msg}</p>
          </>
        )}
        <button className="ghost wide" onClick={onClose}>Mégse</button>
      </div>
    </div>
  )
}
