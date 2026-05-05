import { useEffect, useRef, useCallback, useState } from "react";
import type {
  Ball, Block, Particle, PowerUp, Laser, ShockWave, GameState, Vec2, PowerUpType
} from "./types";
import {
  GAME_W, GAME_H, PADDLE_W, PADDLE_H, PADDLE_Y, BALL_RADIUS,
  BALL_BASE_SPEED, BLOCK_COLS, BLOCK_W, BLOCK_H, BLOCK_PAD,
  BLOCK_OFFSET_X, BLOCK_OFFSET_Y, POWERUP_RADIUS, POWERUP_SPEED,
  LASER_SPEED, LASER_COOLDOWN, POWERUP_COLORS,
} from "./constants";
import { LEVELS, BLOCK_COLOR_MAP, BLOCK_HP } from "./levels";
import { Audio } from "./audio";

const POWERUP_TYPES: PowerUpType[] = [
  "widePaddle", "multiBall", "fireball", "slowMo", "extraLife", "laser", "magnetPaddle"
];

let _pid = 0;
const uid = () => ++_pid;

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function buildLevel(levelIdx: number): Block[] {
  const lvl = LEVELS[levelIdx];
  const blocks: Block[] = [];
  const rows = lvl.rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < lvl.cols; c++) {
      const val = lvl.grid[r * lvl.cols + c];
      if (val === null || val === undefined) continue;
      const ci = BLOCK_COLOR_MAP[val];
      const isIndestructible = val === 9;
      const isExplosive = val === 10;
      const isPowerUp = val === 11;
      let type: Block["type"] = "normal";
      if (isIndestructible) type = "indestructible";
      else if (isExplosive) type = "explosive";
      else if (isPowerUp) type = "powerup";
      else if (BLOCK_HP[val] === 2) type = "strong";
      else if (BLOCK_HP[val] >= 3) type = "tough";

      const powerUp = isPowerUp
        ? POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)]
        : undefined;

      blocks.push({
        x: BLOCK_OFFSET_X + c * (BLOCK_W + BLOCK_PAD),
        y: BLOCK_OFFSET_Y + r * (BLOCK_H + BLOCK_PAD),
        w: BLOCK_W, h: BLOCK_H,
        hp: BLOCK_HP[val], maxHp: BLOCK_HP[val],
        type, color: ci.color, glow: ci.glow,
        powerUp,
        shakeOffset: 0, shakeDecay: 0.85,
        alive: true, sparkle: 0,
      });
    }
  }
  return blocks;
}

function makeBall(x: number, y: number, angle?: number): Ball {
  const a = angle ?? (-Math.PI / 2 + (Math.random() - 0.5) * 0.8);
  return {
    id: uid(), x, y,
    vx: Math.cos(a) * BALL_BASE_SPEED,
    vy: Math.sin(a) * BALL_BASE_SPEED,
    radius: BALL_RADIUS, isFireball: false, trail: [],
  };
}

function spawnParticles(
  parts: Particle[], x: number, y: number, color: string, count = 14
) {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const spd = 1.5 + Math.random() * 3.5;
    parts.push({
      id: uid(), x, y,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      radius: 2 + Math.random() * 4,
      color, alpha: 1,
      decay: 0.025 + Math.random() * 0.02,
      gravity: 0.06, rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.2,
      shape: (["circle", "square", "star"] as const)[Math.floor(Math.random() * 3)],
    });
  }
}

// ── renderer ────────────────────────────────────────────────────────────────

function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  fn: () => void,
  color: string,
  blur = 18,
) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  fn();
  ctx.restore();
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r = 6
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const spikes = 5;
  const outerR = r;
  const innerR = r * 0.4;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i * Math.PI) / spikes - Math.PI / 2;
    const rad = i % 2 === 0 ? outerR : innerR;
    i === 0 ? ctx.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
             : ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
}

// ── main component ─────────────────────────────────────────────────────────

