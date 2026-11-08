'use client';

import { useReducedMotion, motion } from 'framer-motion';
import { type ButtonHTMLAttributes } from 'react';

interface PrismButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  children: React.ReactNode;
}

const ACCENT_COLORS: Record<string, string> = {
  primary: `linear-gradient(145deg,
    rgba(255,255,255,0.35) 0%,
    rgba(34,211,238,0.55) 15%,
    rgba(255,255,255,0.08) 40%,
    rgba(34,211,238,0.20) 70%,
    rgba(255,255,255,0.10) 100%
  )`,
  ghost: `linear-gradient(145deg,
    rgba(255,255,255,0.20) 0%,
    rgba(139,92,246,0.30) 20%,
    rgba(255,255,255,0.06) 50%,
    rgba(139,92,246,0.15) 80%,
    rgba(255,255,255,0.08) 100%
  )`,
};

export default function PrismButton({
  variant = 'primary',
  children,
  className = '',
  disabled,
  ...rest
}: PrismButtonProps) {
  const shouldReduceMotion = useReducedMotion();

  const bg = variant === 'primary'
    ? 'rgba(34,211,238,0.08)'
    : 'transparent';

  return (
    <motion.button
      {...(rest as object)}
      disabled={disabled}
      className={className}
      whileHover={
        disabled || shouldReduceMotion
          ? undefined
          : { y: -1, transition: { duration: 0.18, ease: 'easeOut' } }
      }
      whileTap={disabled ? undefined : { scale: 0.975 }}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1.25rem',
        borderRadius: '0.875rem',
        background: bg,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        color: variant === 'primary' ? 'rgba(34,211,238,1)' : 'rgba(255,255,255,0.75)',
        fontSize: '0.8125rem',
        fontWeight: 800,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        outline: 'none',
        border: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Gradient prism border ring */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '0.875rem',
          padding: '1px',
          background: ACCENT_COLORS[variant],
          WebkitMask:
            'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          mask:
            'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          maskComposite: 'exclude',
          pointerEvents: 'none',
        }}
      />

      {/* Specular sheen on hover */}
      {!shouldReduceMotion && (
        <motion.span
          aria-hidden="true"
          initial={{ x: '-100%', opacity: 0 }}
          whileHover={{ x: '200%', opacity: 1 }}
          transition={{ duration: 0.55, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* Label sits above sheen */}
      <span style={{ position: 'relative', zIndex: 2 }}>{children}</span>
    </motion.button>
  );
}
