import * as THREE from 'three';

const CARD_SCALE = 1.75;
const CARD_WIDTH = 6.35 * CARD_SCALE;
const CARD_HEIGHT = 8.89 * CARD_SCALE;
const CARD_THICKNESS = 0.05 * CARD_SCALE;
const CARD_EDGE_COLOR = 0x111111;

const textureLoader = new THREE.TextureLoader();
textureLoader.crossOrigin = 'anonymous';
const textureCache = new Map();

let spellbookBackTexture = null;
let atlasBackTexture = null;

function loadTexture(url) {
  if (textureCache.has(url)) return textureCache.get(url);
  const tex = textureLoader.load(url);
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

export function createCardMesh(cardInstance) {
  // Always use portrait dimensions — sites get rotated to appear landscape
  const geometry = createCardBoxGeometry(CARD_WIDTH, CARD_HEIGHT);
  const edgeMat = new THREE.MeshStandardMaterial({ color: CARD_EDGE_COLOR });
  const frontMat = new THREE.MeshStandardMaterial({
    map: loadTexture(cardInstance.imageUrl),
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
  mesh.position.set(cardInstance.x, 0.1 + CARD_THICKNESS / 2, cardInstance.z);

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'card', cardInstance };

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

export function createTokenMesh(tokenInstance) {
  const geometry = new THREE.CylinderGeometry(TOKEN_RADIUS, TOKEN_RADIUS, TOKEN_HEIGHT, 32);
  const material = new THREE.MeshStandardMaterial({
    color: TOKEN_COLORS[tokenInstance.color] || TOKEN_COLORS.red,
    roughness: 0.4,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(tokenInstance.x, TOKEN_REST_Y, tokenInstance.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'token', tokenInstance };

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
