import { useEffect, useRef, useState } from "react";

type GameId = "block-breaker" | "balls-bricks";

interface Props {
  onPlay: (game: GameId) => void;
}

export function Home({ onPlay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const [hovered, setHovered] = useState<GameId | null>(null);

  // ── animated particle background ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    type Particle = { x: number; y: number; vx: number; vy: number; r: number; color: string; alpha: number; decay: number };

    const particles: Particle[] = [];
    const colors = ["#00f5ff", "#aa44ff", "#ff00cc", "#ffaa00", "#00ff88"];

    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 0.1 + Math.random() * 0.35;
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        r: 1 + Math.random() * 2.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 0.15 + Math.random() * 0.5,
        decay: 0,
      });
    }

    const ctx = canvas.getContext("2d")!;
    let t = 0;

    const loop = () => {
      t++;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Deep gradient background
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#050018");
      bg.addColorStop(0.5, "#0a0030");
      bg.addColorStop(1, "#080020");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Nebula blobs
      const blobs = [
        { cx: W * 0.15, cy: H * 0.2, color: "rgba(120,0,255,0.06)", r: Math.min(W, H) * 0.45 },
        { cx: W * 0.85, cy: H * 0.7, color: "rgba(0,180,255,0.05)", r: Math.min(W, H) * 0.4 },
        { cx: W * 0.5, cy: H * 0.5, color: "rgba(200,0,180,0.04)", r: Math.min(W, H) * 0.55 },
      ];
      for (const b of blobs) {
        const gr = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, b.r);
        gr.addColorStop(0, b.color);
        gr.addColorStop(1, "transparent");
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, W, H);
      }

      // Grid lines
      ctx.save();
      ctx.strokeStyle = "rgba(100,60,200,0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.restore();

      // Particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;

        const twinkle = 0.5 + 0.5 * Math.sin(t * 0.02 + p.alpha * 20);
        ctx.save();
        ctx.globalAlpha = p.alpha * twinkle;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* background canvas */}
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

      {/* content */}
      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px", boxSizing: "border-box" }}>

        {/* title */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <p style={{ fontSize: 11, letterSpacing: "0.5em", color: "rgba(0,245,255,0.5)", fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>
            NEON ARCADE
          </p>
          <h1 style={{
            fontSize: "clamp(38px, 8vw, 72px)",
            fontWeight: 900,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            background: "linear-gradient(135deg, #00f5ff 0%, #aa44ff 50%, #ff00cc 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 30px rgba(0,245,255,0.3))",
            marginBottom: 12,
          }}>
            Choose<br />Your Game
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em" }}>
            Two classics. Neon edition.
          </p>
        </div>

        {/* cards */}
        <div style={{ display: "flex", gap: 20, marginTop: 32, flexWrap: "wrap", justifyContent: "center", width: "100%", maxWidth: 780 }}>
          <GameCard
            id="block-breaker"
            title="Block Breaker"
            subtitle="CLASSIC PADDLE"
            description="Control a paddle, smash neon blocks, collect power-ups. Beat 50+ levels."
            icon="🏓"
            accent="#00f5ff"
            accentAlt="#0066ff"
            hovered={hovered === "block-breaker"}
            onHover={setHovered}
            onPlay={onPlay}
            badge="50+ Levels"
            tags={["Paddle", "Power-ups", "Combos"]}
          />
          <GameCard
            id="balls-bricks"
            title="Balls vs Bricks"
            subtitle="TURN BASED"
            description="Aim and shoot multiple balls to smash numbered bricks before they reach you."
            icon="🎱"
            accent="#e040fb"
            accentAlt="#6200ea"
            hovered={hovered === "balls-bricks"}
            onHover={setHovered}
            onPlay={onPlay}
            badge="New!"
            tags={["Strategy", "Chain shots", "Endless"]}
          />
        </div>

        {/* footer hint */}
        <p style={{ position: "absolute", bottom: 18, fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,0.15)", textTransform: "uppercase" }}>
          Click a game to start playing
        </p>
      </div>
    </div>
  );
}

// ── Game Card ──────────────────────────────────────────────────────────────────

interface CardProps {
  id: GameId;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  accent: string;
  accentAlt: string;
  hovered: boolean;
  onHover: (id: GameId | null) => void;
  onPlay: (id: GameId) => void;
  badge: string;
  tags: string[];
}

function GameCard({ id, title, subtitle, description, icon, accent, accentAlt, hovered, onHover, onPlay, badge, tags }: CardProps) {
  return (
    <div
      onClick={() => onPlay(id)}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      style={{
        flex: "1 1 300px",
        maxWidth: 360,
        minWidth: 260,
        padding: "32px 28px",
        borderRadius: 20,
        background: hovered
          ? `linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)`
          : "rgba(255,255,255,0.025)",
        border: `1.5px solid ${hovered ? accent + "66" : "rgba(255,255,255,0.08)"}`,
        boxShadow: hovered
          ? `0 0 60px ${accent}22, 0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`
          : "0 4px 24px rgba(0,0,0,0.4)",
        cursor: "pointer",
        transition: "all 0.25s ease",
        transform: hovered ? "translateY(-6px) scale(1.01)" : "translateY(0) scale(1)",
        backdropFilter: "blur(12px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* glow blob behind card on hover */}
      {hovered && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 20, pointerEvents: "none",
          background: `radial-gradient(circle at 50% 0%, ${accent}18 0%, transparent 70%)`,
        }} />
      )}

      {/* badge */}
      <div style={{
        position: "absolute", top: 16, right: 16,
        background: `linear-gradient(135deg, ${accent}, ${accentAlt})`,
        color: "#fff",
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: 99,
        boxShadow: `0 0 12px ${accent}66`,
      }}>
        {badge}
      </div>

      {/* icon */}
      <div style={{
        width: 58, height: 58, borderRadius: 16,
        background: `linear-gradient(135deg, ${accent}22, ${accentAlt}22)`,
        border: `1.5px solid ${accent}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, marginBottom: 20,
        boxShadow: `0 0 20px ${accent}22`,
        transition: "transform 0.2s",
        transform: hovered ? "scale(1.1) rotate(-3deg)" : "scale(1) rotate(0deg)",
      }}>
        {icon}
      </div>

      {/* title */}
      <p style={{ fontSize: 10, letterSpacing: "0.35em", color: accent + "bb", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
        {subtitle}
      </p>
      <h2 style={{ fontSize: 24, fontWeight: 900, color: "#fff", letterSpacing: "-0.01em", marginBottom: 12 }}>
        {title}
      </h2>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: 20 }}>
        {description}
      </p>

      {/* tags */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
        {tags.map(tag => (
          <span key={tag} style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
            padding: "3px 8px", borderRadius: 99,
            background: `${accent}15`,
            border: `1px solid ${accent}33`,
            color: accent + "cc",
          }}>
            {tag}
          </span>
        ))}
      </div>

      {/* play button */}
      <button
        onClick={e => { e.stopPropagation(); onPlay(id); }}
        style={{
          width: "100%",
          padding: "13px 0",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: hovered ? "#000" : "#fff",
          background: hovered
            ? `linear-gradient(135deg, ${accent}, ${accentAlt})`
            : `linear-gradient(135deg, ${accent}22, ${accentAlt}22)`,
          border: `1.5px solid ${accent}55`,
          cursor: "pointer",
          transition: "all 0.2s",
          boxShadow: hovered ? `0 0 24px ${accent}55` : "none",
        }}
      >
        {hovered ? "▶  Play Now" : "Play"}
      </button>
    </div>
  );
}
