import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld, getPlayer, pointInShip, setRng, step } from './sim';
import type { Input, Ship, World } from './types';
import {
  ENEMY_HP,
  ENEMY_MAX_SPEED,
  GUN_RELOAD_PLAYER,
  PLAYER_MAX_SPEED,
  SCORE_PER_KILL,
  SHELL_DAMAGE,
  SHIP_BEAM,
  SHIP_LENGTH,
  SINK_TIME,
  TORP_DAMAGE,
  TORP_LIFE,
  TORP_SPREAD_ANGLES,
  TURRET_MOUNTS,
} from './constants';

const DT = 1 / 60;

/** Small deterministic PRNG (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Neutral input, aimed 300 units ahead of the bow of the player. */
function noInput(world: World): Input {
  const p = getPlayer(world);
  let aimX = world.width / 2;
  let aimY = world.height / 2 - 300;
  if (p) {
    const d = SHIP_LENGTH / 2 + 300;
    aimX = p.x + Math.cos(p.heading) * d;
    aimY = p.y + Math.sin(p.heading) * d;
  }
  return {
    throttleUp: false,
    throttleDown: false,
    turn: 0,
    aimX,
    aimY,
    fireGuns: false,
    fireTorpedoes: false,
  };
}

/** Add an enemy hull directly to the world (no AI-spawn bookkeeping). */
function addEnemy(world: World, x: number, y: number, heading = 0): Ship {
  const ship: Ship = {
    id: world.nextId++,
    team: 'enemy',
    x,
    y,
    heading,
    speed: 0,
    throttle: 0,
    rudder: 0,
    maxSpeed: ENEMY_MAX_SPEED,
    hp: ENEMY_HP,
    maxHp: ENEMY_HP,
    length: SHIP_LENGTH,
    beam: SHIP_BEAM,
    turrets: TURRET_MOUNTS.map((along) => ({ along, angle: heading })),
    aimX: x,
    aimY: y,
    gunCooldown: 0,
    torpCooldown: 0,
    sinking: 0,
    wakeTimer: 0,
  };
  world.ships.push(ship);
  return ship;
}

beforeEach(() => {
  setRng(seeded(12345));
});

describe('createWorld', () => {
  it('has one player, seven islands, none overlapping the player', () => {
    const world = createWorld();
    expect(world.ships.filter((s) => s.team === 'player')).toHaveLength(1);
    expect(world.islands).toHaveLength(7);
    const p = getPlayer(world)!;
    for (const isl of world.islands) {
      expect(Math.hypot(isl.x - p.x, isl.y - p.y)).toBeGreaterThan(isl.r + p.beam);
    }
  });
});

describe('pointInShip', () => {
  it('respects the ship heading', () => {
    const world = createWorld();
    const s = addEnemy(world, 500, 500, 0);
    expect(pointInShip(s, 550, 500)).toBe(true);
    expect(pointInShip(s, 500, 550)).toBe(false);
    s.heading = Math.PI / 2;
    expect(pointInShip(s, 500, 550)).toBe(true);
    expect(pointInShip(s, 550, 500)).toBe(false);
  });
});

describe('player movement', () => {
  it('accelerates toward max speed and moves up-screen when throttle is held', () => {
    const world = createWorld();
    const p = getPlayer(world)!;
    const y0 = p.y;
    for (let i = 0; i < 600; i++) {
      step(world, { ...noInput(world), throttleUp: true }, DT);
    }
    expect(p.speed).toBeGreaterThan(0.8 * PLAYER_MAX_SPEED);
    expect(p.y).toBeLessThan(y0);
  });

  it('turns clockwise (heading increases) with full starboard rudder', () => {
    const world = createWorld();
    const p = getPlayer(world)!;
    const h0 = p.heading;
    for (let i = 0; i < 180; i++) {
      step(world, { ...noInput(world), throttleUp: true, turn: 1 }, DT);
    }
    expect(p.heading).toBeGreaterThan(h0 + 0.5);
  });
});

describe('waves', () => {
  it('spawns exactly one enemy after about one second', () => {
    const world = createWorld();
    let steps = 0;
    while (world.wave === 0 && steps < 200) {
      step(world, noInput(world), DT);
      steps++;
    }
    expect(world.wave).toBe(1);
    expect(world.ships.filter((s) => s.team === 'enemy')).toHaveLength(1);
    expect(world.time).toBeGreaterThan(0.95);
    expect(world.time).toBeLessThan(1.1);
  });
});

