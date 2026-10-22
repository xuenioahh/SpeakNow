import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export default function RouteScroll() {
  const { key, pathname } = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map());

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useLayoutEffect(() => {
    const top = navigationType === "POP" ? positions.current.get(key) || 0 : 0;
    window.scrollTo({ top, left: 0, behavior: "instant" });
    const savedPositions = positions.current;
    return () => {
      savedPositions.set(key, window.scrollY);
      if (savedPositions.size > 100) savedPositions.delete(savedPositions.keys().next().value);
    };
  }, [key, pathname, navigationType]);

  return null;
}
