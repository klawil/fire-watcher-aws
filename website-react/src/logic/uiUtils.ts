'use client';

import { useCallback, useEffect, useState } from "react";

export function useRefIntersection(): [
  (node: HTMLElement | null) => void,
  boolean,
] {
  const [node, setNode] = useState<HTMLElement | null>(null);

  const [refIntersecting, setRefIntersecting] = useState(false);

  const setRef = useCallback(
    (node: HTMLElement | null) => setNode(node),
    [],
  );

  useEffect(() => {
    if (node === null) return;

    const observer = new IntersectionObserver(
      ([entry]) => setRefIntersecting(entry.isIntersecting),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setRef, refIntersecting];
}