describe('guns', () => {
  it('fires one shell per turret when on target and starts the cooldown', () => {
    const world = createWorld();
    const p = getPlayer(world)!;
    step(world, { ...noInput(world), fireGuns: true }, DT);
    expect(world.shells).toHaveLength(TURRET_MOUNTS.length);
    expect(p.gunCooldown).toBeGreaterThan(0);
    expect(p.gunCooldown).toBeLessThanOrEqual(GUN_RELOAD_PLAYER);
  });

  it('does not fire again while reloading', () => {
    const world = createWorld();
    step(world, { ...noInput(world), fireGuns: true }, DT);
    const before = world.shells.length;
    step(world, { ...noInput(world), fireGuns: true }, DT);
    expect(world.shells.length).toBe(before);
  });

  it('a player shell inside an enemy hull damages it and is removed with a hit effect', () => {
    const world = createWorld();
    const enemy = addEnemy(world, 3000, 2200);
    world.shells.push({ id: world.nextId++, team: 'player', x: enemy.x, y: enemy.y, vx: 0, vy: 0, life: 5 });
    step(world, noInput(world), DT);
    expect(enemy.hp).toBe(ENEMY_HP - SHELL_DAMAGE);
    expect(world.shells).toHaveLength(0);
    expect(world.effects.some((e) => e.kind === 'hit')).toBe(true);
  });
});

describe('kills and sinking', () => {
  it('awards score, sinks, then removes the enemy after SINK_TIME', () => {
    const world = createWorld();
    const enemy = addEnemy(world, 3000, 2200);
    enemy.hp = 0;
    step(world, noInput(world), DT);
    expect(world.score).toBe(SCORE_PER_KILL);
    expect(enemy.sinking).toBeGreaterThan(0);
    expect(world.ships.includes(enemy)).toBe(true);

    const steps = Math.ceil(SINK_TIME * 60) + 5;
    for (let i = 0; i < steps; i++) step(world, noInput(world), DT);
    expect(world.ships.includes(enemy)).toBe(false);
    expect(world.score).toBe(SCORE_PER_KILL);
  });

  it('sets status to lost when the player reaches 0 hp', () => {
    const world = createWorld();
    getPlayer(world)!.hp = 0;
    step(world, noInput(world), DT);
    expect(world.status).toBe('lost');
  });
});

describe('torpedoes', () => {
  it('launches a spread of torpedoes', () => {
    const world = createWorld();
    step(world, { ...noInput(world), fireTorpedoes: true }, DT);
    expect(world.torpedoes).toHaveLength(TORP_SPREAD_ANGLES.length);
    for (const t of world.torpedoes) expect(t.life).toBeLessThanOrEqual(TORP_LIFE);
  });

  it('a torpedo inside an enemy does TORP_DAMAGE', () => {
    const world = createWorld();
    const enemy = addEnemy(world, 3000, 2200);
    world.torpedoes.push({ id: world.nextId++, team: 'player', x: enemy.x, y: enemy.y, heading: 0, life: 5 });
    step(world, noInput(world), DT);
    expect(enemy.hp).toBe(ENEMY_HP - TORP_DAMAGE);
    expect(world.torpedoes).toHaveLength(0);
  });
});

describe('soak', () => {
  it('60 s of held fire never produces NaN and keeps ships in bounds', () => {
    const world = createWorld();
    for (let i = 0; i < 3600; i++) {
      const input = { ...noInput(world), fireGuns: true };
      const p = getPlayer(world);
      const enemies = world.ships.filter((s) => s.team === 'enemy');
      if (p && enemies.length > 0) {
        const nearest = enemies.reduce((a, b) =>
          Math.hypot(a.x - p.x, a.y - p.y) <= Math.hypot(b.x - p.x, b.y - p.y) ? a : b,
        );
        input.aimX = nearest.x;
        input.aimY = nearest.y;
      }
      step(world, input, DT);
      for (const s of world.ships) {
        expect(Number.isFinite(s.x)).toBe(true);
        expect(Number.isFinite(s.y)).toBe(true);
        expect(Number.isFinite(s.heading)).toBe(true);
        expect(Number.isFinite(s.speed)).toBe(true);
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(world.width);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(world.height);
      }
    }
    expect(world.wave).toBeGreaterThanOrEqual(1);
  });
});
