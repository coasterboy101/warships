import type { EffectKind, Input, Island, Ship, Team, World } from './types';
import {
  ACCEL,
  AI_AVOID_LOOKAHEAD,
  AI_ENGAGE_RANGE,
  EFFECT_TTL,
  ENEMY_HP,
  ENEMY_MAX_SPEED,
  GUN_RANGE,
  GUN_RELOAD_ENEMY,
  GUN_RELOAD_PLAYER,
  ISLAND_DAMAGE_PER_SEC,
  MAX_ENEMIES_PER_WAVE,
  MIN_STEERAGE,
  PLAYER_HP,
  PLAYER_MAX_SPEED,
  RAM_DAMAGE_PER_SEC,
  SCORE_PER_KILL,
  SHELL_DAMAGE,
  SHELL_SPEED,
  SHELL_SPREAD_ENEMY,
  SHELL_SPREAD_PLAYER,
  SHIP_BEAM,
  SHIP_LENGTH,
  SINK_TIME,
  THROTTLE_MIN,
  THROTTLE_RATE,
  TORP_DAMAGE,
  TORP_LIFE,
  TORP_RELOAD,
  TORP_SPEED,
  TORP_SPREAD_ANGLES,
  TURN_RATE,
  TURRET_FIRE_TOLERANCE,
  TURRET_MOUNTS,
  TURRET_TURN_RATE,
  WAKE_INTERVAL,
  WAVE_DELAY,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';

const TWO_PI = Math.PI * 2;
const AIM_AHEAD = 300;
const MUZZLE_OFFSET = 14;
const TORP_CLEARANCE = 12;
const EDGE_MARGIN = 100;
const EDGE_AVOID_MARGIN = 100;
const ISLAND_AVOID_MARGIN = 60;

const ISLANDS: Island[] = [
  { x: 600, y: 500, r: 110 },
  { x: 3300, y: 600, r: 140 },
  { x: 3400, y: 2300, r: 90 },
  { x: 600, y: 2400, r: 150 },
  { x: 1200, y: 1500, r: 80 },
  { x: 2600, y: 1000, r: 120 },
  { x: 2000, y: 2700, r: 100 },
];

let rng: () => number = Math.random;

/** Replace the random source (tests use a seeded generator). */
export function setRng(fn: () => number): void {
  rng = fn;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Normalise an angle into (-PI, PI]. */
function normAngle(a: number): number {
  let r = a % TWO_PI;
  if (r <= -Math.PI) r += TWO_PI;
  else if (r > Math.PI) r -= TWO_PI;
  return r;
}

/** Signed shortest difference a - b, in (-PI, PI]. */
function angleDiff(a: number, b: number): number {
  return normAngle(a - b);
}

/** True if (x, y) lies inside the ship's elliptical hull. */
export function pointInShip(ship: Ship, x: number, y: number): boolean {
  const dx = x - ship.x;
  const dy = y - ship.y;
  const c = Math.cos(ship.heading);
  const s = Math.sin(ship.heading);
  // Rotate the offset by -heading into the ship's local frame.
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  const a = ship.length / 2;
  const b = ship.beam / 2;
  return (lx * lx) / (a * a) + (ly * ly) / (b * b) <= 1;
}

function spawnEffect(world: World, kind: EffectKind, x: number, y: number): void {
  world.effects.push({ id: world.nextId++, kind, x, y, age: 0, ttl: EFFECT_TTL[kind] });
}

function makeShip(
  world: World,
  team: Team,
  x: number,
  y: number,
  heading: number,
  maxSpeed: number,
  hp: number,
): Ship {
  const aimDist = SHIP_LENGTH / 2 + AIM_AHEAD;
  return {
    id: world.nextId++,
    team,
    x,
    y,
    heading,
    speed: 0,
    throttle: 0,
    rudder: 0,
    maxSpeed,
    hp,
    maxHp: hp,
    length: SHIP_LENGTH,
    beam: SHIP_BEAM,
    turrets: TURRET_MOUNTS.map((along) => ({ along, angle: heading })),
    aimX: x + Math.cos(heading) * aimDist,
    aimY: y + Math.sin(heading) * aimDist,
    gunCooldown: 0,
    torpCooldown: 0,
    sinking: 0,
    wakeTimer: 0,
  };
}

/** Build a fresh world: player at the centre, islands placed, wave 1 pending. */
export function createWorld(): World {
  const world: World = {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    time: 0,
    status: 'playing',
    wave: 0,
    score: 0,
    waveTimer: 1,
    ships: [],
    shells: [],
    torpedoes: [],
    effects: [],
    islands: ISLANDS.map((i) => ({ ...i })),
    nextId: 1,
  };
  world.ships.push(
    makeShip(world, 'player', WORLD_WIDTH / 2, WORLD_HEIGHT / 2, -Math.PI / 2, PLAYER_MAX_SPEED, PLAYER_HP),
  );
  return world;
}

/** The player's ship, or undefined once it has been removed after sinking. */
export function getPlayer(world: World): Ship | undefined {
  return world.ships.find((s) => s.team === 'player');
}

/** Keep a ship centre inside the map. Returns true if it had to be moved. */
function clampPos(world: World, ship: Ship): boolean {
  const nx = clamp(ship.x, 0, world.width);
  const ny = clamp(ship.y, 0, world.height);
  const moved = nx !== ship.x || ny !== ship.y;
  ship.x = nx;
  ship.y = ny;
  return moved;
}

function fireGuns(world: World, ship: Ship): void {
  if (ship.gunCooldown > 0 || ship.sinking > 0) return;
  const isPlayer = ship.team === 'player';
  const spread = isPlayer ? SHELL_SPREAD_PLAYER : SHELL_SPREAD_ENEMY;
  const reload = isPlayer ? GUN_RELOAD_PLAYER : GUN_RELOAD_ENEMY;
  const c = Math.cos(ship.heading);
  const s = Math.sin(ship.heading);
  let fired = false;

  for (const t of ship.turrets) {
    const tx = ship.x + c * t.along;
    const ty = ship.y + s * t.along;
    const bearing = Math.atan2(ship.aimY - ty, ship.aimX - tx);
    if (Math.abs(angleDiff(t.angle, bearing)) > TURRET_FIRE_TOLERANCE) continue;

    const mx = tx + Math.cos(t.angle) * MUZZLE_OFFSET;
    const my = ty + Math.sin(t.angle) * MUZZLE_OFFSET;
    const dir = t.angle + (rng() * 2 - 1) * spread;
    const range = clamp(dist(mx, my, ship.aimX, ship.aimY), 120, GUN_RANGE);
    world.shells.push({
      id: world.nextId++,
      team: ship.team,
      x: mx,
      y: my,
      vx: Math.cos(dir) * SHELL_SPEED,
      vy: Math.sin(dir) * SHELL_SPEED,
      life: range / SHELL_SPEED,
    });
    spawnEffect(world, 'muzzle', mx, my);
    fired = true;
  }

  if (fired) ship.gunCooldown = reload;
}

function fireTorpedoes(world: World, ship: Ship): void {
  if (ship.torpCooldown > 0 || ship.sinking > 0) return;
  const base = Math.atan2(ship.aimY - ship.y, ship.aimX - ship.x);
  const off = ship.beam / 2 + TORP_CLEARANCE;
  const sx = ship.x + Math.cos(base) * off;
  const sy = ship.y + Math.sin(base) * off;
  for (const spread of TORP_SPREAD_ANGLES) {
    world.torpedoes.push({
      id: world.nextId++,
      team: ship.team,
      x: sx,
      y: sy,
      heading: base + spread,
      life: TORP_LIFE,
    });
  }
  ship.torpCooldown = TORP_RELOAD;
}

function spawnEnemy(world: World): void {
  const player = getPlayer(world);
  const cx = world.width / 2;
  const cy = world.height / 2;
  const m = EDGE_MARGIN;
  let x = cx;
  let y = cy;

  for (let attempt = 0; attempt < 20; attempt++) {
    const edge = Math.min(3, Math.floor(rng() * 4));
    if (edge === 0) {
      x = m + rng() * (world.width - 2 * m);
      y = m;
    } else if (edge === 1) {
      x = m + rng() * (world.width - 2 * m);
      y = world.height - m;
    } else if (edge === 2) {
      x = m;
      y = m + rng() * (world.height - 2 * m);
    } else {
      x = world.width - m;
      y = m + rng() * (world.height - 2 * m);
    }
    const nearIsland = world.islands.some((i) => dist(x, y, i.x, i.y) < 150 + i.r);
    const nearPlayer = player !== undefined && dist(x, y, player.x, player.y) < 700;
    if (!nearIsland && !nearPlayer) break;
  }

  const heading = Math.atan2(cy - y, cx - x);
  const ship = makeShip(world, 'enemy', x, y, heading, ENEMY_MAX_SPEED, ENEMY_HP);
  ship.throttle = 0.8;
  ship.speed = 0.5 * ENEMY_MAX_SPEED;
  ship.gunCooldown = rng() * GUN_RELOAD_ENEMY;
  ship.aimX = player ? player.x : cx;
  ship.aimY = player ? player.y : cy;
  world.ships.push(ship);
}

/** Advance the world in place by dt seconds. */
export function step(world: World, input: Input, dt: number): void {
  if (dt <= 0) return;
  world.time += dt;

  // 1. Player control.
  const player = getPlayer(world);
  const playerLive = player !== undefined && player.sinking === 0 && world.status === 'playing';
  if (player && playerLive) {
    const dthr = THROTTLE_RATE * dt;
    let thr = player.throttle;
    if (input.throttleUp) thr += dthr;
    if (input.throttleDown) thr -= dthr;
    player.throttle = clamp(thr, THROTTLE_MIN, 1);
    player.rudder = input.turn;
    player.aimX = input.aimX;
    player.aimY = input.aimY;
    if (input.fireGuns) fireGuns(world, player);
    if (input.fireTorpedoes) fireTorpedoes(world, player);
  }

  // 2. Enemy AI.
  for (const ship of world.ships) {
    if (ship.team !== 'enemy' || ship.sinking > 0) continue;
    if (!player || !playerLive) {
      ship.throttle = 0.3;
      ship.rudder = 0;
      continue;
    }

    const dx = player.x - ship.x;
    const dy = player.y - ship.y;
    const d = Math.hypot(dx, dy);
    const bearing = Math.atan2(dy, dx);

    let desired: number;
    if (d > AI_ENGAGE_RANGE * 1.2) {
      desired = bearing;
    } else if (d < AI_ENGAGE_RANGE * 0.6) {
      desired = bearing + Math.PI;
    } else {
      const a = bearing + Math.PI / 2;
      const b = bearing - Math.PI / 2;
      desired =
        Math.abs(angleDiff(a, ship.heading)) <= Math.abs(angleDiff(b, ship.heading)) ? a : b;
    }

    const lx = ship.x + Math.cos(ship.heading) * AI_AVOID_LOOKAHEAD;
    const ly = ship.y + Math.sin(ship.heading) * AI_AVOID_LOOKAHEAD;
    for (const isl of world.islands) {
      if (dist(lx, ly, isl.x, isl.y) < isl.r + ISLAND_AVOID_MARGIN) {
        desired = Math.atan2(ship.y - isl.y, ship.x - isl.x);
      }
    }
    const edgeM = EDGE_AVOID_MARGIN;
    if (lx < edgeM || lx > world.width - edgeM || ly < edgeM || ly > world.height - edgeM) {
      desired = Math.atan2(world.height / 2 - ship.y, world.width / 2 - ship.x);
    }

    ship.rudder = clamp(angleDiff(desired, ship.heading) * 2, -1, 1);
    ship.throttle = 0.8;

    const t = d / SHELL_SPEED;
    ship.aimX = player.x + Math.cos(player.heading) * player.speed * t;
    ship.aimY = player.y + Math.sin(player.heading) * player.speed * t;

    if (d <= GUN_RANGE) fireGuns(world, ship);
  }

  // 3. Ship movement, turrets, cooldowns, wake.
  for (const ship of world.ships) {
    if (ship.sinking > 0) {
      ship.throttle = 0;
      ship.rudder = 0;
    }

    ship.speed += (ship.throttle * ship.maxSpeed - ship.speed) * Math.min(1, ACCEL * dt);

    const steer = Math.max(MIN_STEERAGE, Math.abs(ship.speed) / ship.maxSpeed);
    const sign = ship.speed < 0 ? -1 : 1;
    ship.heading = normAngle(ship.heading + ship.rudder * TURN_RATE * dt * steer * sign);

    const c = Math.cos(ship.heading);
    const s = Math.sin(ship.heading);
    ship.x += c * ship.speed * dt;
    ship.y += s * ship.speed * dt;
    if (clampPos(world, ship)) ship.speed *= 0.5;

    if (ship.sinking === 0) {
      const maxStep = TURRET_TURN_RATE * dt;
      for (const t of ship.turrets) {
        const tx = ship.x + c * t.along;
        const ty = ship.y + s * t.along;
        const target = Math.atan2(ship.aimY - ty, ship.aimX - tx);
        const diff = angleDiff(target, t.angle);
        t.angle = normAngle(t.angle + clamp(diff, -maxStep, maxStep));
      }
    }

    ship.gunCooldown = Math.max(0, ship.gunCooldown - dt);
    ship.torpCooldown = Math.max(0, ship.torpCooldown - dt);

    if (Math.abs(ship.speed) > 15 && ship.sinking === 0) {
      ship.wakeTimer -= dt;
      if (ship.wakeTimer <= 0) {
        spawnEffect(world, 'wake', ship.x - c * ship.length / 2, ship.y - s * ship.length / 2);
        ship.wakeTimer = WAKE_INTERVAL;
      }
    }
  }

  // 4. Ship vs island collisions.
  for (const ship of world.ships) {
    for (const isl of world.islands) {
      const d = dist(ship.x, ship.y, isl.x, isl.y);
      const minD = isl.r + ship.beam;
      if (d < minD) {
        let nx = 1;
        let ny = 0;
        if (d > 1e-6) {
          nx = (ship.x - isl.x) / d;
          ny = (ship.y - isl.y) / d;
        }
        ship.x = isl.x + nx * minD;
        ship.y = isl.y + ny * minD;
        clampPos(world, ship);
        ship.speed *= Math.max(0, 1 - 4 * dt);
        if (ship.sinking === 0) ship.hp -= ISLAND_DAMAGE_PER_SEC * dt;
      }
    }
  }

  // 5. Ship vs ship ramming.
  const afloat = world.ships.filter((s) => s.sinking === 0);
  for (let i = 0; i < afloat.length; i++) {
    for (let j = i + 1; j < afloat.length; j++) {
      const a = afloat[i];
      const b = afloat[j];
      const d = dist(a.x, a.y, b.x, b.y);
      const need = (a.beam + b.beam) / 2 + 30;
      if (d < need) {
        let nx = 1;
        let ny = 0;
        if (d > 1e-6) {
          nx = (b.x - a.x) / d;
          ny = (b.y - a.y) / d;
        }
        const push = (need - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        clampPos(world, a);
        clampPos(world, b);
        a.hp -= RAM_DAMAGE_PER_SEC * dt;
        b.hp -= RAM_DAMAGE_PER_SEC * dt;
      }
    }
  }

  // 6. Shells.
  const deadShells = new Set<number>();
  for (const shell of world.shells) {
    shell.x += shell.vx * dt;
    shell.y += shell.vy * dt;
    shell.life -= dt;
    const target = world.ships.find(
      (s) => s.team !== shell.team && s.sinking === 0 && pointInShip(s, shell.x, shell.y),
    );
    if (target) {
      target.hp -= SHELL_DAMAGE;
      spawnEffect(world, 'hit', shell.x, shell.y);
      deadShells.add(shell.id);
    } else if (shell.life <= 0) {
      spawnEffect(world, 'splash', shell.x, shell.y);
      deadShells.add(shell.id);
    }
  }
  world.shells = world.shells.filter((s) => !deadShells.has(s.id));

  // 7. Torpedoes.
  const deadTorps = new Set<number>();
  for (const torp of world.torpedoes) {
    torp.x += Math.cos(torp.heading) * TORP_SPEED * dt;
    torp.y += Math.sin(torp.heading) * TORP_SPEED * dt;
    torp.life -= dt;
    const hit = world.ships.find(
      (s) => s.team !== torp.team && s.sinking === 0 && pointInShip(s, torp.x, torp.y),
    );
    if (hit) {
      hit.hp -= TORP_DAMAGE;
      spawnEffect(world, 'explosion', torp.x, torp.y);
      deadTorps.add(torp.id);
      continue;
    }
    if (world.islands.some((i) => dist(torp.x, torp.y, i.x, i.y) < i.r)) {
      spawnEffect(world, 'explosion', torp.x, torp.y);
      deadTorps.add(torp.id);
      continue;
    }
    const outside = torp.x < 0 || torp.x > world.width || torp.y < 0 || torp.y > world.height;
    if (torp.life <= 0 || outside) deadTorps.add(torp.id);
  }
  world.torpedoes = world.torpedoes.filter((t) => !deadTorps.has(t.id));

  // 8. Deaths and sinking.
  for (const ship of world.ships) {
    if (ship.sinking === 0) {
      if (ship.hp <= 0) {
        ship.hp = 0;
        ship.sinking = dt;
        spawnEffect(world, 'explosion', ship.x, ship.y);
        if (ship.team === 'enemy') {
          world.score += SCORE_PER_KILL;
        } else {
          world.status = 'lost';
        }
      }
    } else {
      ship.sinking += dt;
    }
  }
  world.ships = world.ships.filter((s) => s.sinking < SINK_TIME);

  // 9. Effects.
  for (const e of world.effects) e.age += dt;
  world.effects = world.effects.filter((e) => e.age < e.ttl);

  // 10. Waves.
  if (world.status === 'playing' && !world.ships.some((s) => s.team === 'enemy')) {
    world.waveTimer -= dt;
    if (world.waveTimer <= 0) {
      world.wave += 1;
      const count = Math.min(world.wave, MAX_ENEMIES_PER_WAVE);
      for (let i = 0; i < count; i++) spawnEnemy(world);
      world.waveTimer = WAVE_DELAY;
    }
  }
}
