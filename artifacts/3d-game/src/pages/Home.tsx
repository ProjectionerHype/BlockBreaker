import { useState, useEffect, useRef } from "react";

type GameId = "block-breaker" | "balls-bricks";

interface Props {
  onPlay: (game: GameId) => void;
}

// ── Block Breaker mini preview canvas ─────────────────────────────────────────

function BBPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const W = c.width, H = c.height;
    // Vivid neon palette matching the game
    const bColors = [
      { fill: "#003a3f", glow: "#00f5ff" },
      { fill: "#3f0030", glow: "#ff44ff" },
      { fill: "#003318", glow: "#00ff88" },
      { fill: "#3f3a00", glow: "#ffff00" },
      { fill: "#3f1e00", glow: "#ff8800" },
      { fill: "#280033", glow: "#cc44ff" },
      { fill: "#003a3f", glow: "#00f5ff" },
      { fill: "#3f0030", glow: "#ff44ff" },
    ];
    type Blk = { x: number; y: number; w: number; h: number; alive: boolean; ci: number };
    const blocks: Blk[] = [];
    const cols = 6, bw = (W - 20) / cols - 3, bh = 13;
    for (let r = 0; r < 5; r++)
      for (let col = 0; col < cols; col++)
        blocks.push({ x: 10 + col * (bw + 3), y: 10 + r * 17, w: bw, h: bh, alive: true, ci: (r * cols + col) % bColors.length });
    let bx = W * 0.4, by = H * 0.6, vx = 2.2, vy = -2.8;
    const PW = 50, PH = 7;
    let px = W / 2;

    const loop = () => {
      // Background
      ctx.fillStyle = "#000810"; ctx.fillRect(0, 0, W, H);

      // Blocks — fill crisp (no shadowBlur), glow only on border
      for (const b of blocks) {
        if (!b.alive) continue;
        const pal = bColors[b.ci];
        ctx.save();
        // Step 1: crisp fill, no shadow
        ctx.shadowBlur = 0;
        const gr = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
        gr.addColorStop(0, pal.glow + "bb");
        gr.addColorStop(0.35, pal.fill);
        gr.addColorStop(1, pal.fill + "99");
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 3); ctx.fill();
        // Step 2: neon border glow
        ctx.shadowColor = pal.glow; ctx.shadowBlur = 14;
        ctx.strokeStyle = pal.glow; ctx.lineWidth = 1; ctx.stroke();
        // Step 3: shine
        ctx.shadowBlur = 0;
        ctx.save(); ctx.clip();
        const shine = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h * 0.5);
        shine.addColorStop(0, "rgba(255,255,255,0.38)"); shine.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = shine; ctx.fillRect(b.x, b.y, b.w, b.h * 0.5);
        ctx.restore(); ctx.restore();
      }

      // Ball physics
      bx += vx; by += vy;
      if (bx < 6) { bx = 6; vx = Math.abs(vx); }
      if (bx > W - 6) { bx = W - 6; vx = -Math.abs(vx); }
      if (by < 6) { by = 6; vy = Math.abs(vy); }
      px += (bx - px) * 0.06; px = Math.max(PW / 2, Math.min(W - PW / 2, px));
      const py = H - 16;
      if (by + 6 >= py - PH && Math.abs(bx - px) < PW / 2 + 6) { vy = -Math.abs(vy); by = py - PH - 6; }
      for (const b of blocks) {
        if (!b.alive) continue;
        if (bx + 6 > b.x && bx - 6 < b.x + b.w && by + 6 > b.y && by - 6 < b.y + b.h) { b.alive = false; vy = -vy; }
      }
      if (blocks.every(b => !b.alive) || by > H + 20) {
        for (const b of blocks) b.alive = true;
        bx = W / 2; by = H * 0.6; vx = 2 + Math.random(); vy = -3;
      }

      // Paddle
      ctx.save();
      ctx.shadowColor = "#00f5ff"; ctx.shadowBlur = 22;
      const pg = ctx.createLinearGradient(px - PW / 2, 0, px + PW / 2, 0);
      pg.addColorStop(0, "transparent"); pg.addColorStop(0.5, "#00f5ff"); pg.addColorStop(1, "transparent");
      ctx.fillStyle = pg; ctx.fillRect(px - PW / 2, py - PH, PW, PH); ctx.restore();

      // Ball
      ctx.save();
      ctx.shadowColor = "#00f5ff"; ctx.shadowBlur = 20;
      const bg2 = ctx.createRadialGradient(bx - 2, by - 2, 1, bx, by, 6);
      bg2.addColorStop(0, "#fff"); bg2.addColorStop(0.5, "#88eeff"); bg2.addColorStop(1, "#0088cc");
      ctx.fillStyle = bg2; ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();

      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);
  return <canvas ref={ref} width={220} height={160} style={{ display: "block", width: "100%", height: "auto" }} />;
}

