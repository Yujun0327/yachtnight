import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
const PORT = 4196
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' })
await new Promise((r) => setTimeout(r, 1500))
try {
  const browser = await chromium.launch()
  for (const [w, h, name] of [[1100, 750, 'desktop'], [390, 780, 'phone']]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`http://localhost:${PORT}/#lab`)
    await page.waitForSelector('canvas')
    await page.fill('#forced', '6,6,6,6,6')
    const cup = page.locator('.cup-grip')
    const box = await cup.boundingBox()
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2
    await page.mouse.move(cx, cy); await page.mouse.down()
    for (let i = 0; i < 12; i++) await page.mouse.move(cx + (i % 2 ? 50 : -50), cy, { steps: 2 })
    await page.mouse.move(cx, cy - 140, { steps: 3 }); await page.mouse.up()
    await page.waitForSelector('.lab[data-rolling="false"]', { timeout: 20000 })
    await page.screenshot({ path: `e2e/frame-${name}.png` })
    await page.close()
  }
  await browser.close()
} finally { preview.kill() }
console.log('done')
