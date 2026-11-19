import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export default function RouteScroll() {
  const { key, pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const previousPath = useRef(null);
  const positions = useRef(new Map());

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useLayoutEffect(() => {
    const top = navigationType === "POP" ? positions.current.get(key) || 0 : 0;
    const anchor = hash ? document.getElementById(hash.slice(1)) : null;
    if (anchor) anchor.scrollIntoView();
    else if (pathname !== previousPath.current || navigationType === "POP") window.scrollTo({ top, left: 0, behavior: "instant" });
    previousPath.current = pathname;
    const savedPositions = positions.current;
    return () => {
      savedPositions.set(key, window.scrollY);
      if (savedPositions.size > 100) savedPositions.delete(savedPositions.keys().next().value);
    };
  }, [key, pathname, hash, navigationType]);

  return null;
}