// ── Balls vs Bricks mini preview canvas ──────────────────────────────────────

function BVBPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const W = c.width, H = c.height;
    // Vivid palettes matching the updated game
    const pals = [
      { c: "#5a0080", g: "#ee44ff" },
      { c: "#8b0000", g: "#ff4455" },
      { c: "#003a8b", g: "#44aaff" },
      { c: "#005c20", g: "#33ff88" },
      { c: "#8b3a00", g: "#ff9922" },
    ];
    const COLS = 5, bw = (W - 16) / COLS - 3, bh = 20;
    const hps = [[20,20,20,20,20],[10,10,10,10,10],[8,8,8,8,8],[7,7,7,7,7],[15,15,15,15,15]];
    const alive = hps.map(r => r.map(() => true));
    type Ball = { x: number; y: number; vx: number; vy: number };
    const balls: Ball[] = [
      { x: W * 0.25, y: H - 12, vx: 1.6, vy: -3.8 },
      { x: W * 0.5,  y: H - 12, vx: 0.3, vy: -4.2 },
      { x: W * 0.75, y: H - 12, vx: -1.4, vy: -3.5 },
    ];

    const loop = () => {
      // Background
      ctx.fillStyle = "#04000f"; ctx.fillRect(0, 0, W, H);

      // Bricks — fill crisp (no shadowBlur), glow only on border
      for (let r = 0; r < 5; r++) for (let col = 0; col < COLS; col++) {
        if (!alive[r][col]) continue;
        const pal = pals[r % pals.length];
        const bx = 8 + col * (bw + 3), by = 8 + r * (bh + 4);
        ctx.save();
        // Step 1: crisp fill
        ctx.shadowBlur = 0;
        const gr = ctx.createLinearGradient(bx, by, bx, by + bh);
        gr.addColorStop(0, pal.g + "bb");
        gr.addColorStop(0.35, pal.c);
        gr.addColorStop(1, pal.c + "99");
        ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 3); ctx.fill();
        // Step 2: neon border glow
        ctx.shadowColor = pal.g; ctx.shadowBlur = 14;
        ctx.strokeStyle = pal.g; ctx.lineWidth = 1; ctx.stroke();
        // Step 3: shine
        ctx.shadowBlur = 0;
        ctx.save(); ctx.clip();
        const shine = ctx.createLinearGradient(bx, by, bx, by + bh * 0.5);
        shine.addColorStop(0, "rgba(255,255,255,0.38)"); shine.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = shine; ctx.fillRect(bx, by, bw, bh * 0.5); ctx.restore();
        // Step 4: HP label — crisp, no blur
        ctx.shadowBlur = 0; ctx.fillStyle = "#fff";
        ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(hps[r][col]), bx + bw / 2, by + bh / 2);
        ctx.restore();
      }

      // Balls
      for (const b of balls) {
        b.x += b.vx; b.y += b.vy;
        if (b.x < 6) { b.x = 6; b.vx = Math.abs(b.vx); }
        if (b.x > W - 6) { b.x = W - 6; b.vx = -Math.abs(b.vx); }
        if (b.y < 6) { b.y = 6; b.vy = Math.abs(b.vy); }
        if (b.y > H + 10) { b.x = 10 + Math.random() * (W - 20); b.y = H - 10; b.vx = (Math.random() - 0.5) * 3; b.vy = -4; }
        for (let r = 0; r < 5; r++) for (let col = 0; col < COLS; col++) {
          if (!alive[r][col]) continue;
          const bx = 8 + col * (bw + 3), by = 8 + r * (bh + 4);
          if (b.x + 5 > bx && b.x - 5 < bx + bw && b.y + 5 > by && b.y - 5 < by + bh) { alive[r][col] = false; b.vy = -b.vy; }
        }
        ctx.save();
        ctx.shadowColor = "#00eeff"; ctx.shadowBlur = 24;
        const bg2 = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, 5);
        bg2.addColorStop(0, "#fff"); bg2.addColorStop(0.4, "#aaeeff"); bg2.addColorStop(1, "#0088cc");
        ctx.fillStyle = bg2; ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      if (alive.every(r => r.every(v => !v))) { for (const r of alive) for (let i = 0; i < r.length; i++) r[i] = true; }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);
  return <canvas ref={ref} width={220} height={160} style={{ display: "block", width: "100%", height: "auto" }} />;
}

