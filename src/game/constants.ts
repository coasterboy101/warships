// All gameplay tunables live here so balance changes don't touch sim logic.

export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 3000;

// Ship handling
export const THROTTLE_MIN = -0.3;
export const THROTTLE_RATE = 0.8; // throttle units / s while key held
export const ACCEL = 0.6; // fraction of the speed error closed per second
export const TURN_RATE = 0.6; // rad / s at full rudder and full speed
export const MIN_STEERAGE = 0.15; // fraction of turn rate still available when stopped

export const PLAYER_MAX_SPEED = 120;
export const PLAYER_HP = 100;
export const ENEMY_MAX_SPEED = 95;
export const ENEMY_HP = 45;
export const SHIP_LENGTH = 110;
export const SHIP_BEAM = 22;
/** Turret mounts along the centreline, from the ship centre. */
export const TURRET_MOUNTS = [34, 14, -32];
export const TURRET_TURN_RATE = 1.6; // rad / s
/** A turret only fires when within this many radians of the bearing to the aim point. */
export const TURRET_FIRE_TOLERANCE = 0.12;

// Guns
export const SHELL_SPEED = 520;
export const GUN_RANGE = 900;
export const GUN_RELOAD_PLAYER = 1.6;
export const GUN_RELOAD_ENEMY = 3.2;
export const SHELL_DAMAGE = 6;
/** Random aim error in radians (uniform, +/-). */
export const SHELL_SPREAD_PLAYER = 0.02;
export const SHELL_SPREAD_ENEMY = 0.07;

// Torpedoes (player only): a spread launched toward the aim point
export const TORP_SPEED = 190;
export const TORP_LIFE = 9;
export const TORP_RELOAD = 8;
export const TORP_DAMAGE = 40;
export const TORP_SPREAD_ANGLES = [-0.09, 0, 0.09];

// Collisions
export const RAM_DAMAGE_PER_SEC = 12;
export const ISLAND_DAMAGE_PER_SEC = 8;

// Effects
export const SINK_TIME = 3;
export const WAKE_INTERVAL = 0.12;
export const EFFECT_TTL = {
  splash: 0.7,
  hit: 0.45,
  explosion: 1.1,
  wake: 2.4,
  muzzle: 0.12,
} as const;

// Waves
export const WAVE_DELAY = 4;
export const MAX_ENEMIES_PER_WAVE = 6;
export const SCORE_PER_KILL = 100;

// Enemy AI
export const AI_ENGAGE_RANGE = 650; // tries to hold roughly this distance, broadside on
export const AI_AVOID_LOOKAHEAD = 260;
