import { Link } from 'react-router-dom';
import { TOEFL_TASK_TYPES, IELTS_TASK_TYPES, questionBankPath } from '../../shared/questionBank';
import '@/learning.css';
import { bankAccess } from '@/lib/bankAccess';
import { getSpeakingTask } from '../../shared/speakingTasks';
import { examPath } from '../../shared/questionBank';
export default function ExamSpeaking({ exam = 'toefl' }) {
  const ielts = exam === 'ielts';
  const types = ielts ? IELTS_TASK_TYPES : TOEFL_TASK_TYPES;
  return <main className="learning-page selection-page"><header><Link to="/">← Home</Link><Link to="/progress">My Progress</Link></header>
    <nav className="exam-switch" aria-label="Speaking exam"><Link to="/exam" aria-current={!ielts ? 'page' : undefined}>TOEFL</Link><Link to="/exam/ielts" aria-current={ielts ? 'page' : undefined}>IELTS</Link></nav>
    <h1>{ielts ? 'IELTS Speaking' : 'TOEFL Speaking'}</h1>
    {ielts && <p className="learning-muted exam-season">September–December 2026 · New, retained and familiar topics</p>}
    {ielts && <section className="mock-choice"><div><p className="learning-kicker">Full IELTS Mock Test</p><h2>Parts 1, 2 and 3</h2><p>Complete the full speaking test, then review your answers.</p></div><Link className="learning-button primary" to={examPath(getSpeakingTask(bankAccess.fullMockTaskId))}>Start Full Mock Test</Link></section>}
    {ielts && <h2 className="quick-practice-title">Quick Practice</h2>}
    <div className={`task-type-grid${ielts ? ' ielts-types' : ''}`}>{types.map(type => <Link className="task-type-card" key={type.id} to={questionBankPath(type.id)}><h2>{type.title}</h2><p>{type.description}</p></Link>)}</div>
  </main>;
}
