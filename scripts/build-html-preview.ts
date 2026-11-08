import * as fs from 'fs';
import * as path from 'path';

const artifactDir = 'C:\\Users\\basud\\.gemini\\antigravity\\brain\\941dc802-7f14-46db-9ac4-519acb6709dc';
const webpPath = path.join(artifactDir, 'destiny_monochrome_motion.webp');
const pngPath = path.join(artifactDir, 'destiny_monochrome_card.png');

const webpBase64 = fs.readFileSync(webpPath).toString('base64');
const pngBase64 = fs.readFileSync(pngPath).toString('base64');

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Destiny Profile Monochrome Card Preview</title>
  <style>
    body {
      margin: 0;
      padding: 40px;
      background: #050607;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #f2f4f8;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .header {
      margin-bottom: 28px;
      text-align: center;
    }
    .header h1 {
      font-size: 26px;
      font-weight: 700;
      margin: 0 0 8px 0;
      letter-spacing: -0.5px;
      color: #ffffff;
    }
    .header p {
      font-size: 14px;
      color: #717784;
      margin: 0;
    }
    .preview-card {
      background: #090a0c;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 32px;
      padding: 16px;
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.8), 0 0 50px rgba(255, 255, 255, 0.03);
      max-width: 992px;
      width: 100%;
      box-sizing: border-box;
    }
    .card-img {
      width: 100%;
      height: auto;
      border-radius: 24px;
      display: block;
    }
    .badges {
      display: flex;
      gap: 12px;
      margin-top: 24px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .badge {
      background: #121417;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 9999px;
      padding: 6px 16px;
      font-size: 12px;
      font-family: "JetBrains Mono", monospace;
      font-weight: 600;
      color: #a0a6b2;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .badge-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
    }
    .badge-highlight {
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.25);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Destiny Profile — Luxury Monochrome Palette</h1>
    <p>Obsidian Void · Titanium Hairlines · JetBrains Mono Telemetry · 20 FPS Animated Laser Pulse</p>
  </div>

  <div class="preview-card">
    <img class="card-img" src="data:image/webp;base64,${webpBase64}" alt="Destiny Monochrome Motion Card" />
  </div>

  <div class="badges">
    <div class="badge"><span class="badge-dot"></span> Live Supabase User: R7ZYFK</div>
    <div class="badge">960 × 480 Ultra-HD</div>
    <div class="badge badge-highlight">Obsidian & Titanium Monochrome</div>
    <div class="badge">Inter + JetBrains Mono</div>
    <div class="badge">20 FPS Animated WebP</div>
  </div>
</body>
</html>
`;

const viewerPath = path.join(artifactDir, 'card_viewer.html');
fs.writeFileSync(viewerPath, htmlContent);
console.log('Updated card_viewer.html with monochrome preview');
