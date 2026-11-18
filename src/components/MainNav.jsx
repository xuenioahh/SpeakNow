import { Link, useLocation } from 'react-router-dom';
import { House, Mic, BookOpen, ChartNoAxesCombined, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
const items = [
  ['/', 'Home', House], ['/voice', 'Speaking', Mic], ['/exam', 'Exams', BookOpen],
  ['/progress', 'My Progress', ChartNoAxesCombined], ['/membership', 'Membership', null]
];
export default function MainNav() {
  const { pathname } = useLocation(), { user } = useAuth();
  return <><header className="app-header"><div className="app-header-inner"><Link className="app-brand" to="/" aria-label="SpeakNow home">SpeakNow</Link><nav aria-label="Main navigation">{items.map(([path, label, Icon]) => <Link key={path} to={path} aria-current={(path === '/' ? pathname === '/' : pathname.startsWith(path)) ? 'page' : undefined}>{Icon && <Icon size={16} aria-hidden="true" />}<span>{label}</span></Link>)}</nav><Link className="app-account" to={user ? '/profile' : '/auth'}><UserRound size={17} /><span>{user ? 'Account' : 'Sign in'}</span></Link></div></header><div className="app-header-space" /></>;
}
