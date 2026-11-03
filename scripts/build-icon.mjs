// Renders resources/icon.svg to resources/icon.png, the Marketplace icon.
//
// The Marketplace does not accept an SVG icon, and asks for at least 128x128 pixels, 256x256 for high
// density screens: https://code.visualstudio.com/api/references/extension-manifest (icon) and
// https://code.visualstudio.com/api/working-with-extensions/publishing-extension (image restrictions).
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../resources/icon.svg', import.meta.url));
const target = fileURLToPath(new URL('../resources/icon.png', import.meta.url));

// Rasterize at a higher density than needed, then resize, for smooth curves.
await sharp(source, { density: 288 }).resize(256, 256).png({ compressionLevel: 9 }).toFile(target);
console.log(`Wrote ${target}`);