export function BlockBreaker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);

  // game state refs (mutated in game loop)
  const gsRef = useRef<GameState>("menu");
  const levelRef = useRef(0);
  const livesRef = useRef(3);
  const scoreRef = useRef(0);
  const hiScoreRef = useRef(parseInt(localStorage.getItem("bb-hi") || "0", 10));
  const comboRef = useRef(0);
  const comboTimerRef = useRef(0);
  const blocksRef = useRef<Block[]>([]);
  const ballsRef = useRef<Ball[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const lasersRef = useRef<Laser[]>([]);
  const shockwavesRef = useRef<ShockWave[]>([]);

  // paddle
  const paddleRef = useRef({ x: GAME_W / 2, w: PADDLE_W });
  const paddleTargetRef = useRef(GAME_W / 2);

  // active power-up durations (ms)
  const activePURef = useRef({
    widePaddle: 0,
    fireball: 0,
    slowMo: 0,
    laser: 0,
    magnetPaddle: 0,
  });
  const laserLastRef = useRef(0);

  // ball launched flag
  const launchedRef = useRef(false);

  // screen shake
  const shakeRef = useRef({ x: 0, y: 0, power: 0 });

  // background stars
  const starsRef = useRef<{ x: number; y: number; r: number; brightness: number; speed: number }[]>([]);

  // React state (for UI overlays only)
  const [uiState, setUiState] = useState<{
    gs: GameState; level: number; score: number; lives: number; hiScore: number; combo: number;
  }>({ gs: "menu", level: 1, score: 0, lives: 3, hiScore: 0, combo: 0 });

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);

  // ── init stars ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const stars = [];
    for (let i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * GAME_W,
        y: Math.random() * GAME_H,
        r: Math.random() * 1.5 + 0.3,
        brightness: Math.random(),
        speed: 0.05 + Math.random() * 0.15,
      });
    }
    starsRef.current = stars;
  }, []);

  // ── canvas scaling ─────────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const el = containerRef.current;
      if (!el) return;
      const sw = el.clientWidth / GAME_W;
      const sh = el.clientHeight / GAME_H;
      scaleRef.current = Math.min(sw, sh);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── pointer/touch controls ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getX = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const s = scaleRef.current;
      return (clientX - rect.left) / s;
    };

    const onMove = (x: number) => {
      paddleTargetRef.current = clamp(x, paddleRef.current.w / 2, GAME_W - paddleRef.current.w / 2);
      if (gsRef.current === "playing" && !launchedRef.current) {
        ballsRef.current.forEach(b => {
          b.x = paddleTargetRef.current;
        });
      }
    };

    const onClick = () => {
      if (gsRef.current === "playing" && !launchedRef.current) {
        launchedRef.current = true;
        Audio.ballLaunch();
      }
    };

    const mm = (e: MouseEvent) => onMove(getX(e.clientX));
    const mc = () => onClick();
    const tm = (e: TouchEvent) => { e.preventDefault(); onMove(getX(e.touches[0].clientX)); };
    const tc = (e: TouchEvent) => { e.preventDefault(); onClick(); };

    canvas.addEventListener("mousemove", mm);
    canvas.addEventListener("click", mc);
    canvas.addEventListener("touchmove", tm, { passive: false });
    canvas.addEventListener("touchstart", tc, { passive: false });
    return () => {
      canvas.removeEventListener("mousemove", mm);
      canvas.removeEventListener("click", mc);
      canvas.removeEventListener("touchmove", tm);
      canvas.removeEventListener("touchstart", tc);
    };
  }, []);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (gsRef.current === "playing" && !launchedRef.current) {
          launchedRef.current = true;
          Audio.ballLaunch();
        } else if (gsRef.current === "paused") {
          gsRef.current = "playing";
          setUiState(u => ({ ...u, gs: "playing" }));
        } else if (gsRef.current === "playing") {
          gsRef.current = "paused";
          setUiState(u => ({ ...u, gs: "paused" }));
        }
        // Auto-fire laser
        if (activePURef.current.laser > 0) fireLaser();
      }
      if (e.code === "KeyP" || e.code === "Escape") {
        if (gsRef.current === "playing") { gsRef.current = "paused"; setUiState(u => ({ ...u, gs: "paused" })); }
        else if (gsRef.current === "paused") { gsRef.current = "playing"; setUiState(u => ({ ...u, gs: "playing" })); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fireLaser = useCallback(() => {
    const now = performance.now();
    if (now - laserLastRef.current < LASER_COOLDOWN) return;
    laserLastRef.current = now;
    const px = paddleRef.current.x;
    lasersRef.current.push({ id: uid(), x: px - 12, y: PADDLE_Y, vy: -LASER_SPEED, alive: true });
    lasersRef.current.push({ id: uid(), x: px + 12, y: PADDLE_Y, vy: -LASER_SPEED, alive: true });
    Audio.laser();
  }, []);

  // ── start level ─────────────────────────────────────────────────────────────
  const startLevel = useCallback((lvlIdx: number) => {
    blocksRef.current = buildLevel(lvlIdx);
    ballsRef.current = [makeBall(GAME_W / 2, PADDLE_Y - BALL_RADIUS - 2)];
    particlesRef.current = [];
    powerUpsRef.current = [];
    lasersRef.current = [];
    shockwavesRef.current = [];
    paddleRef.current = { x: GAME_W / 2, w: PADDLE_W };
    paddleTargetRef.current = GAME_W / 2;
    activePURef.current = { widePaddle: 0, fireball: 0, slowMo: 0, laser: 0, magnetPaddle: 0 };
    comboRef.current = 0;
    launchedRef.current = false;
    gsRef.current = "playing";
    setUiState(u => ({ ...u, gs: "playing", level: lvlIdx + 1 }));
  }, []);

  const startGame = useCallback(() => {
    levelRef.current = 0;
    livesRef.current = 3;
    scoreRef.current = 0;
    startLevel(0);
    setUiState(u => ({ ...u, score: 0, lives: 3, hiScore: hiScoreRef.current }));
  }, [startLevel]);

  // ── game logic ─────────────────────────────────────────────────────────────
  const updateGame = useCallback((dt: number) => {
    if (gsRef.current !== "playing") return;

    const lvl = LEVELS[levelRef.current];
    const speedMult = lvl.ballSpeedMultiplier * (activePURef.current.slowMo > 0 ? 0.5 : 1);
    const pu = activePURef.current;

    // decrement power-up timers
    for (const k of Object.keys(pu) as (keyof typeof pu)[]) {
      if (pu[k] > 0) {
        pu[k] = Math.max(0, pu[k] - dt);
        if (pu[k] === 0) {
          if (k === "widePaddle" || k === "shrinkPaddle") paddleRef.current.w = PADDLE_W;
        }
      }
    }

    // combo decay
    comboTimerRef.current -= dt;
    if (comboTimerRef.current <= 0) comboRef.current = 0;

    // paddle smooth follow
    const paddle = paddleRef.current;
    paddle.x = lerp(paddle.x, paddleTargetRef.current, 0.22);
    paddle.x = clamp(paddle.x, paddle.w / 2, GAME_W - paddle.w / 2);

    // magnet - pull balls toward paddle
    if (pu.magnetPaddle > 0 && launchedRef.current) {
      for (const b of ballsRef.current) {
        if (b.y < PADDLE_Y - 40) continue;
        const dx = paddle.x - b.x;
        b.vx += dx * 0.004;
      }
    }

    // stars parallax
    for (const s of starsRef.current) {
      s.y += s.speed;
      if (s.y > GAME_H) { s.y = 0; s.x = Math.random() * GAME_W; }
    }

    // shake decay
    const shake = shakeRef.current;
    shake.power *= 0.87;
    shake.x = (Math.random() - 0.5) * shake.power;
    shake.y = (Math.random() - 0.5) * shake.power;

    // ── balls ──────────────────────────────────────────────────────────────
    const blocks = blocksRef.current;

    for (const ball of ballsRef.current) {
      if (!launchedRef.current) {
        ball.x = paddle.x;
        ball.y = PADDLE_Y - ball.radius - 2;
        continue;
      }

      // scale speed
      const spd = Math.hypot(ball.vx, ball.vy);
      const targetSpd = BALL_BASE_SPEED * speedMult;
      if (Math.abs(spd - targetSpd) > 0.5) {
        ball.vx = (ball.vx / spd) * targetSpd;
        ball.vy = (ball.vy / spd) * targetSpd;
      }

      ball.x += ball.vx;
      ball.y += ball.vy;

      // trail
      ball.trail.push({ x: ball.x, y: ball.y, alpha: 1 });
      if (ball.trail.length > 16) ball.trail.shift();
      for (const t of ball.trail) t.alpha -= 0.06;

      // wall collisions
      if (ball.x - ball.radius < 0) { ball.x = ball.radius; ball.vx = Math.abs(ball.vx); Audio.paddleHit(); }
      if (ball.x + ball.radius > GAME_W) { ball.x = GAME_W - ball.radius; ball.vx = -Math.abs(ball.vx); Audio.paddleHit(); }
      if (ball.y - ball.radius < 0) { ball.y = ball.radius; ball.vy = Math.abs(ball.vy); Audio.paddleHit(); }

      // paddle collision
      const py = PADDLE_Y - PADDLE_H / 2;
      if (
        ball.vy > 0 &&
        ball.y + ball.radius >= py &&
        ball.y + ball.radius <= py + PADDLE_H + 6 &&
        ball.x >= paddle.x - paddle.w / 2 - ball.radius &&
        ball.x <= paddle.x + paddle.w / 2 + ball.radius
      ) {
        ball.y = py - ball.radius;
        const hitPos = (ball.x - paddle.x) / (paddle.w / 2); // -1..1
        const angle = hitPos * (Math.PI / 3); // -60..60 deg
        const spd2 = Math.hypot(ball.vx, ball.vy);
        ball.vx = Math.sin(angle) * spd2;
        ball.vy = -Math.abs(Math.cos(angle) * spd2);
        // fire laser on click
        if (pu.laser > 0) fireLaser();
        Audio.paddleHit();
        // spawn small sparks
        spawnParticles(particlesRef.current, ball.x, py, "#00f5ff", 5);
      }

      // block collisions
      for (let bi = 0; bi < blocks.length; bi++) {
        const blk = blocks[bi];
        if (!blk.alive) continue;
        const bx = blk.x, by = blk.y, bw = blk.w, bh = blk.h;

        if (
          ball.x + ball.radius > bx &&
          ball.x - ball.radius < bx + bw &&
          ball.y + ball.radius > by &&
          ball.y - ball.radius < by + bh
        ) {
          if (blk.type === "indestructible") {
            // just bounce
            const overlapL = ball.x + ball.radius - bx;
            const overlapR = bx + bw - (ball.x - ball.radius);
            const overlapT = ball.y + ball.radius - by;
            const overlapB = by + bh - (ball.y - ball.radius);
            const minH = Math.min(overlapL, overlapR);
            const minV = Math.min(overlapT, overlapB);
            if (minH < minV) ball.vx *= -1;
            else ball.vy *= -1;
            blk.shakeOffset = 6;
            Audio.blockHit(99);
            continue;
          }

          // fireball ignores block HP
          const dmg = ball.isFireball ? blk.hp : 1;
          blk.hp = Math.max(0, blk.hp - dmg);
          blk.shakeOffset = 5;
          blk.sparkle = 8;

          if (blk.hp <= 0) {
            blk.alive = false;
            const cx = bx + bw / 2;
            const cy = by + bh / 2;
            const pts = 14 + Math.floor(Math.random() * 8);
            spawnParticles(particlesRef.current, cx, cy, blk.glow, pts);

            // shockwave
            shockwavesRef.current.push({ x: cx, y: cy, r: 0, maxR: 80, alpha: 0.8 });

            // score
            const base = blk.maxHp * 10;
            comboRef.current++;
            comboTimerRef.current = 2500;
            const comboBonus = Math.max(0, comboRef.current - 1) * 5;
            scoreRef.current += base + comboBonus;
            if (comboRef.current >= 2) Audio.combo(comboRef.current);

            // explosive
            if (blk.type === "explosive") {
              Audio.explosion();
              shake.power = 14;
              // blow up neighbors
              for (const nb of blocks) {
                if (!nb.alive || nb === blk || nb.type === "indestructible") continue;
                const dx = (nb.x + nb.w / 2) - cx;
                const dy = (nb.y + nb.h / 2) - cy;
                if (Math.hypot(dx, dy) < BLOCK_W * 1.5 + BLOCK_PAD) {
                  nb.hp = Math.max(0, nb.hp - 1);
                  if (nb.hp <= 0) {
                    nb.alive = false;
                    spawnParticles(particlesRef.current, nb.x + nb.w / 2, nb.y + nb.h / 2, nb.glow, 8);
                    scoreRef.current += nb.maxHp * 10;
                    comboRef.current++;
                  }
                }
              }
            }

            // power-up drop
            if (blk.type === "powerup" && blk.powerUp) {
              powerUpsRef.current.push({
                id: uid(), x: cx, y: cy, vy: POWERUP_SPEED,
                type: blk.powerUp, radius: POWERUP_RADIUS,
                rotation: 0, pulse: 0, alive: true,
              });
            } else if (Math.random() < 0.08) {
              // random small chance
              const t = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
              powerUpsRef.current.push({
                id: uid(), x: cx, y: cy, vy: POWERUP_SPEED,
                type: t, radius: POWERUP_RADIUS,
                rotation: 0, pulse: 0, alive: true,
              });
            }

            Audio.blockDestroy(comboRef.current);
          } else {
            Audio.blockHit(blk.hp);
          }

          // bounce (unless fireball)
          if (!ball.isFireball) {
            const overlapL = ball.x + ball.radius - bx;
            const overlapR = bx + bw - (ball.x - ball.radius);
            const overlapT = ball.y + ball.radius - by;
            const overlapB = by + bh - (ball.y - ball.radius);
            const minH = Math.min(overlapL, overlapR);
            const minV = Math.min(overlapT, overlapB);
            if (minH < minV) { ball.vx *= -1; ball.x += ball.vx * 2; }
            else { ball.vy *= -1; ball.y += ball.vy * 2; }
          }
          break;
        }
      }
    }

    // remove balls that fell below screen
    const before = ballsRef.current.length;
    ballsRef.current = ballsRef.current.filter(b => b.y - b.radius < GAME_H + 20);
    if (ballsRef.current.length === 0) {
      // lost a life
      livesRef.current--;
      shake.power = 18;
      Audio.lifeLost();
      if (livesRef.current <= 0) {
        gsRef.current = "gameOver";
        if (scoreRef.current > hiScoreRef.current) {
          hiScoreRef.current = scoreRef.current;
          localStorage.setItem("bb-hi", String(hiScoreRef.current));
        }
        setUiState(u => ({ ...u, gs: "gameOver", score: scoreRef.current, hiScore: hiScoreRef.current }));
      } else {
        // reset ball on paddle
        ballsRef.current = [makeBall(paddle.x, PADDLE_Y - BALL_RADIUS - 2)];
        launchedRef.current = false;
        setUiState(u => ({ ...u, lives: livesRef.current }));
      }
    }
    if (before > 0 && before !== ballsRef.current.length) {
      // no-op, just tracking
    }

    // check level complete
    const hasBreakable = blocks.some(b => b.alive && b.type !== "indestructible");
    if (!hasBreakable) {
      const nextLvl = levelRef.current + 1;
      if (nextLvl >= LEVELS.length) {
        gsRef.current = "victory";
        if (scoreRef.current > hiScoreRef.current) {
          hiScoreRef.current = scoreRef.current;
          localStorage.setItem("bb-hi", String(hiScoreRef.current));
        }
        Audio.victory();
        setUiState(u => ({ ...u, gs: "victory", score: scoreRef.current, hiScore: hiScoreRef.current }));
      } else {
        gsRef.current = "levelComplete";
        Audio.levelComplete();
        setUiState(u => ({ ...u, gs: "levelComplete", score: scoreRef.current }));
        setTimeout(() => {
          levelRef.current = nextLvl;
          startLevel(nextLvl);
        }, 2200);
      }
      return;
    }

    // ── power-ups ──────────────────────────────────────────────────────────
    for (const pu2 of powerUpsRef.current) {
      if (!pu2.alive) continue;
      pu2.y += pu2.vy;
      pu2.rotation += 0.04;
      pu2.pulse += 0.1;

      // check paddle catch
      if (
        pu2.y + pu2.radius >= PADDLE_Y - PADDLE_H / 2 &&
        pu2.y - pu2.radius <= PADDLE_Y + PADDLE_H / 2 &&
        pu2.x >= paddle.x - paddle.w / 2 - pu2.radius &&
        pu2.x <= paddle.x + paddle.w / 2 + pu2.radius
      ) {
        pu2.alive = false;
        Audio.powerUp();
        applyPowerUp(pu2.type);
        spawnParticles(particlesRef.current, pu2.x, pu2.y, POWERUP_COLORS[pu2.type].bg, 10);
      }

      if (pu2.y - pu2.radius > GAME_H) pu2.alive = false;
    }
    powerUpsRef.current = powerUpsRef.current.filter(p => p.alive);

    // ── lasers ─────────────────────────────────────────────────────────────
    for (const las of lasersRef.current) {
      las.y += las.vy;
      if (las.y < -10) { las.alive = false; continue; }
      for (const blk of blocks) {
        if (!blk.alive) continue;
        if (
          las.x > blk.x && las.x < blk.x + blk.w &&
          las.y > blk.y && las.y < blk.y + blk.h
        ) {
          las.alive = false;
          blk.hp = Math.max(0, blk.hp - 1);
          if (blk.hp <= 0 && blk.type !== "indestructible") {
            blk.alive = false;
            spawnParticles(particlesRef.current, blk.x + blk.w / 2, blk.y + blk.h / 2, blk.glow, 8);
            scoreRef.current += blk.maxHp * 10;
            comboRef.current++;
          }
          break;
        }
      }
    }
    lasersRef.current = lasersRef.current.filter(l => l.alive);

    // ── particles ─────────────────────────────────────────────────────────
    for (const p of particlesRef.current) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.98;
      p.alpha -= p.decay;
      p.rotation += p.rotSpeed;
    }
    particlesRef.current = particlesRef.current.filter(p => p.alpha > 0);

    // ── shockwaves ─────────────────────────────────────────────────────────
    for (const sw of shockwavesRef.current) {
      sw.r += 3.5;
      sw.alpha -= 0.035;
    }
    shockwavesRef.current = shockwavesRef.current.filter(sw => sw.alpha > 0);

    // block shake
    for (const blk of blocks) {
      if (blk.shakeOffset > 0) blk.shakeOffset *= blk.shakeDecay;
      if (blk.sparkle > 0) blk.sparkle--;
    }

    // update UI score every frame via ref (we update score display via canvas only for perf)
    setUiState(u => ({
      ...u,
      score: scoreRef.current,
      combo: comboRef.current,
    }));
  }, [startLevel, fireLaser]);

  // ── renderer ───────────────────────────────────────────────────────────────
  const render = useCallback((ctx: CanvasRenderingContext2D, t: number) => {
    const lvl = LEVELS[Math.min(levelRef.current, LEVELS.length - 1)];
    ctx.clearRect(0, 0, GAME_W, GAME_H);

    // background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, GAME_H);
    bg.addColorStop(0, "#000510");
    bg.addColorStop(1, "#020020");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // grid lines
    ctx.save();
    ctx.strokeStyle = "rgba(0,180,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < GAME_W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GAME_H); ctx.stroke(); }
    for (let y = 0; y < GAME_H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GAME_W, y); ctx.stroke(); }
    ctx.restore();

    // stars
    ctx.save();
    for (const s of starsRef.current) {
      const twinkle = 0.5 + 0.5 * Math.sin(t * 0.001 + s.brightness * 10);
      ctx.globalAlpha = s.brightness * twinkle;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // shockwaves
    for (const sw of shockwavesRef.current) {
      ctx.save();
      ctx.globalAlpha = sw.alpha;
      ctx.strokeStyle = "#00f5ff";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#00f5ff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // blocks
    for (const blk of blocksRef.current) {
      if (!blk.alive) continue;
      const so = blk.shakeOffset;
      const ox = so > 0 ? (Math.random() - 0.5) * so : 0;
      const oy = so > 0 ? (Math.random() - 0.5) * so : 0;
      const x = blk.x + ox, y = blk.y + oy;

      ctx.save();

      // fill
      ctx.shadowColor = blk.glow;
      ctx.shadowBlur = blk.type === "indestructible" ? 6 : 16;
      const grad = ctx.createLinearGradient(x, y, x, y + blk.h);
      grad.addColorStop(0, hexWithAlpha(blk.glow, 0.18));
      grad.addColorStop(1, blk.color);
      ctx.fillStyle = grad;
      drawRoundRect(ctx, x, y, blk.w, blk.h, 5);
      ctx.fill();

      // border glow
      ctx.strokeStyle = hexWithAlpha(blk.glow, blk.sparkle > 0 ? 1 : 0.6);
      ctx.lineWidth = blk.sparkle > 0 ? 2 : 1.2;
      ctx.stroke();

      // HP bar for tough blocks
      if (blk.maxHp > 1 && blk.type !== "indestructible") {
        const pct = blk.hp / blk.maxHp;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(x + 4, y + blk.h - 6, blk.w - 8, 4);
        ctx.fillStyle = blk.glow;
        ctx.fillRect(x + 4, y + blk.h - 6, (blk.w - 8) * pct, 4);
      }

      // indestructible pattern
      if (blk.type === "indestructible") {
        ctx.strokeStyle = "rgba(100,120,160,0.3)";
        ctx.lineWidth = 1;
        for (let i = 0; i < blk.w; i += 10) {
          ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i - blk.h, y + blk.h); ctx.stroke();
        }
      }

      // power-up icon
      if (blk.type === "powerup" && blk.powerUp) {
        const info = POWERUP_COLORS[blk.powerUp];
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = blk.glow;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(info.icon, x + blk.w / 2, y + blk.h / 2);
      }

      // explosive symbol
      if (blk.type === "explosive") {
        ctx.font = "bold 14px monospace";
        ctx.fillStyle = "#ff6600";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✕", x + blk.w / 2, y + blk.h / 2);
      }

      ctx.restore();
    }

    // power-up drops
    for (const pu of powerUpsRef.current) {
      const info = POWERUP_COLORS[pu.type];
      const pulse = 0.85 + 0.15 * Math.sin(pu.pulse);
      const r = pu.radius * pulse;
      ctx.save();
      ctx.translate(pu.x, pu.y);
      ctx.rotate(pu.rotation);
      ctx.shadowColor = info.bg;
      ctx.shadowBlur = 20;
      ctx.fillStyle = info.bg;
      ctx.beginPath();
      ctx.roundRect(-r, -r, r * 2, r * 2, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = `bold ${r * 0.9}px sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(info.icon, 0, 0);
      ctx.restore();
    }

    // lasers
    for (const las of lasersRef.current) {
      ctx.save();
      ctx.shadowColor = "#ffff00";
      ctx.shadowBlur = 14;
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(las.x, las.y);
      ctx.lineTo(las.x, las.y + 18);
      ctx.stroke();
      ctx.restore();
    }

    // particles
    for (const p of particlesRef.current) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "square") {
        ctx.fillRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
      } else {
        drawStar(ctx, 0, 0, p.radius);
        ctx.fill();
      }
      ctx.restore();
    }

    // paddle
    const paddle = paddleRef.current;
    const px = paddle.x - paddle.w / 2;
    const py2 = PADDLE_Y - PADDLE_H / 2;
    const pu2 = activePURef.current;
    const paddleColor = pu2.fireball > 0 ? "#ff4400"
      : pu2.laser > 0 ? "#ffff00"
      : pu2.widePaddle > 0 ? "#00ff88"
      : pu2.magnetPaddle > 0 ? "#00ccff"
      : "#00aaff";

    ctx.save();
    ctx.shadowColor = paddleColor;
    ctx.shadowBlur = 24;
    const pGrad = ctx.createLinearGradient(px, py2, px, py2 + PADDLE_H);
    pGrad.addColorStop(0, hexWithAlpha(paddleColor, 0.9));
    pGrad.addColorStop(1, hexWithAlpha(paddleColor, 0.4));
    ctx.fillStyle = pGrad;
    drawRoundRect(ctx, px, py2, paddle.w, PADDLE_H, 6);
    ctx.fill();
    ctx.strokeStyle = paddleColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // inner highlight
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(px + 4, py2 + 2, paddle.w - 8, 3);
    ctx.restore();

    // balls
    for (const ball of ballsRef.current) {
      // trail
      for (let i = 0; i < ball.trail.length; i++) {
        const tp = ball.trail[i];
        const size = ball.radius * (i / ball.trail.length) * 0.7;
        ctx.save();
        ctx.globalAlpha = tp.alpha * 0.5;
        ctx.fillStyle = ball.isFireball ? "#ff6600" : "#00f5ff";
        ctx.shadowColor = ball.isFireball ? "#ff3300" : "#00f5ff";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ball
      const bColor = ball.isFireball ? "#ff6600" : "#00f5ff";
      const bGlow = ball.isFireball ? "#ff3300" : "#00d4ff";
      ctx.save();
      ctx.shadowColor = bGlow;
      ctx.shadowBlur = 28;
      const bGrad = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.radius);
      bGrad.addColorStop(0, "#ffffff");
      bGrad.addColorStop(0.4, bColor);
      bGrad.addColorStop(1, bGlow);
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // "tap to launch" hint
    if (!launchedRef.current && gsRef.current === "playing") {
      ctx.save();
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 0.003);
      ctx.font = "bold 15px 'Courier New', monospace";
      ctx.fillStyle = "#00f5ff";
      ctx.textAlign = "center";
      ctx.shadowColor = "#00f5ff";
      ctx.shadowBlur = 12;
      ctx.fillText("CLICK  OR  PRESS SPACE  TO LAUNCH", GAME_W / 2, PADDLE_Y + 34);
      ctx.restore();
    }

    // combo display
    if (comboRef.current >= 2) {
      ctx.save();
      const scale2 = 1 + 0.1 * Math.sin(t * 0.01);
      ctx.translate(GAME_W - 10, 12);
      ctx.scale(scale2, scale2);
      ctx.translate(-(GAME_W - 10), -12);
      ctx.font = `bold 18px 'Courier New', monospace`;
      ctx.fillStyle = "#ffff00";
      ctx.textAlign = "right";
      ctx.shadowColor = "#ffff00";
      ctx.shadowBlur = 20;
      ctx.fillText(`✕${comboRef.current} COMBO`, GAME_W - 10, 30);
      ctx.restore();
    }

  }, []);

  // ── game loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const loop = (time: number) => {
      const dt = Math.min(time - lastTimeRef.current, 50);
      lastTimeRef.current = time;

      updateGame(dt);

      // apply screen shake
      ctx.save();
      ctx.translate(shakeRef.current.x, shakeRef.current.y);
      render(ctx, time);
      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [updateGame, render]);

  // ── power-up application ────────────────────────────────────────────────────
  function applyPowerUp(type: PowerUpType) {
    const pu = activePURef.current;
    switch (type) {
      case "widePaddle":
        paddleRef.current.w = Math.min(PADDLE_W * 1.8, 200);
        pu.widePaddle = 15000;
        break;
      case "shrinkPaddle":
        paddleRef.current.w = PADDLE_W * 0.6;
        break;
      case "multiBall": {
        const existing = ballsRef.current[0];
        if (existing) {
          const a1 = Math.atan2(existing.vy, existing.vx) + 0.4;
          const a2 = Math.atan2(existing.vy, existing.vx) - 0.4;
          const spd = Math.hypot(existing.vx, existing.vy);
          ballsRef.current.push(
            { ...makeBall(existing.x, existing.y), vx: Math.cos(a1) * spd, vy: Math.sin(a1) * spd, id: uid() },
            { ...makeBall(existing.x, existing.y), vx: Math.cos(a2) * spd, vy: Math.sin(a2) * spd, id: uid() },
          );
        }
        break;
      }
      case "fireball":
        for (const b of ballsRef.current) b.isFireball = true;
        pu.fireball = 8000;
        setTimeout(() => { for (const b of ballsRef.current) b.isFireball = false; }, 8000);
        break;
      case "slowMo":
        pu.slowMo = 7000;
        break;
      case "extraLife":
        livesRef.current = Math.min(livesRef.current + 1, 6);
        setUiState(u => ({ ...u, lives: livesRef.current }));
        break;
      case "laser":
        pu.laser = 12000;
        break;
      case "magnetPaddle":
        pu.magnetPaddle = 10000;
        break;
    }
    setUiState(u => ({ ...u }));
  }

  // ── overlay UI ─────────────────────────────────────────────────────────────
  const renderOverlay = () => {
    const { gs, score, hiScore, level } = uiState;

    if (gs === "menu") {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-auto select-none">
          <div className="text-center px-8">
            <div className="relative mb-4">
              <h1 className="text-7xl font-black tracking-widest text-transparent bg-clip-text"
                style={{ backgroundImage: "linear-gradient(90deg,#00f5ff,#ff00ff,#ffff00,#00ff88)", letterSpacing: "0.15em" }}>
                BLOCK<br />BREAKER
              </h1>
              <div className="absolute inset-0 blur-2xl opacity-40"
                style={{ backgroundImage: "linear-gradient(90deg,#00f5ff,#ff00ff)", WebkitBackgroundClip: "text" }}>
              </div>
            </div>
            <p className="text-cyan-300 text-sm tracking-widest mb-2 font-mono uppercase opacity-80">
              NEON EDITION
            </p>
            <p className="text-slate-400 font-mono text-xs mb-8">
              HIGH SCORE: <span className="text-yellow-300 font-bold">{hiScore.toLocaleString()}</span>
            </p>
            <button
              onClick={startGame}
              className="px-10 py-4 rounded-lg font-black text-xl tracking-widest uppercase text-black transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ background: "linear-gradient(90deg,#00f5ff,#0088ff)", boxShadow: "0 0 30px #00f5ff88" }}
            >
              PLAY
            </button>
            <div className="mt-8 grid grid-cols-2 gap-2 text-left text-xs font-mono text-slate-400 max-w-xs mx-auto">
              <div className="text-cyan-400">→ MOUSE</div><div>Move paddle</div>
              <div className="text-cyan-400">→ CLICK / SPACE</div><div>Launch ball</div>
              <div className="text-cyan-400">→ P / ESC</div><div>Pause</div>
              <div className="text-cyan-400">→ SPACE</div><div>Fire laser (if active)</div>
            </div>
          </div>
        </div>
      );
    }

    if (gs === "paused") {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-auto"
          style={{ background: "rgba(0,0,20,0.75)", backdropFilter: "blur(4px)" }}>
          <h2 className="text-5xl font-black text-cyan-300 tracking-widest mb-6" style={{ textShadow: "0 0 30px #00f5ff" }}>PAUSED</h2>
          <button onClick={() => { gsRef.current = "playing"; setUiState(u => ({ ...u, gs: "playing" })); }}
            className="px-8 py-3 rounded-lg font-bold text-lg tracking-widest text-black transition-all hover:scale-105"
            style={{ background: "linear-gradient(90deg,#00f5ff,#0088ff)", boxShadow: "0 0 20px #00f5ff66" }}>
            RESUME
          </button>
          <button onClick={startGame} className="mt-3 px-8 py-3 rounded-lg font-bold text-lg tracking-widest text-slate-300 border border-slate-600 hover:border-cyan-400 hover:text-cyan-300 transition-all">
            RESTART
          </button>
        </div>
      );
    }

    if (gs === "levelComplete") {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none"
          style={{ background: "rgba(0,0,20,0.6)" }}>
          <h2 className="text-5xl font-black tracking-widest mb-2" style={{ background: "linear-gradient(90deg,#00f5ff,#00ff88)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textShadow: "none" }}>
            LEVEL {level} CLEAR!
          </h2>
          <p className="text-yellow-300 font-mono text-xl">Score: {score.toLocaleString()}</p>
          <p className="text-slate-400 font-mono text-sm mt-4 animate-pulse">Next level loading...</p>
        </div>
      );
    }

    if (gs === "gameOver") {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-auto"
          style={{ background: "rgba(20,0,0,0.85)", backdropFilter: "blur(6px)" }}>
          <h2 className="text-6xl font-black tracking-widest mb-2" style={{ color: "#ff2244", textShadow: "0 0 40px #ff2244" }}>
            GAME OVER
          </h2>
          <p className="text-slate-300 font-mono text-lg mb-1">SCORE: <span className="text-yellow-300 font-bold">{score.toLocaleString()}</span></p>
          <p className="text-slate-400 font-mono text-sm mb-8">BEST: <span className="text-cyan-300">{hiScore.toLocaleString()}</span></p>
          <button onClick={startGame}
            className="px-10 py-4 rounded-lg font-black text-xl tracking-widest text-black transition-all hover:scale-105 active:scale-95"
            style={{ background: "linear-gradient(90deg,#ff2244,#ff6600)", boxShadow: "0 0 30px #ff224488" }}>
            TRY AGAIN
          </button>
        </div>
      );
    }

    if (gs === "victory") {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-auto"
          style={{ background: "rgba(0,10,0,0.85)", backdropFilter: "blur(6px)" }}>
          <h2 className="text-6xl font-black tracking-widest mb-2 text-center"
            style={{ background: "linear-gradient(90deg,#ffff00,#00ff88,#00f5ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            VICTORY!
          </h2>
          <p className="text-slate-300 font-mono mb-1">All {LEVELS.length} levels conquered!</p>
          <p className="text-yellow-300 font-mono text-2xl font-bold mb-1">{score.toLocaleString()} pts</p>
          <p className="text-slate-400 font-mono text-sm mb-8">HIGH SCORE: {hiScore.toLocaleString()}</p>
          <button onClick={startGame}
            className="px-10 py-4 rounded-lg font-black text-xl tracking-widest text-black transition-all hover:scale-105 active:scale-95"
            style={{ background: "linear-gradient(90deg,#ffff00,#00ff88)", boxShadow: "0 0 30px #ffff0055" }}>
            PLAY AGAIN
          </button>
        </div>
      );
    }
    return null;
  };

  const { gs, score, lives, hiScore, level, combo } = uiState;
  const pu = activePURef.current;
  const showHUD = gs === "playing" || gs === "paused";

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center overflow-hidden"
      style={{ background: "#000008" }}>
      <div className="relative" style={{ width: GAME_W * scaleRef.current, height: GAME_H * scaleRef.current }}>
        <canvas
          ref={canvasRef}
          width={GAME_W}
          height={GAME_H}
          style={{ display: "block", width: "100%", height: "100%", imageRendering: "pixelated" }}
        />

        {/* HUD */}
        {showHUD && (
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-2 pointer-events-none z-20 select-none">
            <div className="flex flex-col">
              <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">Score</span>
              <span className="text-lg font-black text-cyan-300 leading-none" style={{ textShadow: "0 0 10px #00f5ff" }}>
                {score.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">
                {LEVELS[Math.min(level - 1, LEVELS.length - 1)]?.name}
              </span>
              <span className="text-xs font-mono text-purple-300">LVL {level} / {LEVELS.length}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">Lives</span>
              <span className="text-lg font-black leading-none" style={{ color: "#ff2244", textShadow: "0 0 10px #ff2244" }}>
                {"♥".repeat(lives)}
              </span>
            </div>
          </div>
        )}

        {/* Active power-up indicators */}
        {showHUD && (
          <div className="absolute bottom-2 left-2 flex gap-1.5 pointer-events-none z-20">
            {pu.widePaddle > 0 && <PUPill label="WIDE" color="#00ff88" />}
            {pu.fireball > 0 && <PUPill label="FIRE" color="#ff6600" />}
            {pu.slowMo > 0 && <PUPill label="SLOW" color="#00ccff" />}
            {pu.laser > 0 && <PUPill label="LASER" color="#ffff00" />}
            {pu.magnetPaddle > 0 && <PUPill label="MAG" color="#00f5ff" />}
          </div>
        )}

        {/* Hi-score */}
        {showHUD && (
          <div className="absolute bottom-2 right-2 text-right pointer-events-none z-20">
            <span className="text-xs font-mono text-slate-600">BEST </span>
            <span className="text-xs font-mono text-yellow-400">{hiScore.toLocaleString()}</span>
          </div>
        )}

        {/* Overlay screens */}
        {renderOverlay()}
      </div>
    </div>
  );
}

function PUPill({ label, color }: { label: string; color: string }) {
  return (
    <div className="px-2 py-0.5 rounded text-xs font-black font-mono"
      style={{ background: hexWithAlpha(color, 0.2), border: `1px solid ${hexWithAlpha(color, 0.6)}`, color }}>
      {label}
    </div>
  );
}
