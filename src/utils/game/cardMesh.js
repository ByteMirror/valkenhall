import * as THREE from 'three';
import { resolveLocalImageUrl } from '../localApi';

const CARD_SCALE = 1.75;
const CARD_WIDTH = 6.35 * CARD_SCALE;
const CARD_HEIGHT = 8.89 * CARD_SCALE;
// Visible thickness — cards behave like real 3D objects so stacks are
// readable instead of z-fighting paper-thin slabs.
const CARD_THICKNESS = 0.18 * CARD_SCALE;
const CARD_EDGE_COLOR = 0x111111;

const textureLoader = new THREE.TextureLoader();
textureLoader.crossOrigin = 'anonymous';
const textureCache = new Map();

let spellbookBackTexture = null;
let atlasBackTexture = null;

// Renderer reference used to eagerly upload textures to the GPU as
// soon as their image data finishes decoding. Without this, every new
// card's texture is uploaded lazily on its first appearance in a
// render call — which causes 10ms+ frame spikes whenever multiple
// cards land on the table at once. tableScene calls setTextureRenderer
// on init to wire this up.
let textureRenderer = null;
export function setTextureRenderer(renderer) {
  textureRenderer = renderer;
}

function loadTexture(url) {
  if (textureCache.has(url)) return textureCache.get(url);
  const tex = textureLoader.load(url, (loadedTex) => {
    // Image is decoded; upload to GPU now so the next renderer.render()
    // doesn't pay the upload cost mid-frame.
    if (textureRenderer) {
      try { textureRenderer.initTexture(loadedTex); } catch {}
    }
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  textureCache.set(url, tex);
  return tex;
}

export function setCardBackUrls(spellbookUrl, atlasUrl) {
  spellbookBackTexture = loadTexture(spellbookUrl);
  atlasBackTexture = loadTexture(atlasUrl);
}

function getBackTexture(isSite) {
  return isSite ? atlasBackTexture : spellbookBackTexture;
}

function createCardBoxGeometry(w, h) {
  return new THREE.BoxGeometry(w, h, CARD_THICKNESS);
}

// Holographic sheen shader for foil cards
const foilVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const foilFragmentShader = `
  uniform float uTime;
  uniform float uIsRainbow;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  // Prismatic color stops matching the CSS foil gradient
  vec3 prismatic(float t) {
    // #f80e35, #eedf10, #21e985, #0dbde9, #c929f1 repeating
    vec3 c0 = vec3(0.973, 0.055, 0.208); // red-pink
    vec3 c1 = vec3(0.933, 0.875, 0.063); // yellow
    vec3 c2 = vec3(0.129, 0.914, 0.522); // green
    vec3 c3 = vec3(0.051, 0.743, 0.914); // cyan
    vec3 c4 = vec3(0.788, 0.161, 0.945); // purple
    float f = fract(t) * 5.0;
    if (f < 1.0) return mix(c0, c1, f);
    if (f < 2.0) return mix(c1, c2, f - 1.0);
    if (f < 3.0) return mix(c2, c3, f - 2.0);
    if (f < 4.0) return mix(c3, c4, f - 3.0);
    return mix(c4, c0, f - 4.0);
  }

  void main() {
    // Diagonal stripe direction (~110deg like the CSS gradient)
    float stripe = vUv.x * 0.82 + vUv.y * 0.57;

    // Slowly animate the stripe position
    float t = stripe * 2.5 + uTime * 0.08;
    vec3 color = prismatic(t);

    // Subtle shimmer modulation
    float shimmer = sin(vUv.x * 14.0 + uTime * 0.9) * sin(vUv.y * 10.0 - uTime * 0.6);
    shimmer = shimmer * 0.5 + 0.5;

    // Brightness variation along the stripe
    float brightness = sin(stripe * 18.0 - uTime * 1.2) * 0.15 + 0.85;
    color *= brightness;
    color = mix(color, vec3(1.0), shimmer * 0.15);

    // Opacity: visible enough to see the prismatic colors
    float alpha = 0.22 * (0.7 + shimmer * 0.3);
    if (uIsRainbow > 0.5) {
      alpha *= 1.5;
      color = mix(color, color * 1.3, 0.2);
    } else {
      // Standard foil: warm-shifted, slightly less saturated
      color = mix(color, vec3(0.95, 0.8, 0.4), 0.35);
      alpha *= 0.85;
    }

    gl_FragColor = vec4(color, alpha);
  }
`;

let foilSheenTime = 0;
const foilSheenMaterials = [];

function createFoilSheenMaterial(isRainbow) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: foilVertexShader,
    fragmentShader: foilFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uIsRainbow: { value: isRainbow ? 1.0 : 0.0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
  });
  foilSheenMaterials.push(mat);
  return mat;
}

