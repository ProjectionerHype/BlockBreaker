export const GAME_W = 800;
export const GAME_H = 600;

export const PADDLE_W = 110;
export const PADDLE_H = 14;
export const PADDLE_Y = GAME_H - 50;
export const PADDLE_SPEED = 9;

export const BALL_RADIUS = 9;
export const BALL_BASE_SPEED = 5.5;

export const BLOCK_COLS = 10;
export const BLOCK_ROWS = 7;
export const BLOCK_W = 68;
export const BLOCK_H = 26;
export const BLOCK_PAD = 6;
export const BLOCK_OFFSET_X = (GAME_W - (BLOCK_COLS * (BLOCK_W + BLOCK_PAD) - BLOCK_PAD)) / 2;
export const BLOCK_OFFSET_Y = 70;

export const POWERUP_RADIUS = 14;
export const POWERUP_SPEED = 2.2;

export const LASER_SPEED = 10;
export const LASER_COOLDOWN = 400; // ms

export const COLORS = {
  cyan: "#00f5ff",
  magenta: "#ff00ff",
  yellow: "#ffff00",
  green: "#00ff88",
  orange: "#ff8800",
  red: "#ff2244",
  purple: "#cc44ff",
  white: "#ffffff",
  gold: "#ffd700",
  silver: "#c0c0c0",
};

export const BLOCK_COLORS: Record<string, { color: string; glow: string }> = {
  "1-cyan":    { color: "#003a3f", glow: "#00f5ff" },
  "1-magenta": { color: "#3f0030", glow: "#ff00ff" },
  "1-green":   { color: "#003318", glow: "#00ff88" },
  "1-yellow":  { color: "#3f3a00", glow: "#ffff00" },
  "1-orange":  { color: "#3f1e00", glow: "#ff8800" },
  "1-purple":  { color: "#280033", glow: "#cc44ff" },
  "2-silver":  { color: "#2a2a35", glow: "#aaaacc" },
  "3-gold":    { color: "#3f2e00", glow: "#ffd700" },
  "indestructible": { color: "#1a1a2e", glow: "#444466" },
  "explosive":  { color: "#3f0010", glow: "#ff3300" },
  "powerup":    { color: "#001f3f", glow: "#00ccff" },
};

export const POWERUP_COLORS: Record<string, { bg: string; icon: string }> = {
  widePaddle:   { bg: "#004488", icon: "W" },
  multiBall:    { bg: "#880044", icon: "×3" },
  fireball:     { bg: "#882200", icon: "🔥" },
  slowMo:       { bg: "#004422", icon: "⏱" },
  extraLife:    { bg: "#440088", icon: "♥" },
  laser:        { bg: "#884400", icon: "⚡" },
  shrinkPaddle: { bg: "#440000", icon: "↔" },
  magnetPaddle: { bg: "#004444", icon: "🧲" },
};

export const SCORE_BLOCK = 10;
export const SCORE_COMBO_BONUS = 5;
export const TOTAL_LEVELS = 10;
