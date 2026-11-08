const fs = require('fs');
const path = require('path');

const imgPath = path.resolve('C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/destiny_profile_sample.png');
const base64 = fs.readFileSync(imgPath).toString('base64');

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-2 flex flex-col items-center">
  <div class="w-full max-w-4xl bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xl flex flex-col items-center gap-3">
    <div class="w-full flex items-center justify-between px-2">
      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
          Discord Card Attachment Preview
        </span>
        <span class="text-xs text-[var(--muted-foreground)]">960 × 480 px • Native 2D Canvas</span>
      </div>
      <span class="text-xs text-emerald-400 font-medium flex items-center gap-1">● Generated in 18ms</span>
    </div>
    <div class="w-full overflow-hidden rounded-xl border border-white/10 shadow-2xl">
      <img src="data:image/png;base64,${base64}" alt="Destiny Profile Card" class="w-full h-auto block rounded-xl" />
    </div>
  </div>
</body>
</html>`;

const outPath = path.resolve('C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/card_viewer.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('Successfully wrote card_viewer.html to', outPath);