export function updateFoilSheens(dt) {
  foilSheenTime += dt;
  for (const mat of foilSheenMaterials) {
    mat.uniforms.uTime.value = foilSheenTime;
  }
}

export function createCardMesh(cardInstance) {
  // Always use portrait dimensions — sites get rotated to appear landscape
  const geometry = createCardBoxGeometry(CARD_WIDTH, CARD_HEIGHT);
  const foiling = cardInstance.foiling || 'S';
  const isFoil = foiling === 'F' || foiling === 'R';

  const edgeColor = isFoil
    ? (foiling === 'R' ? 0x6644aa : 0x8b7520)
    : CARD_EDGE_COLOR;
  const edgeMat = new THREE.MeshStandardMaterial({ color: edgeColor });

  const imageUrl = resolveLocalImageUrl(cardInstance.imageUrl);

  const frontMat = new THREE.MeshStandardMaterial({
    map: loadTexture(imageUrl),
    transparent: true,
  });

  const backTexture = getBackTexture(cardInstance.isSite);
  const backMat = backTexture
    ? new THREE.MeshStandardMaterial({ map: backTexture, transparent: true })
    : new THREE.MeshStandardMaterial({ color: 0x1a1a2e });

  // BoxGeometry material order: [+X, -X, +Y, -Y, +Z(front), -Z(back)]
  const materials = [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat];
  const mesh = new THREE.Mesh(geometry, materials);

  // Lay flat: rotate so +Z (front/art) faces up (+Y)
  mesh.rotation.x = -Math.PI / 2;
  let baseZ = 0;
  if (cardInstance.isSite) baseZ -= Math.PI / 2;
  if (cardInstance.rotated) baseZ += Math.PI;
  mesh.rotation.z = baseZ;
  mesh.position.set(cardInstance.x, 0.05 + CARD_THICKNESS / 2, cardInstance.z);

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // intentEuler is the "should look like this" orientation (lay-flat plus
  // any tap/flip state). Animations write to this, and physicsWorld's
  // syncMeshFromBody composes it with body.quaternion every frame so
  // physics-driven tilt and animation-driven rotation can coexist without
  // overwriting each other.
  mesh.userData = {
    type: 'card',
    cardInstance,
    intentEuler: new THREE.Euler(-Math.PI / 2, 0, baseZ, 'XYZ'),
  };

  // Add holographic sheen overlay for foil cards
  if (isFoil) {
    const sheenGeo = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);
    const sheenMat = createFoilSheenMaterial(foiling === 'R');
    const sheenPlane = new THREE.Mesh(sheenGeo, sheenMat);
    // Position slightly above the card face (+Z in local space before rotation)
    sheenPlane.position.set(0, 0, CARD_THICKNESS / 2 + 0.01);
    mesh.add(sheenPlane);
  }

  return mesh;
}

