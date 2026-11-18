import { Link, useLocation } from "react-router-dom";
import { House, Mic, BookOpen, History, CreditCard } from "lucide-react";

const NAV_ITEMS = [
  { path: "/", icon: House, label: "Home" },
  { path: "/voice", icon: Mic, label: "Speaking" },
  { path: "/exam", icon: BookOpen, label: "Exams" },
  { path: "/progress", icon: History, label: "My Progress" },
  { path: "/membership", icon: CreditCard, label: "Membership" },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  const hiddenPaths = ["/voice/chat", "/voice/setup", "/voice/report", "/presentation/practice", "/presentation/report"];
  if (hiddenPaths.some(path => pathname.startsWith(path))) return null;

  return (
    <nav aria-label="Main navigation" className="studio-nav">
      <div className="studio-nav-items">
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
          const active = path === "/" ? pathname === path : pathname.startsWith(path);
          return (
            active ? <span key={path} aria-current="page" className="studio-nav-item">
              <Icon size={20} strokeWidth={2} aria-hidden="true" /><span>{label}</span>
            </span> : <Link key={path} to={path} className="studio-nav-item">
              <Icon size={20} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
