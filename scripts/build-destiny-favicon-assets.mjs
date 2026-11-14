import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const assetDir = path.resolve('apps/shared/assets');
const stickers = [
  'destiny_blink.gif',
  'destiny_cute.gif',
  'destiny_hearts.gif',
  'destiny_kiss.gif',
  'destiny_shock.gif',
  'destiny_sleepy.gif',
  'destiny_talk.gif',
  'destiny_wink.gif',
];

for (const stickerName of stickers) {
  const image = await loadImage(path.join(assetDir, stickerName));
  const canvas = createCanvas(128, 128);
  const context = canvas.getContext('2d');
  const x = 6;
  const y = 6;
  const size = 116;
  const radius = 35;

  context.save();
  context.shadowColor = 'rgba(40, 78, 58, 0.18)';
  context.shadowBlur = 7;
  context.shadowOffsetY = 2;
  context.beginPath();
  context.roundRect(x, y, size, size, radius);
  context.fillStyle = '#e6f3eb';
  context.fill();
  context.restore();

  context.save();
  context.beginPath();
  context.roundRect(x, y, size, size, radius);
  context.clip();
  context.drawImage(image, x, y, size, size);
  context.restore();

  context.beginPath();
  context.roundRect(x + 1, y + 1, size - 2, size - 2, radius - 1);
  context.lineWidth = 3;
  context.strokeStyle = '#456552';
  context.stroke();

  const slug = stickerName.replace(/^destiny_/, '').replace(/\.gif$/, '');
  await writeFile(path.join(assetDir, `destiny-icon-${slug}.png`), canvas.toBuffer('image/png'));
}

console.log(`Generated ${stickers.length} framed Destiny favicon assets.`);
