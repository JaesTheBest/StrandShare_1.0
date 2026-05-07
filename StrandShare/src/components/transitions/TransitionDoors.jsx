import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const PANEL_TRANSITION = { duration: 0.7, ease: [0.83, 0, 0.17, 1] };

/**
 * Two-panel "doors" overlay.
 *
 * direction === 'closing' → panels start off-screen, slide in to cover.
 * direction === 'opening' → panels start covering, slide out to reveal.
 *
 * onComplete fires once the right panel finishes its animation.
 */
export default function TransitionDoors({ direction = null, color, onComplete }) {
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
  }, [direction]);

  if (!direction) return null;

  const isClosing = direction === 'closing';
  const isOpening = direction === 'opening';

  const fillColor = color || 'var(--color-primary, #b8955a)';

  const handleComplete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (onComplete) onComplete();
  };

  return (
    <div
      className="transition-doors"
      style={{ pointerEvents: isClosing ? 'auto' : 'none' }}
      aria-hidden="true"
    >
      <motion.div
        className="transition-doors-panel left"
        style={{ background: fillColor }}
        initial={{ x: isClosing ? '-101%' : '0%' }}
        animate={{ x: isClosing ? '0%' : '-101%' }}
        transition={PANEL_TRANSITION}
      />
      <motion.div
        className="transition-doors-panel right"
        style={{ background: fillColor }}
        initial={{ x: isClosing ? '101%' : '0%' }}
        animate={{ x: isClosing ? '0%' : '101%' }}
        transition={PANEL_TRANSITION}
        onAnimationComplete={handleComplete}
      />
      {isOpening || isClosing ? (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: isClosing ? 0 : 1 }}
          animate={{ opacity: isClosing ? 1 : 0 }}
          transition={{ duration: PANEL_TRANSITION.duration * 0.8, ease: PANEL_TRANSITION.ease }}
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(90deg, ${fillColor} 0%, transparent 50%, ${fillColor} 100%)`,
            mixBlendMode: 'multiply',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  );
}