// ── Home ──────────────────────────────────────────────────────────────────────

export function Home({ onPlay }: Props) {
  const [hovered, setHovered] = useState<GameId | null>(null);

  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      display: "flex", flexDirection: "column",
      background: "#050014",
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      userSelect: "none",
    }}>
      {/* ── thin top bar ── */}
      <div style={{
        height: 44, flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "center", gap: 10,
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(0,0,0,0.25)",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00f5ff", boxShadow: "0 0 10px #00f5ff, 0 0 20px #00f5ff44", display: "block" }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.5em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
          Neon Arcade
        </span>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#cc44ff", boxShadow: "0 0 10px #cc44ff, 0 0 20px #cc44ff44", display: "block" }} />
      </div>

      {/* ── panels ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        <SidePanel
          id="block-breaker"
          num="01"
          titleLine1="Block"
          titleLine2="Breaker"
          tagline="100 levels · Power-ups · Combos"
          accent="#00f5ff"
          panelBg="linear-gradient(160deg, #030e1e 0%, #020b14 100%)"
          glowSide="right"
          isHovered={hovered === "block-breaker"}
          isOtherHovered={hovered !== null && hovered !== "block-breaker"}
          onHover={() => setHovered("block-breaker")}
          onLeave={() => setHovered(null)}
          onPlay={() => onPlay("block-breaker")}
        >
          <BBPreview />
        </SidePanel>

        {/* divider */}
        <div style={{
          width: 1, flexShrink: 0, position: "relative",
          background: "linear-gradient(to bottom, transparent 5%, rgba(0,245,255,0.3) 35%, rgba(204,68,255,0.3) 65%, transparent 95%)",
        }}>
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            width: 8, height: 8, borderRadius: "50%",
            background: "#8899cc",
            boxShadow: "0 0 16px #aaddff, 0 0 30px #aaddff44",
          }} />
        </div>

        <SidePanel
          id="balls-bricks"
          num="02"
          titleLine1="Balls vs"
          titleLine2="Bricks"
          tagline="Endless · Turn-based · Strategy"
          accent="#cc44ff"
          panelBg="linear-gradient(160deg, #0b0222 0%, #070118 100%)"
          glowSide="left"
          isHovered={hovered === "balls-bricks"}
          isOtherHovered={hovered !== null && hovered !== "balls-bricks"}
          onHover={() => setHovered("balls-bricks")}
          onLeave={() => setHovered(null)}
          onPlay={() => onPlay("balls-bricks")}
        >
          <BVBPreview />
        </SidePanel>

      </div>
    </div>
  );
}

// ── SidePanel ─────────────────────────────────────────────────────────────────

interface SidePanelProps {
  id: GameId;
  num: string;
  titleLine1: string;
  titleLine2: string;
  tagline: string;
  accent: string;
  panelBg: string;
  glowSide: "left" | "right";
  isHovered: boolean;
  isOtherHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onPlay: () => void;
  children: React.ReactNode;
}

