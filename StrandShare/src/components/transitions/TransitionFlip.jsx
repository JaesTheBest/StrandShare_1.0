import React, { useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';

const FLIP_EASE = [0.83, 0, 0.17, 1];

export function TransitionFlipEntrance({ children, duration = 0.85, delay = 0.05 }) {
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    return <div className="transition-flip-stage">{children}</div>;
  }

  return (
    <div className="transition-flip-stage">
      <motion.div
        className="transition-flip-card"
        initial={{ rotateY: 92, opacity: 0.05, scale: 0.96 }}
        animate={{ rotateY: 0, opacity: 1, scale: 1 }}
        transition={{ duration, ease: FLIP_EASE, delay }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function TransitionFlipExit({ trigger, onComplete, children, duration = 0.7 }) {
  const controls = useAnimation();

  useEffect(() => {
    if (!trigger) return;

    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      if (onComplete) onComplete();
      return;
    }

    let cancelled = false;
    controls
      .start({
        rotateY: -92,
        opacity: 0.05,
        scale: 0.96,
        transition: { duration, ease: FLIP_EASE },
      })
      .then(() => {
        if (!cancelled && onComplete) onComplete();
      });

    // eslint-disable-next-line consistent-return
    return () => {
      cancelled = true;
    };
  }, [trigger, controls, onComplete, duration]);

  return (
    <div className="transition-flip-stage">
      <motion.div
        className="transition-flip-card"
        initial={{ rotateY: 0, opacity: 1, scale: 1 }}
        animate={controls}
      >
        {children}
      </motion.div>
    </div>
  );
}
