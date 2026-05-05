export type GameState = "menu" | "playing" | "paused" | "levelComplete" | "gameOver" | "victory";

export interface Vec2 {
  x: number;
  y: number;
}

export type BlockType = "normal" | "strong" | "tough" | "indestructible" | "explosive" | "powerup";
export type PowerUpType = "widePaddle" | "multiBall" | "fireball" | "slowMo" | "extraLife" | "laser" | "shrinkPaddle" | "magnetPaddle";

export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  type: BlockType;
  color: string;
  glow: string;
  powerUp?: PowerUpType;
  shakeOffset: number;
  shakeDecay: number;
  alive: boolean;
  sparkle: number;
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isFireball: boolean;
  trail: { x: number; y: number; alpha: number }[];
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
  gravity: number;
  rotation: number;
  rotSpeed: number;
  shape: "circle" | "square" | "star";
}

export interface PowerUp {
  id: number;
  x: number;
  y: number;
  vy: number;
  type: PowerUpType;
  radius: number;
  rotation: number;
  pulse: number;
  alive: boolean;
}

export interface Laser {
  id: number;
  x: number;
  y: number;
  vy: number;
  alive: boolean;
}

export interface ShockWave {
  x: number;
  y: number;
  r: number;
  maxR: number;
  alpha: number;
}

export interface LevelConfig {
  name: string;
  grid: (number | null)[];
  cols: number;
  rows: number;
  ballSpeedMultiplier: number;
  background: string;
}
