/**
 * Generate AppExchange-ready PNG assets from the brand SVG.
 * Run: cd branding && node generate-pngs.js
 *
 * Outputs:
 *   logo-512.png         (square 512x512 - AppExchange listing logo)
 *   logo-256.png         (square 256x256 - smaller listing thumbnails)
 *   logo-1024.png        (square 1024x1024 - high-DPI displays / scaling headroom)
 *   logo-tile-220.png    (220x220 - AppExchange tile)
 */
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const svg = fs.readFileSync(path.join(__dirname, 'logo-512.svg'))

const sizes = [256, 512, 1024, 220]

;(async () => {
  for (const size of sizes) {
    const out = size === 220
      ? `logo-tile-${size}.png`
      : `logo-${size}.png`
    await sharp(svg)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(__dirname, out))
    console.log(`  ✓ ${out}`)
  }
  console.log('Done.')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
