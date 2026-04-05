import * as THREE from 'three';
import { addTween } from './animations';

// --- Constants ---

const DIE_SIZE = 2.5;
const DICE_REST_Y = DIE_SIZE / 2 + 0.1;
const DICE_DRAG_Y = DICE_REST_Y + 2;

export { DICE_REST_Y, DICE_DRAG_Y };

const DICE_CONFIGS = {
  d4:  { faces: 4,  color: 0xcc4444, textColor: '#ffffff', label: 'd4' },
  d6:  { faces: 6,  color: 0xe8e8e8, textColor: '#111111', label: 'd6' },
  d8:  { faces: 8,  color: 0x4477cc, textColor: '#ffffff', label: 'd8' },
  d10: { faces: 10, color: 0x44aa66, textColor: '#ffffff', label: 'd10' },
  d12: { faces: 12, color: 0x8855bb, textColor: '#ffffff', label: 'd12' },
  d20: { faces: 20, color: 0xccaa44, textColor: '#111111', label: 'd20' },
};

export { DICE_CONFIGS };

// ─── Geometry factories ───

function createGroupedGeometry(dieType) {
  const s = DIE_SIZE;
  let geo;

  switch (dieType) {
    case 'd4':
      geo = new THREE.TetrahedronGeometry(s * 0.9);
      setTriangleGroups(geo, 4);
      return geo;
    case 'd6':
      // BoxGeometry already has 6 groups (one per face)
      return new THREE.BoxGeometry(s, s, s);
    case 'd8':
      geo = new THREE.OctahedronGeometry(s * 0.75);
      setTriangleGroups(geo, 8);
      return geo;
    case 'd10':
      return createD10Geometry(s * 0.7);
    case 'd12':
      geo = new THREE.DodecahedronGeometry(s * 0.7);
      geo.clearGroups();
      for (let i = 0; i < 12; i++) geo.addGroup(i * 9, 9, i);
      return geo;
    case 'd20':
      geo = new THREE.IcosahedronGeometry(s * 0.7);
      setTriangleGroups(geo, 20);
      return geo;
    default:
      return new THREE.BoxGeometry(s, s, s);
  }
}

function setTriangleGroups(geo, faceCount) {
  geo.clearGroups();
  for (let i = 0; i < faceCount; i++) geo.addGroup(i * 3, 3, i);
}

function createD10Geometry(radius) {
  const top = new THREE.Vector3(0, radius * 1.2, 0);
  const bottom = new THREE.Vector3(0, -radius * 1.2, 0);
  const upper = [];
  const lower = [];
  for (let i = 0; i < 5; i++) {
    const aUp = (i / 5) * Math.PI * 2;
    const aLow = ((i + 0.5) / 5) * Math.PI * 2;
    upper.push(new THREE.Vector3(Math.cos(aUp) * radius, radius * 0.35, Math.sin(aUp) * radius));
    lower.push(new THREE.Vector3(Math.cos(aLow) * radius, -radius * 0.35, Math.sin(aLow) * radius));
  }

  const verts = [];
  const tri = (a, b, c) => verts.push(...a.toArray(), ...b.toArray(), ...c.toArray());

  for (let i = 0; i < 5; i++) {
    const next = (i + 1) % 5;
    // Upper kite face (2 triangles)
    tri(top, upper[i], lower[i]);
    tri(top, lower[i], upper[next]);
    // Lower kite face (2 triangles)
    tri(bottom, lower[(i + 1) % 5], upper[next]);
    tri(bottom, upper[next], lower[i]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  for (let i = 0; i < 10; i++) geo.addGroup(i * 6, 6, i);
  return geo;
}

// ─── Face data (center + outward normal per face) ───

function computeFaceData(geometry, faceCount) {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const faces = [];

  for (let f = 0; f < faceCount; f++) {
    const grp = geometry.groups[f];
    if (!grp) continue;

    const vs = [];
    for (let i = 0; i < grp.count; i++) {
      const vi = idx ? idx.getX(grp.start + i) : grp.start + i;
      vs.push(new THREE.Vector3().fromBufferAttribute(pos, vi));
    }

    const center = new THREE.Vector3();
    vs.forEach((v) => center.add(v));
    center.divideScalar(vs.length);

    const e1 = vs[1].clone().sub(vs[0]);
    const e2 = vs[2].clone().sub(vs[0]);
    const normal = e1.cross(e2).normalize();
    if (normal.dot(center) < 0) normal.negate();

    faces.push({ center, normal });
  }
  return faces;
}

// ─── Face value mapping ───

function getFaceValues(dieType, faceCount) {
  if (dieType === 'd6') {
    // BoxGeometry groups: 0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z
    // Standard die: opposite faces sum to 7
    return [3, 4, 1, 6, 2, 5];
  }
  return Array.from({ length: faceCount }, (_, i) => i + 1);
}

// ─── d6 pip textures (full-face material with dots) ───

const PIP_POSITIONS = {
  1: [[0.5, 0.5]],
  2: [[0.7, 0.3], [0.3, 0.7]],
  3: [[0.7, 0.3], [0.5, 0.5], [0.3, 0.7]],
  4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
  5: [[0.3, 0.3], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.7, 0.7]],
  6: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.5], [0.7, 0.5], [0.3, 0.7], [0.7, 0.7]],
};

