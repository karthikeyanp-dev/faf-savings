import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

const inputImagePath = 'C:\\Users\\karth\\.gemini\\antigravity\\brain\\121da252-311e-4c55-a095-e7b8a54dfbce\\faf_savings_logo_1775895237103.png';
const publicDir = path.resolve(process.cwd(), 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

async function generateIcons() {
  try {
    const sizes = [
      { size: 192, name: 'pwa-192x192.png' },
      { size: 512, name: 'pwa-512x512.png' },
      { size: 512, name: 'maskable-icon-512x512.png' },
      { size: 180, name: 'apple-touch-icon.png' }
    ];

    for (const { size, name } of sizes) {
      await sharp(inputImagePath)
        .resize(size, size)
        .toFile(path.join(publicDir, name));
      console.log(`Generated ${name}`);
    }

    // create favicon.ico
    await sharp(inputImagePath)
      .resize(64, 64)
      .toFile(path.join(publicDir, 'favicon.ico'));
    console.log(`Generated favicon.ico`);

  } catch (err) {
    console.error('Error generating icons:', err);
  }
}

generateIcons();
