import { useEffect, useRef, useState, useCallback } from "react";

// ── constants ─────────────────────────────────────────────────────────────────

const COLS = 7;
const ROWS = 9;
const CELL = 52;
const GAP = 4;
const STRIDE = CELL + GAP; // 56

const GAME_W = 420;
const GAME_H = 640;

const GRID_LEFT = Math.round((GAME_W - (COLS * STRIDE - GAP)) / 2); // 16
const GRID_TOP = 50;
const GRID_BOTTOM = GRID_TOP + ROWS * STRIDE - GAP; // 550
const GRID_RIGHT = GRID_LEFT + COLS * STRIDE - GAP; // 404

const LAUNCH_Y = 595;
const BALL_R = 11;
const BALL_SPEED = 11;

// ── types ─────────────────────────────────────────────────────────────────────

type Brick = { kind: "brick"; hp: number; maxHp: number; color: string; glow: string; shake: number };
type BallPU = { kind: "ballpu" };
type Cell = Brick | BallPU | null;
type Ball = { id: number; x: number; y: number; vx: number; vy: number; done: boolean; trail: { x: number; y: number; a: number }[] };
type Phase = "aiming" | "shooting" | "gameOver";

// ── palettes ──────────────────────────────────────────────────────────────────

const ROW_PALETTES = [
  { color: "#7b1fa2", glow: "#e040fb" },
  { color: "#b71c1c", glow: "#ef5350" },
  { color: "#0d47a1", glow: "#42a5f5" },
  { color: "#1b5e20", glow: "#66bb6a" },
  { color: "#e65100", glow: "#ffa726" },
  { color: "#4a148c", glow: "#ab47bc" },
  { color: "#006064", glow: "#26c6da" },
];

function rowPalette(turn: number) {
  return ROW_PALETTES[turn % ROW_PALETTES.length];
}

// ── grid helpers ──────────────────────────────────────────────────────────────

function cellX(col: number) { return GRID_LEFT + col * STRIDE; }
function cellY(row: number) { return GRID_TOP + row * STRIDE; }

function generateRow(turn: number): Cell[] {
  const pal = rowPalette(turn);
  return Array.from({ length: COLS }, () => {
    const r = Math.random();
    if (r < 0.62) {
      const variance = Math.max(1, Math.floor(turn * 0.3));
      const hp = Math.max(1, turn + Math.floor((Math.random() - 0.3) * variance));
      return { kind: "brick", hp, maxHp: hp, color: pal.color, glow: pal.glow, shake: 0 } as Brick;
    }
    if (r < 0.68) return { kind: "ballpu" } as BallPU;
    return null;
  });
}

function makeInitialGrid(): Cell[][] {
  const grid: Cell[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let r = 0; r < 4; r++) {
    grid[r] = generateRow(r + 1);
  }
  return grid;
}

// ── trajectory preview ────────────────────────────────────────────────────────

type Dot = { x: number; y: number };

function traceAim(sx: number, sy: number, dx: number, dy: number, grid: Cell[][]): Dot[] {
  const dots: Dot[] = [];
  let x = sx, y = sy, vx = dx, vy = dy;
  const step = 3;
  const maxDots = 60;

  for (let i = 0; i < maxDots * 8 && dots.length < maxDots; i++) {
    x += vx * step;
    y += vy * step;

    if (x - BALL_R < GRID_LEFT) { x = GRID_LEFT + BALL_R; vx = Math.abs(vx); }
    if (x + BALL_R > GRID_RIGHT) { x = GRID_RIGHT - BALL_R; vx = -Math.abs(vx); }
    if (y - BALL_R < GRID_TOP) { y = GRID_TOP + BALL_R; vy = Math.abs(vy); }
    if (y > LAUNCH_Y + 20) break;

    // stop trace if we'd hit a brick
    const col = Math.floor((x - GRID_LEFT) / STRIDE);
    const row = Math.floor((y - GRID_TOP) / STRIDE);
    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
      const c = grid[row][col];
      if (c && c.kind === "brick") break;
    }

    if (i % 3 === 0) dots.push({ x, y });
  }
  return dots;
}

// ── ball id ───────────────────────────────────────────────────────────────────

let _bid = 0;
const nextBid = () => ++_bid;

// ── component ─────────────────────────────────────────────────────────────────

