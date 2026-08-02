/**
 * Every texture is generated at runtime on canvas — the repo ships zero
 * image binaries. Palette mirrors app.css: casino-night felt, ivory dice,
 * warm near-black pips, walnut and brass.
 */
import {
  CanvasTexture,
  Color,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'

export const PALETTE = {
  felt: '#0b3d2e',
  feltLo: '#062017',
  ivory: '#f4ecd9',
  ivoryLo: '#e2d5b8',
  pip: '#2a2118',
  walnut: '#241610',
  walnutHi: '#3d2619',
  brass: '#c9a227',
  leather: '#3a2418',
  leatherHi: '#54341f',
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  return [c, c.getContext('2d')!]
}

/** Deep green felt with fiber noise and a soft radial lightening. */
export function feltTexture(size = 512): CanvasTexture {
  const [c, ctx] = canvas(size)
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.1,
    size / 2,
    size / 2,
    size * 0.75,
  )
  grad.addColorStop(0, PALETTE.felt)
  grad.addColorStop(1, PALETTE.feltLo)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  // fiber noise
  const img = ctx.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = RepeatWrapping
  return tex
}

/** Pip layouts on a unit square (0–1 coords). */
const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.28, 0.28],
    [0.72, 0.72],
  ],
  3: [
    [0.26, 0.26],
    [0.5, 0.5],
    [0.74, 0.74],
  ],
  4: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  5: [
    [0.26, 0.26],
    [0.74, 0.26],
    [0.5, 0.5],
    [0.26, 0.74],
    [0.74, 0.74],
  ],
  6: [
    [0.28, 0.24],
    [0.72, 0.24],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.28, 0.76],
    [0.72, 0.76],
  ],
}

/** Ivory die face with slightly ink-bled pips. */
export function faceTexture(value: number, size = 256): CanvasTexture {
  const [c, ctx] = canvas(size)
  ctx.fillStyle = PALETTE.ivory
  ctx.fillRect(0, 0, size, size)
  // subtle warm vignette toward the edges
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.35,
    size / 2,
    size / 2,
    size * 0.72,
  )
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(120,95,60,0.16)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)

  const r = size * 0.085
  ctx.fillStyle = PALETTE.pip
  ctx.shadowColor = PALETTE.pip
  ctx.shadowBlur = size * 0.02 // the ink bleed
  for (const [x, y] of PIP_LAYOUTS[value]) {
    ctx.beginPath()
    ctx.arc(x * size, y * size, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // specular dot on each pip
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  for (const [x, y] of PIP_LAYOUTS[value]) {
    ctx.beginPath()
    ctx.arc(x * size - r * 0.3, y * size - r * 0.3, r * 0.28, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

/**
 * Die materials in BoxGeometry group order [+X, -X, +Y, -Y, +Z, -Z] matching
 * facemap's convention: 3, 4, 1, 6, 2, 5.
 */
export function dieMaterials(): MeshStandardMaterial[] {
  const faceOnAxis = [3, 4, 1, 6, 2, 5]
  return faceOnAxis.map(
    (v) =>
      new MeshStandardMaterial({
        map: faceTexture(v),
        roughness: 0.35,
        metalness: 0.02,
        emissive: new Color('#000000'),
      }),
  )
}

export function feltMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ map: feltTexture(), roughness: 0.95, metalness: 0 })
}

export function walnutMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(PALETTE.walnut),
    roughness: 0.5,
    metalness: 0.12,
  })
}

export function leatherMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(PALETTE.leather),
    roughness: 0.7,
    metalness: 0.04,
  })
}

export function brassMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(PALETTE.brass),
    roughness: 0.35,
    metalness: 0.85,
  })
}

/** A floating pill label ("KEEP") as a sprite texture. */
export function labelTexture(text: string, size = 256): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size / 2
  const ctx = c.getContext('2d')!
  const w = size
  const h = size / 2
  const r = h * 0.32
  ctx.beginPath()
  ctx.roundRect(w * 0.08, h * 0.18, w * 0.84, h * 0.64, r)
  ctx.fillStyle = 'rgba(8, 13, 10, 0.82)'
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = PALETTE.brass
  ctx.stroke()
  ctx.fillStyle = '#f4ecd9'
  ctx.font = `600 ${h * 0.34}px Jost, Avenir Next, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.letterSpacing = '6px'
  ctx.fillText(text, w / 2 + 3, h * 0.51)
  // little downward pointer
  ctx.beginPath()
  ctx.moveTo(w / 2 - h * 0.1, h * 0.82)
  ctx.lineTo(w / 2 + h * 0.1, h * 0.82)
  ctx.lineTo(w / 2, h * 0.98)
  ctx.closePath()
  ctx.fillStyle = PALETTE.brass
  ctx.fill()
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}
