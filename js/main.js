import {
  CELL_SIZE,
  START_COL, START_ROW, GOAL_COL, GOAL_ROW,
  MAZE_COLS, MAZE_ROWS, TUNNEL_GLOW_DURATION,
  GAP_SIZE, CANVAS_PAD,
} from './constants.js';
import { generateMaze, generateTunnels } from './maze.js';
import { buildWallSegments, resolveMovement, checkTunnelContact } from './collision.js';
import { initPointerLock, requestLock, consumeMovement, isLocked } from './pointer-lock.js';
import { initRenderer, render } from './renderer.js';

const canvas = document.getElementById('maze-canvas');
const roamingCursorEl = document.getElementById('roaming-cursor');
const entryHintEl = document.getElementById('entry-hint');
const roamingHintEl = document.getElementById('roaming-hint');

// Game state
let maze;
let wallSegments;
let tunnels;
let cursorX, cursorY;
let gameState = 'idle'; // 'idle' | 'roaming' | 'playing' | 'won' | 'escaped'
let gapOpen = true;

// Tunnel state
let tunnelCooldownIndex = -1;
let tunnelCooldownFrames = 0;
let teleportFlash = null;

// Maze-space dimensions (used for collision bounds and roaming bounds)
const mazeW = MAZE_COLS * CELL_SIZE;
const mazeH = MAZE_ROWS * CELL_SIZE;

// Full canvas dimensions (includes border padding)
const fullW = mazeW + CANVAS_PAD * 2;
const fullH = mazeH + CANVAS_PAD * 2;

// Gap geometry (in maze space)
const gapH = GAP_SIZE * CELL_SIZE;
const gapYStart = (CELL_SIZE - gapH) / 2;
const gapYEnd = gapYStart + gapH;

function resetMaze() {
  maze = generateMaze();
  tunnels = generateTunnels(maze);
  gapOpen = true;
  wallSegments = buildWallSegments(maze, true);
  tunnelCooldownIndex = -1;
  tunnelCooldownFrames = 0;
  teleportFlash = null;
}

// Called when pointer lock is acquired
function onPointerLocked() {
  canvas.classList.add('locked');

  if (gameState === 'idle') {
    // Start roaming — cursor appears at canvas center (in maze space)
    cursorX = mazeW / 2;
    cursorY = mazeH / 2;
    gameState = 'roaming';
  } else if (gameState === 'won' || gameState === 'escaped') {
    if (gameState === 'won') {
      resetMaze();
    } else {
      // Escaped: keep same maze, reset tunnel state
      tunnelCooldownIndex = -1;
      tunnelCooldownFrames = 0;
      teleportFlash = null;
    }
    // Go to roaming — cursor at center, gap open
    gapOpen = true;
    wallSegments = buildWallSegments(maze, true);
    cursorX = mazeW / 2;
    cursorY = mazeH / 2;
    gameState = 'roaming';
  }
}

function onPointerUnlock() {
  canvas.classList.remove('locked');
  if (gameState === 'playing') {
    gameState = 'escaped';
    gapOpen = true;
    wallSegments = buildWallSegments(maze, true);
  } else if (gameState === 'roaming') {
    gameState = 'idle';
    roamingCursorEl.style.display = 'none';
  }
}

// Check if cursor just crossed from outside the maze into the gap
// Unidirectional: only triggers when moving from x < 0 to x >= 0
// while y is within the gap vertical range
function isCursorEnteringGap(prevX, x, y) {
  return prevX < 0
    && x >= 0
    && y >= gapYStart
    && y <= gapYEnd;
}

// Convert maze-space cursor position to page position for the roaming cursor element
function updateRoamingCursor() {
  if (gameState === 'roaming') {
    const rect = canvas.getBoundingClientRect();
    const pageX = rect.left + CANVAS_PAD + cursorX;
    const pageY = rect.top + CANVAS_PAD + cursorY;
    roamingCursorEl.style.display = 'block';
    roamingCursorEl.style.transform = `translate(${pageX}px, ${pageY}px)`;
  } else {
    roamingCursorEl.style.display = 'none';
  }
}

// Initialize
initRenderer(canvas);
resetMaze();

initPointerLock(canvas, {
  onLock: onPointerLocked,
  onUnlock: onPointerUnlock,
});

// Click anywhere on canvas to engage pointer lock
canvas.addEventListener('mousedown', async () => {
  if (isLocked()) return;
  await requestLock(canvas);
});

// Game loop
function gameLoop(timestamp) {
  if (isLocked()) {
    const { dx, dy } = consumeMovement();

    if (gameState === 'roaming') {
      // Free movement — no bounds, no collision. Cursor roams like a normal pointer.
      const prevX = cursorX;
      cursorX += dx;
      cursorY += dy;

      // Check if cursor crossed from outside into the gap (one-way only)
      if (isCursorEnteringGap(prevX, cursorX, cursorY)) {
        // Trap! Close the wall and start playing
        gapOpen = false;
        wallSegments = buildWallSegments(maze, false);
        // Place cursor at the center of the start cell
        cursorX = (START_COL + 0.5) * CELL_SIZE;
        cursorY = (START_ROW + 0.5) * CELL_SIZE;
        gameState = 'playing';
        roamingCursorEl.style.display = 'none';
      }
    } else if (gameState === 'playing') {
      const result = resolveMovement(cursorX, cursorY, dx, dy, wallSegments, mazeW, mazeH);
      cursorX = result.x;
      cursorY = result.y;

      // Tunnel detection
      if (tunnelCooldownFrames > 0) {
        tunnelCooldownFrames--;
      }

      const tunnelHit = checkTunnelContact(cursorX, cursorY, tunnels);
      if (tunnelHit && (tunnelHit.tunnelIndex !== tunnelCooldownIndex || tunnelCooldownFrames === 0)) {
        cursorX = tunnelHit.dest.x;
        cursorY = tunnelHit.dest.y;
        tunnelCooldownIndex = tunnelHit.tunnelIndex;
        tunnelCooldownFrames = 10; // ~166ms at 60fps
        teleportFlash = { x: cursorX, y: cursorY, startTime: timestamp, tunnelIndex: tunnelHit.tunnelIndex };
      }

      // Clear expired flash
      if (teleportFlash && timestamp - teleportFlash.startTime > TUNNEL_GLOW_DURATION) {
        teleportFlash = null;
      }

      // Win check
      const goalCX = (GOAL_COL + 0.5) * CELL_SIZE;
      const goalCY = (GOAL_ROW + 0.5) * CELL_SIZE;
      const dist = Math.hypot(cursorX - goalCX, cursorY - goalCY);
      if (dist < CELL_SIZE * 0.3) {
        gameState = 'won';
        document.exitPointerLock();
        canvas.classList.remove('locked');
        gapOpen = true;
        wallSegments = buildWallSegments(maze, true);
      }
    }
  }

  render({
    maze,
    tunnels,
    cursorX,
    cursorY,
    goalCol: GOAL_COL,
    goalRow: GOAL_ROW,
    isLocked: isLocked(),
    gameState,
    timestamp,
    teleportFlash,
    gapOpen,
  });

  updateRoamingCursor();
  entryHintEl.style.opacity = (gameState === 'roaming') ? '1' : '0';
  roamingHintEl.style.opacity = (gameState === 'roaming') ? '1' : '0';
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
