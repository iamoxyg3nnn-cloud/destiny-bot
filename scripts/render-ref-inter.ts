import { createCanvas, Image, GlobalFonts } from '@napi-rs/canvas';
import * as fs from 'fs';
import * as path from 'path';

GlobalFonts.registerFromPath('assets/fonts/Inter.ttf', 'Inter');

const svg = fs.readFileSync('scripts/reference-profile.svg');
const img = new Image();
img.src = svg;

const canvas = createCanvas(960, 480);
const ctx = canvas.getContext('2d');
ctx.drawImage(img, 0, 0);

const out = path.resolve('C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/reference_render_inter.png');
fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log('Rendered with Inter to', out);
