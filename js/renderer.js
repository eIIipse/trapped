import {
  CELL_SIZE, WALL_THICKNESS,
  COLOR_BACKGROUND, COLOR_PAGE_BG, COLOR_WALL, COLOR_GOAL, COLOR_GOAL_GLOW,
  COLOR_OVERLAY_BG, COLOR_TEXT, COLOR_TUNNEL_WALL, COLOR_TUNNEL_GLOW,
  MAZE_COLS, MAZE_ROWS, CURSOR_SCALE, TELEPORT_FLASH_DURATION, TUNNEL_GLOW_DURATION,
  GAP_SIZE, CANVAS_PAD,
} from './constants.js';

let ctx;
let canvasW, canvasH;   // full canvas dimensions (includes border padding)
let mazeW, mazeH;       // maze-space dimensions (no padding)
let dpr = 1;

// macOS default cursor — pre-built Path2D from SVG path data
// Source: https://github.com/daviddarnes/mac-cursors (translated to 0,0 origin)
const cursorOuter = new Path2D('M6.148 18.473 8.011 17.47 9.626 16.631 7.058 11.815H11.39L0.011 0.407V16.422L3.327 13.201Z');
const cursorInner = new Path2D('M6.431 17 8.196 16.059 5.421 10.857H9.025L1 2.814V14.002L3.53 11.56Z');

export function initRenderer(canvas) {
  ctx = canvas.getContext('2d');
  dpr = window.devicePixelRatio || 1;

  mazeW = MAZE_COLS * CELL_SIZE;
  mazeH = MAZE_ROWS * CELL_SIZE;
  canvasW = mazeW + CANVAS_PAD * 2;
  canvasH = mazeH + CANVAS_PAD * 2;

  canvas.style.width = canvasW + 'px';
  canvas.style.height = canvasH + 'px';
  canvas.width = canvasW * dpr;
  canvas.height = canvasH * dpr;
  ctx.scale(dpr, dpr);
}

export function render(state) {
  const {
    maze, tunnels, cursorX, cursorY, goalCol, goalRow,
    isLocked, gameState, timestamp, teleportFlash, gapOpen,
  } = state;

  // 1. Clear entire canvas with page background (so gap shows viewport color)
  ctx.fillStyle = COLOR_PAGE_BG;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 2. Draw manual border (with gap on left when open)
  drawCanvasBorder(gapOpen);

  // 3. Shift into maze coordinate space
  ctx.save();
  ctx.translate(CANVAS_PAD, CANVAS_PAD);

  // 4. Fill maze interior with white
  ctx.fillStyle = COLOR_BACKGROUND;
  ctx.fillRect(0, 0, mazeW, mazeH);

  // 5. Draw maze content
  drawMaze(maze);
  if (tunnels) drawTunnels(tunnels, teleportFlash, timestamp);
  if (gapOpen) drawGapOpening();
  drawGoal(goalCol, goalRow, timestamp);

  if (teleportFlash) {
    drawTeleportFlash(teleportFlash, timestamp);
  }

  if (isLocked && gameState === 'playing') {
    drawCursor(cursorX, cursorY);
  }

  if (gameState === 'idle') {
    drawOverlay('Click anywhere to start', '');
  } else if (gameState === 'won') {
    drawOverlay('You solved the maze!', 'Click to play again.');
  } else if (gameState === 'escaped') {
    drawOverlay('You escaped!', '...but did you really win? Click to try again.');
  }

  // 6. Restore
  ctx.restore();
}

// --- Border (drawn in canvas space, before translate) ---

function drawCanvasBorder(gapOpen) {
  const pad = CANVAS_PAD;
  const halfPad = pad / 2;

  ctx.strokeStyle = COLOR_WALL;
  ctx.lineWidth = pad;
  ctx.lineCap = 'square';

  // Top border
  ctx.beginPath();
  ctx.moveTo(0, halfPad);
  ctx.lineTo(canvasW, halfPad);
  ctx.stroke();

  // Right border
  ctx.beginPath();
  ctx.moveTo(canvasW - halfPad, 0);
  ctx.lineTo(canvasW - halfPad, canvasH);
  ctx.stroke();

  // Bottom border
  ctx.beginPath();
  ctx.moveTo(0, canvasH - halfPad);
  ctx.lineTo(canvasW, canvasH - halfPad);
  ctx.stroke();

  // Left border (with or without gap)
  if (gapOpen) {
    const gapH = GAP_SIZE * CELL_SIZE;
    const gapYStart = pad + (CELL_SIZE - gapH) / 2;
    const gapYEnd = gapYStart + gapH;

    // Above gap
    ctx.beginPath();
    ctx.moveTo(halfPad, 0);
    ctx.lineTo(halfPad, gapYStart);
    ctx.stroke();

    // Below gap
    ctx.beginPath();
    ctx.moveTo(halfPad, gapYEnd);
    ctx.lineTo(halfPad, canvasH);
    ctx.stroke();
  } else {
    // Full left border
    ctx.beginPath();
    ctx.moveTo(halfPad, 0);
    ctx.lineTo(halfPad, canvasH);
    ctx.stroke();
  }
}

