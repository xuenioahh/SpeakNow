import { Link } from 'react-router-dom';
import '@/learning.css';
export default function MainLanding() {
  return <main className="learning-page core-home"><header className="home-intro"><h1>Speaking practice</h1></header><div className="direction-grid">
      <Link to="/exam" className="direction-card exam-direction"><h2>Exam Practice</h2><p>Choose an IELTS or TOEFL topic, or take a timed mock exam.</p><span className="direction-link">Choose an exam <span aria-hidden="true">↗</span></span></Link>
      <Link to="/voice" className="direction-card daily-direction"><h2>Daily Conversation</h2><p>Choose a 3D scene and practise a conversation with an AI partner.</p><span className="direction-link">Find a conversation <span aria-hidden="true">↗</span></span></Link>
    </div>
    <p className="home-secondary"><Link to="/presentation">Presentation practice</Link><span>·</span><Link to="/voice/casual-video">Expression Lab</Link></p>
  </main>;
}
