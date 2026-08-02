/**
 * Solo game probe: Home → 1-player Classic Yacht → roll, bank all five,
 * score — all 12 boxes via real pointer gestures → victory overlay.
 * Run: node e2e/solo-probe.mjs (assumes dist/ is built)
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { bankAll } from './bank-helper.mjs'

const PORT = 4198
console.log('[solo] starting preview…')
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
})
await new Promise((resolve) => setTimeout(resolve, 1500))

let failed = false
try {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1100, height: 750 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.emulateMedia({ reducedMotion: 'reduce' })

  await page.goto(`http://localhost:${PORT}/`)
  await page.click('button.seat:has-text("1")')
  await page.click('button:has-text("Begin")')
  await page.waitForSelector('.cup-grip', { timeout: 8_000 })

  for (let turn = 1; turn <= 12; turn++) {
    const cup = page.locator('.cup-grip')
    await cup.waitFor({ timeout: 8_000 })
    const box = await cup.boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(cx + (i % 2 === 0 ? -60 : 60), cy, { steps: 2 })
    }
    await page.mouse.move(cx, cy - 160, { steps: 3 })
    await page.mouse.up()
    await page.waitForSelector('.game[data-rolling="false"]', { timeout: 15_000 })
    await page.waitForTimeout(300)

    // the new ritual: no scoring until all five dice are banked in the tray
    const picksBefore = await page.locator('.pick').count()
    if (picksBefore > 0) {
      console.error('[solo] FAIL: sheet unlocked before banking')
      failed = true
    }
    if (!(await bankAll(page))) {
      console.error(`[solo] FAIL: could not bank all five on turn ${turn}`)
      failed = true
      break
    }
    const pick = page.locator('.pick').first()
    await pick.waitFor({ timeout: 15_000 })
    await pick.click()
    console.log(`[solo] turn ${turn} banked & scored`)
  }

  await page.waitForSelector('text=final score', { timeout: 10_000 })
  const total = await page.textContent('.overlay h2')
  console.log('[solo] final score:', total.trim())
  await page.waitForTimeout(400)
  const overlayStillThere = await page.evaluate(() => {
    const el = document.querySelector('.overlay')
    if (!el) return 'GONE'
    const cs = getComputedStyle(el)
    return `present opacity=${cs.opacity} z=${cs.zIndex}`
  })
  console.log('[solo] overlay after 400ms:', overlayStillThere)
  if (overlayStillThere === 'GONE') failed = true
  await page.screenshot({ path: 'e2e/solo-probe.png' })

  if (errors.length) {
    console.error('[solo] page errors:', errors)
    failed = true
  }
  await browser.close()
} catch (err) {
  console.error('[solo] FAIL:', err)
  failed = true
} finally {
  preview.kill()
}

console.log(failed ? '[solo] FAILED' : '[solo] OK')
process.exit(failed ? 1 : 0)
