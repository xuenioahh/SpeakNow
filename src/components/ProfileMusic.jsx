import { useEffect, useRef, useState } from "react";
import { Music2, Pause, Play } from "lucide-react";

const TRACKS = [["Valley Sunset", "/profile-bgm-127.mp3"], ["Vastness", "/profile-bgm-292.mp3"], ["Hazy After Hours", "/profile-bgm-139.mp3"], ["Sleepy Cat", "/profile-bgm-135.mp3"], ["Tech House Vibes", "/profile-bgm-640.mp3"]];

export default function ProfileMusic() {
  const audio = useRef(null);
  const [track, setTrack] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = audio.current;
    return () => { element?.pause(); };
  }, []);
  return <details className="profile-panel profile-music">
    <summary><Music2 size={16} /> Background music <span>Optional</span></summary>
    <div className="profile-music-controls">
      <label>Track<select value={track} onChange={e => { audio.current?.pause(); setTrack(Number(e.target.value)); setError(""); }}>{TRACKS.map(([title], i) => <option key={title} value={i}>{title}</option>)}</select></label>
      <button type="button" className="profile-secondary-button" onClick={async () => { try { setError(""); if (playing) audio.current.pause(); else await audio.current.play(); } catch { setError("Audio could not play. Please try again."); } }}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? "Pause" : "Play"}</button>
      <label>Volume<input aria-label="Music volume" type="range" min="0" max="1" step="0.05" defaultValue="0.35" onChange={e => { audio.current.volume = Number(e.target.value); }} /></label>
    </div>
    <audio ref={audio} src={TRACKS[track][1]} preload="none" onLoadedMetadata={() => { audio.current.volume = 0.35; }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setError("This track is unavailable.")} />
    {error && <p role="alert">{error}</p>}
  </details>;
}
