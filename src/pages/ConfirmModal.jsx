import { useEffect } from 'react'

// Tematikus megerősítő ablak a böngésző natív confirm() helyett.
// Mindig mountolva marad, az `open` kapcsolja – így a be- ÉS kiúszás is animált.
export default function ConfirmModal({ open, title, text, confirmLabel = 'Lezárás', onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  return (
    <div className={`confirm-overlay ${open ? 'show' : ''}`} onClick={onCancel}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <svg className="confirm-rings" viewBox="0 0 80 80" aria-hidden="true">
          <circle cx="40" cy="40" r="30" stroke="#e63946" strokeWidth="3" fill="none"
            strokeDasharray="110 79" strokeLinecap="round" />
          <circle cx="40" cy="40" r="22" stroke="#f77f00" strokeWidth="3" fill="none"
            strokeDasharray="60 78" strokeLinecap="round" transform="rotate(150 40 40)" />
          <circle cx="40" cy="40" r="14" stroke="#2d7dd2" strokeWidth="3" fill="none"
            strokeDasharray="40 48" strokeLinecap="round" transform="rotate(260 40 40)" />
        </svg>
        <h2 style={{ margin: '10px 0 4px', textAlign: 'center' }}>{title}</h2>
        {text && <p className="dim small" style={{ textAlign: 'center', margin: '0 0 16px' }}>{text}</p>}
        <div className="row">
          <button className="ghost" style={{ flex: 1 }} onClick={onCancel}>Mégse</button>
          <button className="danger" style={{ flex: 1 }} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