export function BallsBricks({ onHome }: { onHome: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // game refs
  const gridRef = useRef<Cell[][]>(makeInitialGrid());
  const phaseRef = useRef<Phase>("aiming");
  const ballsRef = useRef<Ball[]>([]);
  const ballCountRef = useRef(1);
  const launchXRef = useRef(GAME_W / 2);
  const firstLandXRef = useRef<number | null>(null);
  const scoreRef = useRef(0);
  const turnRef = useRef(1);
  const aimAngleRef = useRef<number | null>(null);
  const aimDotsRef = useRef<Dot[]>([]);
  const toFireRef = useRef(0);
  const fireTimerRef = useRef(0);

  const starsRef = useRef<{ x: number; y: number; r: number; b: number }[]>([]);

  const [uiState, setUiState] = useState({
    phase: "aiming" as Phase,
    score: 0,
    turn: 1,
    ballCount: 1,
    hiScore: parseInt(localStorage.getItem("bb2-hi") || "0", 10),
  });

  // init stars
  useEffect(() => {
    starsRef.current = Array.from({ length: 70 }, () => ({
      x: Math.random() * GAME_W,
      y: Math.random() * GAME_H,
      r: 0.4 + Math.random() * 1.4,
      b: Math.random(),
    }));
  }, []);

  // ── pointer/aim ─────────────────────────────────────────────────────────────

  const getGamePos = useCallback((clientX: number, clientY: number) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * GAME_W,
      y: ((clientY - rect.top) / rect.height) * GAME_H,
    };
  }, []);

  const updateAim = useCallback((cx: number, cy: number) => {
    if (phaseRef.current !== "aiming") return;
    const lx = launchXRef.current;
    const ly = LAUNCH_Y;
    const dx = cx - lx, dy = cy - ly;
    if (dy >= -20) return;
    const len = Math.hypot(dx, dy);
    const nx = dx / len, ny = dy / len;
    aimAngleRef.current = Math.atan2(ny, nx);
    aimDotsRef.current = traceAim(lx, ly, nx, ny, gridRef.current);
  }, []);

  const shoot = useCallback(() => {
    if (phaseRef.current !== "aiming" || aimAngleRef.current === null) return;
    phaseRef.current = "shooting";
    toFireRef.current = ballCountRef.current;
    fireTimerRef.current = 0;
    firstLandXRef.current = null;
    ballsRef.current = [];
    setUiState(u => ({ ...u, phase: "shooting" }));
  }, []);

  // pointer events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      const pt = "touches" in e ? e.touches[0] : e as MouseEvent;
      const { x, y } = getGamePos(pt.clientX, pt.clientY);
      updateAim(x, y);
    };
    const onUp = () => {
      if (phaseRef.current === "aiming" && aimAngleRef.current !== null) shoot();
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onUp);
    canvas.addEventListener("touchmove", onMove as EventListener, { passive: true });
    canvas.addEventListener("touchend", onUp);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("touchmove", onMove as EventListener);
      canvas.removeEventListener("touchend", onUp);
    };
  }, [getGamePos, updateAim, shoot]);

  // ── game loop ────────────────────────────────────────────────────────────────

  const rafRef = useRef<number | null>(null);
  const lastTRef = useRef(0);

  const advanceTurn = useCallback(() => {
    const grid = gridRef.current;

    // Check game over: any brick in last row
    const isGameOver = grid[ROWS - 1].some(c => c && c.kind === "brick");
    if (isGameOver) {
      phaseRef.current = "gameOver";
      const hi = parseInt(localStorage.getItem("bb2-hi") || "0", 10);
      const newHi = Math.max(hi, scoreRef.current);
      if (newHi > hi) localStorage.setItem("bb2-hi", String(newHi));
      setUiState(u => ({ ...u, phase: "gameOver", score: scoreRef.current, turn: turnRef.current, hiScore: newHi }));
      return;
    }

    // Shift grid down
    const newGrid: Cell[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    for (let r = 1; r < ROWS; r++) newGrid[r] = [...grid[r - 1]];
    turnRef.current++;
    newGrid[0] = generateRow(turnRef.current);
    gridRef.current = newGrid;

    // Update launch position
    if (firstLandXRef.current !== null) {
      launchXRef.current = Math.max(GRID_LEFT + BALL_R + 2, Math.min(GRID_RIGHT - BALL_R - 2, firstLandXRef.current));
    }

    phaseRef.current = "aiming";
    aimAngleRef.current = null;
    aimDotsRef.current = [];
    ballsRef.current = [];
    setUiState(u => ({ ...u, phase: "aiming", score: scoreRef.current, turn: turnRef.current, ballCount: ballCountRef.current }));
  }, []);

  const updateGame = useCallback((dt: number) => {
    if (phaseRef.current !== "shooting") return;

    fireTimerRef.current += dt;
    const fired = ballCountRef.current - toFireRef.current;
    const shouldFire = Math.min(ballCountRef.current, Math.floor(fireTimerRef.current / 90) + 1);
    if (fired < shouldFire && toFireRef.current > 0) {
      const angle = aimAngleRef.current!;
      ballsRef.current.push({
        id: nextBid(),
        x: launchXRef.current,
        y: LAUNCH_Y,
        vx: Math.cos(angle) * BALL_SPEED,
        vy: Math.sin(angle) * BALL_SPEED,
        done: false,
        trail: [],
      });
      toFireRef.current--;
    }

    const grid = gridRef.current;
    let anyActive = false;

    for (const ball of ballsRef.current) {
      if (ball.done) continue;
      anyActive = true;

      ball.x += ball.vx;
      ball.y += ball.vy;

      ball.trail.push({ x: ball.x, y: ball.y, a: 1 });
      if (ball.trail.length > 14) ball.trail.shift();
      for (const t of ball.trail) t.a -= 0.065;

      // Wall bounces
      if (ball.x - BALL_R < GRID_LEFT) { ball.x = GRID_LEFT + BALL_R; ball.vx = Math.abs(ball.vx); }
      if (ball.x + BALL_R > GRID_RIGHT) { ball.x = GRID_RIGHT - BALL_R; ball.vx = -Math.abs(ball.vx); }
      if (ball.y - BALL_R < GRID_TOP) { ball.y = GRID_TOP + BALL_R; ball.vy = Math.abs(ball.vy); }

      // Grid collision (check all bricks)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = grid[r][c];
          if (!cell) continue;
          const bx = cellX(c), by = cellY(r);
          if (
            ball.x + BALL_R > bx && ball.x - BALL_R < bx + CELL &&
            ball.y + BALL_R > by && ball.y - BALL_R < by + CELL
          ) {
            if (cell.kind === "ballpu") {
              grid[r][c] = null;
              ballCountRef.current++;
            } else {
              // Bounce
              const ol = ball.x + BALL_R - bx;
              const or2 = bx + CELL - (ball.x - BALL_R);
              const ot = ball.y + BALL_R - by;
              const ob = by + CELL - (ball.y - BALL_R);
              if (Math.min(ol, or2) < Math.min(ot, ob)) {
                ball.vx = ol < or2 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
              } else {
                ball.vy = ot < ob ? -Math.abs(ball.vy) : Math.abs(ball.vy);
              }
              cell.hp--;
              cell.shake = 5;
              if (cell.hp <= 0) {
                scoreRef.current += cell.maxHp;
                grid[r][c] = null;
              }
            }
            break;
          }
        }
      }

      // Ball falls below bottom
      if (ball.y > GAME_H + BALL_R) {
        ball.done = true;
        if (firstLandXRef.current === null) firstLandXRef.current = ball.x;
      }
    }

    // Shake decay
    for (const row of grid) {
      for (const cell of row) {
        if (cell && cell.kind === "brick" && cell.shake > 0) cell.shake *= 0.78;
      }
    }

    // All done
    if (toFireRef.current === 0 && !anyActive && ballsRef.current.length > 0) {
      advanceTurn();
    }
  }, [advanceTurn]);

  // ── renderer ─────────────────────────────────────────────────────────────────

  const render = useCallback((ctx: CanvasRenderingContext2D, t: number) => {
    ctx.clearRect(0, 0, GAME_W, GAME_H);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, GAME_H);
    bg.addColorStop(0, "#0d0030");
    bg.addColorStop(1, "#050015");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Stars
    for (const s of starsRef.current) {
      const tw = 0.4 + 0.6 * Math.sin(t * 0.0009 + s.b * 9);
      ctx.save();
      ctx.globalAlpha = s.b * tw * 0.75;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Subtle grid lines in playfield
    ctx.save();
    ctx.strokeStyle = "rgba(100,60,200,0.07)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      const x = GRID_LEFT + c * STRIDE - (c > 0 ? GAP / 2 : 0);
      ctx.beginPath(); ctx.moveTo(x, GRID_TOP); ctx.lineTo(x, GRID_BOTTOM); ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      const y = GRID_TOP + r * STRIDE - (r > 0 ? GAP / 2 : 0);
      ctx.beginPath(); ctx.moveTo(GRID_LEFT, y); ctx.lineTo(GRID_RIGHT, y); ctx.stroke();
    }
    ctx.restore();

    // Bricks
    const grid = gridRef.current;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r][c];
        if (!cell) continue;
        const bx = cellX(c), by = cellY(r);

        if (cell.kind === "ballpu") {
          // Ball power-up token
          ctx.save();
          const cx2 = bx + CELL / 2, cy2 = by + CELL / 2;
          const pulse = 0.85 + 0.15 * Math.sin(t * 0.004 + c + r);
          ctx.shadowColor = "#00ff88";
          ctx.shadowBlur = 14;
          ctx.strokeStyle = "#00ff88";
          ctx.lineWidth = 1.8;
          ctx.globalAlpha = pulse;
          ctx.beginPath();
          ctx.arc(cx2, cy2, CELL * 0.38, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(0,255,136,0.12)";
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#00ff88";
          ctx.globalAlpha = pulse;
          ctx.font = "bold 11px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("+1", cx2, cy2);
          ctx.restore();
          continue;
        }

        const brick = cell as Brick;
        const so = brick.shake > 0.5 ? (Math.random() - 0.5) * brick.shake : 0;
        const x = bx + so + 1, y = by + so + 1;
        const w = CELL - 2, h = CELL - 2;

        ctx.save();
        ctx.shadowColor = brick.glow;
        ctx.shadowBlur = 12;

        // Body gradient
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, brick.glow + "55");
        grad.addColorStop(0.35, brick.color);
        grad.addColorStop(1, "rgba(0,0,0,0.82)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 5);
        ctx.fill();

        // Border
        ctx.shadowBlur = 6;
        ctx.strokeStyle = brick.glow + "bb";
        ctx.lineWidth = 1.3;
        ctx.stroke();

        // Shine
        ctx.save();
        ctx.clip();
        const shine = ctx.createLinearGradient(x, y, x, y + h * 0.4);
        shine.addColorStop(0, "rgba(255,255,255,0.22)");
        shine.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = shine;
        ctx.fillRect(x, y, w, h * 0.42);
        ctx.restore();

        // HP label
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fff";
        const fontSize = brick.hp >= 100 ? 12 : brick.hp >= 10 ? 15 : 18;
        ctx.font = `900 ${fontSize}px 'Inter', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(brick.hp), bx + CELL / 2, by + CELL / 2);

        ctx.restore();
      }
    }

    // Game over line
    ctx.save();
    ctx.strokeStyle = "rgba(255,60,60,0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(GRID_LEFT, GRID_BOTTOM + 2);
    ctx.lineTo(GRID_RIGHT, GRID_BOTTOM + 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Aim dots
    const aimDots = aimDotsRef.current;
    if (phaseRef.current === "aiming" && aimDots.length > 0) {
      ctx.save();
      for (let i = 0; i < aimDots.length; i++) {
        const d = aimDots[i];
        const a = (1 - i / aimDots.length) * 0.75;
        ctx.globalAlpha = a;
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#aaccff";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 2.8 - (i / aimDots.length) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Launch indicator
    const lx = launchXRef.current;
    ctx.save();
    ctx.shadowColor = "#00f5ff";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#00f5ff";
    ctx.beginPath();
    ctx.arc(lx, LAUNCH_Y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    // inner white
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(lx, LAUNCH_Y, BALL_R * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Ball count dots under launch
    const bc = ballCountRef.current;
    if (bc > 1) {
      const show = Math.min(bc, 9);
      const spacing = 16;
      const startXd = lx - ((show - 1) * spacing) / 2;
      for (let i = 0; i < show; i++) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = "#aaccff";
        ctx.shadowColor = "#aaccff";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(startXd + i * spacing, LAUNCH_Y + 26, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (bc > 9) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#aaccff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`×${bc}`, lx, LAUNCH_Y + 38);
        ctx.restore();
      }
    }

    // Balls in flight
    for (const ball of ballsRef.current) {
      if (ball.done) continue;

      for (let i = 0; i < ball.trail.length; i++) {
        const tp = ball.trail[i];
        if (tp.a <= 0) continue;
        const tr = BALL_R * (i / ball.trail.length) * 0.6;
        ctx.save();
        ctx.globalAlpha = tp.a * 0.45;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, tr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.shadowColor = "#c8d8ff";
      ctx.shadowBlur = 22;
      const bg2 = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, BALL_R);
      bg2.addColorStop(0, "#ffffff");
      bg2.addColorStop(0.45, "#cce0ff");
      bg2.addColorStop(1, "#8899dd");
      ctx.fillStyle = bg2;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // "Aim to shoot" hint when no aim
    if (phaseRef.current === "aiming" && aimAngleRef.current === null) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.003);
      ctx.save();
      ctx.globalAlpha = pulse * 0.7;
      ctx.fillStyle = "#fff";
      ctx.font = "500 11px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.letterSpacing = "0.15em";
      ctx.fillText("MOVE MOUSE UPWARD TO AIM · RELEASE TO SHOOT", GAME_W / 2, GAME_H - 12);
      ctx.restore();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const loop = (t: number) => {
      const dt = Math.min(t - lastTRef.current, 50);
      lastTRef.current = t;
      updateGame(dt);
      ctx.save();
      render(ctx, t);
      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [updateGame, render]);

  // ── restart ───────────────────────────────────────────────────────────────────

  const restart = useCallback(() => {
    gridRef.current = makeInitialGrid();
    phaseRef.current = "aiming";
    ballsRef.current = [];
    ballCountRef.current = 1;
    launchXRef.current = GAME_W / 2;
    firstLandXRef.current = null;
    scoreRef.current = 0;
    turnRef.current = 1;
    aimAngleRef.current = null;
    aimDotsRef.current = [];
    setUiState(u => ({ ...u, phase: "aiming", score: 0, turn: 1, ballCount: 1 }));
  }, []);

  const { phase, score, turn, ballCount, hiScore } = uiState;

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#050015", overflow: "hidden" }}
    >
      <div style={{ position: "relative", lineHeight: 0 }}>
        <canvas
          ref={canvasRef}
          width={GAME_W}
          height={GAME_H}
          style={{ display: "block", maxWidth: "100vw", maxHeight: "100vh", cursor: phaseRef.current === "aiming" ? "crosshair" : "default" }}
        />

        {/* ── HUD ── */}
        <div style={{
          position: "absolute", top: 0, left: 0, width: "100%",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 10px", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
          boxSizing: "border-box", pointerEvents: "none",
        }}>
          <button
            onClick={onHome}
            style={{ pointerEvents: "auto", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "rgba(255,255,255,0.5)", fontSize: 10, padding: "3px 9px", cursor: "pointer", letterSpacing: "0.08em" }}
          >
            ← HOME
          </button>
          <div style={{ display: "flex", gap: 18, fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)" }}>
            <span>TURN <strong style={{ color: "#00f5ff", fontSize: 13 }}>{turn}</strong></span>
            <span>BALLS <strong style={{ color: "#00ff88", fontSize: 13 }}>{ballCount}</strong></span>
            <span>SCORE <strong style={{ color: "#ffd700", fontSize: 13 }}>{score.toLocaleString()}</strong></span>
          </div>
        </div>

        {/* ── Game Over overlay ── */}
        {phase === "gameOver" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,20,0.88)", backdropFilter: "blur(10px)" }}>
            <div style={{ textAlign: "center", padding: "40px 52px", borderRadius: 20, background: "rgba(0,5,25,0.97)", border: "1px solid rgba(220,60,60,0.3)", boxShadow: "0 0 60px rgba(220,60,60,0.15), 0 0 0 1px rgba(255,255,255,0.04)" }}>
              <p style={{ fontSize: 10, letterSpacing: "0.4em", color: "rgba(255,80,80,0.6)", marginBottom: 10, fontWeight: 700, textTransform: "uppercase" }}>Game Over</p>
              <h2 style={{ fontSize: 44, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em", marginBottom: 6 }}>Turn {turn}</h2>
              <p style={{ fontSize: 24, fontWeight: 800, color: "#ffd700", marginBottom: 4 }}>
                {score.toLocaleString()}
                <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,215,0,0.5)", marginLeft: 6 }}>pts</span>
              </p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 30, letterSpacing: "0.08em" }}>
                BEST {hiScore.toLocaleString()}
              </p>
              <button
                onClick={restart}
                style={{ display: "block", width: "100%", padding: "14px 0", borderRadius: 10, fontSize: 14, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#fff", background: "linear-gradient(135deg,#e040fb,#6200ea)", border: "none", cursor: "pointer", marginBottom: 10, boxShadow: "0 0 30px rgba(200,60,255,0.3)" }}
              >
                Play Again
              </button>
              <button
                onClick={onHome}
                style={{ display: "block", width: "100%", padding: "12px 0", borderRadius: 10, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.35)", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}
              >
                ← Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
