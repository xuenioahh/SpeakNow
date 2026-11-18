import { Link } from 'react-router-dom';
import '@/learning.css';
export default function MainLanding() {
  return <main className="learning-page core-home"><header className="home-intro"><h1>Choose your practice</h1><p>Start with an exam task or an everyday conversation.</p></header><div className="direction-grid">
      <Link to="/exam" className="direction-card exam-direction"><span className="direction-number">01</span><h2>Exam Practice</h2><p>TOEFL &amp; IELTS Speaking</p><span className="direction-link">Choose an exam →</span></Link>
      <Link to="/voice" className="direction-card daily-direction"><span className="direction-number">02</span><h2>Daily Conversation</h2><p>Practise real-life situations.</p><span className="direction-link">Choose a situation →</span></Link>
    </div>
    <p className="home-secondary"><Link to="/presentation">Presentation practice</Link><span>·</span><Link to="/voice/casual-video">Expression Lab</Link></p>
  </main>;
}
