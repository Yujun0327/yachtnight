import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
const PORT = 4197
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' })
await new Promise((r) => setTimeout(r, 1500))
try {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1100, height: 750 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  // NO reduced motion — the real-time playback path
  await page.goto(`http://localhost:${PORT}/`)
  await page.click('button.seat:has-text("1")')
  await page.click('button:has-text("Begin")')
  const cup = page.locator('.cup-grip')
  await cup.waitFor({ timeout: 8000 })
  const box = await cup.boundingBox()
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 0; i < 20; i++) await page.mouse.move(cx + (i % 2 ? 70 : -70), cy + (i % 3) * 10, { steps: 2 })
  await page.mouse.move(cx, cy - 170, { steps: 3 })
  await page.mouse.up()
  // watch phase over time
  for (let t = 0; t < 12; t++) {
    await page.waitForTimeout(1000)
    const state = await page.evaluate(() => {
      const s = window.__yachtnight
      return { rollsUsed: s?.state?.rollsUsed, dice: s?.state?.dice?.join(','), skip: !!document.querySelector('.skip'), picks: document.querySelectorAll('.pick').length, cup: !!document.querySelector('.cup-grip') }
    })
    console.log(`t=${t + 1}s`, JSON.stringify(state))
    if (state.picks > 0) break
  }
  console.log('page errors:', errors)
  await page.screenshot({ path: process.cwd() + '/e2e/repro5.png' })
  await browser.close()
} finally { preview.kill() }
