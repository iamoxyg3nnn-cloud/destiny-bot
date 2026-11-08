import { createCanvas, Image } from '@napi-rs/canvas';

const img = new Image();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="red"/></svg>`;
img.src = Buffer.from(svg);

const c = createCanvas(100, 100);
const ctx = c.getContext('2d');
ctx.drawImage(img, 0, 0);

console.log('SVG render buffer size:', c.toBuffer('image/png').length);
