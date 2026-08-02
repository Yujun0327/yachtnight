/** Grid-click the stage canvas until `want` dice are banked (game screen). */
export async function bankAll(page, want = 5) {
  const canvas = await page.locator('.stage-wrap canvas').boundingBox()
  let prev = Number(await page.getAttribute('.game', 'data-banked'))
  for (let round = 0; round < 4; round++) {
    for (let gy = 0.3; gy <= 0.85; gy += 0.06) {
      for (let gx = 0.08; gx <= 0.92; gx += 0.05) {
        const x = canvas.x + canvas.width * gx
        const y = canvas.y + canvas.height * gy
        await page.mouse.click(x, y)
        let count = Number(await page.getAttribute('.game', 'data-banked'))
        if (count < prev) {
          await page.mouse.click(x, y) // un-banked one by accident — put it back
          count = Number(await page.getAttribute('.game', 'data-banked'))
        }
        prev = count
        if (count >= want) return true
      }
    }
  }
  return false
}
