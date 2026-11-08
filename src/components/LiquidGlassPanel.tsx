'use client';

import { useReducedMotion } from 'framer-motion';
import { motion } from 'framer-motion';

export interface LiquidGlassPanelProps {
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'lg';
  animate?: boolean;
  delay?: number;
}

const BORDER_RADIUS = { lg: '1.75rem', sm: '1rem' } as const;

// Inset edge speculars only — no outer colored glows (those were the halo source)
const BASE_SHADOW =
  'inset 0 1.5px 0 rgba(255,255,255,0.20), inset 0 -1px 0 rgba(255,255,255,0.04), inset 1px 0 0 rgba(255,255,255,0.06), inset -1px 0 0 rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.20), 0 16px 40px rgba(0,0,0,0.28)';

const SM_SHADOW =
  'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(255,255,255,0.03), 0 4px 12px rgba(0,0,0,0.20)';

// Ice-glass backdrop: SVG displacement warp + minimal blur + vivid saturation
// Safari gets fallback without url() — still looks good
const BACKDROP = 'url(#glass-ice-distort) blur(2px) saturate(210%) contrast(1.14) brightness(1.02)';
const BACKDROP_WEBKIT = 'blur(2px) saturate(210%) contrast(1.14) brightness(1.02)';

export default function LiquidGlassPanel({
  children,
  className = '',
  size = 'lg',
  animate = true,
  delay = 0,
}: LiquidGlassPanelProps) {
  const shouldReduceMotion = useReducedMotion();

  const borderRadius = BORDER_RADIUS[size];
  const boxShadow = size === 'lg' ? BASE_SHADOW : SM_SHADOW;

  const initialAnim = shouldReduceMotion
    ? { opacity: 0 }
    : { opacity: 0, y: 14, scale: 0.985 };

  const visibleAnim = shouldReduceMotion
    ? { opacity: 1 }
    : { opacity: 1, y: 0, scale: 1 };

  const inner = (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius,
        // Simple hairline border — no gradient ring, no bloom
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow,
        // Nearly clear — ice transmits most light
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: BACKDROP,
        WebkitBackdropFilter: BACKDROP_WEBKIT,
      }}
    >
      {/* Internal light structure — Schlieren-like refraction bands */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          borderRadius,
          pointerEvents: 'none',
          background: [
            'radial-gradient(ellipse 80% 30% at 35% 0%, rgba(255,255,255,0.13) 0%, transparent 100%)',
            'linear-gradient(127deg, rgba(255,255,255,0.07) 0%, transparent 42%, rgba(255,255,255,0.03) 68%, transparent 100%)',
          ].join(', '),
        }}
      />

      {/* Children */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        {children}
      </div>
    </div>
  );

  if (!animate) {
    return inner;
  }

  return (
    <motion.div
      initial={initialAnim}
      animate={visibleAnim}
      transition={{ duration: 0.45, delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {inner}
    </motion.div>
  );
}
