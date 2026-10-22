import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AUDIENCES, contextFromSetup } from './contracts'
import { listLinkedPractices, readRecording, getPractice } from './storage'
import { requestImpact } from './client'


function RecordingReplay({ id = '', legacyUrl = '' }) {
  const [url, setUrl] = useState(legacyUrl || '')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!id) return undefined
    let active = true
    let objectUrl
    readRecording(id).then((blob) => {
      if (!active) return
      if (blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) }
      else setError('This recording is no longer available on this device.')
    }).catch(() => { if (active) setError('This browser could not read the saved recording.') })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [id])
  function playExclusive(event) {
    document.querySelectorAll('.impact-replay video').forEach((video) => {
      if (video !== event.currentTarget && video instanceof HTMLVideoElement) video.pause()
    })
  }
  return <div className="impact-replay">
    {url && <video controls playsInline src={url} aria-label="Practice recording" onPlay={playExclusive} onError={() => setError('The saved recording could not be played in this browser.')} />}
    {error && <p role="status">{error}</p>}
  </div>
}

function MomentCard({ moment, primary = false, onPractice, canPractice = true }) {
  return <article className={primary ? 'impact-moment primary' : 'impact-moment'}>
    <p className="eyebrow">{primary ? 'Primary Improvement · AI Coaching Suggestion' : 'Secondary Improvement · AI Coaching Suggestion'}</p>
    <h3>{moment.category}</h3>
    <span className="impact-label">Original sentence · transcript excerpt</span>
    <blockquote>{moment.originalText}</blockquote>
    <h4>Why It Matters</h4><p>{moment.explanation}</p><p>{moment.audienceImpact}</p>
    <h4>Suggested priority · not independently confirmed</h4><p>{moment.priorityReason}</p>
    <h4>How to Improve</h4><p>{moment.instruction}</p>
    {moment.suggestedRevision && <details><summary>Suggested Version · optional example</summary><p>{moment.suggestedRevision}</p></details>}
    <h4>Practice objective · 30–60 seconds</h4><p>{moment.practiceObjective}</p>
    <Button type="button" className="primary-button" disabled={!canPractice} onClick={() => onPractice(moment)}>Practice This Moment</Button>
  </article>
}

function Comparison({ session, metadata, comparison }) {
  const [original, setOriginal] = useState(null)
  useEffect(() => { let active = true; getPractice(metadata.parentPracticeId).then(value => { if (active) setOriginal(value) }).catch(() => {}); return () => { active = false } }, [metadata.parentPracticeId])
  const originalMetadata = original?.report?.impact
  return <article className="report-setup-card impact-comparison">
    <p className="eyebrow">Before / After</p>
    <h3>{comparison?.improvementStatus || 'Comparison pending'}</h3><p>AI Coaching Suggestion: this comparison is the model’s judgement of the two texts. It is not confirmed learning improvement or a human evaluation.</p>
    <p>Target: {metadata.target.category} · {metadata.target.practiceObjective}</p>
    <div className="impact-compare-grid">
      <div><h4>Before · original moment</h4><blockquote>{metadata.target.originalText}</blockquote></div>
      <div><h4>After · your actual attempt</h4><blockquote>{session.transcript || 'No transcript captured.'}</blockquote></div>
    </div>
    <details><summary>Replay Before / After · full recordings, no sentence timing</summary>
      <h4>Before · original presentation recordings</h4>
      {originalMetadata?.recordingIds?.map((id) => <RecordingReplay key={id} id={id} />)}
      {!originalMetadata?.recordingIds?.length && original?.presentationRecordingDataUrl && <RecordingReplay legacyUrl={original.presentationRecordingDataUrl} />}
      {!originalMetadata?.recordingIds?.length && !original?.presentationRecordingDataUrl && <p>No saved original recording is available.</p>}
      <h4>After · this attempt only</h4>
      {metadata.recordingIds?.map((id) => <RecordingReplay key={id} id={id} />)}
      {!metadata.recordingIds?.length && <p>No saved recording is available for this attempt.</p>}
    </details>
    {comparison && <>
      <p>{comparison.explanation}</p>
      <p><strong>Meaning & accuracy:</strong> {comparison.accuracyNote}</p>
      <p><strong>Audience fit:</strong> {comparison.audienceFit}</p>
      {comparison.beforeEvidence && <p>Before evidence: “{comparison.beforeEvidence}”</p>}
      {comparison.afterEvidence && <p>After evidence: “{comparison.afterEvidence}”</p>}
      {comparison.remainingIssue && <p>Next: {comparison.remainingIssue}</p>}
    </>}
    <Link className="secondary-button" to={`/presentation/report?session=${metadata.parentPracticeId}`}>Return to Original / Retry</Link>
  </article>
}