export function createPileMesh(pile) {
  const count = pile.cards.length;
  if (count === 0) return null;

  const isSite = pile.name === 'Atlas';
  const thickness = count * CARD_THICKNESS;
  const geometry = new THREE.BoxGeometry(CARD_WIDTH, CARD_HEIGHT, thickness);
  const edgeMat = new THREE.MeshStandardMaterial({ color: CARD_EDGE_COLOR });
  const backTexture = getBackTexture(isSite);
  const topMat = backTexture
    ? new THREE.MeshStandardMaterial({ map: backTexture, transparent: true })
    : new THREE.MeshStandardMaterial({ color: 0x1a1a2e });

  // +Z = top of pile (card back visible)
  const materials = [edgeMat, edgeMat, edgeMat, edgeMat, topMat, edgeMat];
  const mesh = new THREE.Mesh(geometry, materials);

  mesh.rotation.x = -Math.PI / 2;
  let baseZ = 0;
  if (isSite) baseZ -= Math.PI / 2;
  if (pile.rotated) baseZ += Math.PI;
  mesh.rotation.z = baseZ;
  mesh.position.set(pile.x, thickness / 2, pile.z);

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'pile', pile };

  return mesh;
}

export function updatePileMesh(mesh, pile) {
  const count = pile.cards.length;
  if (count === 0) return false;

  const isSite = pile.name === 'Atlas';
  const thickness = count * CARD_THICKNESS;

  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(CARD_WIDTH, CARD_HEIGHT, thickness);

  const edgeMat = new THREE.MeshStandardMaterial({ color: CARD_EDGE_COLOR });
  const backTexture = getBackTexture(isSite);
  const topMat = backTexture
    ? new THREE.MeshStandardMaterial({ map: backTexture, transparent: true })
    : new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((m) => m.dispose());
  }
  mesh.material = [edgeMat, edgeMat, edgeMat, edgeMat, topMat, edgeMat];

  mesh.position.y = thickness / 2;
  return true;
}

const TOKEN_RADIUS = 1.75;
const TOKEN_HEIGHT = CARD_THICKNESS * 4;
const TOKEN_REST_Y = TOKEN_HEIGHT / 2 + 0.1;
const TOKEN_DRAG_Y = TOKEN_REST_Y + 2;
const TOKEN_COLORS = { red: 0xcc3333 };
// Matches the dark fill of the provided token SVGs so the cylinder side
// blends seamlessly into the textured top cap.
const TOKEN_SIDE_COLOR = 0x393939;

/**
 * Build materials for a token cylinder. When `topTextureUrl` is provided,
 * the returned array uses the SVG as the top-cap `map` and keeps the side
 * and bottom a solid dark color so only the printed face shows through.
 */
function createTokenMaterials({ sideColor = TOKEN_SIDE_COLOR, topTextureUrl } = {}) {
  if (!topTextureUrl) {
    return new THREE.MeshStandardMaterial({
      color: sideColor,
      roughness: 0.4,
      metalness: 0.1,
    });
  }
  const sideMat = new THREE.MeshStandardMaterial({ color: sideColor, roughness: 0.4, metalness: 0.1 });
  const topMat = new THREE.MeshStandardMaterial({
    map: loadTexture(topTextureUrl),
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.1,
    transparent: true,
  });
  const bottomMat = new THREE.MeshStandardMaterial({ color: sideColor, roughness: 0.4, metalness: 0.1 });
  // CylinderGeometry groups: 0 = side, 1 = top cap, 2 = bottom cap.
  return [sideMat, topMat, bottomMat];
}

// THREE's CylinderGeometry maps the top-cap UVs so that UV.x is aligned with
// the world +z axis, not +x. With our top-down camera that makes textures
// look rotated 90° on screen — rotating the geometry around Y brings +x back
// into alignment with the texture's right edge so the printed dashes and
// elemental glyphs sit level with the table. Pass `flip: true` to add a
// further 180° spin so tokens on the opposite side of the table read
// right-side up for the player sitting across from p1.
const TOKEN_TOP_UV_ROTATION = Math.PI / 2;

