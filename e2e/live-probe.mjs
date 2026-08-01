import { chromium } from 'playwright'

const url = 'https://yujun0327.github.io/yachtnight/#lab'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 750 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.goto(url)
await page.waitForSelector('canvas', { timeout: 15_000 })
await page.fill('#forced', '5,5,5,5,5')

const cup = page.locator('.cup-grip')
await cup.waitFor({ timeout: 8_000 })
const box = await cup.boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2
await page.mouse.move(cx, cy)
await page.mouse.down()
for (let i = 0; i < 16; i++) {
  await page.mouse.move(cx + (i % 2 === 0 ? -60 : 60), cy, { steps: 2 })
}
await page.mouse.move(cx, cy - 160, { steps: 3 })
await page.mouse.up()
await page.waitForSelector('.lab[data-rolling="false"]', { timeout: 20_000 })
const faces = await page.getAttribute('.lab', 'data-faces')
const visual = await page.evaluate(() => window.__lab.visualFaces().join(','))
console.log('[live] faces:', faces, '| rendered tops:', visual, '| page errors:', errors.length)
await browser.close()
process.exit(faces === '5,5,5,5,5' && visual === '5,5,5,5,5' && errors.length === 0 ? 0 : 1)
