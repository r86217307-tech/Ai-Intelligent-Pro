import React, { useEffect, useRef } from 'react';
import { useAssistant } from '../../lib/voice/AssistantProvider';

export default function SufiaOrb() {
  const { state } = useAssistant();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    // Simulation parameters
    const render = () => {
      time += 0.02;
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = Math.min(width, height) * 0.44;

      ctx.clearRect(0, 0, width, height);

      // Determine state dynamic multipliers
      let pulseSpeed = 1;
      let waveIntensity = 4;
      let glowColor = 'rgba(100, 150, 255, 0.2)';
      let scaleMod = 1;

      if (state === 'SPEAKING') {
        pulseSpeed = 2.5;
        waveIntensity = 12 + Math.sin(time * 6) * 4;
        glowColor = 'rgba(120, 180, 255, 0.4)';
        scaleMod = 1 + Math.sin(time * 4) * 0.04;
      } else if (state === 'USER_SPEAKING' || state === 'LISTENING') {
        pulseSpeed = 1.8;
        waveIntensity = 8 + Math.sin(time * 4) * 3;
        glowColor = 'rgba(140, 160, 255, 0.35)';
        scaleMod = 1 + Math.sin(time * 3) * 0.025;
      } else if (state === 'PROCESSING') {
        pulseSpeed = 3;
        waveIntensity = 6;
        glowColor = 'rgba(160, 200, 255, 0.3)';
        scaleMod = 1 + Math.sin(time * 5) * 0.02;
      }

      const r = baseRadius * scaleMod;

      // Draw outer ambient glow
      const glowGrad = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.35);
      glowGrad.addColorStop(0, glowColor);
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
      ctx.fill();

      // Create clipping path for the organic sphere
      ctx.save();
      ctx.beginPath();

      const numPoints = 64;
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        // Organic multi-harmonic radius distortion
        const offset =
          Math.sin(angle * 3 + time * pulseSpeed) * (waveIntensity * 0.4) +
          Math.cos(angle * 5 - time * (pulseSpeed * 0.8)) * (waveIntensity * 0.3) +
          Math.sin(angle * 2 + time * 1.2) * (waveIntensity * 0.5);

        const currentR = r + offset;
        const x = cx + Math.cos(angle) * currentR;
        const y = cy + Math.sin(angle) * currentR;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.clip();

      // Base sky-blue gradient inside the sphere
      const baseGrad = ctx.createLinearGradient(
        cx - r * 0.5,
        cy - r,
        cx + r * 0.5,
        cy + r
      );
      baseGrad.addColorStop(0, '#5982f6'); // Periwinkle vibrant sky blue
      baseGrad.addColorStop(0.35, '#739bf8');
      baseGrad.addColorStop(0.65, '#96b6fa');
      baseGrad.addColorStop(1, '#c5d7fc'); // Soft light sky
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, width, height);

      // Render organic billowing clouds layers with multi-layered noise-like blob interpolation
      const numBlobs = 6;
      for (let j = 0; j < numBlobs; j++) {
        const blobAngle = time * 0.4 + (j * Math.PI * 2) / numBlobs;
        const driftX = cx + Math.sin(blobAngle * 0.8 + j) * (r * 0.45);
        const driftY = cy + r * 0.15 + Math.cos(blobAngle * 0.6 + j * 1.5) * (r * 0.35);
        const blobRadius = r * (0.45 + 0.15 * Math.sin(time * 1.2 + j));

        const cloudGrad = ctx.createRadialGradient(
          driftX,
          driftY,
          blobRadius * 0.1,
          driftX,
          driftY,
          blobRadius
        );
        cloudGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
        cloudGrad.addColorStop(0.4, 'rgba(240, 246, 255, 0.65)');
        cloudGrad.addColorStop(0.75, 'rgba(215, 230, 255, 0.3)');
        cloudGrad.addColorStop(1, 'rgba(180, 210, 255, 0)');

        ctx.fillStyle = cloudGrad;
        ctx.beginPath();
        ctx.arc(driftX, driftY, blobRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Render lower cloud mass (resembling the bottom fluffy cloud bank in the screenshot)
      const cloudBankY = cy + r * 0.25 + Math.sin(time * 0.8) * (r * 0.05);
      const bankGrad = ctx.createLinearGradient(cx, cloudBankY - r * 0.3, cx, cy + r);
      bankGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      bankGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');
      bankGrad.addColorStop(0.6, 'rgba(245, 250, 255, 0.9)');
      bankGrad.addColorStop(1, 'rgba(225, 238, 255, 0.95)');

      ctx.fillStyle = bankGrad;
      ctx.beginPath();
      // Draw wavy cloud bank
      ctx.moveTo(cx - r * 1.2, cy + r * 1.2);
      for (let k = -r * 1.2; k <= r * 1.2; k += 10) {
        const waveY =
          cloudBankY +
          Math.sin((k + time * 40) * 0.03) * (r * 0.08) +
          Math.cos((k * 0.05) - time * 0.6) * (r * 0.04);
        ctx.lineTo(cx + k, waveY);
      }
      ctx.lineTo(cx + r * 1.2, cy + r * 1.2);
      ctx.closePath();
      ctx.fill();

      // Top soft lighting highlight
      const topHighlight = ctx.createRadialGradient(
        cx - r * 0.25,
        cy - r * 0.4,
        r * 0.05,
        cx,
        cy,
        r * 0.9
      );
      topHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
      topHighlight.addColorStop(0.6, 'rgba(255, 255, 255, 0.05)');
      topHighlight.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
      ctx.fillStyle = topHighlight;
      ctx.fillRect(0, 0, width, height);

      // Inner soft sphere rim shadow
      const innerRim = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r);
      innerRim.addColorStop(0, 'rgba(0, 0, 0, 0)');
      innerRim.addColorStop(0.9, 'rgba(0, 20, 60, 0.05)');
      innerRim.addColorStop(1, 'rgba(0, 20, 60, 0.18)');
      ctx.fillStyle = innerRim;
      ctx.fillRect(0, 0, width, height);

      ctx.restore();

      // Subtle active state rings
      if (state === 'SPEAKING' || state === 'USER_SPEAKING') {
        const ringRadius = r * (1.08 + Math.sin(time * 5) * 0.04);
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle =
          state === 'SPEAKING'
            ? 'rgba(120, 180, 255, 0.25)'
            : 'rgba(140, 160, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [state]);

  return (
    <div className="relative flex flex-col items-center justify-center w-full my-auto select-none">
      {/* Dynamic Aura */}
      <div
        className={`relative flex items-center justify-center transition-all duration-700 ${
          state === 'SPEAKING'
            ? 'scale-105'
            : state === 'USER_SPEAKING'
            ? 'scale-102'
            : 'scale-100'
        }`}
      >
        <canvas
          ref={canvasRef}
          width={360}
          height={360}
          className="w-[280px] h-[280px] sm:w-[340px] sm:h-[340px] md:w-[380px] md:h-[380px] max-w-full aspect-square"
        />
      </div>
    </div>
  );
}
