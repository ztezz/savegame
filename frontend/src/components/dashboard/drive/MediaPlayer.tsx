import React, { useRef, useState } from 'react';
import { Download, File, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { formatDuration } from './driveUtils';

type Props = {
  src: string;
  title: string;
  type: 'video' | 'audio';
};

const MediaPlayer: React.FC<Props> = ({ src, title, type }) => {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);

  const togglePlay = async () => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) {
      await media.play();
      setPlaying(true);
    } else {
      media.pause();
      setPlaying(false);
    }
  };

  const seek = (value: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = value;
    setCurrentTime(value);
  };

  const changeVolume = (value: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.volume = value;
    media.muted = value === 0;
    setVolume(value);
    setMuted(value === 0);
  };

  const toggleMute = () => {
    const media = mediaRef.current;
    if (!media) return;
    media.muted = !media.muted;
    setMuted(media.muted);
  };

  const controls = <div className="rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
    <div className="mb-3 min-w-0">
      <p className="truncate text-sm font-black text-slate-900 dark:text-white">{title}</p>
      <p className="text-xs font-semibold text-slate-500">{formatDuration(currentTime)} / {formatDuration(duration)}</p>
    </div>
    <input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={(e) => seek(Number(e.target.value))} className="w-full accent-indigo-600" />
    <div className="mt-3 flex items-center gap-3">
      <button type="button" onClick={togglePlay} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-none">
        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
      </button>
      <button type="button" onClick={toggleMute} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
        {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <input type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} onChange={(e) => changeVolume(Number(e.target.value))} className="w-28 accent-indigo-600" />
      <a href={src} download={title} className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />Tải</a>
    </div>
  </div>;

  return <div className={type === 'video' ? 'flex min-h-[65vh] items-center justify-center' : 'flex min-h-[420px] items-center justify-center'}>
    {type === 'video' ? <div className="w-full max-w-5xl space-y-4"><video ref={mediaRef} src={src} className="max-h-[62vh] w-full rounded-3xl bg-black shadow-2xl" onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)} onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />{controls}</div> : <div className="w-full max-w-2xl rounded-3xl bg-gradient-to-br from-indigo-50 to-violet-50 p-8 shadow-sm dark:from-slate-900 dark:via-indigo-950/60 dark:to-violet-950/60"><audio ref={mediaRef} src={src} onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)} onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} /><div className="mb-6 flex justify-center"><div className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-indigo-600 shadow-lg dark:bg-slate-800 dark:text-indigo-300"><File className="h-12 w-12" /></div></div>{controls}</div>}
  </div>;
};

export default MediaPlayer;
