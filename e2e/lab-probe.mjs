/**
 * Lab probe: build, preview, open #lab in headless Chromium, force faces,
 * drive a synthetic scrub gesture on the cup, and assert the DOM-exposed
 * settled faces equal the forced ones. Run: node e2e/lab-probe.mjs
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4199
const url = `http://localhost:${PORT}/#lab`

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
  })
}

console.log('[probe] building…')
await run('npx', ['vite', 'build'])

console.log('[probe] starting preview…')
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
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto(url)
  await page.waitForSelector('canvas', { timeout: 10_000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })

  // force a specific outcome
  await page.fill('#forced', '6,6,6,6,6')

  // synthetic scrub: grab the cup, wiggle hard, flick up
  const cup = page.locator('.cup-grip')
  await cup.waitFor({ timeout: 5_000 })
  const box = await cup.boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(cx + (i % 2 === 0 ? -70 : 70), cy + (i % 3) * 14, { steps: 2 })
  }
  await page.mouse.move(cx, cy - 180, { steps: 3 }) // the flick
  await page.mouse.up()

  await page.waitForSelector('.lab[data-rolling="false"]', { timeout: 20_000 })
  const faces = await page.getAttribute('.lab', 'data-faces')
  const visual = await page.evaluate(() => window.__lab.visualFaces().join(','))
  console.log('[probe] settled faces:', faces, '| rendered tops:', visual)
  if (faces !== '6,6,6,6,6' || visual !== '6,6,6,6,6') {
    console.error(`[probe] FAIL: expected 6,6,6,6,6 got model=${faces} visual=${visual}`)
    failed = true
  }

  // second roll: hold two dice, roll the rest onto forced 1s
  await page.fill('#forced', '1,1,1,1,1')
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 0; i < 16; i++) {
    await page.mouse.move(cx + (i % 2 === 0 ? -60 : 60), cy, { steps: 2 })
  }
  await page.mouse.move(cx, cy - 160, { steps: 3 })
  await page.mouse.up()
  await page.waitForSelector('.lab[data-rolling="false"]', { timeout: 20_000 })
  const faces2 = await page.getAttribute('.lab', 'data-faces')
  const visual2 = await page.evaluate(() => window.__lab.visualFaces().join(','))
  console.log('[probe] second roll faces:', faces2, '| rendered tops:', visual2)
  if (faces2 !== '1,1,1,1,1' || visual2 !== '1,1,1,1,1') {
    console.error(`[probe] FAIL: expected 1,1,1,1,1 got model=${faces2} visual=${visual2}`)
    failed = true
  }

  await page.screenshot({ path: 'e2e/lab-probe.png' })
  if (errors.length) {
    console.error('[probe] page errors:', errors)
    failed = true
  }
  await browser.close()
} catch (err) {
  console.error('[probe] FAIL:', err)
  failed = true
} finally {
  preview.kill()
}

console.log(failed ? '[probe] FAILED' : '[probe] OK')
process.exit(failed ? 1 : 0)
