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
  // The atlas card back image is landscape (horizontal), but it's mapped
  // onto a portrait card geometry that gets rotated 90° by the mesh.
  // Pre-rotate the texture -90° so it aligns correctly after the mesh
  // rotation. Without this the back appears sideways on the board,
  // in hand, and on the pile.
  atlasBackTexture.center.set(0.5, 0.5);
  atlasBackTexture.rotation = Math.PI / 2;
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

  // Tokens always use the spellbook back regardless of their type.
  const backTexture = getBackTexture(cardInstance.isToken ? false : cardInstance.isSite);
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

  // Token cards render at 50% size so they're visually distinct from
  // regular cards on the board. The scale is applied to the mesh, not
  // the geometry, so physics, flip, and tap all still work normally.
  if (cardInstance.isToken) {
    mesh.scale.set(0.5, 0.5, 0.5);
  }

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

function pileTopMaterial(pile, isSite, isCemetery) {
  if (isCemetery) {
    const topCard = pile.cards[pile.cards.length - 1];
    const imageUrl = topCard ? resolveLocalImageUrl(topCard.imageUrl) : null;
    if (imageUrl) {
      return new THREE.MeshStandardMaterial({ map: loadTexture(imageUrl), transparent: true });
    }
  }
  const backTexture = getBackTexture(isSite);
  return backTexture
    ? new THREE.MeshStandardMaterial({ map: backTexture, transparent: true })
    : new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
}

