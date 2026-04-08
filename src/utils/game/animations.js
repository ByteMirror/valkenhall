import * as THREE from 'three';
import { CARD_WIDTH as CARD_W, CARD_HEIGHT as CARD_H, CARD_THICKNESS as CARD_T } from './cardMesh';

const activeTweens = [];

export function addTween({ target, property, from, to, duration = 300, easing = easeOutCubic, onComplete }) {
  const tween = {
    target,
    property,
    from,
    to,
    duration,
    easing,
    onComplete,
    startTime: performance.now(),
  };
  activeTweens.push(tween);
  return tween;
}

export function addMultiTween({ target, properties, duration = 300, easing = easeOutCubic, onComplete }) {
  const tweens = Object.entries(properties).map(([property, { from, to }]) =>
    addTween({ target, property, from, to, duration, easing })
  );
  if (onComplete) {
    tweens[tweens.length - 1].onComplete = onComplete;
  }
  return tweens;
}

export function updateTweens() {
  const now = performance.now();
  for (let i = activeTweens.length - 1; i >= 0; i--) {
    const tween = activeTweens[i];
    const elapsed = now - tween.startTime;
    const progress = Math.min(elapsed / tween.duration, 1);
    const easedProgress = tween.easing(progress);

    const keys = tween.property.split('.');
    let obj = tween.target;
    for (let k = 0; k < keys.length - 1; k++) {
      obj = obj[keys[k]];
    }
    const lastKey = keys[keys.length - 1];
    obj[lastKey] = tween.from + (tween.to - tween.from) * easedProgress;

    if (progress >= 1) {
      activeTweens.splice(i, 1);
      tween.onComplete?.();
    }
  }
}

export function hasTweens() {
  return activeTweens.length > 0;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function computeTargetZ(card) {
  let z = 0;
  if (card.isSite) z -= Math.PI / 2;
  if (card.rotated) z += Math.PI;
  if (card.faceDown) z += Math.PI;
  if (card.tapped) z -= Math.PI / 2;
  return z;
}

// Tap and flip animations target mesh.userData.intentEuler — NOT
// mesh.rotation directly — because physicsWorld.syncMeshFromBody
// overwrites mesh.quaternion every frame by composing the body's tilt
// with intentEuler. Writing to mesh.rotation here would be clobbered
// next frame. The intentEuler is created in cardMesh.createCardMesh and
// initialised to the lay-flat + base rotation for the card's state.

export function animateCardFlip(mesh, card) {
  const intent = mesh.userData?.intentEuler || mesh.rotation;
  const fromX = intent.x;
  const targetX = card.faceDown ? Math.PI / 2 : -Math.PI / 2;
  const fromZ = intent.z;
  const targetZ = computeTargetZ(card);

  addTween({ target: intent, property: 'x', from: fromX, to: targetX, duration: 350 });
  addTween({ target: intent, property: 'z', from: fromZ, to: targetZ, duration: 350 });

  const baseY = mesh.position.y;
  addTween({ target: mesh.position, property: 'y', from: baseY, to: baseY + 3, duration: 175 });
  setTimeout(() => {
    addTween({ target: mesh.position, property: 'y', from: baseY + 3, to: baseY, duration: 175 });
  }, 175);
}

export function animateCardTap(mesh, card) {
  const intent = mesh.userData?.intentEuler || mesh.rotation;
  const fromZ = intent.z;
  const targetZ = computeTargetZ(card);

  addTween({ target: intent, property: 'z', from: fromZ, to: targetZ, duration: 250 });
}

export function animateShufflePile(mesh, pile, scene) {
  const baseX = mesh.position.x;
  const baseZ = mesh.position.z;
  const baseY = mesh.position.y;
  const cardCount = Math.min(pile.cards.length, 8);

  if (cardCount === 0) return;

  // Clone the top face material from the pile mesh to get the card back texture
  const pileMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const topMat = pileMats[4] || pileMats[0];

  const tempCards = [];
  const { BoxGeometry, Mesh } = THREE;
  const isSite = pile.name === 'Atlas';
  const w = isSite ? CARD_H : CARD_W;
  const h = isSite ? CARD_W : CARD_H;

  for (let i = 0; i < cardCount; i++) {
    const geo = new BoxGeometry(w, h, CARD_T);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const faceMat = topMat.clone();
    const card = new Mesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, faceMat]);
    card.rotation.x = -Math.PI / 2;
    card.position.set(baseX, baseY + 0.5 + i * CARD_T * 2, baseZ);
    scene.add(card);
    tempCards.push(card);
  }

  // Animate: fan out with rotation, then collapse back
  const fanDuration = 250;
  const spinDuration = 200;
  const collapseDuration = 200;

  tempCards.forEach((card, i) => {
    const angle = (i / cardCount) * Math.PI * 2;
    const radius = 4 + Math.random() * 3;
    const targetX = baseX + Math.cos(angle) * radius;
    const targetZ = baseZ + Math.sin(angle) * radius;
    const spinAngle = (Math.random() - 0.5) * Math.PI * 2;

    // Fan out
    addTween({ target: card.position, property: 'x', from: baseX, to: targetX, duration: fanDuration });
    addTween({ target: card.position, property: 'z', from: baseZ, to: targetZ, duration: fanDuration });
    addTween({ target: card.position, property: 'y', from: card.position.y, to: baseY + 2 + Math.random() * 2, duration: fanDuration });
    addTween({ target: card.rotation, property: 'z', from: 0, to: spinAngle, duration: fanDuration + spinDuration });

    // Collapse back
    setTimeout(() => {
      addTween({ target: card.position, property: 'x', from: card.position.x, to: baseX, duration: collapseDuration });
      addTween({ target: card.position, property: 'z', from: card.position.z, to: baseZ, duration: collapseDuration });
      addTween({
        target: card.position, property: 'y', from: card.position.y, to: baseY, duration: collapseDuration,
        onComplete: () => {
          scene.remove(card);
          card.geometry.dispose();
          const mats = Array.isArray(card.material) ? card.material : [card.material];
          mats.forEach((m) => m.dispose());
        },
      });
    }, fanDuration + spinDuration);
  });

  // Wobble the main pile mesh slightly
  addTween({ target: mesh.position, property: 'y', from: baseY, to: baseY + 1, duration: 200 });
  setTimeout(() => {
    addTween({ target: mesh.position, property: 'y', from: baseY + 1, to: baseY, duration: 250 });
  }, fanDuration + spinDuration);
}

