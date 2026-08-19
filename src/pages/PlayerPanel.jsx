import { youtubeId } from '../lib/lookup.js'

// A játékmester lejátszó-panelje: csak az admin eszközén jelenik meg.
// A YouTube-nak csak a videó-azonosítót adjuk át, így a linkben lévő
// &list=... rádió-paraméterek nem tudnak a szám után véletlen zenét indítani.
export default function PlayerPanel({ song }) {
  const yt = song.source_type === 'youtube' ? youtubeId(song.url) : null

  return (
    <div className="secret">
      <div className="label">Csak neked · #{song.card_number}</div>
      <div style={{ margin: '4px 0 10px' }}>
        <b>{song.artists}</b> – {song.title} <b>({song.year})</b>
      </div>
      {yt ? (
        <iframe
          className="player"
          src={`https://www.youtube.com/embed/${yt}?playsinline=1&rel=0`}
          title="Lejátszó"
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      ) : (
        <iframe
          className="player"
          src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(song.url)}&color=%2300aeef&show_comments=false`}
          title="Lejátszó"
          allow="autoplay"
        />
      )}
      <p className="small dim" style={{ margin: '8px 0 0' }}>
        Nyomd meg a lejátszást, a hang a te eszközödön szól. Körváltáskor magától leáll.
      </p>
    </div>
  )
}
