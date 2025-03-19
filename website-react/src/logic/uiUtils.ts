'use client';

import { useCallback, useEffect, useState } from "react";

export function isElemInView(elem: HTMLElement) {
  const { top, left, bottom, right } = elem.getBoundingClientRect();
  return top >= 0 && left >= 0 && bottom <= innerHeight && right <= innerWidth;
}

export function useRefIntersection(): [
  (node: HTMLElement | null) => void,
  boolean,
] {
  const [node, setNode] = useState<HTMLElement | null>(null);

  const [refIntersecting, setRefIntersecting] = useState(false);

  const setRef = useCallback(
    (newNode: HTMLElement | null) => {
      // @TODO - fix this, we want the node to be able to be set to null
      if (newNode !== null && newNode !== node) {
        setRefIntersecting(false);
        setNode(newNode);
      }
    },
    [node],
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