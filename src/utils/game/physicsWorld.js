import * as CANNON from 'cannon-es';
import * as THREE from 'three';

// Reusable scratch quaternions used by syncMeshFromBody to avoid per-frame
// allocations. The frame loop calls syncMeshFromBody for every card.
const _bodyQuat = new THREE.Quaternion();
const _intentQuat = new THREE.Quaternion();

/**
 * Physics setup for the virtual tabletop. Uses cannon-es with a static
 * ground plane (the table) and dynamic Box bodies for each card.
 *
 * Design notes:
 *   - Strong gravity (-30) so dropped cards settle quickly without
 *     looking floaty.
 *   - Sleeping bodies are enabled. Once a stack settles, the bodies
 *     stop simulating, which keeps the per-frame cost near zero on a
 *     full board.
 *   - Card friction is high (~0.7) so stacks don't slide on the table.
 *   - Restitution is near zero (cards don't bounce).
 *   - Each card body is anchored to the mesh's userData so the render
 *     loop can sync transforms after each step.
 */

// Match the visible table mesh in tableScene.js (rotation -π/2 around X
// at y = 0.05). The physics ground sits at the SAME world Y so cards
// rest visually flush with the table instead of floating above it.
const TABLE_Y = 0.05;

export function createPhysicsWorld() {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -80, 0),
  });
  world.broadphase = new CANNON.NaiveBroadphase();
  world.allowSleep = true;
  // Default contact behavior between any two bodies — solid friction so
  // stacks don't slide, near-zero bounce.
  world.defaultContactMaterial.friction = 0.7;
  world.defaultContactMaterial.restitution = 0.02;

  // Card-on-card contact material with extra-high friction and zero
  // bounce. Prevents stacked cards from micro-sliding on each other
  // indefinitely — the main cause of the "board full of cards never
  // stops clicking" problem.
  const cardMaterial = new CANNON.Material('card');
  const cardContact = new CANNON.ContactMaterial(cardMaterial, cardMaterial, {
    friction: 1.0,
    restitution: 0,
    contactEquationRelaxation: 3,
    frictionEquationStiffness: 1e8,
  });
  world.addContactMaterial(cardContact);
  world._cardMaterial = cardMaterial;

  // Static ground plane representing the table surface. Oriented so its
  // normal points up (+Y). Cards collide against it instead of phasing
  // through to gravity hell.
  const groundShape = new CANNON.Plane();
  const groundBody = new CANNON.Body({ type: CANNON.Body.STATIC });
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  groundBody.position.set(0, TABLE_Y, 0);
  world.addBody(groundBody);

  return world;
}

export function stepPhysics(world, dt = 1 / 60) {
  // Fixed-step physics with a max sub-step count to prevent spiral of
  // death on slow frames.
  world.step(1 / 60, dt, 3);
}

/**
 * Create a dynamic Box body matching a card's WORLD-space dimensions.
 *
 * The body is in WORLD-axis orientation (identity quaternion), with
 * halfExtents (W/2, T/2, H/2) so the box already lies flat at creation
 * time without any rotation. Physics is then free to TILT it as cards
 * collide with each other — that's how stacking pivots work.
 *
 * Tap/flip animations are kept separate from physics: the mesh stores
 * an "intent" Euler in userData.intentEuler that encodes the lay-flat
 * orientation plus tap/flip state. Each frame, syncMeshFromBody composes
 * the body's physics-driven tilt with that intent so neither system
 * fights the other:
 *
 *   mesh.quaternion = body.quaternion (tilt) * intentQuat (lay-flat + tap)
 *
 * @param {CANNON.World} world
 * @param {THREE.Mesh} mesh         the card mesh, already added to the scene
 * @param {{ width: number, height: number, thickness: number }} dims
 *                                  WORLD-space dimensions of the card
 */
export function addCardBody(world, mesh, { width, height, thickness }) {
  // Box halfExtents in WORLD axes (the body starts at identity quaternion,
  // so body-local axes line up with world axes): X = width, Y = thickness
  // (vertical), Z = height.
  const halfExtents = new CANNON.Vec3(width / 2, thickness / 2, height / 2);
  const shape = new CANNON.Box(halfExtents);
  const body = new CANNON.Body({
    mass: 0.1,
    material: world._cardMaterial,
    allowSleep: true,
    // Tight sleep thresholds — cards must settle quickly. The old values
    // (0.18 / 0.35) let stacked cards micro-oscillate forever because
    // contact jitter kept them hovering just above the threshold.
    sleepSpeedLimit: 0.05,
    sleepTimeLimit: 0.15,
    // Heavy damping bleeds velocity fast so cards reach sleep threshold
    // within a fraction of a second instead of drifting endlessly.
    linearDamping: 0.92,
    angularDamping: 0.96,
  });
  body.addShape(shape);
  body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
  // Identity quaternion — the box is already flat in WORLD axes.
  body.quaternion.set(0, 0, 0, 1);
  body.updateMassProperties();
  world.addBody(body);
  mesh.userData.body = body;
  return body;
}

