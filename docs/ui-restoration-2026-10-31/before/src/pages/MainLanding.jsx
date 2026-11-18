import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import '@/learning.css';
export default function MainLanding() {
  const { user, isAdmin, logout } = useAuth();
  return <main className="learning-page core-home"><header><strong>SpeakNow</strong><nav aria-label="Account and history"><Link to="/progress">My Progress</Link><Link to="/membership">Membership</Link>{user ? <><Link to="/profile">Account</Link><button onClick={() => logout()}>Sign out</button></> : <Link to="/auth">Sign in</Link>}<details><summary>More</summary><div><Link to="/presentation">Presentation studio</Link><Link to="/voice/casual-video">Expression Lab</Link>{isAdmin && <Link to="/admin">Admin</Link>}</div></details></nav></header>
    <h1 className="sr-only">Choose your practice</h1><div className="direction-grid">
      <Link to="/exam" className="direction-card exam-direction"><h2>Exam<br />Practice</h2><p>TOEFL &amp; IELTS Speaking</p></Link>
      <Link to="/voice" className="direction-card daily-direction"><h2>Daily<br />Conversation</h2><p>Practise real-life situations.</p></Link>
    </div>
  </main>;
}
