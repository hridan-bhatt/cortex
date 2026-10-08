import React, { useRef, useEffect } from 'react';
import { gsap } from 'gsap';

/**
 * Reusable magnetic micro-interaction hook.
 * Translates element up to maxDistance (default 2px) toward cursor on hover,
 * springs back over 200ms power2.out on leave.
 */
export function useMagnetic<T extends HTMLElement = HTMLButtonElement>(maxDistance: number = 2) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const halfW = rect.width / 2 || 1;
      const halfH = rect.height / 2 || 1;

      const dx = (e.clientX - centerX) / halfW;
      const dy = (e.clientY - centerY) / halfH;

      const targetX = Math.max(-maxDistance, Math.min(maxDistance, dx * maxDistance));
      const targetY = Math.max(-maxDistance, Math.min(maxDistance, dy * maxDistance));

      gsap.to(el, {
        x: targetX,
        y: targetY,
        duration: 0.15,
        ease: 'power1.out',
        overwrite: 'auto',
      });
    };

    const onMouseLeave = () => {
      gsap.to(el, {
        x: 0,
        y: 0,
        duration: 0.2,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    };

    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('mouseleave', onMouseLeave);

    return () => {
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('mouseleave', onMouseLeave);
      gsap.set(el, { x: 0, y: 0 });
    };
  }, [maxDistance]);

  return ref;
}

/**
 * Helper component for easily applying magnetic interaction to any button or link
 */
export const MagneticItem: React.FC<{
  children: React.ReactElement;
  maxDistance?: number;
}> = ({ children, maxDistance = 2 }) => {
  const ref = useMagnetic<HTMLElement>(maxDistance);
  return React.cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      (ref as any).current = node;
      const childRef = (children as any).ref;
      if (typeof childRef === 'function') childRef(node);
      else if (childRef) childRef.current = node;
    },
  });
};
