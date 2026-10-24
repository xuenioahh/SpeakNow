import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import BottomNav from '@/components/BottomNav';
import '@/learning.css';
export default function MainLanding() {
  const {
    user,
    isAdmin,
    logout
  } = useAuth();
  return <main className="learning-page"><header><strong>SpeakNow</strong><div>{user ? <><Link to="/profile">{user.full_name}</Link> · <button onClick={() => logout()}>Sign out</button></> : <Link to="/auth">Sign in</Link>}</div></header><p className="learning-kicker">A little practice. A clearer voice.</p><h1>Find your words.<br />Make them yours.</h1><p className="learning-muted">Practise English, get specific feedback, and try again.</p><div className="learning-grid" style={{
      marginTop: 32
    }}><Link to="/exam" className="learning-card"><p className="learning-kicker">01 · TOEFL / IELTS</p><h2>Academic & Exam Speaking</h2><p>Prepare for the task. Develop your answer.</p><span>Choose an exam task →</span></Link><Link to="/voice" className="learning-card"><p className="learning-kicker">02 · Real-life English</p><h2>Daily Conversation</h2><p>Step into a situation. Talk it through with AI.</p><span>Start a conversation →</span></Link></div><div className="learning-actions"><Link className="learning-button" to="/practice/history">History & next practice →</Link></div><details><summary>More ways to practise</summary><div className="learning-actions"><Link to="/presentation">Presentation studio →</Link><Link to="/voice/casual-video">Expression Lab →</Link><Link to="/profile">Your profile →</Link>{isAdmin && <Link to="/admin">Admin →</Link>}</div></details><BottomNav /></main>;
}
