/** Real-time (NO reduced motion) roll → bank → score-picks regression probe. */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { bankAll } from './bank-helper.mjs'
const PORT = 4197
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' })
await new Promise((r) => setTimeout(r, 1500))
let failed = false
try {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1100, height: 750 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
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
  // real-time playback must finish on its own and re-offer the cup
  await page.waitForSelector('.game[data-rolling="false"]', { timeout: 15000 })
  await page.waitForSelector('.cup-grip', { timeout: 5000 })
  console.log('[repro5] playback finished, cup returned')
  if (!(await bankAll(page))) {
    console.error('[repro5] FAIL: could not bank all five')
    failed = true
  } else {
    await page.waitForSelector('.pick', { timeout: 8000 })
    console.log('[repro5] banked all five → sheet unlocked,', await page.locator('.pick').count(), 'picks')
  }
  if (errors.length) {
    console.error('[repro5] page errors:', errors)
    failed = true
  }
  await browser.close()
} catch (err) {
  console.error('[repro5] FAIL:', err)
  failed = true
} finally { preview.kill() }
console.log(failed ? '[repro5] FAILED' : '[repro5] OK')
process.exit(failed ? 1 : 0)