export default function ImpactReport({ session: savedSession }) {
  const session = { ...savedSession, transcript: savedSession.report?.impact?.transcript }
  const navigate = useNavigate()
  const [metadata, setMetadata] = useState(() => savedSession.report.impact)
  const context = metadata?.context || contextFromSetup()
  const [audience, setAudience] = useState(context.targetAudience)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [linked, setLinked] = useState([])
  const inFlight = useRef(false)
  const active = useRef(true)

  async function analyze() {
    if (inFlight.current) return
    if (!session.transcript?.trim()) { setError('There is no actual transcript to analyze. Record another attempt.'); return }
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const nextSession = await requestImpact(session.id)
      if (active.current) { setMetadata(nextSession.report.impact); setLinked(await listLinkedPractices(session.id)) }
    } catch (err) { if (active.current) setError(err.message || 'Analysis failed. Please retry.') }
    finally { inFlight.current = false; if (active.current) setBusy(false) }
  }

  useEffect(() => {
    active.current = true
    // Defer to avoid effects changing state during render; single-flight survives StrictMode.
    const timer = setTimeout(() => {
      if (!savedSession.report.impact.analysis && !savedSession.report.impact.comparison) analyze()
      listLinkedPractices(session.id).then(value => { if (active.current) setLinked(value) }).catch(() => {})
    }, 0)
    return () => { active.current = false; clearTimeout(timer) }
    // Session-scoped component is keyed by session.id in ReportPage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  function practice(moment) {
    if (audience !== context.targetAudience) return;
    const originalMetadata = metadata
    navigate('/presentation/practice', { state: { impactPractice: { context: { ...originalMetadata.context }, kind: 'moment', parentPracticeId: session.id, targetId: moment.id, target: moment } } })
  }

  const view = metadata?.analysis?.audiences?.find((item) => item.audienceType === audience)
  const isComparison = metadata?.kind === 'moment'
  return <>
    <article className="report-setup-card impact-summary">
      <p className="eyebrow">SpeakNow Impact Studio</p>
      <h3>Your presentation · one change to practise</h3>
      <p className="impact-slogan">Prepare your important presentation and improve the parts that matter.</p>
      <p>{isComparison ? 'See whether this attempt addresses your original practice objective.' : 'Focus on the one moment worth fixing first, then practice it in your own words.'}</p>
      <p><strong>Your core message:</strong> {context.coreMessage || 'Not configured in this older practice.'}</p>
      <p><strong>Desired outcome:</strong> {context.desiredOutcome || 'Not configured in this older practice.'}</p>
      <p><strong>Intended audience:</strong> {context.targetAudience} Audience {context.audienceDescription && `· ${context.audienceDescription}`}</p>
      {metadata?.inputSource === 'typed' && <p>Text fallback: this feedback evaluates your typed practice text. It does not establish what was spoken in the recording.</p>}
      {metadata?.inputSource === 'mixed' && <p>This practice combines transcribed speech and text fallback. Coaching evaluates the supplied text; spoken delivery is not assessed.</p>}
      {!isComparison && <div className="impact-audiences" role="group" aria-label="Analyze the same transcript for another audience">
        {AUDIENCES.map((type) => <Button type="button" key={type} className={audience === type ? 'secondary-button active' : 'secondary-button'} aria-pressed={audience === type} onClick={() => setAudience(type)}>{type}</Button>)}
      </div>}
      {busy && <p role="status">{isComparison ? 'Comparing your actual attempts…' : 'Reading transcript evidence and analyzing all three audience perspectives…'}</p>}
      {error && <div role="alert"><p>{error}</p><Button type="button" disabled={busy} className="secondary-button" onClick={analyze}>Retry Analysis</Button></div>}
      {!!metadata?.analysis?.rejectedEvidence && <p>Some feedback was omitted because its quote or suggested numerical claim could not be verified.</p>}
    </article>

    <article className="report-setup-card"><h3>Recorded evidence</h3><p>Saved duration: {savedSession.duration_seconds}s · source: {metadata.inputSource}. Duration is browser timing, not a delivery score. The transcript is recognized or supplied text; check it against the recording.</p></article>
    {isComparison && <Comparison session={session} metadata={metadata} comparison={metadata.comparison} />}
    {view && <article className="report-setup-card impact-surgeon">
      <h3>The one thing worth fixing first · {audience} Audience</h3><p>AI Coaching Suggestion. Check whether it serves your goal and audience before practising it.</p>{audience !== context.targetAudience && <p>For a comparable retry, return to the intended {context.targetAudience} Audience. Use the separate audience practice action to change listeners.</p>}
      {view.primary ? <MomentCard moment={view.primary} primary canPractice={audience === context.targetAudience} onPractice={practice} /> : <p>No strong improvement priority identified. This does not mean the presentation has no issues.</p>}
      {!!view.secondary.length && <details><summary>Secondary improvements ({view.secondary.length})</summary>{view.secondary.map((moment) => <MomentCard key={moment.id} moment={moment} canPractice={audience === context.targetAudience} onPractice={practice} />)}</details>}
      <h4>Listen to the original practice</h4>
      <p>Review this section. No reliable sentence timestamps are available. Use the full recording controls below; the quote above comes from your transcript.</p>
      {metadata?.recordingIds?.map((id, index) => <div key={id}><p>Recording {index + 1}</p><RecordingReplay id={id} /></div>)}
      {!metadata?.recordingIds?.length && session.presentationRecordingDataUrl && <RecordingReplay legacyUrl={session.presentationRecordingDataUrl} />}
      {!metadata?.recordingIds?.length && !session.presentationRecordingDataUrl && <p>No saved recording is available for this practice.</p>}
      {metadata?.mediaWarning && <p role="status">{metadata.mediaWarning}</p>}
    </article>}

    {view && <article className="report-setup-card impact-audience-report">
      <p className="eyebrow">One Idea, Three Audiences</p><h3>Audience Adaptation · {audience}</h3>
      <p>These are model-generated coaching perspectives on the same original transcript, not measured audience reactions.</p>
      <h4>What works</h4>
      {view.strengths.length ? view.strengths.map((item, i) => <div key={i} className="impact-evidence"><blockquote>{item.originalText}</blockquote><p>{item.explanation}</p>{item.suggestion && <p>{item.suggestion}</p>}</div>) : <p>No specific strength was confidently supported by quoted evidence.</p>}
      <h4>Message Impact Feedback</h4>
      {view.dimensions.map((item) => <div className="impact-evidence" key={item.dimension}><strong>{item.dimension}</strong><blockquote>{item.originalText}</blockquote><p>{item.explanation}</p></div>)}
      {view.improvementAreas.map((item, i) => <div className="impact-evidence" key={i}><blockquote>{item.originalText}</blockquote><p>{item.explanation}</p><p>{item.suggestion}</p></div>)}
      <Button type="button" className="primary-button" onClick={() => navigate('/presentation', { state: { impactContext: { ...context, targetAudience: audience, audienceDescription: audience === context.targetAudience ? context.audienceDescription : '' }, parentPracticeId: session.id, kind: 'audience' } })}>Practice this idea for {audience} Audience</Button>
      <p>Keep your core message and outcome. Describe the new audience and deliver a new presentation yourself.</p>
    </article>}

    {!!linked.length && <article className="report-setup-card"><h3>Linked practice attempts</h3>{linked.map((attempt, index) => <p key={attempt.practiceId}><Link to={`/presentation/report?session=${attempt.practiceId}`}>Attempt {index + 1} · {attempt.context?.targetAudience} · {attempt.comparison ? `AI comparison · ${attempt.comparison.improvementStatus}` : (attempt.kind === 'audience' ? 'Audience switch' : 'View comparison')}</Link></p>)}</article>}
    <article className="report-setup-card"><details><summary>{metadata?.inputSource === 'typed' ? 'Actual typed practice text' : 'Practice transcript'}</summary><p className="impact-transcript">{session.transcript || 'No transcript captured.'}</p></details></article>
    {!view && metadata?.recordingIds?.length > 0 && <article className="report-setup-card"><h3>Practice Replay</h3>{metadata.recordingIds.map((id) => <RecordingReplay key={id} id={id} />)}</article>}
  </>
}
