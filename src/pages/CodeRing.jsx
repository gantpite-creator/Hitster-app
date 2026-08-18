// A fizikai kártyahát gyűrű-motívuma: a szobakód köré rajzolt színes ívek
export default function CodeRing({ code }) {
  const arcs = [
    { r: 96, c: '#e63946', from: 20, to: 150 },
    { r: 96, c: '#2d7dd2', from: 200, to: 330 },
    { r: 84, c: '#f77f00', from: 300, to: 80 },
    { r: 84, c: '#ffd166', from: 120, to: 200 },
    { r: 72, c: '#7b5ea7', from: 60, to: 250 },
    { r: 72, c: '#00aeef', from: 270, to: 350 },
  ]
  const polar = (r, deg) => {
    const rad = (deg * Math.PI) / 180
    return [105 + r * Math.cos(rad), 105 + r * Math.sin(rad)]
  }
  const arcPath = ({ r, from, to }) => {
    const [x1, y1] = polar(r, from)
    const end = to < from ? to + 360 : to
    const [x2, y2] = polar(r, end)
    const large = end - from > 180 ? 1 : 0
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
  }
  return (
    <div className="code-ring" aria-label={`Szobakód: ${code}`}>
      <svg viewBox="0 0 210 210" width="210" height="210" aria-hidden="true">
        {arcs.map((a, i) => (
          <path key={i} d={arcPath(a)} stroke={a.c} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        ))}
      </svg>
      <span className="code">{code}</span>
    </div>
  )
}
