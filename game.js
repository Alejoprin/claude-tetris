'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // tuerca - gris metálico
  '#ff7043', // bomba - naranja
];

// Paletas alternativas por skin — mismo largo/orden que COLORS, nunca se muta COLORS.
const PALETTE_NEON = [
  null,
  '#00e5ff',
  '#fff176',
  '#e040fb',
  '#69f0ae',
  '#ff1744',
  '#448aff',
  '#ff9100',
  '#90a4ae',
  '#ff3d00',
];

const PALETTE_PASTEL = [
  null,
  '#a8d8ea',
  '#fff2b2',
  '#d9b8e8',
  '#b5e8b0',
  '#f4b8b8',
  '#b8cdf0',
  '#f7cfa0',
  '#d6d9de',
  '#f7b7a3',
];

const PALETTES = {
  retro: COLORS,
  neon: PALETTE_NEON,
  pastel: PALETTE_PASTEL,
  pixel: COLORS,
};

const SKINS = ['retro', 'neon', 'pastel', 'pixel'];

const NUT = 8;
const BOMB = 9;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // tuerca
  [[9]],                                       // bomba
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const NUT_CELL_SCORE = 50;
const BOMB_CELL_SCORE = 30;
const BOMB_EVERY_LINES = 10;
const BOMB_EVERY_PIECES = 10;
const FUSE_MS = 350;
const BLAST_MS = 300;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, bombPending, piecesPlaced, fuse, blast, holdType, canHold, skin;
let gridLineColor = '#22222e';

// Los skins neon/pastel/pixel fijan su propio fondo de canvas sin importar el tema claro/oscuro,
// así que su línea de grilla también se fija en JS — evita una guerra de especificidad CSS entre
// [data-theme] y [data-skin] (ambos en <html>) donde el que se declara último siempre ganaba.
const SKIN_GRID_COLORS = {
  neon: '#0d3b40',
  pastel: '#e8dff5',
  pixel: '#3a3a3a',
};

function updateGridColor() {
  if (skin && SKIN_GRID_COLORS[skin]) {
    gridLineColor = SKIN_GRID_COLORS[skin];
    return;
  }
  gridLineColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim() || gridLineColor;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  updateGridColor();
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(currentTheme);
}

function currentPalette() {
  return PALETTES[skin] || COLORS;
}

function applySkin(newSkin) {
  skin = SKINS.includes(newSkin) ? newSkin : 'retro';
  document.documentElement.setAttribute('data-skin', skin);
  updateGridColor();
  if (skinSelect) skinSelect.value = skin;
  localStorage.setItem(SKIN_KEY, skin);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  return makePiece(type);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  let nutCells = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      nutCells += board[r].filter(v => v === NUT).length;
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    const linesBefore = lines;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    score += nutCells * NUT_CELL_SCORE * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (Math.floor(lines / BOMB_EVERY_LINES) > Math.floor(linesBefore / BOMB_EVERY_LINES)) bombPending = true;
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.type === BOMB) {
    if (fuse) detonate(fuse.cx, fuse.cy);
    fuse = { cx: current.x, cy: current.y, t: 0 };
  } else {
    merge();
    piecesPlaced++;
    if (piecesPlaced % BOMB_EVERY_PIECES === 0) bombPending = true;
  }
  clearLines();
  spawn();
}

function detonate(cx, cy) {
  const cells = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = cy + dr, c = cx + dc;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
      if (board[r][c] !== 0) {
        cells.push({ r, c, type: board[r][c] });
        board[r][c] = 0;
      }
    }
  }
  score += cells.length * BOMB_CELL_SCORE * level;
  collapseColumns();
  clearLines();
  updateHUD();
  blast = { cx, cy, t: 0, cells };
  fuse = null;
}

function collapseColumns() {
  for (let c = 0; c < COLS; c++) {
    const stack = [];
    for (let r = 0; r < ROWS; r++)
      if (board[r][c] !== 0) stack.push(board[r][c]);
    for (let r = ROWS - 1; r >= 0; r--)
      board[r][c] = stack.length ? stack.pop() : 0;
  }
}