export function animateCardToPile(mesh, pileX, pileZ, scene, onComplete) {
  const duration = 350;
  const startX = mesh.position.x;
  const startY = mesh.position.y;
  const startZ = mesh.position.z;

  // Lift up, fly to pile, shrink, then remove
  addTween({ target: mesh.position, property: 'x', from: startX, to: pileX, duration });
  addTween({ target: mesh.position, property: 'z', from: startZ, to: pileZ, duration });
  addTween({ target: mesh.position, property: 'y', from: startY, to: startY + 5, duration: duration / 2 });
  addTween({ target: mesh.scale, property: 'x', from: 1, to: 0.3, duration });
  addTween({ target: mesh.scale, property: 'y', from: 1, to: 0.3, duration });
  addTween({ target: mesh.scale, property: 'z', from: 1, to: 0.3, duration, onComplete: () => {
    scene.remove(mesh);
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => m.dispose());
    onComplete?.();
  }});

  setTimeout(() => {
    addTween({ target: mesh.position, property: 'y', from: mesh.position.y, to: 1, duration: duration / 2 });
  }, duration / 2);
}

export function animateCardFromPile(pileMesh, scene, onComplete) {
  if (!pileMesh) { onComplete?.(); return; }

  const { BoxGeometry, MeshStandardMaterial, Mesh } = THREE;
  const geo = new BoxGeometry(CARD_W, CARD_H, CARD_T);
  const mat = new MeshStandardMaterial({ color: 0x1a1a2e });
  const tempCard = new Mesh(geo, mat);

  tempCard.rotation.x = -Math.PI / 2;
  tempCard.position.copy(pileMesh.position);
  tempCard.position.y = pileMesh.position.y + 1;
  tempCard.scale.set(0.5, 0.5, 0.5);
  scene.add(tempCard);

  const duration = 300;
  addTween({ target: tempCard.position, property: 'y', from: tempCard.position.y, to: tempCard.position.y + 8, duration });
  addTween({ target: tempCard.scale, property: 'x', from: 0.5, to: 1, duration });
  addTween({ target: tempCard.scale, property: 'y', from: 0.5, to: 1, duration });
  addTween({ target: tempCard.scale, property: 'z', from: 0.5, to: 1, duration, onComplete: () => {
    scene.remove(tempCard);
    geo.dispose();
    mat.dispose();
    onComplete?.();
  }});
}
