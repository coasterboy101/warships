// Pure drawing helpers. Each takes a pixi Graphics and world data and rebuilds its
// contents (clear first, then shape-then-fill/stroke). No React, no state.
import type { Graphics } from 'pixi.js';
import type { Effect, Island, Ship, Shell, Torpedo } from '../game/types';
import { GUN_RANGE, SINK_TIME } from '../game/constants';

const GRID_STEP = 200;
const WATER = 0x0a3046;
const WATER_GRID = 0x1b5878;
const WATER_BORDER = 0x2f7fa8;
const SAND = 0xd9c27a;
const GRASS = 0x4f8a3c;
const PLAYER_HULL = 0xc9d3da;
const ENEMY_HULL = 0x9c3b3b;
const TURRET_DARK = 0x222a30;
const WHITE = 0xffffff;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function darken(c: number, f: number): number {
  const r = Math.round(((c >> 16) & 0xff) * f);
  const g = Math.round(((c >> 8) & 0xff) * f);
  const b = Math.round((c & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

/** Transform a ship-local point (+x bow, +y starboard) to world coordinates. */
function toWorld(s: Ship, lx: number, ly: number): number[] {
  const c = Math.cos(s.heading);
  const sn = Math.sin(s.heading);
  return [s.x + lx * c - ly * sn, s.y + lx * sn + ly * c];
}

/** Static: water, grid and world border. Drawn once. */
export function drawWater(g: Graphics, w: number, h: number): void {
  g.clear();
  g.rect(0, 0, w, h).fill(WATER);
  for (let x = 0; x <= w; x += GRID_STEP) g.moveTo(x, 0).lineTo(x, h);
  for (let y = 0; y <= h; y += GRID_STEP) g.moveTo(0, y).lineTo(w, y);
  g.stroke({ width: 1, color: WATER_GRID, alpha: 0.6 });
  g.rect(0, 0, w, h).stroke({ width: 4, color: WATER_BORDER, alpha: 0.9 });
}

export function drawIslands(g: Graphics, islands: Island[]): void {
  g.clear();
  for (const i of islands) {
    g.circle(i.x, i.y, i.r).fill(SAND);
    g.circle(i.x, i.y, i.r * 0.8).fill(GRASS);
  }
}

export function drawEffects(g: Graphics, effects: Effect[]): void {
  g.clear();
  for (const e of effects) {
    const t = clamp01(e.age / e.ttl);
    const fade = 1 - t;
    switch (e.kind) {
      case 'wake':
        g.circle(e.x, e.y, 4 + 10 * t).fill({ color: WHITE, alpha: 0.35 * fade });
        break;
      case 'splash':
        g.circle(e.x, e.y, 4 + 14 * t).stroke({ width: 2, color: WHITE, alpha: 0.8 * fade });
        break;
      case 'hit':
        g.circle(e.x, e.y, 10).fill({ color: 0xffb030, alpha: fade });
        break;
      case 'explosion': {
        const r = 8 + 37 * t;
        g.circle(e.x, e.y, r).fill({ color: 0xff7a1a, alpha: fade });
        g.circle(e.x, e.y, r * 0.45).fill({ color: 0xffe066, alpha: fade });
        break;
      }
      case 'muzzle':
        g.circle(e.x, e.y, 7).fill({ color: 0xfff080, alpha: fade });
        break;
    }
  }
}

export function drawTorpedoes(g: Graphics, torps: Torpedo[]): void {
  g.clear();
  const color = 0xdfeff7;
  for (const t of torps) {
    const dx = Math.cos(t.heading);
    const dy = Math.sin(t.heading);
    g.moveTo(t.x - dx * 8, t.y - dy * 8)
      .lineTo(t.x + dx * 8, t.y + dy * 8)
      .stroke({ width: 2, color, alpha: 0.95 });
    g.circle(t.x - dx * 12, t.y - dy * 12, 2).fill({ color, alpha: 0.3 });
  }
}

export function drawShips(g: Graphics, ships: Ship[]): void {
  g.clear();
  for (const s of ships) {
    const alpha = s.sinking > 0 ? clamp01(1 - s.sinking / SINK_TIME) : 1;
    if (alpha <= 0) continue;

    const isPlayer = s.team === 'player';
    const hull = isPlayer ? PLAYER_HULL : ENEMY_HULL;
    const deck = darken(hull, 0.6);
    const outline = darken(hull, 0.5);
    const hl = s.length / 2;
    const hb = s.beam / 2;

    // Hull: pointed bow at +hl, flat stern at -hl.
    const hullPts = [
      [hl, 0],
      [hl * 0.6, hb],
      [-hl, hb],
      [-hl, -hb],
      [hl * 0.6, -hb],
    ].flatMap(([x, y]) => toWorld(s, x, y));
    g.poly(hullPts, true).fill({ color: hull, alpha });
    g.poly(hullPts, true).stroke({ width: 1, color: outline, alpha });

    // Darker deck stripe along the centreline.
    const deckPts = [
      [-hl * 0.7, -hb * 0.25],
      [hl * 0.2, -hb * 0.25],
      [hl * 0.2, hb * 0.25],
      [-hl * 0.7, hb * 0.25],
    ].flatMap(([x, y]) => toWorld(s, x, y));
    g.poly(deckPts, true).fill({ color: deck, alpha });

    // Turrets: a disc at the mount plus a barrel along the world angle.
    for (const t of s.turrets) {
      const [tx, ty] = toWorld(s, t.along, 0);
      g.circle(tx, ty, 6).fill({ color: darken(hull, 0.35), alpha });
      const ex = tx + Math.cos(t.angle) * 14;
      const ey = ty + Math.sin(t.angle) * 14;
      g.moveTo(tx, ty).lineTo(ex, ey).stroke({ width: 3, color: TURRET_DARK, alpha });
    }

    // Enemy hp bar, 30 units above the ship in screen-up direction.
    if (!isPlayer && s.sinking === 0) {
      const frac = clamp01(s.hp / s.maxHp);
      const x = s.x - 20;
      const y = s.y - 30 - 2;
      const barColor = frac > 0.5 ? 0x5fd068 : frac > 0.25 ? 0xe0b040 : 0xe05050;
      g.rect(x, y, 40, 4).fill({ color: 0x000000, alpha: 0.6 });
      if (frac > 0) g.rect(x, y, 40 * frac, 4).fill({ color: barColor, alpha: 0.95 });
    }
  }
}

export function drawShells(g: Graphics, shells: Shell[]): void {
  g.clear();
  for (const sh of shells) {
    const color = sh.team === 'player' ? 0xfff4c2 : 0xff9a8a;
    const speed = Math.hypot(sh.vx, sh.vy) || 1;
    const tail = 10;
    const tx = sh.x - (sh.vx / speed) * tail;
    const ty = sh.y - (sh.vy / speed) * tail;
    g.moveTo(tx, ty).lineTo(sh.x, sh.y).stroke({ width: 1.5, color, alpha: 0.5 });
    g.circle(sh.x, sh.y, 2.5).fill({ color, alpha: 1 });
  }
}

/** Aim reticle at (aimX, aimY), gun-range ring and a line from the player to the aim point. */
export function drawAim(g: Graphics, player: Ship | undefined, aimX: number, aimY: number): void {
  g.clear();
  if (player) {
    g.circle(player.x, player.y, GUN_RANGE).stroke({ width: 1, color: WHITE, alpha: 0.08 });
    const dx = aimX - player.x;
    const dy = aimY - player.y;
    const d = Math.hypot(dx, dy);
    const k = d > GUN_RANGE && d > 0 ? GUN_RANGE / d : 1;
    g.moveTo(player.x, player.y)
      .lineTo(player.x + dx * k, player.y + dy * k)
      .stroke({ width: 1, color: WHITE, alpha: 0.25 });
  }
  g.circle(aimX, aimY, 10).stroke({ width: 1.5, color: WHITE, alpha: 0.9 });
  g.moveTo(aimX - 14, aimY)
    .lineTo(aimX + 14, aimY)
    .moveTo(aimX, aimY - 14)
    .lineTo(aimX, aimY + 14)
    .stroke({ width: 1.5, color: WHITE, alpha: 0.9 });
}
