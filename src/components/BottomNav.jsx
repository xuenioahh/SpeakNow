import { Link, useLocation } from "react-router-dom";
import { House, Mic, Monitor, User } from "lucide-react";

const NAV_ITEMS = [
  { path: "/", icon: House, label: "Home" },
  { path: "/voice", icon: Mic, label: "Speaking" },
  { path: "/presentation", icon: Monitor, label: "Presentation" },
  { path: "/profile", icon: User, label: "Profile" },
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
            <Link key={path} to={path} aria-current={active ? "page" : undefined} className="studio-nav-item">
              <Icon size={20} strokeWidth={active ? 2 : 1.6} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
