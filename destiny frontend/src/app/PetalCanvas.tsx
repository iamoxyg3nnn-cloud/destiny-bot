"use client";

import { useEffect, useRef } from "react";

interface Petal {
  x: number;
  y: number;
  length: number;
  width: number;
  speedY: number;
  speedX: number;
  swayAngle: number;
  swaySpeed: number;
  swayRadius: number;
  rotation: number;
  rotationSpeed: number;
  flip: number;
  flipSpeed: number;
  opacity: number;
  colorFront: string;
  colorBack: string;
}

const PETAL_PALETTES = [
  // Soft Rose
  { front: "rgba(228, 87, 127, 0.72)", back: "rgba(255, 178, 198, 0.72)" },
  // Destiny Rose Ink
  { front: "rgba(190, 46, 91, 0.65)", back: "rgba(244, 114, 152, 0.65)" },
  // Tender Blush
  { front: "rgba(255, 160, 185, 0.68)", back: "rgba(255, 209, 222, 0.68)" },
  // Blossom Coral
  { front: "rgba(251, 113, 133, 0.62)", back: "rgba(254, 205, 211, 0.62)" },
  // Translucent Pearl Rose
  { front: "rgba(255, 190, 206, 0.55)", back: "rgba(255, 230, 238, 0.55)" },
];

export function PetalCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Respect user's motion preferences
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number | null = null;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const updateDpr = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    updateDpr();

    // Mouse Tracking for Interactive Breeze
    const mouse = {
      x: -9999,
      y: -9999,
      prevX: -9999,
      prevY: -9999,
      vx: 0,
      vy: 0,
      radius: 125,
    };

    const handlePointerMove = (e: MouseEvent) => {
      if (mouse.x === -9999) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      }
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.vx = (mouse.x - mouse.prevX) * 0.25;
      mouse.vy = (mouse.y - mouse.prevY) * 0.25;
    };

    const handlePointerLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
      mouse.vx = 0;
      mouse.vy = 0;
    };

    // Scroll Tracking for Dynamic Wind Drafts
    let lastScrollY = window.scrollY;
    let scrollVelocity = 0;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollY;
      lastScrollY = currentScrollY;
      // Scroll velocity influences petal vertical drift & flutter
      scrollVelocity += delta * 0.18;
      // Clamp maximum velocity for smooth elegance
      scrollVelocity = Math.max(-14, Math.min(14, scrollVelocity));
    };

    window.addEventListener("mousemove", handlePointerMove, { passive: true });
    window.addEventListener("mouseleave", handlePointerLeave, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateDpr, { passive: true });

    // Petal Particle Pool
    const isMobile = width < 768;
    const count = isMobile ? 18 : 34;

    const createPetal = (scatterVertically = false): Petal => {
      const palette = PETAL_PALETTES[Math.floor(Math.random() * PETAL_PALETTES.length)];
      const sizeScale = 0.75 + Math.random() * 0.55;
      return {
        x: Math.random() * width,
        y: scatterVertically ? Math.random() * height : -30 - Math.random() * 50,
        length: 16 * sizeScale,
        width: 10 * sizeScale,
        speedY: 0.65 + Math.random() * 0.85,
        speedX: -0.25 + Math.random() * 0.6,
        swayAngle: Math.random() * Math.PI * 2,
        swaySpeed: 0.012 + Math.random() * 0.02,
        swayRadius: 0.8 + Math.random() * 1.2,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        flip: Math.random() * Math.PI * 2,
        flipSpeed: 0.015 + Math.random() * 0.03,
        opacity: 0.55 + Math.random() * 0.35,
        colorFront: palette.front,
        colorBack: palette.back,
      };
    };

    const petals: Petal[] = Array.from({ length: count }, () => createPetal(true));

    // Animation Loop
    let isRunning = true;

    const render = () => {
      if (!isRunning) return;

      ctx.clearRect(0, 0, width, height);

      // Smooth decay for scroll and mouse impulses
      scrollVelocity *= 0.92;
      mouse.vx *= 0.82;
      mouse.vy *= 0.82;

      for (let i = 0; i < petals.length; i++) {
        const p = petals[i];

        // Natural swaying drift
        p.swayAngle += p.swaySpeed;
        const sway = Math.sin(p.swayAngle) * p.swayRadius;

        // Position updates with scroll wind influence
        p.x += p.speedX + sway - scrollVelocity * 0.04;
        p.y += p.speedY + scrollVelocity * 0.35;

        // 3D rotations (planar angle + 3D flip)
        p.rotation += p.rotationSpeed + scrollVelocity * 0.002;
        p.flip += p.flipSpeed + Math.abs(scrollVelocity) * 0.004;

        // Cursor Breeze Interaction (proximity push + swirl)
        if (mouse.x !== -9999) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const distSq = dx * dx + dy * dy;
          const radiusSq = mouse.radius * mouse.radius;

          if (distSq < radiusSq && distSq > 0.01) {
            const dist = Math.sqrt(distSq);
            const force = Math.pow(1 - dist / mouse.radius, 1.8);
            const normalX = dx / dist;
            const normalY = dy / dist;

            // Push outward + incorporate mouse movement wake
            p.x += normalX * force * 3.8 + mouse.vx * 0.35;
            p.y += normalY * force * 3.8 + mouse.vy * 0.35;
            p.flip += force * 0.12;
            p.rotation += (normalX * 0.05 + 0.02) * force;
          }
        }

        // Screen boundary wrapping
        if (p.y > height + 35) {
          p.y = -25;
          p.x = Math.random() * width;
        } else if (p.y < -40) {
          p.y = height + 25;
          p.x = Math.random() * width;
        }

        if (p.x > width + 40) {
          p.x = -30;
        } else if (p.x < -40) {
          p.x = width + 30;
        }

        // Draw 3D curved rose petal
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);

        // 3D flip factor (cos determines apparent width and front/back facing)
        const cosFlip = Math.cos(p.flip);
        const scaleX = cosFlip;
        const isBack = scaleX < 0;

        ctx.scale(scaleX, 1);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = isBack ? p.colorBack : p.colorFront;

        // Organic rose petal path with soft curved indent
        const l = p.length;
        const w = p.width;

        ctx.beginPath();
        ctx.moveTo(0, -l * 0.45);
        ctx.bezierCurveTo(w * 0.9, -l * 0.4, w * 1.1, l * 0.25, 0, l * 0.55);
        ctx.bezierCurveTo(-w * 1.1, l * 0.25, -w * 0.9, -l * 0.4, 0, -l * 0.45);
        ctx.closePath();
        ctx.fill();

        // Subtle center crease / translucent highlight
        ctx.beginPath();
        ctx.moveTo(0, -l * 0.35);
        ctx.quadraticCurveTo(w * 0.12, 0, 0, l * 0.4);
        ctx.strokeStyle = isBack
          ? "rgba(255, 255, 255, 0.4)"
          : "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    // Pause animation when tab is inactive to preserve 0% idle CPU
    const handleVisibility = () => {
      if (document.hidden) {
        isRunning = false;
        if (animId) cancelAnimationFrame(animId);
      } else {
        if (!isRunning) {
          isRunning = true;
          lastScrollY = window.scrollY;
          animId = requestAnimationFrame(render);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    animId = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animId) cancelAnimationFrame(animId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseleave", handlePointerLeave);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateDpr);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="petal-canvas"
      aria-hidden="true"
    />
  );
}