function SidePanel({
  num, titleLine1, titleLine2, tagline,
  accent, panelBg, glowSide,
  isHovered, isOtherHovered,
  onHover, onLeave, onPlay,
  children,
}: SidePanelProps) {
  return (
    <div
      onClick={onPlay}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        flex: isHovered ? "1.18" : isOtherHovered ? "0.82" : "1",
        transition: "flex 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
        background: panelBg,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "clamp(18px, 3vh, 32px) clamp(20px, 4vw, 40px)",
        cursor: "pointer",
        overflow: "hidden",
      }}
    >
      {/* atmospheric radial glow — much stronger */}
      <div style={{
        position: "absolute",
        [glowSide]: "-60px",
        bottom: "-20px",
        width: "420px",
        height: "420px",
        borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}28 0%, ${accent}0a 45%, transparent 70%)`,
        opacity: isHovered ? 1 : 0.6,
        transition: "opacity 0.45s ease",
        pointerEvents: "none",
      }} />

      {/* top corner accent streak */}
      <div style={{
        position: "absolute",
        top: 0,
        [glowSide === "right" ? "left" : "right"]: 0,
        width: "60%",
        height: 1,
        background: `linear-gradient(${glowSide === "right" ? "to right" : "to left"}, ${accent}88, transparent)`,
        opacity: isHovered ? 1 : 0.4,
        transition: "opacity 0.45s",
        pointerEvents: "none",
      }} />

      {/* top section */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* number + line */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "clamp(12px, 2vh, 22px)" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", color: accent, opacity: 0.9, textShadow: `0 0 12px ${accent}` }}>
            {num}
          </span>
          <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${accent}77, transparent)` }} />
        </div>

        {/* preview */}
        <div style={{
          borderRadius: 12,
          overflow: "hidden",
          border: `1px solid ${accent}33`,
          background: "rgba(0,0,0,0.5)",
          maxWidth: 260,
          boxShadow: isHovered
            ? `0 0 40px ${accent}28, 0 0 0 1px ${accent}22, inset 0 1px 0 rgba(255,255,255,0.06)`
            : `0 0 16px ${accent}10, 0 0 0 1px ${accent}10`,
          transform: isHovered ? "scale(1.04)" : "scale(1)",
          transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), box-shadow 0.45s",
          transformOrigin: glowSide === "right" ? "left center" : "right center",
        }}>
          {children}
        </div>
      </div>

      {/* bottom section */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* ghost number watermark — slightly more visible */}
        <div style={{
          position: "absolute",
          right: -10, bottom: -20,
          fontSize: "clamp(80px, 12vw, 130px)",
          fontWeight: 900,
          color: accent,
          opacity: isHovered ? 0.09 : 0.04,
          transition: "opacity 0.45s",
          lineHeight: 1,
          letterSpacing: "-0.05em",
          pointerEvents: "none",
          userSelect: "none",
        }}>{num}</div>

        {/* tagline */}
        <p style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: accent,
          opacity: 0.75,
          marginBottom: 10,
          textShadow: `0 0 16px ${accent}66`,
        }}>
          {tagline}
        </p>

        {/* title */}
        <div style={{ marginBottom: "clamp(14px, 2.5vh, 22px)", lineHeight: 1.0 }}>
          <div style={{
            fontSize: "clamp(26px, 3.8vw, 54px)",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            color: "#ffffff",
            textShadow: "0 2px 20px rgba(0,0,0,0.5)",
          }}>
            {titleLine1}
          </div>
          <div style={{
            fontSize: "clamp(26px, 3.8vw, 54px)",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            color: accent,
            filter: `drop-shadow(0 0 22px ${accent}88)`,
          }}>
            {titleLine2}
          </div>
        </div>

        {/* play button */}
        <button
          onClick={e => { e.stopPropagation(); onPlay(); }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            padding: "10px 24px",
            borderRadius: 7,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: isHovered ? (accent === "#00f5ff" ? "#010c14" : "#080118") : "#ffffff",
            background: isHovered ? accent : "rgba(255,255,255,0.06)",
            border: `1.5px solid ${isHovered ? accent : "rgba(255,255,255,0.15)"}`,
            cursor: "pointer",
            transition: "all 0.25s ease",
            boxShadow: isHovered ? `0 0 28px ${accent}66, 0 0 60px ${accent}22` : "none",
          }}
        >
          <span>Play</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ opacity: 0.9 }}>
            <path d="M2 1.5l6 3.5-6 3.5V1.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
