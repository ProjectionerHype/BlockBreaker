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
import { Audio, setAudioMuted, isAudioMuted } from "./audio";

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

  // streak tracking
  const streakRef = useRef<number>((() => {
    const saved = localStorage.getItem("bb-streak");
    const lastDate = localStorage.getItem("bb-streak-date");
    if (!saved || !lastDate) return 0;
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (lastDate === today || lastDate === yesterday) return parseInt(saved, 10);
    return 0;
  })());
  const diedOnLevelRef = useRef(0);
  const achievedRef = useRef<Set<string>>(new Set());

  // level progression
  const unlockedRef = useRef<number>(parseInt(localStorage.getItem("bb-unlocked") || "0", 10));
  const completedRef = useRef<Set<number>>(new Set(
    JSON.parse(localStorage.getItem("bb-completed") || "[]") as number[]
  ));

  // sound toggle
  const soundRef = useRef<boolean>(!isAudioMuted());

  // React state (for UI overlays only)
  const [uiState, setUiState] = useState<{
    gs: GameState; level: number; score: number; lives: number; hiScore: number; combo: number;
    toast: string; streak: number; unlocked: number; sound: boolean;
  }>({
    gs: "menu", level: 1, score: 0, lives: 3, hiScore: 0, combo: 0,
    toast: "", streak: streakRef.current,
    unlocked: unlockedRef.current, sound: soundRef.current,
  });

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);

  // held arrow keys for keyboard paddle control
  const keysRef = useRef({ left: false, right: false });

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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft")  { e.preventDefault(); keysRef.current.left  = true; return; }
      if (e.code === "ArrowRight") { e.preventDefault(); keysRef.current.right = true; return; }

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
        if (activePURef.current.laser > 0) fireLaser();
      }
      if (e.code === "KeyP" || e.code === "Escape") {
        if (gsRef.current === "playing") { gsRef.current = "paused"; setUiState(u => ({ ...u, gs: "paused" })); }
        else if (gsRef.current === "paused") { gsRef.current = "playing"; setUiState(u => ({ ...u, gs: "playing" })); }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft")  keysRef.current.left  = false;
      if (e.code === "ArrowRight") keysRef.current.right = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
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
    const safeIdx = Math.max(0, Math.min(lvlIdx, LEVELS.length - 1));
    blocksRef.current = buildLevel(safeIdx);
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

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setUiState(u => ({ ...u, toast: msg }));
    toastTimerRef.current = setTimeout(() => setUiState(u => ({ ...u, toast: "" })), 2000);
  }, []);

  const goToLevelSelect = useCallback(() => {
    gsRef.current = "levelSelect";
    setUiState(u => ({ ...u, gs: "levelSelect", unlocked: unlockedRef.current }));
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundRef.current;
    soundRef.current = next;
    setAudioMuted(!next);
    setUiState(u => ({ ...u, sound: next }));
    if (next) Audio.menuClick();
  }, []);

  const startGame = useCallback((lvlIdx: number) => {
    // update streak
    const today = new Date().toDateString();
    const lastDate = localStorage.getItem("bb-streak-date");
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let newStreak = streakRef.current;
    if (lastDate !== today) {
      newStreak = lastDate === yesterday ? newStreak + 1 : 1;
      streakRef.current = newStreak;
      localStorage.setItem("bb-streak", String(newStreak));
      localStorage.setItem("bb-streak-date", today);
    }
    achievedRef.current = new Set();
    levelRef.current = lvlIdx;
    livesRef.current = 3;
    scoreRef.current = 0;
    startLevel(lvlIdx);
    setUiState(u => ({ ...u, score: 0, lives: 3, hiScore: hiScoreRef.current, streak: newStreak }));
  }, [startLevel, showToast]);

  const startRevenge = useCallback(() => {
    achievedRef.current = new Set();
    levelRef.current = diedOnLevelRef.current;
    livesRef.current = 3;
    scoreRef.current = 0;
    startLevel(diedOnLevelRef.current);
    setUiState(u => ({ ...u, score: 0, lives: 3, hiScore: hiScoreRef.current, streak: streakRef.current }));
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

    // keyboard paddle movement (arrow keys)
    const KSPEED = 7;
    if (keysRef.current.left)  paddleTargetRef.current -= KSPEED;
    if (keysRef.current.right) paddleTargetRef.current += KSPEED;
    paddleTargetRef.current = clamp(paddleTargetRef.current, paddleRef.current.w / 2, GAME_W - paddleRef.current.w / 2);

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
            // achievement toasts for combo milestones
            const milestones: Record<number, string> = { 3: "✦ TRIPLE COMBO!", 5: "🔥 5× COMBO!", 10: "⚡ 10× COMBO!", 20: "★ UNSTOPPABLE!" };
            const achieveKey = `combo-${comboRef.current}`;
            if (milestones[comboRef.current] && !achievedRef.current.has(achieveKey)) {
              achievedRef.current.add(achieveKey);
              showToast(milestones[comboRef.current]);
            }

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
        diedOnLevelRef.current = levelRef.current;
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
      const clearedLvl = levelRef.current;
      const nextLvl = clearedLvl + 1;

      // unlock next level + mark this as completed
      completedRef.current.add(clearedLvl);
      localStorage.setItem("bb-completed", JSON.stringify([...completedRef.current]));
      if (nextLvl > unlockedRef.current && nextLvl < LEVELS.length) {
        unlockedRef.current = nextLvl;
        localStorage.setItem("bb-unlocked", String(nextLvl));
      }

      if (nextLvl >= LEVELS.length) {
        gsRef.current = "victory";
        if (scoreRef.current > hiScoreRef.current) {
          hiScoreRef.current = scoreRef.current;
          localStorage.setItem("bb-hi", String(hiScoreRef.current));
        }
        Audio.victory();
        setUiState(u => ({ ...u, gs: "victory", score: scoreRef.current, hiScore: hiScoreRef.current, unlocked: unlockedRef.current }));
      } else {
        gsRef.current = "levelComplete";
        Audio.levelComplete();
        setUiState(u => ({ ...u, gs: "levelComplete", score: scoreRef.current, unlocked: unlockedRef.current }));
        // after brief celebration, go back to level select
        setTimeout(() => {
          gsRef.current = "levelSelect";
          setUiState(u => ({ ...u, gs: "levelSelect", unlocked: unlockedRef.current }));
        }, 2400);
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
        // achievement toast
        const toastMap: Partial<Record<PowerUpType, string>> = {
          multiBall: "🔥 MULTIBALL!", fireball: "🔥 FIREBALL!", laser: "⚡ LASER!",
          extraLife: "❤ EXTRA LIFE!", slowMo: "⏱ SLOW-MO!", widePaddle: "↔ WIDE PADDLE!",
          magnetPaddle: "🧲 MAGNET!",
        };
        const msg = toastMap[pu2.type];
        if (msg) showToast(msg);
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
  }, [startLevel, fireLaser, showToast]);

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
      const bw = blk.w, bh = blk.h;
      const radius = 6;
      const isIndestr = blk.type === "indestructible";

      ctx.save();

      // outer glow — layered for more punch
      const glowStrength = isIndestr ? 6 : (blk.sparkle > 0 ? 28 : 18);
      ctx.shadowColor = blk.glow;
      ctx.shadowBlur = glowStrength;

      // body fill — rich 3-stop gradient: vivid edge → dark center → black base
      const grad = ctx.createLinearGradient(x, y, x, y + bh);
      grad.addColorStop(0,   hexWithAlpha(blk.glow, 0.55));   // bright top
      grad.addColorStop(0.35, blk.color);                       // saturated mid
      grad.addColorStop(1,   "rgba(0,0,0,0.85)");              // deep base
      ctx.fillStyle = grad;
      drawRoundRect(ctx, x, y, bw, bh, radius);
      ctx.fill();

      // reset shadow before layering details
      ctx.shadowBlur = 0;

      // top-edge highlight bevel — glass shine
      ctx.save();
      ctx.clip();  // clip to block shape
      const shine = ctx.createLinearGradient(x, y, x, y + bh * 0.45);
      shine.addColorStop(0,   "rgba(255,255,255,0.22)");
      shine.addColorStop(0.5, "rgba(255,255,255,0.06)");
      shine.addColorStop(1,   "rgba(255,255,255,0)");
      ctx.fillStyle = shine;
      drawRoundRect(ctx, x, y, bw, bh, radius);
      ctx.fill();
      ctx.restore();

      // border — crisp neon outline
      ctx.shadowColor = blk.glow;
      ctx.shadowBlur = blk.sparkle > 0 ? 14 : 7;
      ctx.strokeStyle = hexWithAlpha(blk.glow, blk.sparkle > 0 ? 1.0 : 0.75);
      ctx.lineWidth = blk.sparkle > 0 ? 1.8 : 1.1;
      drawRoundRect(ctx, x, y, bw, bh, radius);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // HP pip bar for multi-hit blocks
      if (blk.maxHp > 1 && !isIndestr) {
        const pct = blk.hp / blk.maxHp;
        const barX = x + 5, barY = y + bh - 5, barW = bw - 10, barH = 3;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 2); ctx.fill();
        ctx.fillStyle = blk.glow;
        ctx.shadowColor = blk.glow; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.roundRect(barX, barY, barW * pct, barH, 2); ctx.fill();
        ctx.shadowBlur = 0;
      }

      // indestructible cross-hatch
      if (isIndestr) {
        ctx.save();
        drawRoundRect(ctx, x, y, bw, bh, radius);
        ctx.clip();
        ctx.strokeStyle = "rgba(80,110,160,0.18)";
        ctx.lineWidth = 1;
        for (let i = -bh; i < bw + bh; i += 10) {
          ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i + bh, y + bh); ctx.stroke();
        }
        ctx.restore();
      }

      // power-up star burst bg + icon
      if (blk.type === "powerup" && blk.powerUp) {
        const info = POWERUP_COLORS[blk.powerUp];
        ctx.save();
        drawRoundRect(ctx, x + 2, y + 2, bw - 4, bh - 4, 4);
        ctx.clip();
        ctx.fillStyle = hexWithAlpha(blk.glow, 0.1);
        ctx.fill();
        ctx.restore();
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.fillStyle = "#fff";
        ctx.shadowColor = blk.glow; ctx.shadowBlur = 10;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(info.icon, x + bw / 2, y + bh / 2);
        ctx.shadowBlur = 0;
      }

      // explosive warning mark
      if (blk.type === "explosive") {
        ctx.font = "bold 13px system-ui, sans-serif";
        ctx.fillStyle = "#ff8800";
        ctx.shadowColor = "#ff4400"; ctx.shadowBlur = 12;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("✦", x + bw / 2, y + bh / 2);
        ctx.shadowBlur = 0;
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
      const pulse = 0.55 + 0.45 * Math.sin(t * 0.0028);
      ctx.save();
      // pill background
      const hintW = 280, hintH = 30, hintX = GAME_W / 2 - hintW / 2, hintY = PADDLE_Y + 24;
      ctx.globalAlpha = pulse * 0.85;
      ctx.fillStyle = "rgba(0,20,40,0.9)";
      ctx.strokeStyle = "rgba(0,245,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(hintX, hintY, hintW, hintH, 15);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = pulse;
      ctx.font = "600 12px 'Inter', system-ui, sans-serif";
      ctx.fillStyle = "#00f5ff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#00f5ff";
      ctx.shadowBlur = 8;
      ctx.fillText("CLICK · SPACE · ← → to move", GAME_W / 2, hintY + hintH / 2);
      ctx.restore();
    }

    // combo display
    if (comboRef.current >= 2) {
      const scale2 = 1 + 0.08 * Math.sin(t * 0.012);
      const comboX = GAME_W - 14, comboY = 36;
      ctx.save();
      ctx.translate(comboX, comboY);
      ctx.scale(scale2, scale2);
      ctx.translate(-comboX, -comboY);
      // pill bg
      const label = `×${comboRef.current}  COMBO`;
      ctx.font = "bold 13px 'Inter', system-ui, sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = "rgba(40,40,0,0.85)";
      ctx.strokeStyle = "rgba(255,255,0,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(comboX - tw - 20, comboY - 12, tw + 24, 24, 12);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffff00";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#ffff00";
      ctx.shadowBlur = 18;
      ctx.fillText(label, comboX - 6, comboY);
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
    const { gs, score, hiScore, level, streak = 0, toast } = uiState;

    if (gs === "menu") {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-auto select-none">
          {/* Sound toggle — top right */}
          <button onClick={toggleSound} style={{
            position: "absolute", top: 12, right: 14,
            background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, cursor: "pointer", padding: "6px 8px",
            fontSize: 16, lineHeight: 1,
            color: uiState.sound ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.22)",
          }}>
            {uiState.sound ? "🔊" : "🔇"}
          </button>
          {/* title */}
          <div className="mb-1 text-center">
            <h1
              className="font-black leading-none tracking-tight"
              style={{
                fontSize: "clamp(52px, 10vw, 80px)",
                background: "linear-gradient(135deg,#00f5ff 0%,#aa44ff 50%,#ff00cc 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 28px rgba(0,245,255,0.35))",
                letterSpacing: "-0.02em",
              }}
            >
              BLOCK<br />BREAKER
            </h1>
            <p style={{ fontSize: 11, letterSpacing: "0.35em", color: "rgba(0,245,255,0.55)", marginTop: 8, fontWeight: 600, textTransform: "uppercase" }}>
              NEON EDITION
            </p>
          </div>

          {/* hi-score + streak row */}
          <div style={{ margin: "18px 0 28px", display: "flex", gap: 10, alignItems: "center", justifyContent: "center" }}>
            <div style={{
              padding: "6px 18px", borderRadius: 99,
              background: "rgba(255,215,0,0.07)", border: "1px solid rgba(255,215,0,0.22)",
              fontSize: 12, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em",
            }}>
              BEST &nbsp;<span style={{ color: "#ffd700", fontWeight: 700 }}>{hiScore.toLocaleString()}</span>
            </div>
            {streak > 1 && (
              <div style={{
                padding: "6px 14px", borderRadius: 99,
                background: "rgba(255,120,0,0.08)", border: "1px solid rgba(255,120,0,0.25)",
                fontSize: 12, color: "rgba(255,200,100,0.7)", letterSpacing: "0.06em", fontWeight: 600,
              }}>
                🔥 {streak}-day streak
              </div>
            )}
          </div>

          {/* play button → goes to level select */}
          <button
            onClick={goToLevelSelect}
            style={{
              padding: "14px 52px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#000",
              background: "linear-gradient(135deg,#00f5ff,#0066ff)",
              boxShadow: "0 0 40px rgba(0,200,255,0.45), 0 4px 16px rgba(0,0,0,0.5)",
              border: "none",
              cursor: "pointer",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.transform = "scale(1.06)"; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.transform = "scale(1)"; }}
          >
            SELECT LEVEL
          </button>

          {/* controls legend */}
          <div style={{
            marginTop: 32,
            display: "grid",
            gridTemplateColumns: "auto auto",
            columnGap: 16,
            rowGap: 6,
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
            letterSpacing: "0.05em",
          }}>
            {[
              ["MOUSE / ← →", "Move paddle"],
              ["CLICK · SPACE", "Launch ball"],
              ["SPACE", "Fire laser"],
              ["P · ESC", "Pause"],
            ].map(([k, v]) => (
              <span key={k} style={{ display: "contents" }}>
                <span style={{ color: "#00f5ff", fontWeight: 600, textAlign: "right" }}>{k}</span>
                <span>{v}</span>
              </span>
            ))}
          </div>
        </div>
      );
    }

    if (gs === "levelSelect") {
      const unlocked = uiState.unlocked ?? 0;
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-auto select-none"
          style={{ background: "rgba(0,2,16,0.96)", backdropFilter: "blur(4px)" }}>
          {/* Sound toggle — top right */}
          <button onClick={toggleSound} style={{
            position: "absolute", top: 12, right: 14,
            background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, cursor: "pointer", padding: "6px 8px",
            fontSize: 16, lineHeight: 1,
            color: uiState.sound ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.22)",
          }}>
            {uiState.sound ? "🔊" : "🔇"}
          </button>
          {/* header */}
          <div style={{ marginBottom: 12, textAlign: "center", flexShrink: 0 }}>
            <p style={{ fontSize: 9, letterSpacing: "0.35em", color: "rgba(0,245,255,0.5)", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>
              BLOCK BREAKER · NEON EDITION
            </p>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.01em", marginBottom: 2 }}>
              Choose Level
            </h2>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
              {completedRef.current.size} / {LEVELS.length} completed
            </p>
          </div>

          {/* level grid — scrollable */}
          <div style={{
            overflowY: "auto",
            maxHeight: "calc(100% - 140px)",
            width: "100%",
            padding: "4px 16px 8px",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(0,245,255,0.2) transparent",
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(10, 1fr)",
              gap: 7,
              width: "100%",
              maxWidth: 560,
              margin: "0 auto",
            }}>
              {LEVELS.map((lvl, i) => {
                const isUnlocked = i <= unlocked;
                const isCompleted = completedRef.current.has(i);
                const isCurrent = i === unlocked && !isCompleted;
                return (
                  <button
                    key={i}
                    disabled={!isUnlocked}
                    onClick={() => isUnlocked && startGame(i)}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 8,
                      border: isCompleted
                        ? "1.5px solid rgba(0,255,136,0.55)"
                        : isCurrent
                        ? "1.5px solid rgba(0,245,255,0.7)"
                        : isUnlocked
                        ? "1.5px solid rgba(255,255,255,0.14)"
                        : "1.5px solid rgba(255,255,255,0.05)",
                      background: isCompleted
                        ? "rgba(0,255,136,0.09)"
                        : isCurrent
                        ? "rgba(0,200,255,0.12)"
                        : isUnlocked
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.3)",
                      boxShadow: isCompleted
                        ? "0 0 10px rgba(0,255,136,0.25)"
                        : isCurrent
                        ? "0 0 12px rgba(0,200,255,0.3)"
                        : "none",
                      cursor: isUnlocked ? "pointer" : "default",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      gap: 1, transition: "transform 0.1s",
                      padding: 0,
                    }}
                    onMouseEnter={e => { if (isUnlocked) (e.currentTarget as HTMLElement).style.transform = "scale(1.12)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                    title={isUnlocked ? lvl.name : "Locked"}
                  >
                    {isUnlocked ? (
                      <>
                        <span style={{ fontSize: 12, fontWeight: 900, color: isCompleted ? "#00ff88" : isCurrent ? "#00f5ff" : "rgba(255,255,255,0.75)", lineHeight: 1 }}>
                          {isCompleted ? "★" : i + 1}
                        </span>
                        {!isCompleted && (
                          <span style={{ fontSize: 6, color: isCurrent ? "rgba(0,245,255,0.6)" : "rgba(255,255,255,0.25)", letterSpacing: "0.03em", textTransform: "uppercase", lineHeight: 1 }}>
                            {i + 1}
                          </span>
                        )}
                      </>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5">
                        <rect x="3" y="11" width="18" height="11" rx="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* back to menu */}
          <button
            onClick={() => { gsRef.current = "menu"; setUiState(u => ({ ...u, gs: "menu" })); }}
            style={{
              padding: "8px 24px", borderRadius: 8,
              fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "rgba(255,255,255,0.35)", background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
            }}
          >
            ← Back
          </button>
        </div>
      );
    }

    if (gs === "paused") {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-auto"
          style={{ background: "rgba(2,4,20,0.82)", backdropFilter: "blur(8px)" }}>
          <div style={{
            padding: "40px 52px",
            borderRadius: 20,
            background: "rgba(0,15,35,0.95)",
            border: "1px solid rgba(0,245,255,0.18)",
            boxShadow: "0 0 60px rgba(0,0,0,0.6)",
            textAlign: "center",
          }}>
            <p style={{ fontSize: 11, letterSpacing: "0.35em", color: "rgba(0,245,255,0.5)", marginBottom: 8, fontWeight: 600 }}>
              ◼ PAUSED
            </p>
            <h2 style={{
              fontSize: 42,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              color: "#fff",
              textShadow: "0 0 30px rgba(0,245,255,0.4)",
              marginBottom: 28,
            }}>
              Game Paused
            </h2>
            <button
              onClick={() => { gsRef.current = "playing"; setUiState(u => ({ ...u, gs: "playing" })); }}
              style={{
                display: "block", width: "100%",
                padding: "13px 0", borderRadius: 10,
                fontSize: 14, fontWeight: 800, letterSpacing: "0.15em",
                color: "#000",
                background: "linear-gradient(135deg,#00f5ff,#0066ff)",
                boxShadow: "0 0 24px rgba(0,200,255,0.35)",
                border: "none", cursor: "pointer", marginBottom: 10,
              }}
            >
              RESUME
            </button>
            <button
              onClick={startGame}
              style={{
                display: "block", width: "100%",
                padding: "12px 0", borderRadius: 10,
                fontSize: 13, fontWeight: 600, letterSpacing: "0.12em",
                color: "rgba(255,255,255,0.55)",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.12)",
                cursor: "pointer",
              }}
            >
              RESTART
            </button>
          </div>
        </div>
      );
    }

    if (gs === "levelComplete") {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none"
          style={{ background: "rgba(0,4,20,0.7)", backdropFilter: "blur(3px)" }}>
          <p style={{ fontSize: 11, letterSpacing: "0.35em", color: "rgba(0,255,136,0.6)", fontWeight: 600, marginBottom: 8 }}>
            ✦ STAGE COMPLETE
          </p>
          <h2 style={{
            fontSize: 48,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            background: "linear-gradient(135deg,#00f5ff,#00ff88)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: 12,
          }}>
            Level {level}
          </h2>
          <p style={{ fontSize: 22, fontWeight: 700, color: "#ffd700", marginBottom: 4 }}>
            {score.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,215,0,0.5)" }}>pts</span>
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", marginTop: 16 }} className="animate-pulse">
            NEXT LEVEL INCOMING…
          </p>
        </div>
      );
    }

    if (gs === "gameOver") {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-auto"
          style={{ background: "rgba(18,0,0,0.88)", backdropFilter: "blur(8px)" }}>
          <div style={{
            padding: "40px 52px",
            borderRadius: 20,
            background: "rgba(25,0,4,0.96)",
            border: "1px solid rgba(255,34,68,0.22)",
            boxShadow: "0 0 60px rgba(0,0,0,0.7)",
            textAlign: "center",
          }}>
            <p style={{ fontSize: 11, letterSpacing: "0.35em", color: "rgba(255,60,80,0.6)", marginBottom: 8, fontWeight: 600 }}>
              ✕ GAME OVER
            </p>
            <h2 style={{
              fontSize: 46,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              color: "#ff2244",
              textShadow: "0 0 40px rgba(255,34,68,0.5)",
              marginBottom: 24,
            }}>
              You Died
            </h2>
            <div style={{
              padding: "14px 24px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              marginBottom: 24,
            }}>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", marginBottom: 4 }}>FINAL SCORE</p>
              <p style={{ fontSize: 30, fontWeight: 800, color: "#ffd700" }}>{score.toLocaleString()}</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>
                Best: <span style={{ color: "rgba(0,245,255,0.7)", fontWeight: 600 }}>{hiScore.toLocaleString()}</span>
              </p>
            </div>
            {/* gap from best */}
            {hiScore > score && (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 4 }}>
                {(hiScore - score).toLocaleString()} pts behind your best
              </p>
            )}
            {score >= hiScore && score > 0 && (
              <p style={{ fontSize: 11, color: "#ffd700", marginTop: 4 }}>✦ New best!</p>
            )}

            {/* Revenge button — same level */}
            <button
              onClick={startRevenge}
              style={{
                display: "block", width: "100%",
                padding: "13px 0", borderRadius: 10,
                fontSize: 14, fontWeight: 800, letterSpacing: "0.15em",
                color: "#fff",
                background: "linear-gradient(135deg,#ff4400,#cc1100)",
                boxShadow: "0 0 28px rgba(255,68,0,0.35)",
                border: "none", cursor: "pointer", marginBottom: 10,
              }}
            >
              ⚡ REVENGE — LEVEL {diedOnLevelRef.current + 1}
            </button>
            <button
              onClick={goToLevelSelect}
              style={{
                display: "block", width: "100%",
                padding: "12px 0", borderRadius: 10,
                fontSize: 13, fontWeight: 600, letterSpacing: "0.12em",
                color: "rgba(255,255,255,0.55)",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.12)",
                cursor: "pointer",
              }}
            >
              ← LEVEL SELECT
            </button>
          </div>
        </div>
      );
    }

    if (gs === "victory") {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-auto"
          style={{ background: "rgba(0,10,0,0.88)", backdropFilter: "blur(8px)" }}>
          <div style={{
            padding: "40px 52px",
            borderRadius: 20,
            background: "rgba(0,14,6,0.96)",
            border: "1px solid rgba(0,255,136,0.2)",
            boxShadow: "0 0 80px rgba(0,0,0,0.7)",
            textAlign: "center",
          }}>
            <p style={{ fontSize: 11, letterSpacing: "0.35em", color: "rgba(0,255,136,0.55)", marginBottom: 8, fontWeight: 600 }}>
              ✦ ALL LEVELS COMPLETE
            </p>
            <h2 style={{
              fontSize: 52,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              background: "linear-gradient(135deg,#ffff00,#00ff88)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: 24,
            }}>
              Victory!
            </h2>
            <div style={{
              padding: "14px 24px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              marginBottom: 24,
            }}>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", marginBottom: 4 }}>FINAL SCORE</p>
              <p style={{ fontSize: 32, fontWeight: 800, color: "#ffd700" }}>{score.toLocaleString()}</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>
                High Score: <span style={{ color: "rgba(0,245,255,0.7)", fontWeight: 600 }}>{hiScore.toLocaleString()}</span>
              </p>
            </div>
            <button
              onClick={goToLevelSelect}
              style={{
                display: "block", width: "100%",
                padding: "13px 0", borderRadius: 10,
                fontSize: 14, fontWeight: 800, letterSpacing: "0.15em",
                color: "#000",
                background: "linear-gradient(135deg,#ffff00,#00ff88)",
                boxShadow: "0 0 28px rgba(100,255,100,0.3)",
                border: "none", cursor: "pointer",
              }}
            >
              ← LEVEL SELECT
            </button>
          </div>
        </div>
      );
    }
    return null;
  };

  const { gs, score, lives, hiScore, level } = uiState;
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

        {/* ── HUD bar — single row, no background ── */}
        {showHUD && (
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 12px",
            pointerEvents: "none", userSelect: "none",
          }}>
            {/* Score — left */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: "#fff", lineHeight: 1, textShadow: "0 0 8px rgba(0,200,255,0.5)" }}>
                {score.toLocaleString()}
              </span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", fontWeight: 500 }}>
                best {hiScore.toLocaleString()}
              </span>
            </div>

            {/* Center — level name + progress dots inline */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", color: "rgba(255,255,255,0.8)", textTransform: "uppercase", textShadow: "0 0 10px rgba(180,120,255,0.4)" }}>
                {LEVELS[Math.min(level - 1, LEVELS.length - 1)]?.name}
              </span>
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                {Array.from({ length: LEVELS.length }).map((_, i) => (
                  <div key={i} style={{
                    width: i === level - 1 ? 14 : 3, height: 3, borderRadius: 3,
                    background: i < level ? (i === level - 1 ? "#00f5ff" : "rgba(0,245,255,0.4)") : "rgba(255,255,255,0.12)",
                    boxShadow: i === level - 1 ? "0 0 6px #00f5ff" : "none",
                    transition: "width 0.3s ease",
                  }} />
                ))}
              </div>
            </div>

            {/* Lives + sound — right */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {Array.from({ length: Math.max(lives, 0) }).map((_, i) => (
                  <svg key={i} width="11" height="11" viewBox="0 0 24 24" fill="rgba(255,255,255,0.75)">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                ))}
              </div>
              <button
                onClick={toggleSound}
                style={{
                  pointerEvents: "auto",
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: "2px", lineHeight: 1, fontSize: 13,
                  color: uiState.sound ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)",
                }}
                title={uiState.sound ? "Mute" : "Unmute"}
              >
                {uiState.sound ? "🔊" : "🔇"}
              </button>
            </div>
          </div>
        )}

        {/* ── Active power-ups ── */}
        {showHUD && (
          <div style={{
            position: "absolute", bottom: 8, left: 8,
            display: "flex", gap: 5,
            pointerEvents: "none",
          }}>
            {pu.widePaddle > 0 && <PUPill label="WIDE" color="#00ff88" />}
            {pu.fireball > 0 && <PUPill label="FIRE" color="#ff6600" />}
            {pu.slowMo > 0 && <PUPill label="SLOW" color="#00ccff" />}
            {pu.laser > 0 && <PUPill label="LASER" color="#ffff00" />}
            {pu.magnetPaddle > 0 && <PUPill label="MAGNET" color="#00f5ff" />}
          </div>
        )}

        {/* Overlay screens */}
        {renderOverlay()}

        {/* Toast notification */}
        {uiState.toast && (
          <div style={{
            position: "absolute", top: "18%", left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10,
            padding: "9px 22px",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.16em",
            color: "#fff",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            boxShadow: "0 0 24px rgba(0,0,0,0.5)",
            animation: "toast-pop 0.25s ease",
            zIndex: 50,
          }}>
            {uiState.toast}
          </div>
        )}
      </div>
    </div>
  );
}

function PUPill({ label, color }: { label: string; color: string }) {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return (
    <div style={{
      padding: "3px 9px",
      borderRadius: 6,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color,
      background: `rgba(${r},${g},${b},0.14)`,
      border: `1px solid rgba(${r},${g},${b},0.45)`,
      boxShadow: `0 0 10px rgba(${r},${g},${b},0.2)`,
    }}>
      {label}
    </div>
  );
}
