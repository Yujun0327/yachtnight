/**
 * The casino table: felt pad with a walnut rim under one warm spotlight,
 * five ivory dice and a leather cup. One shadow-casting spotlight (512px
 * map), DPR capped at 2, no postprocessing — must hold 60fps on mid-range
 * Android. All geometry procedural, all textures canvas-generated.
 */
import {
  AmbientLight,
  CylinderGeometry,
  Group,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SpotLight,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  brassMaterial,
  dieMaterials,
  feltMaterial,
  labelTexture,
  leatherMaterial,
  walnutMaterial,
} from './materials'
import { CUP, DICE_COUNT, DIE_SIZE, PAD, TRAY } from './physics'

export interface Stage {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  dice: Mesh[]
  cup: Group
  keepSigns: Sprite[]
  /** Extra camera offset for shake/push-in drama; reset each frame by the director. */
  camShake: Vector3
  camPush: { value: number }
  render(): void
  setSize(w: number, h: number): void
  dispose(): void
}

const CAM_POS = new Vector3(0, 13.5, 11.5)
const CAM_LOOK = new Vector3(0, 0, -1.9)
const CAM_DIR = CAM_POS.clone().sub(CAM_LOOK).normalize()

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true

  const scene = new Scene()
  const camera = new PerspectiveCamera(38, 1, 0.5, 100)
  camera.position.copy(CAM_POS)
  camera.lookAt(CAM_LOOK)

  /* lights: one warm spot + ambient + a candle-warm fill — warm and clear,
     midway between moody and washed-out. */
  const spot = new SpotLight('#ffe0b0', 1250)
  spot.position.set(0, 16, 1)
  spot.angle = 0.78
  spot.penumbra = 0.6
  spot.decay = 1.5
  spot.castShadow = true
  spot.shadow.mapSize.set(512, 512)
  spot.shadow.bias = -0.002
  spot.target.position.set(0, 0, -1)
  scene.add(spot, spot.target)
  scene.add(new AmbientLight('#4d5c52', 2.9))
  const fill = new PointLight('#ffab60', 120, 40, 1.7)
  fill.position.set(-6, 7, 8)
  scene.add(fill)

  /* the table */
  const felt = new Mesh(new PlaneGeometry(PAD.halfW * 2 + 3, PAD.halfD * 2 + 3), feltMaterial())
  felt.rotation.x = -Math.PI / 2
  felt.receiveShadow = true
  scene.add(felt)

  // walnut rim: four low rounded bars around the pad
  const rimMat = walnutMaterial()
  const rimH = 0.9
  const rimT = 0.8
  const bars: Array<[number, number, number, number, number]> = [
    // [cx, cz, w, d, rotY]
    [0, -PAD.halfD - rimT / 2, PAD.halfW * 2 + rimT * 2, rimT, 0],
    [0, PAD.halfD + rimT / 2, PAD.halfW * 2 + rimT * 2, rimT, 0],
    [-PAD.halfW - rimT / 2, 0, rimT, PAD.halfD * 2, 0],
    [PAD.halfW + rimT / 2, 0, rimT, PAD.halfD * 2, 0],
  ]
  for (const [cx, cz, w, d] of bars) {
    const bar = new Mesh(new RoundedBoxGeometry(w, rimH, d, 3, 0.18), rimMat)
    bar.position.set(cx, rimH / 2 - 0.05, cz)
    bar.castShadow = true
    bar.receiveShadow = true
    scene.add(bar)
  }
  // brass corner studs (studMat is reused by the tray's well frames)
  const studGeo = new CylinderGeometry(0.22, 0.22, rimH + 0.06, 12)
  const studMat = brassMaterial()
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const stud = new Mesh(studGeo, studMat)
      stud.position.set(sx * (PAD.halfW + rimT / 2), rimH / 2, sz * (PAD.halfD + rimT / 2))
      scene.add(stud)
    }
  }

  /* the keep tray: five felt-lined wells on a walnut base behind the pad */
  const trayW = 5 * TRAY.pitch + 1.1
  const trayD = TRAY.well + 0.9
  const trayBase = new Mesh(new RoundedBoxGeometry(trayW, TRAY.baseH, trayD, 3, 0.16), rimMat)
  trayBase.position.set(0, TRAY.baseH / 2 - 0.02, TRAY.z)
  trayBase.castShadow = true
  trayBase.receiveShadow = true
  scene.add(trayBase)
  const wellMat = feltMaterial()
  for (let i = 0; i < 5; i++) {
    const well = new Mesh(new PlaneGeometry(TRAY.well, TRAY.well), wellMat)
    well.rotation.x = -Math.PI / 2
    well.position.set((i - 2) * TRAY.pitch, TRAY.baseH + 0.005, TRAY.z)
    well.receiveShadow = true
    scene.add(well)
    // thin brass frame around each well
    const frame = new Mesh(
      new CylinderGeometry(TRAY.well * 0.71, TRAY.well * 0.71, 0.03, 4, 1, true),
      studMat,
    )
    frame.rotation.y = Math.PI / 4
    frame.position.set((i - 2) * TRAY.pitch, TRAY.baseH + 0.02, TRAY.z)
    scene.add(frame)
  }

  /* floating KEEP tags, one per die (director drives visibility/position) */
  const keepSigns: Sprite[] = []
  const keepTex = labelTexture('KEEP')
  for (let i = 0; i < DICE_COUNT; i++) {
    const sprite = new Sprite(new SpriteMaterial({ map: keepTex, transparent: true, depthWrite: false }))
    sprite.scale.set(1.9, 0.95, 1)
    sprite.visible = false
    scene.add(sprite)
    keepSigns.push(sprite)
  }

  /* dice */
  const dice: Mesh[] = []
  for (let i = 0; i < DICE_COUNT; i++) {
    const die = new Mesh(
      new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 4, DIE_SIZE * 0.12),
      dieMaterials(),
    )
    die.castShadow = true
    die.receiveShadow = true
    die.position.set(0, DIE_SIZE / 2, 0)
    scene.add(die)
    dice.push(die)
  }

  /* the cup: leather shaker, open mouth */
  const cup = new Group()
  const cupWall = new Mesh(
    new CylinderGeometry(CUP.radius * 1.02, CUP.radius * 0.88, CUP.height, 24, 1, true),
    leatherMaterial(),
  )
  cupWall.material.side = 2 // DoubleSide
  cupWall.castShadow = true
  const cupBottom = new Mesh(
    new CylinderGeometry(CUP.radius * 0.88, CUP.radius * 0.88, 0.18, 24),
    leatherMaterial(),
  )
  cupBottom.position.y = -CUP.height / 2
  const cupBand = new Mesh(
    new CylinderGeometry(CUP.radius * 1.05, CUP.radius * 1.05, 0.26, 24, 1, true),
    brassMaterial(),
  )
  cupBand.material.side = 2
  cupBand.position.y = CUP.height / 2 - 0.3
  cup.add(cupWall, cupBottom, cupBand)
  cup.visible = false
  scene.add(cup)

  const camShake = new Vector3()
  const camPush = { value: 0 }
  const basePos = CAM_POS.clone()

  function render(): void {
    camera.position.copy(basePos).addScaledVector(CAM_DIR, -camPush.value * 3.2)
    camera.position.add(camShake)
    camera.lookAt(CAM_LOOK)
    renderer.render(scene, camera)
  }

  function setSize(w: number, h: number): void {
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    // frame the WHOLE pad (rim included) at any aspect: pull the camera back
    // along its fixed direction until both extents fit with margin
    const vfov = (camera.fov * Math.PI) / 180
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect)
    const needW = PAD.halfW + 1.9
    const needD = PAD.halfD + 5.8 // includes the keep tray behind the pad
    const dist = Math.max(needW / Math.tan(hfov / 2), needD / Math.tan(vfov / 2), 13)
    basePos.copy(CAM_LOOK).addScaledVector(CAM_DIR, dist)
  }

  function dispose(): void {
    renderer.dispose()
    scene.traverse((obj) => {
      const mesh = obj as Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const m of mats) m.dispose()
    })
  }

  return { renderer, scene, camera, dice, cup, keepSigns, camShake, camPush, render, setSize, dispose }
}
