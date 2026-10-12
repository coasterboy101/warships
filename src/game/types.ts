// Shared contract between the simulation (sim.ts) and the renderer (src/render, src/App.tsx).
//
// Conventions:
//  - World units are pixels at zoom 1. Origin top-left, +x right, +y DOWN (screen space).
//  - Angles are radians. 0 points along +x; positive angles rotate clockwise on screen.
//    A ship's forward vector is (cos(heading), sin(heading)).
//  - Time is in seconds.

export type Team = 'player' | 'enemy';

export interface Turret {
  /** Position along the ship's centreline, in world units from the ship centre (+ = toward bow). */
  along: number;
  /** Current barrel direction as a WORLD angle. */
  angle: number;
}

export interface Ship {
  id: number;
  team: Team;
  x: number;
  y: number;
  heading: number;
  /** Current speed along heading, world units / s. Negative when going astern. */
  speed: number;
  /** Ordered engine setting, THROTTLE_MIN..1. Speed eases toward throttle * maxSpeed. */
  throttle: number;
  /** Rudder order, -1 (port / counter-clockwise) .. 1 (starboard / clockwise). */
  rudder: number;
  maxSpeed: number;
  hp: number;
  maxHp: number;
  /** Hull length (along heading) and beam (across), world units. */
  length: number;
  beam: number;
  turrets: Turret[];
  /** World point the guns are trying to aim at. */
  aimX: number;
  aimY: number;
  /** Seconds until guns / torpedoes can fire again (0 = ready). */
  gunCooldown: number;
  torpCooldown: number;
  /** 0 while afloat. Once hp <= 0 this counts up in seconds; the ship is removed at SINK_TIME. */
  sinking: number;
  /** Sim-private timer for emitting wake effects. */
  wakeTimer: number;
}

export interface Shell {
  id: number;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds of flight remaining; at 0 the shell splashes harmlessly. */
  life: number;
}

export interface Torpedo {
  id: number;
  team: Team;
  x: number;
  y: number;
  heading: number;
  life: number;
}

export type EffectKind = 'splash' | 'hit' | 'explosion' | 'wake' | 'muzzle';

export interface Effect {
  id: number;
  kind: EffectKind;
  x: number;
  y: number;
  /** Seconds since spawn; removed when age >= ttl. */
  age: number;
  ttl: number;
}

export interface Island {
  x: number;
  y: number;
  r: number;
}

export type GameStatus = 'playing' | 'lost';

export interface World {
  width: number;
  height: number;
  time: number;
  status: GameStatus;
  /** Current wave number, starting at 1. Wave n spawns n enemies (capped). */
  wave: number;
  score: number;
  /** Seconds until the next wave spawns; only counts down while no enemies are afloat. */
  waveTimer: number;
  ships: Ship[];
  shells: Shell[];
  torpedoes: Torpedo[];
  effects: Effect[];
  islands: Island[];
  nextId: number;
}

/** Player intent for one simulation step. */
export interface Input {
  /** Held: raise / lower the throttle order. */
  throttleUp: boolean;
  throttleDown: boolean;
  /** -1 port, 0 midships, 1 starboard. */
  turn: -1 | 0 | 1;
  /** Aim point in WORLD coordinates. */
  aimX: number;
  aimY: number;
  fireGuns: boolean;
  fireTorpedoes: boolean;
}
