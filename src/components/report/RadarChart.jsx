import { hasReportedScore, displayScore, displayRecordDate } from '@/lib/reportDisplay';
import { useId, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Radar, RadarChart as RechartsRadar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Text } from 'recharts';

export default function RadarChart({ scores, maxScore = 9, history = [] }) {
  const [chartWidth, setChartWidth] = useState(0);
  const [selected, setSelected] = useState(null);
  const reduced = useReducedMotion();
  const gradient = useId().replace(/:/g, '');
  const data = Object.entries(scores || {}).map(([key, value]) => ({ subject: key, score: hasReportedScore(value) ? Number(value) : null, label: displayScore(value), fullMark: maxScore }));
  const canDraw = data.length >= 3 && data.every(item => item.score !== null && item.score >= 0 && item.score <= maxScore);
  const metric = data.find(item => item.subject === selected);
  const trend = history.filter(session => {
    const value = session.report?.scores?.[selected];
    return hasReportedScore(value) && Number(value) >= 0 && Number(value) <= maxScore && !session.report?.fallback_reason && session.report?.source === 'measured' && Number.isFinite(new Date(session.created_date).getTime());
  }).sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime()).slice(-5);
  return <section className="skill-radar" aria-label="Skill scores">
    <div className="w-full h-64" role="img" aria-label={data.map(item => `${item.subject}: ${item.score === null ? "not available" : item.label + " out of " + maxScore}`).join(', ')}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} onResize={width => setChartWidth(current => current === Math.round(width) ? current : Math.round(width))}>
        <RechartsRadar cx="50%" cy="50%" outerRadius={chartWidth ? Math.max(40, Math.min(chartWidth / 2 - 72, 88)) : "60%"} data={data}>
          <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c5a7ff" stopOpacity={0.48} /><stop offset="100%" stopColor="#8061ce" stopOpacity={0.14} /></linearGradient></defs>
          <PolarGrid stroke="rgba(205,190,232,0.14)" />
          <PolarAngleAxis dataKey="subject" tick={({ x, y, textAnchor, payload }) => <Text x={x} y={y} textAnchor={textAnchor} verticalAnchor="middle" width={64} maxLines={3} breakAll fontSize={11} fill="#c7bdd8">{payload.value}</Text>} />
          <PolarRadiusAxis angle={90} domain={[0, maxScore]} tick={{ fill: '#b0a6c0', fontSize: 9 }} />
          <Tooltip formatter={value => [`${displayScore(value)} / ${maxScore}`, 'Score']} allowEscapeViewBox={{ x: false, y: false }} contentStyle={{ background: '#25202f', border: '1px solid #aa8bd540', borderRadius: 12, color: '#ede5f8' }} />
          {canDraw && <Radar name="Score" dataKey="score" stroke="#bca1ef" fill={`url(#${gradient})`} strokeWidth={2} dot={({ cx, cy, payload }) => <circle key={payload.subject} cx={cx} cy={cy} r={selected === payload.subject ? 5 : 3} fill={selected === payload.subject ? '#f1e4ff' : '#d4bcff'} stroke={selected === payload.subject ? '#aa85ee' : 'transparent'} strokeWidth={2} />} isAnimationActive={!reduced} animationDuration={450} />}
        </RechartsRadar>
      </ResponsiveContainer>
    </div>
    {!canDraw && <p className="skill-chart-notice">The chart needs complete scores within the recorded scale. Available values are listed below.</p>}
    <div className="skill-dimensions" aria-label="Select a skill">{data.map(item => <button type="button" key={item.subject} aria-pressed={selected === item.subject} onClick={() => setSelected(selected === item.subject ? null : item.subject)}>{item.subject} <strong>{item.label}</strong></button>)}</div>
    <div className="skill-detail" aria-live="polite">{metric ? <><strong>{metric.subject}: {metric.label} / {maxScore}</strong>{trend.length ? <div className="skill-history">{trend.map((session, i) => <span key={session.id || i}>{displayRecordDate(session.created_date)}: <b>{session.report.scores[selected]}</b></span>)}</div> : <p>No comparable saved scores for this dimension yet.</p>}</> : 'Explore a dimension. Exact scores stay on the original scale.'}</div>
  </section>;
}
