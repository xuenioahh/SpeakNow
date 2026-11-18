import { Link } from 'react-router-dom';
import '@/learning.css';
export default function MainLanding() {
  return <main className="learning-page core-home"><header className="home-intro"><p className="home-eyebrow">A place to practise speaking</p><h1>Find your words.<br />Make them yours.</h1><p>A conversation for today. Preparation for what comes next.</p></header><div className="direction-grid">
      <Link to="/exam" className="direction-card exam-direction"><span className="direction-category">For your next exam</span><h2>Exam Practice</h2><p>Work through TOEFL and IELTS questions, then return to the answers you want to improve.</p><span className="direction-link">Choose an exam <span aria-hidden="true">↗</span></span></Link>
      <Link to="/voice" className="direction-card daily-direction"><span className="direction-category">For everyday life</span><h2>Daily Conversation</h2><p>Pick a place, meet your conversation partner and see where the conversation takes you.</p><span className="direction-link">Find a conversation <span aria-hidden="true">↗</span></span></Link>
    </div>
    <p className="home-secondary"><Link to="/presentation">Presentation practice</Link><span>·</span><Link to="/voice/casual-video">Expression Lab</Link></p>
  </main>;
}
