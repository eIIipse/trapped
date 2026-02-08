import {
  MAZE_ROWS, MAZE_COLS, CELL_SIZE, WALL_THICKNESS,
  START_ROW, START_COL, GOAL_ROW, GOAL_COL,
  TUNNEL_PAIR_COUNT, TELEPORTER_COUNT, TUNNEL_MIN_DISTANCE,
} from './constants.js';

function createGrid(rows, cols) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        row: r,
        col: c,
        walls: { top: true, right: true, bottom: true, left: true },
        visited: false,
      });
    }
    grid.push(row);
  }
  return grid;
}

function getUnvisitedNeighbors(cell, grid) {
  const { row, col } = cell;
  const neighbors = [];
  if (row > 0 && !grid[row - 1][col].visited) neighbors.push(grid[row - 1][col]);
  if (row < grid.length - 1 && !grid[row + 1][col].visited) neighbors.push(grid[row + 1][col]);
  if (col > 0 && !grid[row][col - 1].visited) neighbors.push(grid[row][col - 1]);
  if (col < grid[0].length - 1 && !grid[row][col + 1].visited) neighbors.push(grid[row][col + 1]);
  return neighbors;
}

function removeWallBetween(a, b) {
  const dr = b.row - a.row;
  const dc = b.col - a.col;
  if (dr === -1) { a.walls.top = false; b.walls.bottom = false; }
  if (dr === 1)  { a.walls.bottom = false; b.walls.top = false; }
  if (dc === -1) { a.walls.left = false; b.walls.right = false; }
  if (dc === 1)  { a.walls.right = false; b.walls.left = false; }
}

export function generateMaze(rows = MAZE_ROWS, cols = MAZE_COLS) {
  const grid = createGrid(rows, cols);
  const stack = [];
  let current = grid[0][0];
  current.visited = true;
  stack.push(current);

  while (stack.length > 0) {
    const neighbors = getUnvisitedNeighbors(current, grid);
    if (neighbors.length > 0) {
      const next = neighbors[Math.floor(Math.random() * neighbors.length)];
      removeWallBetween(current, next);
      next.visited = true;
      stack.push(current);
      current = next;
    } else {
      current = stack.pop();
    }
  }

  return grid;
}

/**
 * Generate a mix of tunnel pairs and random teleporters.
 *
 * Tunnel pairs: bidirectional (A↔B), touching one side sends you to the other.
 * Teleporters: one-way walls that send you to a random cell in the maze.
 *
 * Both types look the same (subtle grey wall). You don't know which kind
 * you've hit until you touch it.
 */
export function generateTunnels(maze) {
  const rows = maze.length;
  const cols = maze[0].length;

  // Collect all interior walls (walls between two adjacent cells, not on border)
  const interiorWalls = collectInteriorWalls(maze, rows, cols);
  shuffle(interiorWalls);

  const used = new Set();
  const tunnels = [];

  // 1. Pick paired tunnels (bidirectional A↔B)
  for (let i = 0; i < interiorWalls.length && tunnels.length < TUNNEL_PAIR_COUNT; i++) {
    if (used.has(i)) continue;
    const wallA = interiorWalls[i];

    for (let j = i + 1; j < interiorWalls.length; j++) {
      if (used.has(j)) continue;
      const wallB = interiorWalls[j];
      const dist = Math.abs(wallA.row - wallB.row) + Math.abs(wallA.col - wallB.col);
      if (dist >= TUNNEL_MIN_DISTANCE) {
        used.add(i);
        used.add(j);
        tunnels.push({
          type: 'pair',
          cellA: { row: wallA.row, col: wallA.col },
          wallSideA: wallA.side,
          cellB: { row: wallB.row, col: wallB.col },
          wallSideB: wallB.side,
          rectA: wallRect(wallA),
          rectB: wallRect(wallB),
          destA: cellCenter(wallB.neighborRow, wallB.neighborCol),
          destB: cellCenter(wallA.neighborRow, wallA.neighborCol),
        });
        break;
      }
    }
  }

  // 2. Pick random teleporter walls (one-way to random cell)
  let teleportersAdded = 0;
  for (let i = 0; i < interiorWalls.length && teleportersAdded < TELEPORTER_COUNT; i++) {
    if (used.has(i)) continue;
    const wall = interiorWalls[i];
    used.add(i);

    // Pick a random cell that isn't start, goal, or adjacent to this wall
    const dest = randomDistantCell(wall.row, wall.col, rows, cols);

    tunnels.push({
      type: 'teleporter',
      cellA: { row: wall.row, col: wall.col },
      wallSideA: wall.side,
      rectA: wallRect(wall),
      destA: cellCenter(dest.row, dest.col),
      // No B side — one-way only
      cellB: null,
      wallSideB: null,
      rectB: null,
      destB: null,
    });
    teleportersAdded++;
  }

  return tunnels;
}

function collectInteriorWalls(maze, rows, cols) {
  const walls = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === START_ROW && c === START_COL) continue;
      if (r === GOAL_ROW && c === GOAL_COL) continue;

      const cell = maze[r][c];

      if (c < cols - 1 && cell.walls.right) {
        if (!(r === START_ROW && c + 1 === START_COL) &&
            !(r === GOAL_ROW && c + 1 === GOAL_COL)) {
          walls.push({ row: r, col: c, side: 'right', neighborRow: r, neighborCol: c + 1 });
        }
      }

      if (r < rows - 1 && cell.walls.bottom) {
        if (!(r + 1 === START_ROW && c === START_COL) &&
            !(r + 1 === GOAL_ROW && c === GOAL_COL)) {
          walls.push({ row: r, col: c, side: 'bottom', neighborRow: r + 1, neighborCol: c });
        }
      }
    }
  }
  return walls;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function randomDistantCell(fromRow, fromCol, rows, cols) {
  // Pick a random cell at least 6 cells away, not start or goal
  for (let attempt = 0; attempt < 50; attempt++) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (r === START_ROW && c === START_COL) continue;
    if (r === GOAL_ROW && c === GOAL_COL) continue;
    if (Math.abs(r - fromRow) + Math.abs(c - fromCol) >= 6) {
      return { row: r, col: c };
    }
  }
  // Fallback: center of maze
  return { row: Math.floor(rows / 2), col: Math.floor(cols / 2) };
}

function wallRect(wall) {
  const half = WALL_THICKNESS / 2;
  const x = wall.col * CELL_SIZE;
  const y = wall.row * CELL_SIZE;
  if (wall.side === 'right') {
    return { x: x + CELL_SIZE - half, y, w: WALL_THICKNESS, h: CELL_SIZE };
  } else {
    return { x, y: y + CELL_SIZE - half, w: CELL_SIZE, h: WALL_THICKNESS };
  }
}

function cellCenter(row, col) {
  return { x: (col + 0.5) * CELL_SIZE, y: (row + 0.5) * CELL_SIZE };
}
