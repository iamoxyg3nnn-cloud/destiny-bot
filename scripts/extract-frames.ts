import sharp from 'sharp';

async function extractFrames() {
  const file = 'C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/profile-motion.webp';
  for (const f of [0, 20, 40, 60]) {
    await sharp(file, { page: f })
      .toFile(`C:/Users/basud/.gemini/antigravity/brain/941dc802-7f14-46db-9ac4-519acb6709dc/frame_${f}.png`);
    console.log(`Extracted frame ${f}`);
  }
}

extractFrames();
