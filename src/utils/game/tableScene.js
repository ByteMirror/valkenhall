import * as THREE from 'three';
import { CARD_THICKNESS, updateFoilSheens, setTextureRenderer } from './cardMesh';
import { addTween, updateTweens } from './animations';
import { perf } from '../perfMonitor';
import { getEffectivePixelRatio, onGraphicsChange } from './graphicsSettings';

const TABLE_WIDTH = 200;
const TABLE_HEIGHT = Math.round(200 / (10300 / 7200));
const TABLE_THICKNESS = 3;
const TABLE_CORNER_RADIUS = 4;

const _right = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _raycastTarget = new THREE.Vector3();
let pollId = null;

function createRoundedBoxGeometry(width, height, depth, radius) {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);

  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);

  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
}

export function createTableScene(canvas, battlemapUrl, backgroundUrl) {
  // Check WebGL support on a throwaway canvas. Testing on the real canvas
  // then calling loseContext() leaves it in a "context lost" state that
  // Three.js can't recover from — the renderer gets a null context and
  // crashes with "Cannot read properties of null (reading 'precision')".
  const probe = document.createElement('canvas');
  const testCtx = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!testCtx) {
    throw new Error('WebGL is not available. Your GPU or browser configuration may not support it.');
  }
  const loseExt = testCtx.getExtension('WEBGL_lose_context');
  if (loseExt) loseExt.loseContext();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Pixel ratio comes from the user's graphics settings (Settings → Display).
  // Defaults to `high` which matches the legacy `min(devicePixelRatio, 1.5)` cap.
  renderer.setPixelRatio(getEffectivePixelRatio());
  renderer.setClearColor(0x0e0b08);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // Hand the renderer to cardMesh so card image textures get uploaded
  // to the GPU as soon as they finish loading, instead of paying the
  // upload cost mid-render the first time the card appears.
  setTextureRenderer(renderer);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);

  // Orbit camera state
  let orbitTarget = new THREE.Vector3(0, 0, 0);
  let orbitDistance = 160;
  let orbitPhi = 0.1; // vertical angle: 0 = top-down, PI/2 = horizon
  let orbitTheta = 0; // horizontal rotation

  function updateCameraFromOrbit() {
    const x = orbitDistance * Math.sin(orbitPhi) * Math.sin(orbitTheta);
    const y = orbitDistance * Math.cos(orbitPhi);
    const z = orbitDistance * Math.sin(orbitPhi) * Math.cos(orbitTheta);
    camera.position.set(orbitTarget.x + x, orbitTarget.y + y, orbitTarget.z + z);
    camera.lookAt(orbitTarget);
  }

  updateCameraFromOrbit();

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0xffffff, 1.6);
  directional.position.set(5, 100, 10);
  directional.castShadow = true;
  directional.shadow.mapSize.width = 1024;
  directional.shadow.mapSize.height = 1024;
  directional.shadow.camera.left = -TABLE_WIDTH / 2;
  directional.shadow.camera.right = TABLE_WIDTH / 2;
  directional.shadow.camera.top = TABLE_WIDTH / 2;
  directional.shadow.camera.bottom = -TABLE_WIDTH / 2;
  scene.add(directional);

  // ─── Time-of-day lighting ───
  // Night = full-moon silvery (still well-lit), day = warm golden.
  // Background art darkens at night instead of the table.
  const TOD_KEYFRAMES = [
    //                    ambient RGB              aInt    directional RGB           dInt    bgDim   moonAngle
    { hour: 0,  ambCol: [0.55, 0.58, 0.72], ambInt: 0.50, dirCol: [0.70, 0.75, 0.90], dirInt: 1.1, bgDim: 0.35, moonAngle: 0.5 },
    { hour: 5,  ambCol: [0.55, 0.58, 0.72], ambInt: 0.50, dirCol: [0.70, 0.75, 0.90], dirInt: 1.1, bgDim: 0.35, moonAngle: 0.9 },
    { hour: 6,  ambCol: [0.95, 0.75, 0.55], ambInt: 0.50, dirCol: [1.00, 0.80, 0.55], dirInt: 1.2, bgDim: 0.60, moonAngle: 0.0 },
    { hour: 8,  ambCol: [1.00, 0.92, 0.82], ambInt: 0.55, dirCol: [1.00, 0.95, 0.85], dirInt: 1.4, bgDim: 0.80, moonAngle: 0.0 },
    { hour: 12, ambCol: [1.00, 0.93, 0.87], ambInt: 0.65, dirCol: [1.00, 0.94, 0.87], dirInt: 1.7, bgDim: 0.88, moonAngle: 0.0 },
    { hour: 17, ambCol: [1.00, 0.88, 0.75], ambInt: 0.60, dirCol: [1.00, 0.82, 0.60], dirInt: 1.5, bgDim: 0.80, moonAngle: 0.0 },
    { hour: 19, ambCol: [0.85, 0.60, 0.45], ambInt: 0.50, dirCol: [0.95, 0.65, 0.45], dirInt: 1.2, bgDim: 0.55, moonAngle: 0.0 },
    { hour: 21, ambCol: [0.60, 0.60, 0.75], ambInt: 0.50, dirCol: [0.75, 0.75, 0.90], dirInt: 1.1, bgDim: 0.40, moonAngle: 0.1 },
    { hour: 24, ambCol: [0.55, 0.58, 0.72], ambInt: 0.50, dirCol: [0.70, 0.75, 0.90], dirInt: 1.1, bgDim: 0.35, moonAngle: 0.5 },
  ];

  function lerpTOD(a, b, t) {
    return {
      ambCol: a.ambCol.map((v, i) => v + (b.ambCol[i] - v) * t),
      ambInt: a.ambInt + (b.ambInt - a.ambInt) * t,
      dirCol: a.dirCol.map((v, i) => v + (b.dirCol[i] - v) * t),
      dirInt: a.dirInt + (b.dirInt - a.dirInt) * t,
      bgDim: a.bgDim + (b.bgDim - a.bgDim) * t,
      moonAngle: a.moonAngle + (b.moonAngle - a.moonAngle) * t,
    };
  }

  function getTimeOfDayLighting() {
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    let lo = TOD_KEYFRAMES[0];
    let hi = TOD_KEYFRAMES[1];
    for (let i = 0; i < TOD_KEYFRAMES.length - 1; i++) {
      if (h >= TOD_KEYFRAMES[i].hour && h < TOD_KEYFRAMES[i + 1].hour) {
        lo = TOD_KEYFRAMES[i];
        hi = TOD_KEYFRAMES[i + 1];
        break;
      }
    }
    const t = (h - lo.hour) / (hi.hour - lo.hour || 1);
    return lerpTOD(lo, hi, t);
  }

  function isNightTime() {
    const h = new Date().getHours();
    return h >= 20 || h < 6;
  }

  // Apply initial lighting
  let bgMaterialRef = null; // set later when background is created
  const initTOD = getTimeOfDayLighting();
  ambient.color.setRGB(...initTOD.ambCol);
  ambient.intensity = initTOD.ambInt;
  directional.color.setRGB(...initTOD.dirCol);
  directional.intensity = initTOD.dirInt;
  if (initTOD.moonAngle > 0) applyMoonPosition(initTOD.moonAngle);

  function applyMoonPosition(moonAngle) {
    // Moon arcs from east (negative X) to west (positive X) across the night sky
    const angle = moonAngle * Math.PI; // 0..1 → 0..π
    const moonX = Math.cos(angle) * 80;
    const moonY = 100;
    const moonZ = Math.sin(angle) * 40 - 20;
    directional.position.set(moonX, moonY, moonZ);
  }

  // ─── Fireflies (visible at night) ───
  const ROAMING_FIREFLY_COUNT = 12;
  const CANDLE_FIREFLY_COUNT = 4; // per candle
  const fireflyStartTime = performance.now() * 0.001;
  const fireflies = [];
  const fireflyGroup = new THREE.Group();
  scene.add(fireflyGroup);

  // ─── Table Candles (at opposite corners, lit at night) ───
  const LAMP_POSITIONS = [
    new THREE.Vector3(-95, 0.05, -64),  // top-left from Player 1's view
    new THREE.Vector3(95, 0.05, 64),    // bottom-right from Player 1's view
  ];
  const lamps = [];
  const candleHolderMat = new THREE.MeshStandardMaterial({
    color: 0x1a1208,
    roughness: 0.55,
    metalness: 0.85,
  });
  const candleWaxMat = new THREE.MeshStandardMaterial({
    color: 0xf5e6c8,
    roughness: 0.85,
  });

  for (const lampPos of LAMP_POSITIONS) {
    const lampGroup = new THREE.Group();

    // Holder saucer
    const saucer = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.5, 0.5, 10),
      candleHolderMat,
    );
    saucer.position.y = 0.25;
    saucer.castShadow = true;
    saucer.receiveShadow = true;
    lampGroup.add(saucer);

    // Wax pool around candle base
    const waxPool = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.4, 0.3, 8),
      candleWaxMat,
    );
    waxPool.position.y = 0.65;
    lampGroup.add(waxPool);

    // Candle body (slightly tapered, thinner at the top)
    const candleBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.8, 4.5, 8),
      candleWaxMat,
    );
    candleBody.position.y = 3.05;
    candleBody.castShadow = true;
    lampGroup.add(candleBody);

    // Flame sprite (tall teardrop glow)
    const flameCanvas = document.createElement('canvas');
    flameCanvas.width = 32;
    flameCanvas.height = 32;
    const fCtx = flameCanvas.getContext('2d');
    const fGrad = fCtx.createRadialGradient(16, 18, 0, 16, 16, 16);
    fGrad.addColorStop(0, 'rgba(255, 255, 220, 1)');
    fGrad.addColorStop(0.2, 'rgba(255, 230, 100, 0.9)');
    fGrad.addColorStop(0.5, 'rgba(255, 180, 40, 0.5)');
    fGrad.addColorStop(1, 'rgba(255, 120, 10, 0)');
    fCtx.fillStyle = fGrad;
    fCtx.fillRect(0, 0, 32, 32);
    const flameTex = new THREE.CanvasTexture(flameCanvas);
    const flameMat = new THREE.SpriteMaterial({
      map: flameTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    });
    const flameSprite = new THREE.Sprite(flameMat);
    flameSprite.scale.set(1.5, 2.8, 1);
    flameSprite.position.y = 6.5;
    lampGroup.add(flameSprite);

    // Soft glow aura around the flame
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const gCtx = glowCanvas.getContext('2d');
    const gGrad = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gGrad.addColorStop(0, 'rgba(255, 220, 100, 0.9)');
    gGrad.addColorStop(0.4, 'rgba(255, 180, 50, 0.4)');
    gGrad.addColorStop(1, 'rgba(255, 150, 30, 0)');
    gCtx.fillStyle = gGrad;
    gCtx.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glowSpriteMat = new THREE.SpriteMaterial({
      map: glowTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    });
    const glowSprite = new THREE.Sprite(glowSpriteMat);
    glowSprite.scale.set(10, 10, 1);
    glowSprite.position.y = 6;
    lampGroup.add(glowSprite);

    // Point light at the flame
    const lampLight = new THREE.PointLight(0xffcc44, 0, 60, 1.5);
    lampLight.position.y = 6;
    lampGroup.add(lampLight);

    lampGroup.position.copy(lampPos);
    scene.add(lampGroup);

    lamps.push({
      group: lampGroup,
      light: lampLight,
      flameMaterial: flameMat,
      flameSprite,
      glowSpriteMaterial: glowSpriteMat,
      tipX: lampPos.x,
      tipY: lampPos.y + 6,
      tipZ: lampPos.z,
    });
  }

  function createFirefly() {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 240, 140, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 220, 80, 0.6)');
    gradient.addColorStop(1, 'rgba(255, 200, 50, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({
      map: texture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.2, 1.2, 1);
    fireflyGroup.add(sprite);
    // No PointLight here. Each firefly used to carry its own light, but
    // 20 fireflies × MeshStandardMaterial fragment shaders meant every
    // PBR pixel looped over 22 lights every frame (the lamps + 20
    // fireflies). The visible glow comes from the additive sprite, not
    // the light contribution, so dropping the lights is invisible to
    // the eye but ~10× cheaper per fragment.
    return { sprite, light: null, material: mat };
  }

  // Candle fireflies — hover near each candle, with spawn/despawn lifecycle
  for (let li = 0; li < lamps.length; li++) {
    const lamp = lamps[li];
    for (let ci = 0; ci < CANDLE_FIREFLY_COUNT; ci++) {
      const { sprite, light, material } = createFirefly();
      sprite.position.set(lamp.tipX, lamp.tipY, lamp.tipZ);

      const homeAngle = Math.random() * Math.PI * 2;
      fireflies.push({
        sprite, light, material,
        type: 'candle',
        lampX: lamp.tipX, lampY: lamp.tipY, lampZ: lamp.tipZ,
        homeX: lamp.tipX + Math.cos(homeAngle) * (2 + Math.random() * 6),
        homeY: lamp.tipY + (Math.random() - 0.5) * 4,
        homeZ: lamp.tipZ + Math.sin(homeAngle) * (2 + Math.random() * 6),
        baseX: lamp.tipX, baseY: lamp.tipY, baseZ: lamp.tipZ,
        phase: Math.random() * Math.PI * 2,
        speedX: 0.4 + Math.random() * 0.5,
        speedY: 0.3 + Math.random() * 0.3,
        speedZ: 0.4 + Math.random() * 0.5,
        radiusX: 1 + Math.random() * 1.5,
        radiusY: 0.3 + Math.random() * 0.8,
        radiusZ: 1 + Math.random() * 1.5,
        pulseSpeed: 2 + Math.random() * 2,
        pulsePhase: Math.random() * Math.PI * 2,
        spawnAt: fireflyStartTime + ci * 0.8 + Math.random() * 2,
        spawned: false,
        lifetime: 15 + Math.random() * 20,
        respawnedAt: 0,
        fading: false,
      });
    }
  }

  // Roaming fireflies — emerge from candles one by one, then explore the table
  for (let i = 0; i < ROAMING_FIREFLY_COUNT; i++) {
    const { sprite, light, material } = createFirefly();
    const lamp = lamps[i % lamps.length];
    sprite.position.set(lamp.tipX, lamp.tipY, lamp.tipZ);

    fireflies.push({
      sprite, light, material,
      type: 'roaming',
      lampX: lamp.tipX, lampY: lamp.tipY, lampZ: lamp.tipZ,
      homeX: (Math.random() - 0.5) * TABLE_WIDTH * 0.9,
      homeY: 2 + Math.random() * 8,
      homeZ: (Math.random() - 0.5) * TABLE_HEIGHT * 0.9,
      baseX: lamp.tipX, baseY: lamp.tipY, baseZ: lamp.tipZ,
      phase: Math.random() * Math.PI * 2,
      speedX: 0.3 + Math.random() * 0.4,
      speedY: 0.2 + Math.random() * 0.3,
      speedZ: 0.3 + Math.random() * 0.4,
      radiusX: 1.5 + Math.random() * 2,
      radiusY: 0.5 + Math.random() * 1,
      radiusZ: 1.5 + Math.random() * 2,
      pulseSpeed: 1.5 + Math.random() * 2,
      pulsePhase: Math.random() * Math.PI * 2,
      spawnAt: fireflyStartTime + 2 + i * 1.2 + Math.random() * 3,
      spawned: false,
      nextHomeTime: fireflyStartTime + 25 + Math.random() * 30,
    });
  }

  let todUpdateTimer = 0;

  // Table — rounded rectangle top surface + thick rounded body
  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin('anonymous');
  const tableTexture = textureLoader.load(battlemapUrl);
  tableTexture.colorSpace = THREE.SRGBColorSpace;

  // Rounded rectangle shape for the top surface
  const tableShape = new THREE.Shape();
  const tw = TABLE_WIDTH / 2;
  const th = TABLE_HEIGHT / 2;
  const tr = TABLE_CORNER_RADIUS;
  tableShape.moveTo(-tw + tr, -th);
  tableShape.lineTo(tw - tr, -th);
  tableShape.quadraticCurveTo(tw, -th, tw, -th + tr);
  tableShape.lineTo(tw, th - tr);
  tableShape.quadraticCurveTo(tw, th, tw - tr, th);
  tableShape.lineTo(-tw + tr, th);
  tableShape.quadraticCurveTo(-tw, th, -tw, th - tr);
  tableShape.lineTo(-tw, -th + tr);
  tableShape.quadraticCurveTo(-tw, -th, -tw + tr, -th);

  // ShapeGeometry generates UVs from the shape coordinates
  const topGeometry = new THREE.ShapeGeometry(tableShape);

  // Remap UVs from shape coords (-tw..tw, -th..th) to 0..1
  const uvAttr = topGeometry.attributes.uv;
  const posAttr = topGeometry.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const px = posAttr.getX(i);
    const py = posAttr.getY(i);
    uvAttr.setXY(i, (px / TABLE_WIDTH) + 0.5, (py / TABLE_HEIGHT) + 0.5);
  }
  uvAttr.needsUpdate = true;

  const topMaterial = new THREE.MeshStandardMaterial({
    map: tableTexture,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const tableMesh = new THREE.Mesh(topGeometry, topMaterial);
  tableMesh.rotation.x = -Math.PI / 2;
  tableMesh.position.y = 0.05;
  tableMesh.receiveShadow = true;
  tableMesh.userData = { type: 'table' };
  scene.add(tableMesh);

  // Thick rounded body underneath (ExtrudeGeometry — no texture needed, just solid color)
  const bodyGeometry = new THREE.ExtrudeGeometry(tableShape, {
    depth: TABLE_THICKNESS,
    bevelEnabled: false,
    steps: 1,
  });
  const bodySideMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1510, roughness: 0.9 });
  const bodyMesh = new THREE.Mesh(bodyGeometry, bodySideMaterial);
  bodyMesh.rotation.x = -Math.PI / 2;
  bodyMesh.position.y = -TABLE_THICKNESS;
  bodyMesh.receiveShadow = true;
  bodyMesh.castShadow = true;
  scene.add(bodyMesh);

  // Drifting cloud layers between the table and background
  const cloudLayers = [];
  const CLOUD_PLANE_SIZE = 400;
  const cloudConfigs = [
    { y: -TABLE_THICKNESS - 2, speed: 0.0008, dir: [1, 0.3], opacity: 0.18, scale: 1.0 },
    { y: -TABLE_THICKNESS - 4, speed: 0.0005, dir: [-0.6, 1], opacity: 0.14, scale: 0.7 },
    { y: -TABLE_THICKNESS - 6, speed: 0.0003, dir: [0.4, -0.8], opacity: 0.10, scale: 0.5 },
  ];

  const cloudVertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  // Simplex-style noise + fbm for natural cloud shapes
  const cloudFragmentShader = `
    uniform float uTime;
    uniform float uOpacity;
    uniform float uScale;
    uniform vec2 uDirection;
    varying vec2 vUv;

    // Simple hash-based noise
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                         -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                                   + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m * m;
      m = m * m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x = a0.x * x0.x + h.x * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 5; i++) {
        value += amplitude * snoise(p);
        p *= 2.0;
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      vec2 uv = vUv * 3.0 * uScale + uDirection * uTime;
      float n = fbm(uv);
      float cloud = smoothstep(-0.1, 0.4, n);

      // Fade at edges so clouds don't cut off abruptly
      float edgeFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x)
                     * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);

      gl_FragColor = vec4(0.85, 0.88, 0.95, cloud * uOpacity * edgeFade);
    }
  `;

  for (const cfg of cloudConfigs) {
    const cloudMat = new THREE.ShaderMaterial({
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: cfg.opacity },
        uScale: { value: cfg.scale },
        uDirection: { value: new THREE.Vector2(cfg.dir[0], cfg.dir[1]) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cloudGeo = new THREE.PlaneGeometry(CLOUD_PLANE_SIZE, CLOUD_PLANE_SIZE);
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    cloudMesh.rotation.x = -Math.PI / 2;
    cloudMesh.position.y = cfg.y;
    scene.add(cloudMesh);
    cloudLayers.push({ mesh: cloudMesh, material: cloudMat, speed: cfg.speed });
  }

  // Background art plane beneath the table (soft focus via downsampled canvas)
  let bgTextureRef = null;
  if (backgroundUrl) {
    const FLOOR_SIZE = 500;
    const bgGeometry = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
    const bgMaterial = new THREE.MeshBasicMaterial({ color: 0x888888 });
    bgMaterialRef = bgMaterial;
    const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
    bgMesh.rotation.x = -Math.PI / 2;
    bgMesh.position.y = -TABLE_THICKNESS - 8;
    scene.add(bgMesh);

    const bgImage = new Image();
    bgImage.crossOrigin = 'anonymous';
    bgImage.onload = () => {
      if (disposed) return; // scene already torn down
      const blurCanvas = document.createElement('canvas');
      blurCanvas.width = 512;
      blurCanvas.height = 512;
      const ctx = blurCanvas.getContext('2d');
      ctx.filter = 'blur(4px)';
      ctx.drawImage(bgImage, 0, 0, 512, 512);
      bgTextureRef = new THREE.CanvasTexture(blurCanvas);
      bgTextureRef.colorSpace = THREE.SRGBColorSpace;
      bgMaterial.map = bgTextureRef;
      bgMaterial.needsUpdate = true;
    };
    bgImage.src = backgroundUrl;
  }

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  resize();

  // Live-apply graphics setting changes from the Settings screen so users
  // can preview render-quality tradeoffs without leaving the game.
  const unsubscribeGraphics = onGraphicsChange(() => {
    renderer.setPixelRatio(getEffectivePixelRatio());
    resize();
  });

  let animationId = null;
  const heldKeys = new Set();
  const PAN_SPEED = 1.3;

  // External per-frame callbacks (e.g. physics step). Run once per
  // requestAnimationFrame, after pan input but before lighting/cloud
  // updates so positional changes are visible the same frame.
  const frameCallbacks = new Set();
  function onFrame(cb) {
    frameCallbacks.add(cb);
    return () => frameCallbacks.delete(cb);
  }

  let lastFrameTime = performance.now();
  function animate() {
    animationId = requestAnimationFrame(animate);
    const animateMark = perf.beginMark('frame.animate');
    const nowMs = performance.now();
    const dt = Math.min(0.1, (nowMs - lastFrameTime) / 1000);
    lastFrameTime = nowMs;
    const callbacksMark = perf.beginMark('frame.callbacks');
    for (const cb of frameCallbacks) {
      try { cb(dt); } catch (err) { console.error('frame cb error:', err); }
    }
    perf.endMark(callbacksMark);

    if (heldKeys.size > 0) {
      let inputForward = 0;
      let inputRight = 0;
      if (heldKeys.has('w') || heldKeys.has('W')) inputForward += PAN_SPEED;
      if (heldKeys.has('s') || heldKeys.has('S')) inputForward -= PAN_SPEED;
      if (heldKeys.has('d') || heldKeys.has('D')) inputRight += PAN_SPEED;
      if (heldKeys.has('a') || heldKeys.has('A')) inputRight -= PAN_SPEED;
      if (inputForward !== 0 || inputRight !== 0) {
        // Project input into world space via the camera's horizontal
        // orientation — same technique as the mouse-drag pan — so WASD
        // always moves relative to the viewer's perspective even when
        // the board is flipped for player 2.
        camera.getWorldDirection(_forward);
        _right.crossVectors(_forward, camera.up).normalize();
        _forward.crossVectors(camera.up, _right).normalize();
        orbitTarget.addScaledVector(_right, inputRight);
        orbitTarget.addScaledVector(_forward, inputForward);
        orbitTarget.y = 0;
        clampPanTarget();
        updateCameraFromOrbit();
      }
    }

    // Animate cloud drift (wrap at 10000 to prevent float precision loss over long sessions)
    for (const layer of cloudLayers) {
      layer.material.uniforms.uTime.value = (layer.material.uniforms.uTime.value + layer.speed) % 10000;
    }

    // Update time-of-day lighting every ~2 seconds (no need for per-frame)
    todUpdateTimer++;
    if (todUpdateTimer >= 120) {
      todUpdateTimer = 0;
      const tod = getTimeOfDayLighting();
      ambient.color.setRGB(...tod.ambCol);
      ambient.intensity = tod.ambInt;
      directional.color.setRGB(...tod.dirCol);
      directional.intensity = tod.dirInt;

      // Darken the background art at night (table stays bright)
      if (bgMaterialRef) {
        const d = tod.bgDim;
        bgMaterialRef.color.setRGB(d, d, d);
      }

      // Move directional light to simulate moon arc at night
      if (tod.moonAngle > 0) {
        applyMoonPosition(tod.moonAngle);
      } else {
        directional.position.set(5, 100, 10); // daytime default
      }
    }

    // Get mouse world position on table plane for firefly scaring
    const mouseWorld = new THREE.Vector3();
    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(tablePlane, mouseWorld);

    // Animate fireflies
    const now = performance.now() * 0.001;
    const night = isNightTime();

    const lampsMark = perf.beginMark('frame.lamps');
    // Animate candle flame and glow with day/night
    for (let li = 0; li < lamps.length; li++) {
      const lamp = lamps[li];
      const targetIntensity = night ? 65 : 0;
      lamp.light.intensity += (targetIntensity - lamp.light.intensity) * 0.02;
      if (night) {
        // Candle flicker — slightly more pronounced than a lantern
        lamp.light.intensity *= 0.93 + 0.07 * Math.sin(now * 4.5 + li * 2.1);
        // Wobble the flame sprite gently
        lamp.flameSprite.position.x = Math.sin(now * 5.3 + li * 3) * 0.15;
        lamp.flameSprite.position.z = Math.cos(now * 4.1 + li * 1.7) * 0.1;
      }
      const targetFlameOp = night ? 0.9 : 0;
      lamp.flameMaterial.opacity += (targetFlameOp - lamp.flameMaterial.opacity) * 0.02;
      const targetGlowOp = night ? 0.6 : 0;
      lamp.glowSpriteMaterial.opacity += (targetGlowOp - lamp.glowSpriteMaterial.opacity) * 0.02;
    }

    perf.endMark(lampsMark);
    perf.gauge('scene.lamps', lamps.length);
    perf.gauge('scene.fireflies', fireflies.length);

    const firefliesMark = perf.beginMark('frame.fireflies');
    const SCARE_RADIUS = 25;
    const FLEE_SPEED = 0.15;

    for (const ff of fireflies) {
      // Staggered spawn — invisible until spawn time arrives
      if (!ff.spawned) {
        if (now < ff.spawnAt) {
          ff.material.opacity = 0;
          continue;
        }
        ff.spawned = true;
        ff.respawnedAt = now;
        ff.baseX = ff.lampX;
        ff.baseY = ff.lampY;
        ff.baseZ = ff.lampZ;
      }

      // Determine target opacity (night vs day, plus lifecycle for candle type)
      let targetOp = night ? 0.7 : 0;

      if (ff.type === 'candle') {
        // Lifecycle: fade out after lifetime, then respawn at candle
        if (!ff.fading && now - ff.respawnedAt > ff.lifetime) {
          ff.fading = true;
        }
        if (ff.fading) {
          targetOp = 0;
          if (ff.material.opacity < 0.01) {
            ff.fading = false;
            ff.respawnedAt = now;
            ff.lifetime = 15 + Math.random() * 20;
            ff.baseX = ff.lampX;
            ff.baseY = ff.lampY;
            ff.baseZ = ff.lampZ;
            const a = Math.random() * Math.PI * 2;
            ff.homeX = ff.lampX + Math.cos(a) * (2 + Math.random() * 6);
            ff.homeY = ff.lampY + (Math.random() - 0.5) * 4;
            ff.homeZ = ff.lampZ + Math.sin(a) * (2 + Math.random() * 6);
          }
        }
      }

      // Roaming fireflies periodically pick a new wandering target
      if (ff.type === 'roaming' && now > ff.nextHomeTime) {
        ff.homeX = (Math.random() - 0.5) * TABLE_WIDTH * 0.9;
        ff.homeY = 2 + Math.random() * 8;
        ff.homeZ = (Math.random() - 0.5) * TABLE_HEIGHT * 0.9;
        ff.nextHomeTime = now + 20 + Math.random() * 30;
      }

      // Smooth opacity transition
      ff.material.opacity += (targetOp - ff.material.opacity) * 0.02;

      // Check distance to mouse cursor (XZ plane)
      const dx = ff.sprite.position.x - mouseWorld.x;
      const dz = ff.sprite.position.z - mouseWorld.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < SCARE_RADIUS * SCARE_RADIUS && distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        const fleeStrength = FLEE_SPEED * (1 - dist / SCARE_RADIUS);

        // Candle fireflies or roaming near a candle — flee toward candle
        const distToLampSq = (ff.baseX - ff.lampX) ** 2 + (ff.baseZ - ff.lampZ) ** 2;
        if (ff.type === 'candle' || distToLampSq < 30 * 30) {
          const toLampX = ff.lampX - ff.baseX;
          const toLampY = ff.lampY - ff.baseY;
          const toLampZ = ff.lampZ - ff.baseZ;
          const toLampDist = Math.sqrt(toLampX * toLampX + toLampY * toLampY + toLampZ * toLampZ);
          if (toLampDist > 0.5) {
            ff.baseX += (toLampX / toLampDist) * fleeStrength * 5;
            ff.baseY += (toLampY / toLampDist) * fleeStrength * 5;
            ff.baseZ += (toLampZ / toLampDist) * fleeStrength * 5;
          }
        } else {
          ff.baseX += (dx / dist) * fleeStrength * 3;
          ff.baseZ += (dz / dist) * fleeStrength * 3;
          ff.baseY += fleeStrength * 2;
        }
        ff.material.opacity *= 0.92;
      } else {
        // Drift toward home — candle fireflies settle faster, roaming drift slowly
        const drift = ff.type === 'candle' ? 0.008 : 0.002;
        ff.baseX += (ff.homeX - ff.baseX) * drift;
        ff.baseY += (ff.homeY - ff.baseY) * drift;
        ff.baseZ += (ff.homeZ - ff.baseZ) * drift;
      }

      // Wandering motion around base
      const t = now + ff.phase;
      ff.sprite.position.x = ff.baseX + Math.sin(t * ff.speedX) * ff.radiusX;
      ff.sprite.position.y = ff.baseY + Math.sin(t * ff.speedY + 1.3) * ff.radiusY;
      ff.sprite.position.z = ff.baseZ + Math.cos(t * ff.speedZ + 0.7) * ff.radiusZ;

      // Pulsing glow
      const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * ff.pulseSpeed + ff.pulsePhase));
      ff.sprite.scale.setScalar(1.2 * pulse);
    }

    perf.endMark(firefliesMark);

    const tweensMark = perf.beginMark('frame.tweens');
    updateTweens();
    perf.endMark(tweensMark);

    const foilMark = perf.beginMark('frame.foilSheen');
    updateFoilSheens(1 / 60);
    perf.endMark(foilMark);

    const renderMark = perf.beginMark('frame.render');
    renderer.render(scene, camera);
    perf.endMark(renderMark);

    perf.endMark(animateMark);
  }

  animate();

  function updateMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function raycastObjects(event, objects) {
    updateMouse(event);
    raycaster.setFromCamera(mouse, camera);
    return raycaster.intersectObjects(objects, true);
  }

  function raycastTablePoint(event) {
    updateMouse(event);
    raycaster.setFromCamera(mouse, camera);
    const target = _raycastTarget;
    raycaster.ray.intersectPlane(tablePlane, target);
    return target;
  }

  // Camera controls
  let isPanning = false;
  let controlStart = { x: 0, y: 0 };
  let panStartTarget = new THREE.Vector3();

  function onWheel(event) {
    event.preventDefault();
    const zoomSpeed = 0.1;
    const delta = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
    orbitDistance = Math.max(20, Math.min(160, orbitDistance * delta));
    updateCameraFromOrbit();
  }

  function clampPanTarget() {
    const PAN_LIMIT_X = TABLE_WIDTH / 4;
    const PAN_LIMIT_Z = TABLE_HEIGHT / 4;
    orbitTarget.x = Math.max(-PAN_LIMIT_X, Math.min(PAN_LIMIT_X, orbitTarget.x));
    orbitTarget.z = Math.max(-PAN_LIMIT_Z, Math.min(PAN_LIMIT_Z, orbitTarget.z));
  }

  function onMouseDown(event) {
    // Right mouse = pan
    if (event.button === 2) {
      isPanning = true;
      controlStart = { x: event.clientX, y: event.clientY };
      panStartTarget = orbitTarget.clone();
      event.preventDefault();
      return;
    }
  }

  function onMouseMove(event) {
    if (isPanning) {
      const dx = (event.clientX - controlStart.x) * 0.2;
      const dy = (event.clientY - controlStart.y) * 0.2;

      const right = _right;
      const forward = _forward;
      camera.getWorldDirection(forward);
      right.crossVectors(forward, camera.up).normalize();
      forward.crossVectors(camera.up, right).normalize();

      orbitTarget.copy(panStartTarget)
        .addScaledVector(right, -dx)
        .addScaledVector(forward, dy);
      orbitTarget.y = 0;
      clampPanTarget();
      updateCameraFromOrbit();
      return;
    }
  }

  function onMouseUp(event) {
    if (event.button === 2) isPanning = false;
  }

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  let disposed = false;

  function disposeMaterial(m) {
    if (m.map) m.map.dispose();
    if (m.normalMap) m.normalMap.dispose();
    if (m.roughnessMap) m.roughnessMap.dispose();
    if (m.metalnessMap) m.metalnessMap.dispose();
    if (m.emissiveMap) m.emissiveMap.dispose();
    m.dispose();
  }

  function dispose() {
    disposed = true;
    unsubscribeGraphics();
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    if (pollId) cancelAnimationFrame(pollId);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseup', onMouseUp);

    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(disposeMaterial);
      }
    });

    tableTexture?.dispose();
    bgTextureRef?.dispose();
    cloudLayers.length = 0;
    for (const ff of fireflies) {
      ff.material.map?.dispose();
      ff.material.dispose();
    }
    fireflies.length = 0;
    lamps.length = 0;
    renderer.dispose();
    renderer.forceContextLoss();
  }

  function setOrbitTheta(theta) {
    orbitTheta = theta;
    updateCameraFromOrbit();
  }

  function pan(dx, dz) {
    orbitTarget.x += dx;
    orbitTarget.z += dz;
    clampPanTarget();
    updateCameraFromOrbit();
  }

  function setKeyHeld(key, held) {
    if (held) {
      heldKeys.add(key);
    } else {
      heldKeys.delete(key);
    }
  }

  function animateOrbitTo(targetX, targetZ, dist, phi, theta, duration = 500) {
    const orbitState = { x: orbitTarget.x, z: orbitTarget.z, dist: orbitDistance, phi: orbitPhi, theta: orbitTheta };

    addTween({ target: orbitState, property: 'x', from: orbitTarget.x, to: targetX, duration });
    addTween({ target: orbitState, property: 'z', from: orbitTarget.z, to: targetZ, duration });
    addTween({ target: orbitState, property: 'dist', from: orbitDistance, to: dist, duration });
    addTween({ target: orbitState, property: 'phi', from: orbitPhi, to: phi, duration });
    addTween({ target: orbitState, property: 'theta', from: orbitTheta, to: theta, duration });

    // Update orbit from the animated state each frame via a polling approach
    const startTime = performance.now();
    function poll() {
      orbitTarget.x = orbitState.x;
      orbitTarget.z = orbitState.z;
      orbitDistance = orbitState.dist;
      orbitPhi = orbitState.phi;
      orbitTheta = orbitState.theta;
      updateCameraFromOrbit();
      if (performance.now() - startTime < duration + 50) {
        pollId = requestAnimationFrame(poll);
      }
    }
    poll();
  }

  function zoomToOverview() {
    animateOrbitTo(0, 0, 160, 0.1, flipped ? Math.PI : 0, 600);
  }

  function zoomToCard(x, z) {
    animateOrbitTo(x, z, 30, 0.15, flipped ? Math.PI : 0, 400);
  }

  let flipped = false;
  function flipPerspective() {
    flipped = !flipped;
    animateOrbitTo(0, 0, orbitDistance, orbitPhi, flipped ? Math.PI : 0, 600);
  }

  return {
    scene,
    camera,
    renderer,
    raycaster,
    tableMesh,
    resize,
    dispose,
    updateMouse,
    raycastObjects,
    raycastTablePoint,
    pan,
    setOrbitTheta,
    setKeyHeld,
    zoomToOverview,
    zoomToCard,
    flipPerspective,
    onFrame,
    CARD_REST_Y: 0.05 + CARD_THICKNESS / 2,
    CARD_DRAG_Y: 0.05 + CARD_THICKNESS / 2 + 2,
  };
}
