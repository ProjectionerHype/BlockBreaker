import type { LevelConfig } from "./types";

// Block encoding:
// null = empty
// 1-6 = normal block (different colors)
// 7   = silver (2 hits)
// 8   = gold   (3 hits)
// 9   = indestructible
// 10  = explosive
// 11  = power-up container

// Colors map by value: 1=cyan, 2=magenta, 3=green, 4=yellow, 5=orange, 6=purple

export const LEVELS: LevelConfig[] = [
  {
    name: "NEON DAWN",
    ballSpeedMultiplier: 1.0,
    background: "linear-gradient(180deg,#000a1a 0%,#000d22 100%)",
    cols: 10,
    rows: 5,
    grid: [
      1,1,1,1,1,1,1,1,1,1,
      2,2,2,2,2,2,2,2,2,2,
      3,3,3,3,3,3,3,3,3,3,
      4,4,4,4,4,4,4,4,4,4,
      5,5,5,5,5,5,5,5,5,5,
    ],
  },
  {
    name: "PULSE WAVE",
    ballSpeedMultiplier: 1.1,
    background: "linear-gradient(180deg,#0a0010 0%,#12001a 100%)",
    cols: 10,
    rows: 6,
    grid: [
      null,1,null,1,null,1,null,1,null,1,
      2,null,2,null,2,null,2,null,2,null,
      null,3,7,3,null,3,7,3,null,3,
      4,null,4,null,7,null,4,null,4,null,
      null,5,null,5,null,5,null,5,null,5,
      6,null,6,null,6,null,6,null,6,null,
    ],
  },
  {
    name: "DIAMOND MATRIX",
    ballSpeedMultiplier: 1.2,
    background: "linear-gradient(180deg,#001a0a 0%,#00220d 100%)",
    cols: 10,
    rows: 7,
    grid: [
      null,null,null,null,1,1,null,null,null,null,
      null,null,null,2,1,1,2,null,null,null,
      null,null,3,2,7,7,2,3,null,null,
      null,4,3,8,7,7,8,3,4,null,
      null,null,3,2,7,7,2,3,null,null,
      null,null,null,2,1,1,2,null,null,null,
      null,null,null,null,1,1,null,null,null,null,
    ],
  },
  {
    name: "POWER SURGE",
    ballSpeedMultiplier: 1.25,
    background: "linear-gradient(180deg,#1a0a00 0%,#220d00 100%)",
    cols: 10,
    rows: 6,
    grid: [
      9,1,1,1,1,1,1,1,1,9,
      1,7,2,2,11,11,2,2,7,1,
      1,2,7,3,3,3,3,7,2,1,
      1,2,3,7,10,10,7,3,2,1,
      1,7,2,2,11,11,2,2,7,1,
      9,1,1,1,1,1,1,1,1,9,
    ],
  },
  {
    name: "SPIRAL CHAOS",
    ballSpeedMultiplier: 1.3,
    background: "linear-gradient(180deg,#0a001a 0%,#12002a 100%)",
    cols: 10,
    rows: 7,
    grid: [
      1,1,1,1,1,1,1,1,1,1,
      1,null,null,null,null,null,null,null,null,2,
      1,null,3,3,3,3,3,3,null,2,
      1,null,3,null,null,null,8,3,null,2,
      1,null,3,null,10,null,3,null,null,2,
      1,null,null,null,null,null,null,null,null,2,
      4,4,4,4,4,4,4,4,4,4,
    ],
  },
  {
    name: "FORTRESS",
    ballSpeedMultiplier: 1.35,
    background: "linear-gradient(180deg,#001010 0%,#001515 100%)",
    cols: 10,
    rows: 7,
    grid: [
      9,9,9,9,9,9,9,9,9,9,
      9,8,8,8,8,8,8,8,8,9,
      9,8,7,7,11,11,7,7,8,9,
      9,8,7,1,2,3,1,7,8,9,
      9,8,7,7,11,11,7,7,8,9,
      9,8,8,8,8,8,8,8,8,9,
      9,9,9,9,9,9,9,9,9,9,
    ],
  },
  {
    name: "METEOR STORM",
    ballSpeedMultiplier: 1.4,
    background: "linear-gradient(180deg,#100500 0%,#1a0800 100%)",
    cols: 10,
    rows: 7,
    grid: [
      1,null,2,null,3,null,4,null,5,null,
      null,7,null,7,null,7,null,7,null,6,
      2,null,3,null,8,null,3,null,2,null,
      null,3,null,8,null,8,null,3,null,1,
      10,null,4,null,8,null,4,null,10,null,
      null,5,null,5,null,5,null,5,null,2,
      6,null,6,null,6,null,6,null,6,null,
    ],
  },
  {
    name: "CHROME GRID",
    ballSpeedMultiplier: 1.45,
    background: "linear-gradient(180deg,#050010 0%,#0a0020 100%)",
    cols: 10,
    rows: 7,
    grid: [
      7,7,7,7,7,7,7,7,7,7,
      7,8,8,8,8,8,8,8,8,7,
      7,8,9,9,11,11,9,9,8,7,
      7,8,9,10,1,1,10,9,8,7,
      7,8,9,9,11,11,9,9,8,7,
      7,8,8,8,8,8,8,8,8,7,
      7,7,7,7,7,7,7,7,7,7,
    ],
  },
  {
    name: "QUANTUM BREAK",
    ballSpeedMultiplier: 1.5,
    background: "linear-gradient(180deg,#00100a 0%,#001510 100%)",
    cols: 10,
    rows: 7,
    grid: [
      1,2,3,4,5,6,1,2,3,4,
      4,7,2,3,4,5,6,1,7,3,
      3,2,8,4,5,6,1,8,2,2,
      2,3,4,9,6,1,9,3,4,1,
      3,2,8,4,5,6,1,8,2,2,
      4,7,2,3,4,5,6,1,7,3,
      1,2,3,10,5,6,10,2,3,4,
    ],
  },
  {
    name: "FINAL JUDGMENT",
    ballSpeedMultiplier: 1.6,
    background: "linear-gradient(180deg,#100000 0%,#1a0000 100%)",
    cols: 10,
    rows: 7,
    grid: [
      9,9,9,9,9,9,9,9,9,9,
      9,8,8,8,8,8,8,8,8,9,
      9,8,7,7,10,10,7,7,8,9,
      9,8,7,8,11,11,8,7,8,9,
      9,8,7,7,10,10,7,7,8,9,
      9,8,8,8,8,8,8,8,8,9,
      9,9,9,9,9,9,9,9,9,9,
    ],
  },
];

export const BLOCK_COLOR_MAP: Record<number, { color: string; glow: string; label: string }> = {
  1: { color: "#003a3f", glow: "#00f5ff", label: "cyan" },
  2: { color: "#3f0030", glow: "#ff00ff", label: "magenta" },
  3: { color: "#003318", glow: "#00ff88", label: "green" },
  4: { color: "#3f3a00", glow: "#ffff00", label: "yellow" },
  5: { color: "#3f1e00", glow: "#ff8800", label: "orange" },
  6: { color: "#280033", glow: "#cc44ff", label: "purple" },
  7: { color: "#252535", glow: "#aaaacc", label: "silver" },    // 2 hits
  8: { color: "#3a2800", glow: "#ffd700", label: "gold" },      // 3 hits
  9: { color: "#111122", glow: "#334466", label: "indestructible" }, // ∞ hits
  10: { color: "#3f0010", glow: "#ff3300", label: "explosive" }, // explodes neighbors
  11: { color: "#001835", glow: "#00aaff", label: "powerup" },   // drops power-up
};

export const BLOCK_HP: Record<number, number> = {
  1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1,
  7: 2, 8: 3, 9: 999, 10: 1, 11: 1,
};
