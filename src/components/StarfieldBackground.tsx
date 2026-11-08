'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, cx = 0, cy = 0, maxR = 0;

    function resize() {
      W = canvas!.width = window.innerWidth;
      H = canvas!.height = window.innerHeight;
      cx = W / 2; cy = H / 2;
      maxR = Math.hypot(cx, cy) * 1.1;
    }
    resize();
    window.addEventListener('resize', resize);

    // Stars in polar coordinates
    const STAR_COUNT = 520;
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: Math.random() * maxR,
      size: Math.random() < 0.88 ? 0.3 + Math.random() * 0.8 : 1.1 + Math.random() * 0.5,
      baseOpacity: 0.15 + Math.random() * 0.6,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleFreq: 0.00025 + Math.random() * 0.0005,
      twinkleAmp: 0.06 + Math.random() * 0.16,
    }));

    // Shooting stars
    const shooters: Array<{x:number,y:number,vx:number,vy:number,life:number,decay:number,trailLen:number}> = [];
    let nextShot = performance.now() + 5000 + Math.random() * 10000;

    function spawnShooter() {
      const angle = -0.5 + Math.random() * 0.4;
      const spd = 5 + Math.random() * 7;
      shooters.push({
        x: Math.random() * W * 0.7, y: Math.random() * H * 0.3,
        vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd + 1.5,
        life: 1.0, decay: 0.010 + Math.random() * 0.009,
        trailLen: 80 + Math.random() * 130,
      });
    }

    let rotation = 0;
    const ROT_SPEED = 0.00016;

    function draw(now: number) {
      rotation += ROT_SPEED;
      ctx!.fillStyle = '#000000';
      ctx!.fillRect(0, 0, W, H);

      for (const s of stars) {
        const a = s.angle + rotation;
        const x = cx + Math.cos(a) * s.radius;
        const y = cy + Math.sin(a) * s.radius;
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        const twinkle = Math.sin(now * s.twinkleFreq + s.twinklePhase);
        const opacity = Math.max(0, s.baseOpacity + twinkle * s.twinkleAmp);
        ctx!.beginPath();
        ctx!.arc(x, y, s.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255,255,255,${opacity.toFixed(3)})`;
        ctx!.fill();
      }

      if (now > nextShot) {
        spawnShooter();
        nextShot = now + 6000 + Math.random() * 14000;
      }
      for (let i = shooters.length - 1; i >= 0; i--) {
        const s = shooters[i];
        const mag = Math.hypot(s.vx, s.vy);
        const tx = s.x - (s.vx / mag) * s.trailLen * s.life;
        const ty = s.y - (s.vy / mag) * s.trailLen * s.life;
        const grad = ctx!.createLinearGradient(tx, ty, s.x, s.y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, `rgba(255,255,255,${s.life * 0.9})`);
        ctx!.beginPath(); ctx!.moveTo(tx, ty); ctx!.lineTo(s.x, s.y);
        ctx!.strokeStyle = grad; ctx!.lineWidth = 1.2 * s.life;
        ctx!.lineCap = 'round'; ctx!.stroke();
        ctx!.beginPath(); ctx!.arc(s.x, s.y, 1.5 * s.life, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255,255,255,${s.life})`; ctx!.fill();
        s.x += s.vx; s.y += s.vy; s.life -= s.decay;
        if (s.life <= 0) shooters.splice(i, 1);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [shouldReduceMotion]);

  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      {/* Canvas starfield */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      {/* Tri-prism ambient color overlays */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '60%', height: '60%', background: 'radial-gradient(ellipse 40% 35% at 15% 20%, rgba(139,92,246,0.10) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '65%', height: '65%', background: 'radial-gradient(ellipse 45% 40% at 85% 80%, rgba(34,211,238,0.07) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', top: '20%', right: 0, width: '40%', height: '60%', background: 'radial-gradient(ellipse 25% 30% at 92% 45%, rgba(245,158,11,0.06) 0%, transparent 60%)' }} />
      </div>
    </div>
  );
}