function spawn() {
  current = next;
  next = bombPending ? makePiece(BOMB) : randomPiece();
  bombPending = false;
  canHold = true;
  drawHold();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function hold() {
  if (!canHold || current.type === BOMB) return;
  const swapType = holdType;
  holdType = current.type;
  canHold = false;
  if (swapType == null) {
    current = next;
    next = bombPending ? makePiece(BOMB) : randomPiece();
    bombPending = false;
    drawNext();
  } else {
    current = makePiece(swapType);
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawHold();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = currentPalette()[colorIndex];
  const a = alpha ?? 1;
  switch (skin) {
    case 'neon':
      drawBlockNeon(context, x, y, color, size, a);
      break;
    case 'pastel':
      drawBlockPastel(context, x, y, color, size, a);
      break;
    case 'pixel':
      drawBlockPixel(context, x, y, color, size, a);
      break;
    default:
      drawBlockRetro(context, x, y, color, size, a);
  }
}

function drawBlockRetro(context, x, y, color, size, alpha) {
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

// Neon — fondo oscuro, borde brillante y glow con shadowBlur.
// shadowBlur es caro por celda a 60fps con ~200 celdas en pantalla, así que se activa una sola vez
// (solo para el trazo del borde) en vez de en cada fillRect del bloque.
function drawBlockNeon(context, x, y, color, size, alpha) {
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = '#0a0a0f';
  context.fillRect(px, py, s, s);
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 1, py + 1, Math.max(0, s - 2), Math.max(0, s - 2));
  context.shadowBlur = 0;
  context.globalAlpha = alpha * 0.85;
  context.fillStyle = color;
  context.fillRect(px + 3, py + 3, Math.max(0, s - 6), Math.max(0, s - 6));
  context.restore();
}

// Pastel — colores suaves con esquinas redondeadas.
function drawBlockPastel(context, x, y, color, size, alpha) {
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  const r = size * 0.22;
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  roundRectPath(context, px, py, s, s, r);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.35)';
  roundRectPath(context, px + 2, py + 2, Math.max(0, s - 4), Math.max(0, s * 0.35), r * 0.8);
  context.fill();
  context.restore();
}

// Pixel art — textura de mini-cuadros tipo dithering sobre el color base.
function drawBlockPixel(context, x, y, color, size, alpha) {
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  const cell = Math.max(2, Math.floor(s / 6));
  context.fillStyle = 'rgba(0,0,0,0.15)';
  for (let ry = 0; ry < s; ry += cell * 2) {
    for (let rx = 0; rx < s; rx += cell * 2) {
      context.fillRect(px + rx, py + ry, cell, cell);
      context.fillRect(px + rx + cell, py + ry + cell, cell, cell);
    }
  }
  context.strokeStyle = 'rgba(0,0,0,0.4)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, Math.max(0, s - 1), Math.max(0, s - 1));
  context.restore();
}

function roundRectPath(context, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  context.beginPath();
  context.moveTo(x + rad, y);
  context.arcTo(x + w, y, x + w, y + h, rad);
  context.arcTo(x + w, y + h, x, y + h, rad);
  context.arcTo(x, y + h, x, y, rad);
  context.arcTo(x, y, x + w, y, rad);
  context.closePath();
}

// Perfora un círculo transparente en (cx, cy) — deja ver el fondo CSS, sirve en ambos temas.
function punchNutHole(context, cx, cy, size) {
  context.globalCompositeOperation = 'destination-out';
  context.beginPath();
  context.arc((cx + 0.5) * size, (cy + 0.5) * size, size * 0.72, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = 'source-over';
}

function strokeNutHole(context, cx, cy, size, alpha) {
  context.globalAlpha = alpha;
  context.strokeStyle = currentPalette()[NUT];
  context.lineWidth = 2;
  context.beginPath();
  context.arc((cx + 0.5) * size, (cy + 0.5) * size, size * 0.6, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
}

// Dibuja el cuerpo redondo + mecha de la bomba, sobre el bloque ya pintado por drawBlock.
function drawBombFace(context, cx, cy, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  const px = (cx + 0.5) * size, py = (cy + 0.5) * size;
  context.fillStyle = '#2b2b2b';
  context.beginPath();
  context.arc(px, py, size * 0.32, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#2b2b2b';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(px + size * 0.18, py - size * 0.28);
  context.lineTo(px + size * 0.32, py - size * 0.42);
  context.stroke();
  context.globalAlpha = 1;
}

// Bomba fijada, parpadeando mientras cuenta hasta detonar.
function drawFuse() {
  if (!fuse) return;
  const p = fuse.t / FUSE_MS;
  const alpha = 0.55 + 0.45 * Math.abs(Math.sin(fuse.t / (55 - p * 30)));
  drawBlock(ctx, fuse.cx, fuse.cy, BOMB, BLOCK, alpha);
  drawBombFace(ctx, fuse.cx, fuse.cy, BLOCK, alpha);
  const px = (fuse.cx + 0.5) * BLOCK, py = (fuse.cy + 0.5) * BLOCK;
  const sparkR = BLOCK * (0.08 + 0.06 * Math.abs(Math.sin(fuse.t / 40)));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff59d';
  ctx.beginPath();
  ctx.arc(px + BLOCK * 0.32, py - BLOCK * 0.42, sparkR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Onda expansiva + celdas destruidas encogiéndose y desvaneciéndose.
function drawBlast() {
  if (!blast) return;
  const p = blast.t / BLAST_MS;

  for (const cell of blast.cells) {
    const size = BLOCK * (1 - p * 0.6);
    const offset = (BLOCK - size) / 2;
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = currentPalette()[cell.type];
    ctx.fillRect(cell.c * BLOCK + offset, cell.r * BLOCK + offset, size, size);
    ctx.globalAlpha = 1;
  }

  const px = (blast.cx + 0.5) * BLOCK, py = (blast.cy + 0.5) * BLOCK;
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = currentPalette()[BOMB];
  ctx.lineWidth = 3 * (1 - p);
  ctx.beginPath();
  ctx.arc(px, py, BLOCK * (0.4 + p * 2.2), 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridLineColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // agujeros de tuercas ya fijadas: celda vacía rodeada por los 8 vecinos de la tuerca
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (board[r][c] !== 0) continue;
      let ringComplete = true;
      for (let dr = -1; dr <= 1 && ringComplete; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (board[r + dr][c + dc] !== NUT) { ringComplete = false; break; }
        }
      if (ringComplete) punchNutHole(ctx, c, r, BLOCK);
    }
  }

  drawFuse();
  drawBlast();

  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.type === NUT) strokeNutHole(ctx, current.x + 1, gy + 1, BLOCK, 0.2);
  if (current.type === BOMB) drawBombFace(ctx, current.x, gy, BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === NUT) punchNutHole(ctx, current.x + 1, current.y + 1, BLOCK);
  if (current.type === BOMB) drawBombFace(ctx, current.x, current.y, BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === NUT) punchNutHole(nextCtx, offX + 1, offY + 1, NB);
  if (next.type === BOMB) drawBombFace(nextCtx, offX, offY, NB);
}

function drawHold() {
  const NB = 30;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  holdCanvas.classList.toggle('locked', !canHold);
  if (holdType == null) return;
  const shape = PIECES[holdType];
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  const alpha = canHold ? 1 : 0.35;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(holdCtx, offX + c, offY + r, shape[r][c], NB, alpha);
  if (holdType === NUT) punchNutHole(holdCtx, offX + 1, offY + 1, NB);
}

function endGame() {
  if (fuse) detonate(fuse.cx, fuse.cy);
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (fuse) { fuse.t += dt; if (fuse.t >= FUSE_MS) detonate(fuse.cx, fuse.cy); }
  if (blast) { blast.t += dt; if (blast.t >= BLAST_MS) blast = null; }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  bombPending = false;
  piecesPlaced = 0;
  fuse = null;
  blast = null;
  holdType = null;
  canHold = true;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      hold();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeToggleBtn.addEventListener('click', toggleTheme);
if (skinSelect) skinSelect.addEventListener('change', e => applySkin(e.target.value));

applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
applySkin(localStorage.getItem(SKIN_KEY) || 'retro');
init();
