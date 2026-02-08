// Maze grid dimensions (cells, not pixels)
export const MAZE_COLS = 31;
export const MAZE_ROWS = 23;

// Each cell is this many pixels wide/tall
export const CELL_SIZE = 20;

// Wall thickness in pixels
export const WALL_THICKNESS = 2;

// Cursor collision radius — near-point at the arrow tip so it can touch walls
export const CURSOR_RADIUS = 1;

// Cursor visual scale (macOS arrow drawn from SVG paths)
export const CURSOR_SCALE = 0.85;

// Canvas border padding (replaces CSS border — drawn manually with gap)
export const CANVAS_PAD = 2;

// Colors
export const COLOR_BACKGROUND = '#ffffff';
export const COLOR_PAGE_BG = '#f5f5f5';
export const COLOR_WALL = '#222222';
export const COLOR_GOAL = '#daa520';
export const COLOR_GOAL_GLOW = 'rgba(218, 165, 32, 0.4)';
export const COLOR_OVERLAY_BG = 'rgba(255, 255, 255, 0.85)';
export const COLOR_TEXT = '#222222';

// Tunnels (paired: A↔B bidirectional) and teleporters (one-way to random cell)
export const COLOR_TUNNEL_WALL = '#e0e0e0';
export const TUNNEL_PAIR_COUNT = 3;       // bidirectional paired tunnels
export const TELEPORTER_COUNT = 3;        // one-way random destination walls
export const TUNNEL_MIN_DISTANCE = 8;
export const TELEPORT_FLASH_DURATION = 100;
export const COLOR_TUNNEL_GLOW = '#4a9eff';
export const TUNNEL_GLOW_DURATION = 300;

// Entry gap (fraction of CELL_SIZE, centered on left wall of start cell)
export const GAP_SIZE = 1.0;

// Start and goal cells
export const START_COL = 0;
export const START_ROW = 0;
export const GOAL_COL = MAZE_COLS - 1;
export const GOAL_ROW = MAZE_ROWS - 1;
