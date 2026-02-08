// Sensitivity: 1.0 = matches OS cursor speed exactly
const SENSITIVITY = 0.6;

let pendingDX = 0;
let pendingDY = 0;
let locked = false;
let onLockCallback = null;
let onUnlockCallback = null;

function onMouseMove(e) {
  pendingDX += e.movementX * SENSITIVITY;
  pendingDY += e.movementY * SENSITIVITY;
}

function onLockChange() {
  if (document.pointerLockElement) {
    locked = true;
    if (onLockCallback) onLockCallback();
  } else {
    locked = false;
    if (onUnlockCallback) onUnlockCallback();
  }
}

export function initPointerLock(canvas, { onLock, onUnlock }) {
  onLockCallback = onLock;
  onUnlockCallback = onUnlock;

  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('mousemove', onMouseMove);
  // No click listener — main.js controls when to request lock
}

export async function requestLock(canvas) {
  if (locked) return;
  await canvas.requestPointerLock();
}

export function consumeMovement() {
  const dx = pendingDX;
  const dy = pendingDY;
  pendingDX = 0;
  pendingDY = 0;
  return { dx, dy };
}

export function isLocked() {
  return locked;
}