function createD6FaceMaterial(value) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // White background with slight rounding
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, size, size);

  // Draw pips
  ctx.fillStyle = '#222222';
  const pipR = size * 0.07;
  for (const [px, py] of PIP_POSITIONS[value] || []) {
    ctx.beginPath();
    ctx.arc(px * size, py * size, pipR, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.45, metalness: 0.05 });
}

// ─── Polyhedra face number labels (small planes on each face) ───

function createNumberTexture(value, textColor) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = textColor;
  ctx.font = `bold ${value >= 10 ? 110 : 140}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), size / 2, size / 2);

  return new THREE.CanvasTexture(canvas);
}

function addFaceLabels(mesh, geometry, faceCount, config, faceValues, faceData) {
  const labelSize = DIE_SIZE * (faceCount <= 6 ? 0.6 : faceCount <= 12 ? 0.55 : 0.45);

  for (let i = 0; i < faceData.length; i++) {
    const { center, normal } = faceData[i];
    const texture = createNumberTexture(faceValues[i], config.textColor);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const plane = new THREE.PlaneGeometry(labelSize, labelSize);
    const label = new THREE.Mesh(plane, mat);
    label.position.copy(center).addScaledVector(normal, 0.03);
    label.lookAt(center.clone().add(normal));
    label.userData = { isFaceLabel: true };
    mesh.add(label);
  }
}

// ─── Value sprite (always-readable floating indicator) ───

function createValueSprite(value) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), size / 2, size / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.2, 2.2, 1);
  sprite.position.y = DIE_SIZE * 0.85;
  sprite.renderOrder = 999;
  return sprite;
}

function updateValueSprite(mesh, value) {
  const sprite = mesh.children.find((c) => c.isSprite);
  if (!sprite) return;
  sprite.material.map.dispose();
  sprite.material.dispose();
  const next = createValueSprite(value);
  sprite.material = next.material;
}

// Keep the sprite anchored above the die regardless of mesh rotation
function anchorSprite(mesh) {
  const sprite = mesh.children.find((c) => c.isSprite);
  if (!sprite) return;
  const invQ = mesh.quaternion.clone().invert();
  sprite.position.set(0, DIE_SIZE * 0.85, 0).applyQuaternion(invQ);
}

// ─── Mesh creation ───

export function createDiceMesh(diceInstance) {
  const config = DICE_CONFIGS[diceInstance.dieType] || DICE_CONFIGS.d6;
  const geometry = createGroupedGeometry(diceInstance.dieType);
  const faceValues = getFaceValues(diceInstance.dieType, config.faces);
  const faceData = computeFaceData(geometry, config.faces);

  let mesh;

  if (diceInstance.dieType === 'd6') {
    const materials = faceValues.map((v) => createD6FaceMaterial(v));
    mesh = new THREE.Mesh(geometry, materials);
  } else {
    const material = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide });
    mesh = new THREE.Mesh(geometry, material);
    addFaceLabels(mesh, geometry, config.faces, config, faceValues, faceData);
  }

  mesh.position.set(diceInstance.x, DICE_REST_Y, diceInstance.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'dice', diceInstance, faceData, faceValues };

  mesh.add(createValueSprite(diceInstance.value));

  setDieFaceUp(mesh, diceInstance.value);

  return mesh;
}

// ─── Set a specific face up ───

export function setDieFaceUp(mesh, value) {
  const { faceData, faceValues, diceInstance } = mesh.userData;
  if (!faceData || !faceValues) return;

  const idx = faceValues.indexOf(value);
  if (idx < 0) return;

  const normal = faceData[idx].normal;
  mesh.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0, 1, 0)));

  diceInstance.value = value;
  updateValueSprite(mesh, value);
  anchorSprite(mesh);
}

// ─── Roll animation ───

export function animateDiceRoll(mesh, targetValue, onComplete) {
  const duration = 1200;
  const startQ = mesh.quaternion.clone();
  const startX = mesh.position.x;
  const startZ = mesh.position.z;

  // 3 random tumble rotations for a natural rolling look
  const tumbleQs = [];
  for (let i = 0; i < 3; i++) {
    tumbleQs.push(new THREE.Quaternion().setFromEuler(new THREE.Euler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    )));
  }

  // Final orientation: target face up
  const { faceData, faceValues } = mesh.userData;
  const fIdx = faceValues.indexOf(targetValue);
  const finalQ = fIdx >= 0
    ? new THREE.Quaternion().setFromUnitVectors(faceData[fIdx].normal, new THREE.Vector3(0, 1, 0))
    : startQ;

  // All rotation keyframes: start → tumble1 → tumble2 → tumble3 → final
  const keyframes = [startQ, ...tumbleQs, finalQ];

  // Random table jitter direction
  const jitterX = (Math.random() - 0.5) * 3;
  const jitterZ = (Math.random() - 0.5) * 3;

  const t0 = performance.now();

  function tick() {
    const elapsed = performance.now() - t0;
    const p = Math.min(elapsed / duration, 1);

    // Bouncing Y: big bounce → smaller bounce → settle
    let bounceY = 0;
    if (p < 0.25) {
      bounceY = Math.sin(p / 0.25 * Math.PI) * 5;
    } else if (p < 0.5) {
      bounceY = Math.sin((p - 0.25) / 0.25 * Math.PI) * 2.5;
    } else if (p < 0.7) {
      bounceY = Math.sin((p - 0.5) / 0.2 * Math.PI) * 1;
    }
    mesh.position.y = DICE_REST_Y + bounceY;

    // X/Z wobble that eases out
    const wobbleFade = Math.max(0, 1 - p * 1.3);
    mesh.position.x = startX + jitterX * Math.sin(p * Math.PI * 4) * wobbleFade;
    mesh.position.z = startZ + jitterZ * Math.sin(p * Math.PI * 3.5) * wobbleFade;

    // Rotation: slerp through tumble keyframes
    const segCount = keyframes.length - 1;
    const segProgress = p * segCount;
    const segIdx = Math.min(Math.floor(segProgress), segCount - 1);
    const segT = segProgress - segIdx;
    mesh.quaternion.slerpQuaternions(keyframes[segIdx], keyframes[segIdx + 1], segT);

    anchorSprite(mesh);

    if (p < 1) {
      requestAnimationFrame(tick);
    } else {
      mesh.position.set(startX, DICE_REST_Y, startZ);
      mesh.quaternion.copy(finalQ);
      mesh.userData.diceInstance.value = targetValue;
      updateValueSprite(mesh, targetValue);
      anchorSprite(mesh);
      onComplete?.();
    }
  }

  requestAnimationFrame(tick);
}
