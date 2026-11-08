import { createCanvas, GlobalFonts, Path2D, Image } from '@napi-rs/canvas';
import * as fs from 'fs';
import * as path from 'path';

// Register fonts
GlobalFonts.registerFromPath('assets/fonts/Inter.ttf', 'Inter');
GlobalFonts.registerFromPath('assets/fonts/JetBrainsMono.ttf', 'JetBrains Mono');

export interface SessionRecapData {
  roomCode: string;
  durationText: string;
  chemistryScore: number;
  xpAwarded: number;
  coinsAwarded: number;
  user1: {
    pseudonym: string;
    avatarMonogram: string;
    destinyId: string;
    tier: string;
  };
  user2: {
    pseudonym: string;
    avatarMonogram: string;
    destinyId: string;
    tier: string;
  };
}

export function drawSessionRecapCard(
  ctx: any,
  data: SessionRecapData,
  width: number,
  height: number
) {
  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
  };

  // 1. Base background & shell
  ctx.save();
  roundRect(1, 1, width - 2, height - 2, 28);
  ctx.clip();

  ctx.fillStyle = '#090a0c';
  ctx.fillRect(0, 0, width, height);

  // Micro dot matrix
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  for (let dx = 16; dx < width; dx += 16) {
    for (let dy = 16; dy < height; dy += 16) {
      ctx.fillRect(dx, dy, 1, 1);
    }
  }

  // Top specular ambient glow
  const topGlow = ctx.createRadialGradient(width / 2, 0, 10, width / 2, 0, 360);
  topGlow.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
  topGlow.addColorStop(1, 'rgba(9, 10, 12, 0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();

  // Outer border
  roundRect(1, 1, width - 2, height - 2, 28);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // -------------------------------------------------------------
  // HEADER
  // -------------------------------------------------------------
  ctx.font = 'bold 12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8b929e';
  ctx.textAlign = 'left';
  ctx.fillText('DESTINY MATCHMAKING · SESSION RECAP', 36, 46);

  ctx.textAlign = 'right';
  ctx.fillText(`ROOM: ${data.roomCode}`, width - 36, 46);

  // Header hairline
  ctx.beginPath();
  ctx.moveTo(36, 62);
  ctx.lineTo(width - 36, 62);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // -------------------------------------------------------------
  // USER 1 SQUIRCLE (LEFT: x=50, y=90)
  // -------------------------------------------------------------
  const u1X = 60;
  const uY = 96;
  const sqSize = 100;

  // Squircle frame
  roundRect(u1X - 3, uY - 3, sqSize + 6, sqSize + 6, 26);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  roundRect(u1X, uY, sqSize, sqSize, 24);
  const u1Grad = ctx.createLinearGradient(u1X, uY, u1X + sqSize, uY + sqSize);
  u1Grad.addColorStop(0, '#22252a');
  u1Grad.addColorStop(1, '#111315');
  ctx.fillStyle = u1Grad;
  ctx.fill();

  ctx.font = 'bold 30px "JetBrains Mono", monospace';
  ctx.fillStyle = '#f2f4f8';
  ctx.textAlign = 'center';
  ctx.fillText(data.user1.avatarMonogram, u1X + sqSize / 2, uY + sqSize / 2 + 10);

  // User 1 Names
  ctx.font = 'bold 24px "Inter", sans-serif';
  ctx.fillStyle = '#f2f4f8';
  ctx.fillText(data.user1.pseudonym, u1X + sqSize / 2, uY + sqSize + 36);

  ctx.font = '500 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8b929e';
  ctx.fillText(`ID: ${data.user1.destinyId} · ${data.user1.tier}`, u1X + sqSize / 2, uY + sqSize + 58);

  // -------------------------------------------------------------
  // USER 2 SQUIRCLE (RIGHT: x=800, y=96)
  // -------------------------------------------------------------
  const u2X = width - 60 - sqSize;

  roundRect(u2X - 3, uY - 3, sqSize + 6, sqSize + 6, 26);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  roundRect(u2X, uY, sqSize, sqSize, 24);
  const u2Grad = ctx.createLinearGradient(u2X, uY, u2X + sqSize, uY + sqSize);
  u2Grad.addColorStop(0, '#22252a');
  u2Grad.addColorStop(1, '#111315');
  ctx.fillStyle = u2Grad;
  ctx.fill();

  ctx.font = 'bold 30px "JetBrains Mono", monospace';
  ctx.fillStyle = '#f2f4f8';
  ctx.textAlign = 'center';
  ctx.fillText(data.user2.avatarMonogram, u2X + sqSize / 2, uY + sqSize / 2 + 10);

  // User 2 Names
  ctx.font = 'bold 24px "Inter", sans-serif';
  ctx.fillStyle = '#f2f4f8';
  ctx.fillText(data.user2.pseudonym, u2X + sqSize / 2, uY + sqSize + 36);

  ctx.font = '500 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8b929e';
  ctx.fillText(`ID: ${data.user2.destinyId} · ${data.user2.tier}`, u2X + sqSize / 2, uY + sqSize + 58);

  // -------------------------------------------------------------
  // CENTER TELEMETRY & CHEMISTRY (x: 280, width: 400)
  // -------------------------------------------------------------
  const cX = width / 2;
  const cBoxX = 260;
  const cBoxW = 440;
  const cBoxY = 96;
  const cBoxH = 190;

  roundRect(cBoxX, cBoxY, cBoxW, cBoxH, 18);
  ctx.fillStyle = '#121417';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Top highlight bevel
  ctx.beginPath();
  ctx.moveTo(cBoxX + 18, cBoxY + 1);
  ctx.lineTo(cBoxX + cBoxW - 18, cBoxY + 1);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Chemistry Score Hero
  ctx.font = 'bold 12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8b929e';
  ctx.textAlign = 'center';
  ctx.fillText('MATCH CHEMISTRY AFFINITY', cX, cBoxY + 36);

  ctx.font = 'bold 52px "JetBrains Mono", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${data.chemistryScore}%`, cX, cBoxY + 92);

  // Talk time
  ctx.font = '600 15px "JetBrains Mono", monospace';
  ctx.fillStyle = '#d0d4dc';
  ctx.fillText(`DURATION: ${data.durationText}`, cX, cBoxY + 124);

  // Rewards Pill row
  const rY = cBoxY + 144;
  roundRect(cX - 160, rY, 150, 28, 6);
  ctx.fillStyle = '#181b20';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.stroke();
  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#10B981';
  ctx.fillText(`+${data.xpAwarded} XP GAINED`, cX - 85, rY + 18);

  roundRect(cX + 10, rY, 150, 28, 6);
  ctx.fillStyle = '#181b20';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`+${data.coinsAwarded} DC EARNED`, cX + 85, rY + 18);

  // -------------------------------------------------------------
  // LOWER HIGHLIGHT BANNER (y: 316)
  // -------------------------------------------------------------
  const banY = 316;
  const banW = width - 72;
  roundRect(36, banY, banW, 76, 14);
  ctx.fillStyle = '#101215';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '600 13px "Inter", sans-serif';
  ctx.fillStyle = '#f2f4f8';
  ctx.textAlign = 'center';
  ctx.fillText('✨ Both partners were awarded coins and connection progression XP.', width / 2, banY + 34);

  ctx.font = '500 12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#575d68';
  ctx.fillText('Privacy Guaranteed · Discord usernames and identities remained 100% hidden', width / 2, banY + 56);

  // -------------------------------------------------------------
  // FOOTER (y: 444)
  // -------------------------------------------------------------
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#575d68';
  ctx.textAlign = 'left';
  ctx.fillText('DESTINY ANONYMOUS MATCHMAKING · EPHEMERAL CO-OP RECAP', 36, 446);

  ctx.textAlign = 'right';
  ctx.fillText('STATUS: SESSION COMPLETED', width - 36, 446);
}

async function main() {
  const WIDTH = 960;
  const HEIGHT = 480;

  const recapData: SessionRecapData = {
    roomCode: 'ROOM-8492A1',
    durationText: '48m 12s',
    chemistryScore: 96,
    xpAwarded: 450,
    coinsAwarded: 25,
    user1: {
      pseudonym: 'Midnight Wolf',
      avatarMonogram: 'MW',
      destinyId: 'R7ZYFK',
      tier: 'Strangers',
    },
    user2: {
      pseudonym: 'Celestial Fox',
      avatarMonogram: 'CF',
      destinyId: '9XU8R3',
      tier: 'Acquaintances',
    },
  };

  const artifactDir = 'C:\\Users\\basud\\.gemini\\antigravity\\brain\\941dc802-7f14-46db-9ac4-519acb6709dc';
  const canvas = createCanvas(WIDTH, HEIGHT);
  drawSessionRecapCard(canvas.getContext('2d'), recapData, WIDTH, HEIGHT);

  const pngBuf = canvas.toBuffer('image/png');
  const pngPath = path.join(artifactDir, 'destiny_session_recap.png');
  fs.writeFileSync(pngPath, pngBuf);
  console.log(`Saved Session Recap PNG to ${pngPath}`);
}

main().catch(console.error);