function getTopCapRotation(hasTexture, flip) {
  if (!hasTexture) return 0;
  return TOKEN_TOP_UV_ROTATION + (flip ? Math.PI : 0);
}

export function createTokenMesh(tokenInstance) {
  const geometry = new THREE.CylinderGeometry(TOKEN_RADIUS, TOKEN_RADIUS, TOKEN_HEIGHT, 32);
  const rotation = getTopCapRotation(!!tokenInstance.topTexture, tokenInstance.flip);
  if (rotation) geometry.rotateY(rotation);
  const material = createTokenMaterials({
    sideColor: tokenInstance.topTexture ? TOKEN_SIDE_COLOR : (TOKEN_COLORS[tokenInstance.color] || TOKEN_COLORS.red),
    topTextureUrl: tokenInstance.topTexture,
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(tokenInstance.x, TOKEN_REST_Y, tokenInstance.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'token', tokenInstance };

  return mesh;
}

/**
 * Create a flat cylindrical button for the game board (used by the tracker
 * +/- buttons). Takes a texture URL that is painted onto the top cap.
 * Pass `flip: true` to rotate the printed face 180° for the opposite seat.
 */
export function createTokenButtonMesh({ radius = TOKEN_RADIUS, height = 0.2, topTextureUrl, sideColor = TOKEN_SIDE_COLOR, flip = false } = {}) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
  const rotation = getTopCapRotation(!!topTextureUrl, flip);
  if (rotation) geometry.rotateY(rotation);
  const material = createTokenMaterials({ sideColor, topTextureUrl });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

export function createTokenSpawnerMesh(x, z) {
  const geometry = new THREE.CylinderGeometry(TOKEN_RADIUS, TOKEN_RADIUS, TOKEN_HEIGHT, 32);
  const material = new THREE.MeshStandardMaterial({
    color: TOKEN_COLORS.red,
    roughness: 0.4,
    metalness: 0.1,
    transparent: true,
    opacity: 0.6,
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(x, TOKEN_REST_Y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'tokenSpawner' };

  return mesh;
}

// --- Minion stat tracker HUD ---

function createStatTexture(icon, value, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 144;
  canvas.height = 36;
  const ctx = canvas.getContext('2d');
  const w = 144, h = 36, r = 7;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
  ctx.beginPath();
  ctx.roundRect(1, 1, w - 2, h - 2, r);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(1, 1, w - 2, h - 2, r);
  ctx.stroke();

  const sec = w / 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.moveTo(sec, 5); ctx.lineTo(sec, h - 5);
  ctx.moveTo(sec * 2, 5); ctx.lineTo(sec * 2, h - 5);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('−', sec / 2, h / 2);

  ctx.fillStyle = color;
  ctx.font = '13px sans-serif';
  ctx.fillText(icon, sec + sec / 2 - 9, h / 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(String(value), sec + sec / 2 + 9, h / 2);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('+', sec * 2 + sec / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const STAT_HUD_W = 3.8;
const STAT_HUD_H = 0.9;
const STAT_Z = CARD_THICKNESS / 2 + 0.15;
const STAT_PAD = 0.15;

export function createLifeHUD(cardInstance) {
  const hp = cardInstance.currentLife ?? 0;
  const atk = cardInstance.currentAttack ?? 0;
  const yPos = -CARD_HEIGHT / 2 + STAT_HUD_H / 2 + STAT_PAD;

  // ATK tracker — bottom-left
  const atkGeo = new THREE.PlaneGeometry(STAT_HUD_W, STAT_HUD_H);
  const atkMat = new THREE.MeshBasicMaterial({ map: createStatTexture('⚔', atk, 'rgba(245,158,11,0.9)'), transparent: true, depthTest: true, side: THREE.DoubleSide });
  const atkMesh = new THREE.Mesh(atkGeo, atkMat);
  atkMesh.position.set(-CARD_WIDTH / 2 + STAT_HUD_W / 2 + STAT_PAD, yPos, STAT_Z);
  atkMesh.userData = { type: 'lifeHUD', cardId: cardInstance.id, stat: 'atk' };

  // HP tracker — bottom-right
  const hpGeo = new THREE.PlaneGeometry(STAT_HUD_W, STAT_HUD_H);
  const hpMat = new THREE.MeshBasicMaterial({ map: createStatTexture('♥', hp, 'rgba(239,68,68,0.9)'), transparent: true, depthTest: true, side: THREE.DoubleSide });
  const hpMesh = new THREE.Mesh(hpGeo, hpMat);
  hpMesh.position.set(CARD_WIDTH / 2 - STAT_HUD_W / 2 - STAT_PAD, yPos, STAT_Z);
  hpMesh.userData = { type: 'lifeHUD', cardId: cardInstance.id, stat: 'hp' };

  // Hit zones: left half = minus, right half = plus — oversized for easier clicking
  const halfW = STAT_HUD_W / 2;
  const hitGeo = new THREE.PlaneGeometry(halfW * 1.6, STAT_HUD_H * 3);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });

  const atkMinusMesh = new THREE.Mesh(hitGeo, hitMat);
  atkMinusMesh.position.copy(atkMesh.position);
  atkMinusMesh.position.x -= halfW / 2;
  atkMinusMesh.position.z += 0.05;
  atkMinusMesh.userData = { type: 'lifeButton', action: 'decrement', stat: 'atk', cardId: cardInstance.id };

  const atkPlusMesh = new THREE.Mesh(hitGeo.clone(), hitMat.clone());
  atkPlusMesh.position.copy(atkMesh.position);
  atkPlusMesh.position.x += halfW / 2;
  atkPlusMesh.position.z += 0.05;
  atkPlusMesh.userData = { type: 'lifeButton', action: 'increment', stat: 'atk', cardId: cardInstance.id };

  const hpMinusMesh = new THREE.Mesh(hitGeo.clone(), hitMat.clone());
  hpMinusMesh.position.copy(hpMesh.position);
  hpMinusMesh.position.x -= halfW / 2;
  hpMinusMesh.position.z += 0.05;
  hpMinusMesh.userData = { type: 'lifeButton', action: 'decrement', stat: 'hp', cardId: cardInstance.id };

  const hpPlusMesh = new THREE.Mesh(hitGeo.clone(), hitMat.clone());
  hpPlusMesh.position.copy(hpMesh.position);
  hpPlusMesh.position.x += halfW / 2;
  hpPlusMesh.position.z += 0.05;
  hpPlusMesh.userData = { type: 'lifeButton', action: 'increment', stat: 'hp', cardId: cardInstance.id };

  return {
    sprite: atkMesh, // keep 'sprite' key for compat — used for ATK display
    hpSprite: hpMesh,
    plusMesh: atkPlusMesh,
    minusMesh: atkMinusMesh,
    hpPlusMesh,
    hpMinusMesh,
  };
}

export function updateLifeHUD(mesh, value, stat = 'hp') {
  if (mesh.material.map) mesh.material.map.dispose();
  const icon = stat === 'atk' ? '⚔' : '♥';
  const color = stat === 'atk' ? 'rgba(245,158,11,0.9)' : 'rgba(239,68,68,0.9)';
  mesh.material.map = createStatTexture(icon, value, color);
  mesh.material.needsUpdate = true;
}

export function disposeTextureCache() {
  for (const tex of textureCache.values()) tex.dispose();
  textureCache.clear();
  spellbookBackTexture = null;
  atlasBackTexture = null;
}

export { CARD_WIDTH, CARD_HEIGHT, CARD_THICKNESS, TOKEN_RADIUS, TOKEN_HEIGHT, TOKEN_REST_Y, TOKEN_DRAG_Y };
