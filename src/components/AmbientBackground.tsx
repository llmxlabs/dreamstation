'use client';

import { motion, useReducedMotion } from 'framer-motion';

interface Field {
  gradient: string;
  duration: number;
  delay: number;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  width: string;
  height: string;
}

const FIELDS: Field[] = [
  {
    // Violet — top-left
    gradient:
      'radial-gradient(ellipse 40% 35% at 15% 20%, rgba(139,92,246,0.12) 0%, transparent 70%)',
    duration: 13,
    delay: 0,
    top: '0',
    left: '0',
    width: '60%',
    height: '60%',
  },
  {
    // Cyan — bottom-right
    gradient:
      'radial-gradient(ellipse 45% 40% at 85% 80%, rgba(34,211,238,0.09) 0%, transparent 70%)',
    duration: 17,
    delay: -4,
    bottom: '0',
    right: '0',
    width: '65%',
    height: '65%',
  },
  {
    // Amber accent — far right center
    gradient:
      'radial-gradient(ellipse 25% 30% at 92% 45%, rgba(245,158,11,0.07) 0%, transparent 60%)',
    duration: 21,
    delay: -8,
    top: '20%',
    right: '0',
    width: '40%',
    height: '60%',
  },
  {
    // Deep indigo — center wash
    gradient:
      'radial-gradient(ellipse 60% 50% at 50% 55%, rgba(67,56,202,0.08) 0%, transparent 70%)',
    duration: 11,
    delay: -2,
    top: '15%',
    left: '10%',
    width: '80%',
    height: '70%',
  },
];

export default function AmbientBackground() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        backgroundColor: '#020617',
        overflow: 'hidden',
      }}
    >
      {FIELDS.map((field, i) => (
        <motion.div
          key={i}
          animate={
            shouldReduceMotion
              ? {}
              : {
                  opacity: [0.7, 1, 0.75, 0.95, 0.7],
                  scale: [1, 1.04, 0.98, 1.03, 1],
                }
          }
          transition={
            shouldReduceMotion
              ? {}
              : {
                  duration: field.duration,
                  delay: field.delay,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }
          }
          style={{
            position: 'absolute',
            top: field.top,
            left: field.left,
            right: field.right,
            bottom: field.bottom,
            width: field.width,
            height: field.height,
            background: field.gradient,
            // No blur — opacity control keeps edges crisp for cinematic look
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  );
}