// --- Maze drawing (all in maze space after translate) ---

function drawMaze(maze) {
  ctx.strokeStyle = COLOR_WALL;
  ctx.lineWidth = WALL_THICKNESS;
  ctx.lineCap = 'square';

  for (let r = 0; r < maze.length; r++) {
    for (let c = 0; c < maze[0].length; c++) {
      const cell = maze[r][c];
      const x = c * CELL_SIZE;
      const y = r * CELL_SIZE;

      if (cell.walls.top) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + CELL_SIZE, y);
        ctx.stroke();
      }
      if (cell.walls.right) {
        ctx.beginPath();
        ctx.moveTo(x + CELL_SIZE, y);
        ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE);
        ctx.stroke();
      }
      if (cell.walls.bottom) {
        ctx.beginPath();
        ctx.moveTo(x, y + CELL_SIZE);
        ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE);
        ctx.stroke();
      }
      if (cell.walls.left) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + CELL_SIZE);
        ctx.stroke();
      }
    }
  }
}

function lerpColor(a, b, t) {
  const p = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const ca = p(a), cb = p(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function drawTunnels(tunnels, flash, timestamp) {
  ctx.lineWidth = WALL_THICKNESS;
  ctx.lineCap = 'square';

  for (const [i, t] of tunnels.entries()) {
    let color = COLOR_TUNNEL_WALL;
    if (flash && flash.tunnelIndex === i) {
      const elapsed = timestamp - flash.startTime;
      if (elapsed < TUNNEL_GLOW_DURATION) {
        color = lerpColor(COLOR_TUNNEL_GLOW, COLOR_TUNNEL_WALL, elapsed / TUNNEL_GLOW_DURATION);
      }
    }
    ctx.strokeStyle = color;
    if (t.cellA) drawWallLine(t.cellA, t.wallSideA);
    if (t.cellB) drawWallLine(t.cellB, t.wallSideB);
  }
}

function drawWallLine(cell, side) {
  const x = cell.col * CELL_SIZE;
  const y = cell.row * CELL_SIZE;
  ctx.beginPath();
  switch (side) {
    case 'top':    ctx.moveTo(x, y); ctx.lineTo(x + CELL_SIZE, y); break;
    case 'right':  ctx.moveTo(x + CELL_SIZE, y); ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE); break;
    case 'bottom': ctx.moveTo(x, y + CELL_SIZE); ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE); break;
    case 'left':   ctx.moveTo(x, y); ctx.lineTo(x, y + CELL_SIZE); break;
  }
  ctx.stroke();
}

function drawGapOpening() {
  // Erase the left wall of cell (0,0) in the gap region + bridge through border band
  const gapH = GAP_SIZE * CELL_SIZE;
  const gapYStart = (CELL_SIZE - gapH) / 2;

  ctx.fillStyle = COLOR_BACKGROUND;
  ctx.fillRect(-CANVAS_PAD, gapYStart, CANVAS_PAD + WALL_THICKNESS + 1, gapH);
}

function drawGoal(col, row, timestamp) {
  const cx = (col + 0.5) * CELL_SIZE;
  const cy = (row + 0.5) * CELL_SIZE;
  const pulse = 1 + 0.2 * Math.sin(timestamp * 0.004);
  const radius = 5 * pulse;

  // Glow
  ctx.save();
  ctx.shadowColor = COLOR_GOAL_GLOW;
  ctx.shadowBlur = 8 * pulse;
  ctx.fillStyle = COLOR_GOAL;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Solid center
  ctx.fillStyle = COLOR_GOAL;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawTeleportFlash(flash, timestamp) {
  const elapsed = timestamp - flash.startTime;
  if (elapsed > TUNNEL_GLOW_DURATION) return;

  const progress = elapsed / TUNNEL_GLOW_DURATION;
  const alpha = (1 - progress) * 0.5;
  const radius = 4 + progress * 10;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLOR_TUNNEL_GLOW;
  ctx.beginPath();
  ctx.arc(flash.x, flash.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCursor(x, y) {
  ctx.save();
  ctx.translate(x, y - 0.4 * CURSOR_SCALE);
  ctx.scale(CURSOR_SCALE, CURSOR_SCALE);

  // White body (outer path)
  ctx.fillStyle = '#ffffff';
  ctx.fill(cursorOuter);

  // Black interior (inner path)
  ctx.fillStyle = '#000000';
  ctx.fill(cursorInner);

  ctx.restore();
}

function drawOverlay(title, subtitle) {
  // Semi-transparent background (maze area only)
  ctx.fillStyle = COLOR_OVERLAY_BG;
  ctx.fillRect(0, 0, mazeW, mazeH);

  // Title
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, mazeW / 2, mazeH / 2 - 16);

  // Subtitle
  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText(subtitle, mazeW / 2, mazeH / 2 + 16);
}
