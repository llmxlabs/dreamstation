'use client';

import { forwardRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  /** 'default' | 'hero' (higher blur) | 'subtle' (recedes) */
  variant?: 'default' | 'hero' | 'subtle';
  animate?: boolean;
  delay?: number;
  onClick?: () => void;
  style?: React.CSSProperties;
}

// Ice-glass backdrop — SVG displacement warps backdrop pixels + vivid saturation
// Safari fallback omits url() since -webkit-backdrop-filter has partial SVG support
const BACKDROP: Record<string, string> = {
  default: 'url(#glass-ice-distort) blur(2px) saturate(210%) contrast(1.14) brightness(1.02)',
  hero:    'url(#glass-ice-distort) blur(3px) saturate(220%) contrast(1.16) brightness(1.03)',
  subtle:  'url(#glass-ice-distort) blur(2px) saturate(190%) contrast(1.10) brightness(1.01)',
};
const BACKDROP_WEBKIT: Record<string, string> = {
  default: 'blur(2px) saturate(210%) contrast(1.14) brightness(1.02)',
  hero:    'blur(3px) saturate(220%) contrast(1.16) brightness(1.03)',
  subtle:  'blur(2px) saturate(190%) contrast(1.10) brightness(1.01)',
};

// Inset edge speculars only — no outer colored glows (those cause the halo)
const SHADOW: Record<string, string> = {
  default: 'inset 0 1.5px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(255,255,255,0.04), inset 1px 0 0 rgba(255,255,255,0.06), inset -1px 0 0 rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.18), 0 16px 40px rgba(0,0,0,0.26)',
  hero:    'inset 0 1.5px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(255,255,255,0.05), inset 1px 0 0 rgba(255,255,255,0.08), inset -1px 0 0 rgba(0,0,0,0.10), 0 6px 16px rgba(0,0,0,0.22), 0 24px 48px rgba(0,0,0,0.30)',
  subtle:  'inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 16px rgba(0,0,0,0.18)',
};

// Internal Schlieren light bands — simulate refraction texture inside thick glass
const SCHLIEREN =
  'radial-gradient(ellipse 80% 30% at 35% 0%, rgba(255,255,255,0.13) 0%, transparent 100%), ' +
  'linear-gradient(127deg, rgba(255,255,255,0.07) 0%, transparent 42%, rgba(255,255,255,0.03) 68%, transparent 100%)';

const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ children, className = '', variant = 'default', animate = true, delay = 0, onClick, style }, ref) => {
    const shouldReduceMotion = useReducedMotion();

    const glassStyle: React.CSSProperties = {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: '1.5rem',
      border: '1px solid rgba(255,255,255,0.10)',
      background: variant === 'subtle' ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
      backdropFilter: BACKDROP[variant],
      WebkitBackdropFilter: BACKDROP_WEBKIT[variant],
      boxShadow: SHADOW[variant],
      ...style,
    };

    const schlierenStyle: React.CSSProperties = {
      position: 'absolute',
      inset: 0,
      zIndex: 0,
      borderRadius: 'inherit',
      pointerEvents: 'none',
      background: variant === 'subtle' ? 'radial-gradient(ellipse 70% 25% at 30% 0%, rgba(255,255,255,0.06) 0%, transparent 100%)' : SCHLIEREN,
      opacity: variant === 'subtle' ? 0.5 : 1,
    };

    const inner = (
      <div className={className} style={glassStyle} onClick={onClick}>
        {/* Internal refraction texture */}
        <div aria-hidden="true" style={schlierenStyle} />
        {/* Content */}
        <div style={{ position: 'relative', zIndex: 10 }}>
          {children}
        </div>
      </div>
    );

    if (!animate) return <div ref={ref}>{inner}</div>;

    const initial = shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 };
    const animateTo = shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 };

    return (
      <motion.div
        ref={ref}
        initial={initial}
        animate={animateTo}
        transition={{ duration: 0.45, delay, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {inner}
      </motion.div>
    );
  }
);

GlassPanel.displayName = 'GlassPanel';
export default GlassPanel;