export function createPileMesh(pile) {
  const count = pile.cards.length;
  if (count === 0) return null;

  const isSite = pile.name === 'Atlas';
  const isCemetery = pile.id?.startsWith('cemetery');
  const thickness = count * CARD_THICKNESS;
  const geometry = new THREE.BoxGeometry(CARD_WIDTH, CARD_HEIGHT, thickness);
  const edgeMat = new THREE.MeshStandardMaterial({ color: CARD_EDGE_COLOR });

  // Cemetery piles show the top card face-up so both players can see
  // what's in the graveyard. All other piles show the card back.
  const topMat = pileTopMaterial(pile, isSite, isCemetery);

  // +Z = top of pile
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
  const isCemetery = pile.id?.startsWith('cemetery');
  const thickness = count * CARD_THICKNESS;

  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(CARD_WIDTH, CARD_HEIGHT, thickness);

  const edgeMat = new THREE.MeshStandardMaterial({ color: CARD_EDGE_COLOR });
  const topMat = pileTopMaterial(pile, isSite, isCemetery);
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

// ── Status effect badges ─────────────────────────────────────────
//
// Small circular badges attached to the card mesh in the top-left
// corner, stacking downward. Each badge shows a short abbreviation
// for the keyword ability (Stealth → STL, Ward → WRD, etc.) on a
// tinted background.

export const STATUS_EFFECTS = [
  { key: 'stealth',     label: 'Stealth',     abbr: 'STL', color: '#6366f1' },
  { key: 'ward',        label: 'Ward',        abbr: 'WRD', color: '#06b6d4' },
  { key: 'airborne',    label: 'Airborne',    abbr: 'AIR', color: '#a0badb' },
  { key: 'charge',      label: 'Charge',      abbr: 'CHG', color: '#f59e0b' },
  { key: 'lethal',      label: 'Lethal',      abbr: 'LTH', color: '#ef4444' },
  { key: 'disabled',    label: 'Disabled',    abbr: 'DIS', color: '#525252' },
  { key: 'immobile',    label: 'Immobile',    abbr: 'IMM', color: '#78716c' },
  { key: 'burrowing',   label: 'Burrowing',   abbr: 'BUR', color: '#92400e' },
  { key: 'submerge',    label: 'Submerge',    abbr: 'SUB', color: '#0891b2' },
  { key: 'voidwalk',    label: 'Voidwalk',    abbr: 'VDW', color: '#7c3aed' },
  { key: 'spellcaster', label: 'Spellcaster', abbr: 'SPC', color: '#c084fc' },
  { key: 'deathrite',   label: 'Deathrite',   abbr: 'DTH', color: '#64748b' },
  { key: 'landbound',   label: 'Landbound',   abbr: 'LND', color: '#a3a3a3' },
  { key: 'waterbound',  label: 'Waterbound',  abbr: 'WTR', color: '#38bdf8' },
  { key: 'flooded',     label: 'Flooded',     abbr: 'FLD', color: '#0284c7' },
  { key: 'ranged',      label: 'Ranged',      abbr: 'RNG', color: '#fb923c' },
];

const STATUS_BADGE_SIZE = 1.0;     // world-unit diameter
const STATUS_BADGE_GAP = 0.15;     // gap between stacked badges
// High-res canvas so the abbreviation text renders crisp even when the
// camera is close. 256 px for a 1-world-unit plane is ~23 px/unit on a
// typical game-board zoom — the same density as the stat HUD canvases.
const STATUS_BADGE_CANVAS = 256;

function createStatusBadgeTexture(abbr, color) {
  const s = STATUS_BADGE_CANVAS;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, s, s);
  const r = s / 2 - 6;
  const cx = s / 2;
  const cy = s / 2;

  // ── Solid base with radial gradient for a 3D dome look ──
  const baseGrad = ctx.createRadialGradient(
    cx - r * 0.25, cy - r * 0.3, r * 0.1,
    cx, cy, r,
  );
  baseGrad.addColorStop(0, '#3a3530');     // highlight center (top-left)
  baseGrad.addColorStop(0.55, '#201c18');  // mid body
  baseGrad.addColorStop(1, '#0e0c0a');     // dark rim
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = baseGrad;
  ctx.fill();

  // ── Color gradient overlay — concentrated at the top for a "lit" feel ──
  const colorGrad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  colorGrad.addColorStop(0, color);
  colorGrad.addColorStop(0.6, color);
  colorGrad.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = colorGrad;
  ctx.globalAlpha = 0.4;
  ctx.fill();
  ctx.globalAlpha = 1;

  // ── Top-edge specular highlight — "glass dome" sheen ──
  const sheenGrad = ctx.createLinearGradient(cx, cy - r, cx, cy - r * 0.15);
  sheenGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
  sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.45, r * 0.7, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = sheenGrad;
  ctx.fill();
  ctx.restore();

  // ── Bottom shadow crescent — grounds the badge ──
  const shadowGrad = ctx.createLinearGradient(cx, cy + r * 0.3, cx, cy + r);
  shadowGrad.addColorStop(0, 'rgba(0,0,0,0)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.5, r * 0.8, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fillStyle = shadowGrad;
  ctx.fill();
  ctx.restore();

  // ── Gold rim with inner + outer ring for depth ──
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(140,110,50,0.9)';
  ctx.lineWidth = 5;
  ctx.stroke();
  // Bright inner ring
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(220,180,80,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── Abbreviation text ──
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(s * 0.30)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillText(abbr, cx, cy + 2);
  ctx.shadowColor = 'transparent';

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createStatusBadgeMesh(statusKey) {
  const def = STATUS_EFFECTS.find((e) => e.key === statusKey);
  if (!def) return null;
  const geo = new THREE.PlaneGeometry(STATUS_BADGE_SIZE, STATUS_BADGE_SIZE);
  const mat = new THREE.MeshBasicMaterial({
    map: createStatusBadgeTexture(def.abbr, def.color),
    transparent: true,
    alphaTest: 0.01,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { type: 'statusBadge', statusKey };
  return mesh;
}

// Rebuild all status badge meshes for a card. Returns an array of the
// new meshes (caller adds them to the card mesh and tracks them).
// `isSite` flips the layout: site cards are rotated -90° around Z, so
// badges are positioned at what becomes the visual top-left of the
// horizontal card after rotation — local bottom-left, stacking in +X
// (which maps to visual downward after the rotation).
export function buildStatusBadges(activeStatuses, isSite = false) {
  const badges = [];
  const pad = STAT_PAD + 0.1;
  const step = STATUS_BADGE_SIZE + STATUS_BADGE_GAP;

  let i = 0;
  for (const key of activeStatuses) {
    const mesh = createStatusBadgeMesh(key);
    if (!mesh) continue;
    if (isSite) {
      // Bottom-left of portrait card → visual top-left of horizontal site.
      // Counter-rotate +90° around Z so the badge text reads upright on
      // the horizontal card (the card itself is rotated -90°).
      mesh.position.set(
        -CARD_WIDTH / 2 + STATUS_BADGE_SIZE / 2 + pad + i * step,
        -CARD_HEIGHT / 2 + STATUS_BADGE_SIZE / 2 + pad,
        STAT_Z,
      );
      mesh.rotation.z = Math.PI / 2;
    } else {
      // Top-left of portrait card, stacking downward
      mesh.position.set(
        -CARD_WIDTH / 2 + STATUS_BADGE_SIZE / 2 + pad,
        CARD_HEIGHT / 2 - STATUS_BADGE_SIZE / 2 - pad - i * step,
        STAT_Z,
      );
    }
    badges.push(mesh);
    i++;
  }
  return badges;
}

export function disposeTextureCache() {
  for (const tex of textureCache.values()) tex.dispose();
  textureCache.clear();
  spellbookBackTexture = null;
  atlasBackTexture = null;
}

/**
 * Create a face-down card mesh for the opponent's visible hand on the
 * table. Shows only the card back (spellbook or atlas) — the card never
 * reveals its face, it's purely a "how many cards does the opponent hold"
 * indicator. Not interactive and has no physics body.
 */
export function createHandBackMesh(isSite) {
  const geometry = createCardBoxGeometry(CARD_WIDTH, CARD_HEIGHT);
  const edgeMat = new THREE.MeshStandardMaterial({ color: CARD_EDGE_COLOR });
  const backTexture = getBackTexture(isSite);
  const faceMat = backTexture
    ? new THREE.MeshStandardMaterial({ map: backTexture, transparent: true })
    : new THREE.MeshStandardMaterial({ color: 0x1a1a2e });

  // +Z = top face (visible when laid flat). Both top and bottom show the
  // card back so the mesh reads correctly from any camera angle.
  const materials = [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, faceMat];
  const mesh = new THREE.Mesh(geometry, materials);

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'opponentHand' };

  return mesh;
}

export { CARD_WIDTH, CARD_HEIGHT, CARD_THICKNESS, TOKEN_RADIUS, TOKEN_HEIGHT, TOKEN_REST_Y, TOKEN_DRAG_Y };
