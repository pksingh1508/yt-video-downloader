import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, CheckCheck, ChevronDown, CircleHelp, CircleCheck, Clock3, Copy, ExternalLink, Film, FolderDown, HardDrive, Link2, ListVideo, LoaderCircle, LockKeyhole, MonitorPlay, MoreHorizontal, Play, Plus, Scissors, ShieldCheck, Sparkles, Trash2, TriangleAlert, X as Close, Youtube } from 'lucide-react';
import { PROFILES, exportSchema, formatBytes, formatTime, parseTime, validateClip, isActive, type ExportOptions, type VideoInfo, type Job, type Health } from './shared';

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } }); }
  catch { throw new Error('Couldn’t connect to the local server. Check that the app is running and try again.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request failed. Please try again.');
  return body as T;
}

function readPreferences(): Pick<ExportOptions, 'profile' | 'quality' | 'aspect'> {
  const defaults = { profile: 'standard', quality: '720', aspect: 'original' } as const;
  try {
    return exportSchema.pick({ profile: true, quality: true, aspect: true }).parse(JSON.parse(localStorage.getItem('postready-preferences') || 'null'));
  } catch { return defaults; }
}

function XLogo({ className = '' }: { className?: string }) {
  return <svg className={className} width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-7.42L5.57 22H2.45l7.19-8.22L1.8 2h6.4l4.42 6.77L18.9 2Zm-1.1 18h1.73L7.26 3.88H5.4L17.8 20Z" /></svg>;
}

