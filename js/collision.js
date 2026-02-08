import { CELL_SIZE, WALL_THICKNESS, CURSOR_RADIUS, GAP_SIZE } from './constants.js';

/**
 * Convert maze grid into an array of axis-aligned wall rectangles.
 * Called once after maze generation.
 */
export function buildWallSegments(maze, gapOpen = false) {
  const segments = [];
  const half = WALL_THICKNESS / 2;
  const rows = maze.length;
  const cols = maze[0].length;

  // Gap geometry for cell (0,0) left wall
  const gapH = GAP_SIZE * CELL_SIZE;
  const gapYStart = (CELL_SIZE - gapH) / 2;
  const gapYEnd = gapYStart + gapH;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = maze[r][c];
      const x = c * CELL_SIZE;
      const y = r * CELL_SIZE;

      // Top wall (horizontal)
      if (cell.walls.top) {
        segments.push({ x, y: y - half, w: CELL_SIZE, h: WALL_THICKNESS });
      }
      // Right wall (vertical)
      if (cell.walls.right) {
        segments.push({ x: x + CELL_SIZE - half, y, w: WALL_THICKNESS, h: CELL_SIZE });
      }
      // Bottom wall — only for last row (others handled by next row's top)
      if (r === rows - 1 && cell.walls.bottom) {
        segments.push({ x, y: y + CELL_SIZE - half, w: CELL_SIZE, h: WALL_THICKNESS });
      }
      // Left wall — only for first column (others handled by prev col's right)
      if (c === 0 && cell.walls.left) {
        if (r === 0 && gapOpen) {
          // Split into two stubs above and below the gap
          if (gapYStart > 0) {
            segments.push({ x: x - half, y, w: WALL_THICKNESS, h: gapYStart });
          }
          if (gapYEnd < CELL_SIZE) {
            segments.push({ x: x - half, y: y + gapYEnd, w: WALL_THICKNESS, h: CELL_SIZE - gapYEnd });
          }
        } else {
          segments.push({ x: x - half, y, w: WALL_THICKNESS, h: CELL_SIZE });
        }
      }
    }
  }

  return segments;
}

function circleIntersectsRect(cx, cy, r, rx, ry, rw, rh) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) < (r * r);
}

function collidesWithAnyWall(cx, cy, r, walls) {
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (circleIntersectsRect(cx, cy, r, w.x, w.y, w.w, w.h)) {
      return true;
    }
  }
  return false;
}

/**
 * Find the furthest valid position along one axis using binary search.
 * This gives smooth wall-hugging instead of jerky snapping.
 */
function binarySearchAxis(fromVal, toVal, fixedVal, isXAxis, radius, walls, canvasLimit) {
  // Clamp target to canvas bounds (allow cursor right to the edge)
  toVal = Math.max(radius, Math.min(canvasLimit - radius, toVal));

  // If target is valid, just use it
  const cx = isXAxis ? toVal : fixedVal;
  const cy = isXAxis ? fixedVal : toVal;
  if (!collidesWithAnyWall(cx, cy, radius, walls)) {
    return toVal;
  }

  // Binary search: find the furthest point we can move to without collision
  let lo = fromVal;
  let hi = toVal;
  for (let i = 0; i < 8; i++) { // 8 iterations = precision of ~0.4% of movement
    const mid = (lo + hi) / 2;
    const mx = isXAxis ? mid : fixedVal;
    const my = isXAxis ? fixedVal : mid;
    if (collidesWithAnyWall(mx, my, radius, walls)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return lo;
}

/**
 * Resolve a single step of movement with separate-axis collision + binary search.
 */
function resolveStep(x, y, dx, dy, radius, walls, canvasW, canvasH) {
  // Try X axis first
  const targetX = x + dx;
  const newX = binarySearchAxis(x, targetX, y, true, radius, walls, canvasW);

  // Try Y axis with the resolved X
  const targetY = y + dy;
  const newY = binarySearchAxis(y, targetY, newX, false, radius, walls, canvasH);

  return { x: newX, y: newY };
}

/**
 * Resolve movement with sub-stepping to prevent wall tunneling.
 */
export function resolveMovement(x, y, dx, dy, walls, canvasW, canvasH) {
  const radius = CURSOR_RADIUS;
  const totalDist = Math.hypot(dx, dy);
  if (totalDist === 0) return { x, y };

  // Sub-step: each step moves at most 'radius' pixels to prevent tunneling
  const maxStep = Math.max(radius, WALL_THICKNESS);
  const steps = Math.max(1, Math.ceil(totalDist / maxStep));
  const stepDX = dx / steps;
  const stepDY = dy / steps;

  let cx = x;
  let cy = y;
  for (let i = 0; i < steps; i++) {
    const result = resolveStep(cx, cy, stepDX, stepDY, radius, walls, canvasW, canvasH);
    cx = result.x;
    cy = result.y;
  }

  return { x: cx, y: cy };
}

/**
 * Check if the cursor is pressing against a tunnel or teleporter wall.
 * Uses a slightly inflated radius to detect proximity (cursor stops just before the wall).
 *
 * For paired tunnels: entrance A → destA (other side of B), entrance B → destB (other side of A).
 * For teleporters: entrance A → destA (random cell). No B side.
 */
export function checkTunnelContact(cx, cy, tunnels) {
  const detectRadius = CURSOR_RADIUS + 2;
  for (let i = 0; i < tunnels.length; i++) {
    const t = tunnels[i];
    if (t.rectA && circleIntersectsRect(cx, cy, detectRadius, t.rectA.x, t.rectA.y, t.rectA.w, t.rectA.h)) {
      // For pairs: A entrance sends to destB (other side of B wall)
      // For teleporters: A entrance sends to destA (random cell)
      const dest = t.type === 'teleporter' ? t.destA : t.destB;
      return { tunnelIndex: i, entrance: 'A', dest };
    }
    if (t.rectB && circleIntersectsRect(cx, cy, detectRadius, t.rectB.x, t.rectB.y, t.rectB.w, t.rectB.h)) {
      return { tunnelIndex: i, entrance: 'B', dest: t.destA };
    }
  }
  return null;
}
