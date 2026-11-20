export default function ExamRubricGuide({ rubric }) {
  if (!rubric) return null;
  return <details className="exam-rubric-guide">
    <summary>{rubric.title}</summary>
    <p>{rubric.scale}</p>
    <dl>{rubric.benchmarks.map(([label, explanation]) => <div key={label}>
      <dt>{label}</dt><dd>{explanation}</dd>
    </div>)}</dl>
    <p>{rubric.audio}</p>
    <a href={rubric.source} target="_blank" rel="noreferrer">Read the official scoring guide</a>
  </details>;
}
