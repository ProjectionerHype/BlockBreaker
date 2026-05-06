import { useState } from "react";
import { Home } from "./pages/Home";
import { BlockBreaker } from "./game/BlockBreaker";
import { BallsBricks } from "./game/BallsBricks";

type Screen = "home" | "block-breaker" | "balls-bricks";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");

  if (screen === "block-breaker") {
    return (
      <div style={{ width: "100vw", height: "100vh", background: "#0a0020", position: "relative" }}>
        <button
          onClick={() => setScreen("home")}
          style={{
            position: "absolute", top: 12, left: 14, zIndex: 100,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8, cursor: "pointer",
            padding: "5px 10px", fontSize: 11,
            color: "rgba(255,255,255,0.45)",
            letterSpacing: "0.08em",
          }}
        >
          ← HOME
        </button>
        <BlockBreaker />
      </div>
    );
  }

  if (screen === "balls-bricks") {
    return (
      <div style={{ width: "100vw", height: "100vh" }}>
        <BallsBricks onHome={() => setScreen("home")} />
      </div>
    );
  }

  return <Home onPlay={(game) => setScreen(game)} />;
}