function App() {
  const [view, setView] = useState<'create' | 'downloads'>('create');
  const [url, setUrl] = useState('');
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preferences, setPreferences] = useState(readPreferences);
  const [startTime, setStartTime] = useState('0:00');
  const [endTime, setEndTime] = useState('2:20');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [connected, setConnected] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const guideRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentJob = jobs.find(job => job.id === jobId);
  const processing = Boolean(currentJob && isActive(currentJob));
  const completed = jobs.filter(job => job.status === 'completed');
  const options: ExportOptions = { ...preferences, videoToken: video?.token || '', start: parseTime(startTime), end: parseTime(endTime) };
  const clipError = video ? !Number.isFinite(options.start) || !Number.isFinite(options.end) ? 'Enter a time such as 1:30 or 0:05.' : validateClip(options, video) : null;
  const clipDuration = Number.isFinite(options.end - options.start) ? Math.max(0, options.end - options.start) : 0;
  const actualQuality = preferences.profile === 'premium' && clipDuration > 7200 ? '720' : preferences.quality;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const result = await api<Job[]>('/api/jobs');
        if (stopped) return;
        setJobs(result); setConnected(true);
        timer = setTimeout(refresh, result.some(isActive) ? 1500 : 5000);
      } catch {
        if (!stopped) { setConnected(false); timer = setTimeout(refresh, 5000); }
      }
    };
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);

  useEffect(() => {
    let stopped = false;
    const refresh = () => api<Health>('/api/health').then(value => { if (!stopped) setHealth(value); }).catch(() => { if (!stopped) setHealth(null); });
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);

  useEffect(() => { try { localStorage.setItem('postready-preferences', JSON.stringify(preferences)); } catch { /* Preferences still work in memory. */ } }, [preferences]);
  useEffect(() => {
    const dialog = guideRef.current;
    if (showGuide && dialog && !dialog.open) dialog.showModal();
    if (!showGuide && dialog?.open) dialog.close();
  }, [showGuide]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); }, [notice]);

  async function analyze(event?: React.FormEvent) {
    event?.preventDefault();
    if (!url.trim() || loading || processing) return;
    setError(''); setLoading(true); setJobId(null);
    try {
      const result = await api<VideoInfo>('/api/inspect', { method: 'POST', body: JSON.stringify({ url }) });
      setVideo(result); setUrl(result.url); setStartTime('0:00');
      setEndTime(formatTime(Math.min(Math.floor(result.duration), PROFILES[preferences.profile].maxDuration)));
    } catch (error) { setVideo(null); setError((error as Error).message); }
    finally { setLoading(false); }
  }

  async function paste() {
    try { setUrl(await navigator.clipboard.readText()); setError(''); inputRef.current?.focus(); }
    catch { setNotice('Clipboard access isn’t available. Paste your link into the field with ⌘V or Ctrl+V.'); inputRef.current?.focus(); }
  }

  async function startExport() {
    if (!video || clipError || starting || processing) return;
    setError(''); setStarting(true);
    try {
      const job = await api<Job>('/api/jobs', { method: 'POST', body: JSON.stringify(options) });
      setJobs(previous => [job, ...previous]); setJobId(job.id);
    } catch (error) { setError((error as Error).message); }
    finally { setStarting(false); }
  }

  async function cancelJob(id: string) {
    setBusyId(id);
    try { await api(`/api/jobs/${id}/cancel`, { method: 'POST' }); setJobs(await api<Job[]>('/api/jobs')); }
    catch (error) { setError((error as Error).message); }
    finally { setBusyId(null); }
  }

  async function deleteJob(id: string) {
    setBusyId(id);
    try {
      await api(`/api/jobs/${id}`, { method: 'DELETE' });
      setJobs(previous => previous.filter(job => job.id !== id));
      if (jobId === id) setJobId(null);
      setNotice('Export removed from your local library.');
    } catch (error) { setError((error as Error).message); }
    finally { setBusyId(null); }
  }

  function reset() {
    setView('create'); setVideo(null); setJobId(null); setUrl(''); setError('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="PostReady home"><span className="brand-mark">p<span /></span><span>PostReady<span className="brand-dot">.</span></span></a>
      <span className="nav-label">WORKSPACE</span>
      <nav aria-label="Main navigation">
        <button className={`nav-item ${view === 'create' ? 'active' : ''}`} onClick={() => { setView('create'); setError(''); }}><MonitorPlay size={18} /><span>Video downloader</span></button>
        <button className={`nav-item ${view === 'downloads' ? 'active' : ''}`} onClick={() => { setView('downloads'); setError(''); }}><FolderDown size={18} /><span>My downloads</span><span className="nav-count">{completed.length}</span></button>
      </nav>
      <div className="sidebar-note"><div className="note-icon"><XLogo /></div><h3>A better way to post.</h3><p>The right format.<br />The right size. Every time.</p><button onClick={() => setShowGuide(true)}>See how it works <ArrowRight size={14} /></button></div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setShowGuide(true)}><CircleHelp size={18} /><span>Help & upload guide</span><ExternalLink size={13} /></button><div className="local-account"><span className="avatar">Y</span><div><strong>Your workspace</strong><span>Local & private</span></div><LockKeyhole size={14} /></div></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span><strong>{view === 'create' ? 'Video downloader' : 'My downloads'}</strong></div><div className={`engine-status ${connected && health?.ready ? 'online' : 'offline'}`}><span className="status-dot" />{connected && health?.ready ? 'Ready to process' : !connected ? 'Connecting to server' : 'Setup required'}</div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow"><span /> YOUR NEXT POST STARTS HERE</div><h1>{view === 'create' ? <>Great videos. <span>Ready for X.</span></> : <>Your videos. <span>Ready to go.</span></>}</h1><p>{view === 'create' ? 'Turn any public YouTube video into a perfectly prepared MP4 for your timeline.' : 'Your recent exports, checked and ready for your next post.'}</p></div><div className="platform-flow" aria-hidden="true"><span className="youtube-tile"><Youtube size={29} fill="currentColor" stroke="white" /></span><span className="flow-dashes">···<ArrowRight size={16} />···</span><span className="x-tile"><XLogo /></span></div></div>

        <div className="workspace-tabs"><div role="tablist" aria-label="Workspace views"><button role="tab" aria-selected={view === 'create'} className={view === 'create' ? 'selected' : ''} onClick={() => { setView('create'); setError(''); }}><Plus size={16} />Create a video</button><button role="tab" aria-selected={view === 'downloads'} className={view === 'downloads' ? 'selected' : ''} onClick={() => { setView('downloads'); setError(''); }}><ListVideo size={16} />My downloads<span>{completed.length}</span></button></div><span className="workspace-badge"><LockKeyhole size={12} /> LOCAL WORKSPACE</span></div>

        {error && <div className="alert error" role="alert"><TriangleAlert size={18} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><Close size={16} /></button></div>}
        {connected && health && !health.ready && <div className="alert warning"><TriangleAlert size={18} /><span>Finish local setup to enable downloads. Run <code>npm run setup</code> in this project, then restart the server.</span></div>}

        {view === 'create' ? <>
          <section className="card link-card" aria-labelledby="link-heading"><div className="section-title"><span className="step-number">01</span><h2 id="link-heading">Add your YouTube link</h2><span className="subtle-pill">Videos & Shorts</span></div><form className="url-form" onSubmit={analyze}><div className="url-input"><Link2 size={19} /><input ref={inputRef} aria-label="YouTube video link" type="url" placeholder="Paste a YouTube video link here…" value={url} disabled={loading || processing} onChange={event => { setUrl(event.target.value); setError(''); }} required /><button className="paste-button" type="button" disabled={loading || processing} onClick={() => void paste()}><Copy size={13} />Paste</button></div><button className="primary analyze-button" type="submit" disabled={!url.trim() || loading || processing || !health?.ready}>{loading ? <LoaderCircle size={17} className="spin" /> : null}{loading ? 'Loading video' : 'Get video'}{!loading && <ArrowRight size={17} />}</button></form><p className="input-hint"><Youtube size={14} />Works with youtube.com, youtu.be, and YouTube Shorts links.</p></section>

          <div className="editor-grid"><div className="editor-column">
            <section className="card preview-card" aria-labelledby="preview-heading"><div className="section-title"><span className="step-number">02</span><h2 id="preview-heading">Preview & trim</h2><span className="muted">{video ? formatTime(video.duration) + ' source' : 'Choose your moment'}</span></div>
              {loading ? <div className="empty-preview loading-preview"><LoaderCircle className="spin" size={32} /><h3>Finding your video…</h3><p>Fetching the title, duration, and available formats.</p></div> : !video ? <div className="empty-preview"><div className="empty-art" aria-hidden="true"><span className="art-line line-one" /><span className="art-line line-two" /><div className="art-video"><div className="art-video-dots"><i /><i /><i /></div><span className="art-play"><Play size={23} fill="currentColor" /></span><div className="art-timeline"><span /><i /></div></div><span className="art-check"><Check size={17} /></span></div><h3>A good link goes a long way.</h3><p>Add a video above to preview it and pick<br className="desktop-break" /> the perfect clip for your audience.</p><span className="empty-label"><Film size={13} /> Your video will appear here</span></div> : <>
                <div className="video-preview">{currentJob?.status === 'completed' ? <video key={currentJob.id} controls playsInline preload="metadata" src={`/api/jobs/${currentJob.id}/file?preview=1`} poster={video.thumbnail} /> : <><img src={video.thumbnail} alt={`Thumbnail for ${video.title}`} /><a className="source-play" href={video.url} target="_blank" rel="noreferrer" aria-label="Watch source video on YouTube"><Play size={23} fill="currentColor" /></a><span className="preview-duration">{formatTime(video.duration)}</span><span className="source-label">SOURCE PREVIEW</span></>}</div>
                <div className="video-details"><h3>{video.title}</h3><div><span><Youtube size={14} />{video.channel}</span><a href={video.url} target="_blank" rel="noreferrer">View on YouTube<ExternalLink size={12} /></a></div></div>
                <div className="trim-editor"><div className="trim-heading"><label><Scissors size={15} />Select your clip</label><span>{formatTime(clipDuration)} selected</span></div><div className="clip-timeline" aria-hidden="true"><div className="clip-selection" style={{ left: `${Math.min(100, Math.max(0, options.start / video.duration * 100 || 0))}%`, width: `${Math.min(100, clipDuration / video.duration * 100)}%` }}><i /><i /></div></div><div className="timeline-labels"><span>0:00</span><span>{formatTime(video.duration)}</span></div><div className="trim-fields"><label>Start time<div><Clock3 size={14} /><input aria-label="Clip start time" value={startTime} onChange={event => setStartTime(event.target.value)} disabled={processing || starting} /></div></label><ArrowRight size={16} /><label>End time<div><Clock3 size={14} /><input aria-label="Clip end time" value={endTime} onChange={event => setEndTime(event.target.value)} disabled={processing || starting} /></div></label><button disabled={processing || starting} className="text-button" onClick={() => { setStartTime('0:00'); setEndTime(formatTime(Math.min(Math.floor(video.duration), PROFILES[preferences.profile].maxDuration))); }}>Reset clip</button></div>{clipError ? <p className="clip-error"><TriangleAlert size={14} />{clipError}</p> : <p className="trim-help">{video.duration > PROFILES[preferences.profile].maxDuration ? `The first ${formatTime(PROFILES[preferences.profile].maxDuration)} is selected. Adjust the times to choose a different moment.` : 'Your full video is selected. Adjust the times to keep just the part you want.'}</p>}</div>
              </>}
            </section>

            {currentJob && <section className={`card job-card ${currentJob.status}`} aria-live="polite"><div className="job-heading"><span className="job-icon">{currentJob.status === 'completed' ? <CheckCheck size={21} /> : isActive(currentJob) ? <LoaderCircle className="spin" size={21} /> : <TriangleAlert size={20} />}</span><div><h3>{currentJob.status === 'completed' ? 'Your video is ready for X.' : currentJob.status === 'failed' ? 'We couldn’t finish this export.' : currentJob.status === 'cancelled' ? 'Export cancelled.' : 'Preparing your next post…'}</h3><p>{currentJob.message}</p></div>{isActive(currentJob) && <button className="text-button" disabled={busyId === currentJob.id} onClick={() => void cancelJob(currentJob.id)}>Cancel</button>}</div>{isActive(currentJob) && <><div className="progress-track" role="progressbar" aria-label="Export progress" aria-valuenow={currentJob.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${currentJob.progress}%` }} /></div><div className="progress-stages"><span className={currentJob.status === 'downloading' ? 'current' : ''}>Downloading</span><span className={currentJob.status === 'converting' ? 'current' : ''}>Converting</span><span className={currentJob.status === 'verifying' ? 'current' : ''}>Checking</span><strong>{currentJob.progress}%</strong></div></>}{currentJob.status === 'completed' && currentJob.result && <><div className="result-specs"><span>{formatTime(currentJob.result.duration)}</span><span>{formatBytes(currentJob.result.size)}</span><span>{currentJob.result.width} × {currentJob.result.height}</span><span>MP4 · H.264 · AAC</span></div><div className="result-actions"><a className="primary" href={`/api/jobs/${currentJob.id}/file`} download><ArrowDownToLine size={17} />Download MP4</a><button className="secondary" onClick={reset}>Create another</button></div><p className="verified-note"><ShieldCheck size={14} />{currentJob.result.checks.length} compatibility checks passed</p></>}{(currentJob.status === 'failed' || currentJob.status === 'cancelled') && <button className="secondary retry-button" disabled={starting || Boolean(clipError)} onClick={() => void startExport()}>Try again<ArrowRight size={15} /></button>}</section>}

            <div className="privacy-note"><LockKeyhole size={14} /><span>Processed on your computer. Your videos stay yours.</span></div>
          </div>

          <aside className="export-column"><section className="card export-card" aria-labelledby="export-heading"><div className="section-title"><span className="step-number">03</span><h2 id="export-heading">Export settings</h2><MoreHorizontal size={19} className="muted" /></div><div className="export-controls"><label className="field-label" htmlFor="profile">Upload preset</label><div className="select-wrap"><XLogo /><select id="profile" value={preferences.profile} disabled={processing || starting} onChange={event => setPreferences(previous => ({ ...previous, profile: event.target.value as ExportOptions['profile'] }))}><option value="standard">X Standard</option><option value="premium">X Premium · web / iOS</option></select><ChevronDown size={14} /></div><p className="field-help">{PROFILES[preferences.profile].description}</p><div className="quality-label"><span className="field-label">Video quality</span><span>30 fps</span></div><div className="quality-picker">{(['720', '1080'] as const).map(quality => <button key={quality} aria-pressed={preferences.quality === quality} disabled={processing || starting} className={preferences.quality === quality ? 'chosen' : ''} onClick={() => setPreferences(previous => ({ ...previous, quality }))}><strong>{quality}p</strong><span>{quality === '720' ? 'Recommended' : 'Higher detail'}</span>{preferences.quality === quality && <CircleCheck size={14} />}</button>)}</div>{actualQuality !== preferences.quality && <p className="field-help">Clips over 2 hours are exported at 720p for X Premium.</p>}<span className="field-label aspect-label">Frame shape</span><div className="aspect-picker">{([{ value: 'original', label: 'Original', className: 'shape-original' }, { value: 'landscape', label: '16:9', className: 'shape-landscape' }, { value: 'square', label: '1:1', className: 'shape-square' }, { value: 'portrait', label: '9:16', className: 'shape-portrait' }] as const).map(aspect => <button key={aspect.value} aria-pressed={preferences.aspect === aspect.value} disabled={processing || starting} className={preferences.aspect === aspect.value ? 'chosen' : ''} onClick={() => setPreferences(previous => ({ ...previous, aspect: aspect.value }))}><span className={aspect.className} />{aspect.label}</button>)}</div><p className="field-help">{preferences.aspect === 'original' ? 'Keep the source’s shape. No cropping.' : 'Fit the entire video. Padding fills extra space.'}</p></div><div className="compatibility-box"><div className="compatibility-heading"><ShieldCheck size={16} /><strong>Built for X</strong><span>Auto-optimized</span></div><dl><div><dt>File format</dt><dd>MP4 <Check size={12} /></dd></div><div><dt>Video / audio</dt><dd>H.264 / AAC <Check size={12} /></dd></div><div><dt>Max. duration</dt><dd>{preferences.profile === 'standard' ? '2 min 20 sec' : 'Under 4 hours'} <Check size={12} /></dd></div><div><dt>Max. file size</dt><dd>{preferences.profile === 'standard' ? '512 MB' : '16 GB'} <Check size={12} /></dd></div></dl></div><div className="export-bottom"><button className="primary export-button" onClick={() => void startExport()} disabled={!video || Boolean(clipError) || processing || starting || !connected || !health?.ready}>{starting || processing ? <LoaderCircle size={17} className="spin" /> : <ArrowDownToLine size={17} />}{starting ? 'Starting export…' : processing ? 'Preparing video…' : 'Prepare for X'}{!starting && !processing && <ArrowRight size={16} />}</button><p>{video ? 'We’ll verify your MP4 before you download.' : 'Add a video link to get started.'}</p></div></section><div className="tip-card"><span><Sparkles size={16} /></span><div><strong>A little shorter. A lot stronger.</strong><p>A focused clip makes a great post. Keep the moment that matters.</p></div></div></aside></div>

          <section className="how-strip" aria-label="How PostReady works"><div><span className="how-icon"><Link2 size={19} /></span><div><h3>Paste a link</h3><p>Bring a video from YouTube.</p></div></div><ArrowRight className="how-arrow" size={16} /><div><span className="how-icon"><Scissors size={19} /></span><div><h3>Make it yours</h3><p>Choose your clip and frame.</p></div></div><ArrowRight className="how-arrow" size={16} /><div><span className="how-icon"><XLogo /></span><div><h3>Take it to your timeline</h3><p>Download. Upload. Hit post.</p></div></div></section>
        </> : <section className="downloads-section"><div className="downloads-heading"><div><h2>Your local library <span>{jobs.length}</span></h2><p>Files are automatically removed after 24 hours.</p></div><button className="primary" onClick={reset}><Plus size={16} />New video</button></div>{!jobs.length ? <div className="card downloads-empty"><span><FolderDown size={31} /></span><h3>A home for your next great post.</h3><p>Your prepared videos will appear here.<br />Start with a YouTube link to create your first export.</p><button className="secondary" onClick={reset}>Create a video<ArrowRight size={16} /></button></div> : <div className="download-list">{jobs.map(job => <article className="card download-row" key={job.id}><img className="download-thumbnail" src={job.video.thumbnail} alt="" /><div className="download-info"><h3>{job.video.title}</h3><p>{job.video.channel}<span>·</span>{new Date(job.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p><div className="download-meta"><span className={`job-status ${job.status}`}>{job.status === 'completed' ? <CircleCheck size={12} /> : isActive(job) ? <LoaderCircle size={12} className="spin" /> : <TriangleAlert size={12} />}{job.status === 'completed' ? 'Ready for X' : job.status.charAt(0).toUpperCase() + job.status.slice(1)}</span>{job.result ? <span>{formatBytes(job.result.size)}<i>·</i>{formatTime(job.result.duration)}<i>·</i>MP4</span> : isActive(job) ? <span>{job.progress}%</span> : <span className="download-error">{job.error || job.message}</span>}</div></div><div className="download-actions">{job.status === 'completed' && <a className="secondary" href={`/api/jobs/${job.id}/file`} download><ArrowDownToLine size={16} />Download</a>}{isActive(job) ? <button className="secondary" disabled={busyId === job.id} onClick={() => void cancelJob(job.id)}>Cancel</button> : <button className="icon-button" aria-label={`Delete export: ${job.video.title}`} disabled={busyId === job.id} onClick={() => void deleteJob(job.id)}><Trash2 size={17} /></button>}</div></article>)}</div>}</section>}

        <footer><span>Made for the moment you want to share.</span><div><span>Only download content you own or have permission to use.</span><button onClick={() => setShowGuide(true)}>Upload guide<ExternalLink size={12} /></button></div></footer>
      </main>
    </div>

    {notice && <div className="toast" role="status"><CircleCheck size={17} /><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}><Close size={14} /></button></div>}
    <dialog className="guide-dialog" ref={guideRef} onClose={() => setShowGuide(false)} onClick={event => { if (event.target === event.currentTarget) setShowGuide(false); }} aria-labelledby="guide-title"><div className="guide-content"><button className="dialog-close icon-button" aria-label="Close guide" onClick={() => setShowGuide(false)}><Close size={20} /></button><span className="guide-icon"><XLogo /></span><h2 id="guide-title">From link to timeline.</h2><p className="guide-intro">A few simple steps to make your next post ready.</p><ol><li><strong>Load a public YouTube video.</strong><p>Paste a watch, Shorts, or youtu.be link. Private, live, and restricted videos may not be available.</p></li><li><strong>Pick the part you want to share.</strong><p>Use start and end times in m:ss or h:mm:ss. Standard keeps clips within 2:20 and 512 MB. Premium allows longer clips for web and iOS uploads.</p></li><li><strong>Prepare and download your MP4.</strong><p>PostReady downloads your section, converts to H.264 and AAC, and verifies upload limits and playback. Conversion can take a few minutes.</p></li><li><strong>Upload it to X.</strong><p>Open X, create a post, choose your downloaded MP4 with the media button, and publish when you’re ready.</p></li></ol><div className="guide-note"><ShieldCheck size={18} /><p>Our presets follow X’s published web upload limits. Account eligibility, content restrictions, and platform changes can still affect uploads. Files stay on this computer and expire after 24 hours.</p></div><a className="secondary" href="https://help.x.com/en/using-x/x-videos" target="_blank" rel="noreferrer">X’s official upload requirements<ExternalLink size={14} /></a></div></dialog>
  </div>;
}

export default App;