/** Remove a card's body from the world and clear the mesh reference. */
export function removeCardBody(world, mesh) {
  const body = mesh.userData?.body;
  if (!body) return;
  world.removeBody(body);
  mesh.userData.body = null;
}

/**
 * After a physics step, sync the body's pose onto the mesh:
 *
 *   position = body.position
 *   quaternion = body.quaternion * intentQuat
 *
 * Where intentQuat encodes the card's "should look like this" orientation
 * (lay-flat + tap/flip state) and body.quaternion encodes the physics
 * tilt that emerges from collisions on uneven stacks. Composing them in
 * this order means tap/flip and physics tilt can coexist without fighting.
 */
export function syncMeshFromBody(mesh) {
  const body = mesh.userData?.body;
  if (!body) return;

  mesh.position.x = body.position.x;
  mesh.position.y = body.position.y;
  mesh.position.z = body.position.z;

  const intent = mesh.userData.intentEuler;
  if (!intent) return;
  _bodyQuat.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
  _intentQuat.setFromEuler(intent);
  mesh.quaternion.multiplyQuaternions(_bodyQuat, _intentQuat);
}

/**
 * Set a body to LOCAL-KINEMATIC mode while the user is dragging the card.
 * Kinematic bodies don't respond to gravity, but with collisionResponse
 * left enabled they DO push other dynamic bodies — so dragging a card
 * (or a group of cards) through a stack still scatters the stack the way
 * you'd expect.
 *
 * Always re-enables collisionResponse and resets rotation to identity:
 * the body might previously have been in remote-controlled mode (which
 * disables collisions and may have left a tilt), and a fresh drag should
 * always start from a clean local-controlled state.
 */
export function setBodyKinematic(body) {
  if (!body) return;
  body.type = CANNON.Body.KINEMATIC;
  body.collisionResponse = true;
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.quaternion.set(0, 0, 0, 1);
  body.wakeUp();
}

/**
 * Switch a body back to dynamic so gravity + collisions take over again.
 * Called on drop. The body keeps its current pose but starts simulating.
 *
 * Always re-enables collisionResponse so a body that was previously in
 * remote-controlled mode (collisionResponse=false) is now a fully
 * participating member of the local simulation again.
 *
 * Velocity and angular velocity are zeroed out explicitly. cannon-es
 * can leave an implicit velocity behind on kinematic → dynamic
 * transitions when a kinematic body was being moved via direct
 * position writes (which is exactly what moveKinematicBody does), and
 * that residual velocity would then "inherit" into the dynamic sim as
 * if the user threw the card — not what we want on a drop.
 */
export function setBodyDynamic(body) {
  if (!body) return;
  body.type = CANNON.Body.DYNAMIC;
  body.collisionResponse = true;
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.wakeUp();
}

/**
 * Manually move a kinematic body to a target world position. Used while
 * the user is dragging — the cursor's table-plane intersection becomes
 * the new body position. Velocities stay zero (kinematic).
 */
export function moveKinematicBody(body, x, y, z) {
  if (!body) return;
  body.position.set(x, y, z);
}

/**
 * Switch a body into REMOTE-CONTROLLED mode: kinematic so local physics
 * doesn't drive it, AND collisionResponse=false so it can't push local-
 * owned bodies around. Used when the opponent has claimed the card and
 * is streaming its pose; the body becomes a pose-driven ghost on this
 * client until card:release arrives.
 *
 * The cascade visual still works on the receiving client because the
 * REMOTE owner's machine is also auto-claiming any free body that wakes,
 * which propagates as additional card:claim messages — so cards that
 * would have been pushed get switched to remote-controlled mode too.
 */
export function setBodyRemoteControlled(body) {
  if (!body) return;
  body.type = CANNON.Body.KINEMATIC;
  body.collisionResponse = false;
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.wakeUp();
}

/**
 * Apply an authoritative pose from the opponent and put the body fully
 * back into the local physics consensus pool: dynamic, colliding, asleep
 * at the new pose. Called when handling card:release.
 */
export function applyRemotePoseAndRest(body, pos, quat) {
  if (!body) return;
  body.position.set(pos[0], pos[1], pos[2]);
  body.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.collisionResponse = true;
  body.type = CANNON.Body.DYNAMIC;
  body.sleep();
}

/**
 * Create a rigid lock constraint between two bodies.
 *
 * Used by the card-grouping feature: when the player groups N stacked
 * cards together, we chain N-1 lock constraints between consecutive
 * members. The constraints freeze each pair at their current relative
 * pose, so gravity, collisions, and user drags move the whole group
 * as a single rigid object — the contact solver never has to resolve
 * face-to-face contacts between group members because the constraint
 * handles their relative pose directly. Crucially this means the
 * stacking order inside the group can't be swapped by numerical
 * jitter on release, which is the bug the deterministic-landing
 * workaround was trying to paper over.
 */
export function addLockConstraint(world, bodyA, bodyB) {
  if (!world || !bodyA || !bodyB) return null;
  const constraint = new CANNON.LockConstraint(bodyA, bodyB);
  world.addConstraint(constraint);
  return constraint;
}

export function removeConstraint(world, constraint) {
  if (!world || !constraint) return;
  world.removeConstraint(constraint);
}
