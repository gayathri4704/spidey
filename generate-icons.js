import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const source = 'd:/spidey1/spidey-logo.png';
const outDir = 'd:/spidey1/spidey1/public';
const iconsDir = path.join(outDir, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

async function generate() {
  const s = sharp(source);
  
  // favicon
  await s.clone().resize(32, 32).toFile(path.join(outDir, 'favicon.png'));
  
  // 192
  await s.clone().resize(192, 192).toFile(path.join(iconsDir, 'icon-192.png'));
  
  // 512
  await s.clone().resize(512, 512).toFile(path.join(iconsDir, 'icon-512.png'));
  await s.clone().resize(512, 512).toFile(path.join(iconsDir, 'maskable-512.png'));
  
  // apple
  await s.clone().resize(180, 180).toFile(path.join(iconsDir, 'apple-touch-icon.png'));
  
  console.log('Icons generated successfully.');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
