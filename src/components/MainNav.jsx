import { Link, useLocation } from 'react-router-dom';
import { House, Mic, BookOpen, ChartNoAxesCombined, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const items = [
  ['/', 'Home', House], ['/voice', 'Speaking', Mic], ['/exam', 'Exams', BookOpen],
  ['/progress', 'My Progress', ChartNoAxesCombined], ['/membership', 'Membership', null],
];

export default function MainNav() {
  const { pathname, search, hash } = useLocation();
  const { user } = useAuth();
  const activePath = pathname === '/practice/review' ? '/progress' : pathname;
  const accountPath = user ? '/profile' : pathname === '/auth' ? pathname + search : '/auth?' + new URLSearchParams({ returnTo: pathname + search + hash });
  return <>
    <a className="skip-content" href="#page-content">Skip to page content</a>
    <header className="app-header"><div className="app-header-inner">
      <Link className="app-brand" to="/" aria-label="SpeakNow home">SpeakNow</Link>
      <nav aria-label="Main navigation">{items.map(([path, label, Icon]) =>
        <Link key={path} to={path} aria-current={activePath === path || activePath.startsWith(path + '/') ? 'page' : undefined}>
          {Icon && <Icon size={16} aria-hidden="true" />}<span>{label}</span>
        </Link>)}</nav>
      <Link className="app-account" to={accountPath} aria-current={['/profile', '/auth'].includes(pathname) ? 'page' : undefined}><UserRound size={17} aria-hidden="true" /><span>{user ? 'Account' : 'Sign in'}</span></Link>
    </div></header><div className="app-header-space" />
  </>;
}
