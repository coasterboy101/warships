import type { GameStatus } from '../game/types';

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  speed: number;
  maxSpeed: number;
  throttle: number;
  /** 0..1 */
  gunReady: number;
  /** 0..1 */
  torpReady: number;
  wave: number;
  score: number;
  enemies: number;
  status: GameStatus;
  minimap: {
    w: number;
    h: number;
    player?: { x: number; y: number };
    enemies: { x: number; y: number }[];
    islands: { x: number; y: number; r: number }[];
  };
}

interface HudProps {
  snapshot: HudSnapshot;
  onRestart: () => void;
}

function Bar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`hud-bar ${className ?? ''}`}>
      <div className="hud-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Minimap({ m }: { m: HudSnapshot['minimap'] }) {
  const dot = m.w * 0.015;
  return (
    <svg
      className="hud-minimap"
      viewBox={`0 0 ${m.w} ${m.h}`}
      width={180}
      height={Math.round((180 * m.h) / m.w)}
      aria-label="Minimap"
    >
      <rect x={0} y={0} width={m.w} height={m.h} fill="#0a3046" stroke="#2f7fa8" strokeWidth={m.h * 0.01} />
      {m.islands.map((i, k) => (
        <circle key={k} cx={i.x} cy={i.y} r={i.r} fill="#d9c27a" />
      ))}
      {m.enemies.map((e, k) => (
        <circle key={k} cx={e.x} cy={e.y} r={dot} fill="#ff5a5a" />
      ))}
      {m.player && <circle cx={m.player.x} cy={m.player.y} r={dot * 1.3} fill="#ffffff" />}
    </svg>
  );
}

export function Hud({ snapshot: s, onRestart }: HudProps) {
  const knots = Math.round(s.speed / 4);
  const throttlePct = Math.round(s.throttle * 100);
  return (
    <div className="hud">
      <div className="hud-panel hud-topleft">
        <div className="hud-row">
          <span className="hud-label">Hull</span>
          <span className="hud-value">
            {Math.max(0, Math.round(s.hp))} / {s.maxHp}
          </span>
        </div>
        <Bar value={s.maxHp > 0 ? s.hp / s.maxHp : 0} className="hud-bar-hull" />
        <div className="hud-row">
          <span className="hud-label">Speed</span>
          <span className="hud-value">
            {knots} kn · throttle {throttlePct}%
          </span>
        </div>
        <Bar value={s.maxSpeed > 0 ? Math.abs(s.speed) / s.maxSpeed : 0} className="hud-bar-speed" />
        <div className="hud-row">
          <span className="hud-label">Guns</span>
          <span className="hud-value">{s.gunReady >= 1 ? 'READY' : 'reloading'}</span>
        </div>
        <Bar value={s.gunReady} className="hud-bar-gun" />
        <div className="hud-row">
          <span className="hud-label">Torpedoes</span>
          <span className="hud-value">{s.torpReady >= 1 ? 'READY' : 'reloading'}</span>
        </div>
        <Bar value={s.torpReady} className="hud-bar-torp" />
      </div>

      <div className="hud-panel hud-topright">
        <div className="hud-row">
          <span className="hud-label">Wave</span>
          <span className="hud-value">{s.wave}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">Score</span>
          <span className="hud-value">{s.score}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">Enemies afloat</span>
          <span className="hud-value">{s.enemies}</span>
        </div>
      </div>

      <div className="hud-bottomright">
        <Minimap m={s.minimap} />
      </div>

      <div className="hud-bottomleft hud-legend">
        W/S throttle · A/D rudder · Mouse aim · LMB guns · Space torpedoes
      </div>

      {s.status === 'lost' && (
        <div className="hud-overlay">
          <div className="hud-lost">
            <h1>SHIP LOST</h1>
            <p>
              Final score {s.score} · wave {s.wave}
            </p>
            <button type="button" className="hud-restart" onClick={onRestart}>
              New battle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
