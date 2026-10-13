import { useRef, type RefObject } from 'react';
import { extend, useApplication, useTick } from '@pixi/react';
import { Container, Graphics } from 'pixi.js';
import type { Input, Ship, World } from '../game/types';
import { getPlayer, step } from '../game/sim';
import {
  GUN_RELOAD_PLAYER,
  PLAYER_HP,
  PLAYER_MAX_SPEED,
  TORP_RELOAD,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../game/constants';
import { useInput } from './useInput';
import type { HudSnapshot } from './Hud';
import * as draw from './draw';

extend({ Container, Graphics });

const HUD_INTERVAL = 0.1;

export interface GameSceneProps {
  worldRef: RefObject<World>;
  onHud: (snapshot: HudSnapshot) => void;
}

/** Camera offset along one axis: centre on target, clamp inside the world, centre if world is smaller. */
function clampCamera(target: number, worldSize: number, screenSize: number): number {
  if (worldSize <= screenSize) return (worldSize - screenSize) / 2;
  return Math.min(Math.max(target, 0), worldSize - screenSize);
}

function snapshotOf(world: World): HudSnapshot {
  const player = getPlayer(world);
  const enemies = world.ships.filter((s: Ship) => s.team === 'enemy' && s.sinking === 0);
  return {
    hp: player ? player.hp : 0,
    maxHp: player ? player.maxHp : PLAYER_HP,
    speed: player ? player.speed : 0,
    maxSpeed: player ? player.maxSpeed : PLAYER_MAX_SPEED,
    throttle: player ? player.throttle : 0,
    gunReady: player ? draw.clamp01(1 - player.gunCooldown / GUN_RELOAD_PLAYER) : 0,
    torpReady: player ? draw.clamp01(1 - player.torpCooldown / TORP_RELOAD) : 0,
    wave: world.wave,
    score: world.score,
    enemies: enemies.length,
    status: world.status,
    minimap: {
      w: world.width,
      h: world.height,
      player: player ? { x: player.x, y: player.y } : undefined,
      enemies: enemies.map((e) => ({ x: e.x, y: e.y })),
      islands: world.islands.map((i) => ({ x: i.x, y: i.y, r: i.r })),
    },
  };
}

// Static water layer: drawn once by the draw prop (stable function, so it is not re-run).
const drawWaterLayer = (g: Graphics) => draw.drawWater(g, WORLD_WIDTH, WORLD_HEIGHT);
const noop = () => {};

export function GameScene({ worldRef, onHud }: GameSceneProps) {
  const { app } = useApplication();
  const input = useInput();

  const cameraRef = useRef<Container>(null);
  const islandsRef = useRef<Graphics>(null);
  const effectsRef = useRef<Graphics>(null);
  const torpsRef = useRef<Graphics>(null);
  const shipsRef = useRef<Graphics>(null);
  const shellsRef = useRef<Graphics>(null);
  const aimRef = useRef<Graphics>(null);

  // Last applied camera offset (world point at the top-left of the screen).
  const camRef = useRef({ x: 0, y: 0 });
  // Start at the interval so the HUD appears on the first frame.
  const hudAccRef = useRef(HUD_INTERVAL);

  useTick((ticker) => {
    const world = worldRef.current;
    const islands = islandsRef.current;
    const effects = effectsRef.current;
    const torps = torpsRef.current;
    const ships = shipsRef.current;
    const shells = shellsRef.current;
    const aim = aimRef.current;
    const camera = cameraRef.current;
    if (!world || !islands || !effects || !torps || !ships || !shells || !aim || !camera) return;

    const dt = ticker.deltaMS / 1000;
    const simDt = Math.min(dt, 0.05);
    const pad = input.current;
    const cam = camRef.current;

    // Screen -> world uses the camera from the previous frame (one frame of lag is invisible).
    const canvasRect = app.canvas.getBoundingClientRect();
    const mouseWorldX = pad.mouseX - canvasRect.left + cam.x;
    const mouseWorldY = pad.mouseY - canvasRect.top + cam.y;

    const keys = pad.keys;
    const left = keys.has('KeyA') || keys.has('ArrowLeft');
    const right = keys.has('KeyD') || keys.has('ArrowRight');
    const inputState: Input = {
      throttleUp: keys.has('KeyW') || keys.has('ArrowUp'),
      throttleDown: keys.has('KeyS') || keys.has('ArrowDown'),
      turn: left && !right ? -1 : right && !left ? 1 : 0,
      aimX: mouseWorldX,
      aimY: mouseWorldY,
      fireGuns: pad.mouseDown,
      fireTorpedoes: keys.has('Space'),
    };

    step(world, inputState, simDt);

    // Camera: centre on the player (or world centre), clamped to the world bounds.
    const player = getPlayer(world);
    const sw = app.screen.width;
    const sh = app.screen.height;
    const targetX = player ? player.x : world.width / 2;
    const targetY = player ? player.y : world.height / 2;
    cam.x = clampCamera(targetX - sw / 2, world.width, sw);
    cam.y = clampCamera(targetY - sh / 2, world.height, sh);
    camera.x = -cam.x;
    camera.y = -cam.y;

    // Dynamic layers, back to front.
    draw.drawIslands(islands, world.islands);
    draw.drawEffects(effects, world.effects);
    draw.drawTorpedoes(torps, world.torpedoes);
    draw.drawShips(ships, world.ships);
    draw.drawShells(shells, world.shells);
    draw.drawAim(aim, player, inputState.aimX, inputState.aimY);

    hudAccRef.current += dt;
    if (hudAccRef.current >= HUD_INTERVAL) {
      hudAccRef.current = 0;
      onHud(snapshotOf(world));
    }
  });

  return (
    <pixiContainer ref={cameraRef}>
      <pixiGraphics draw={drawWaterLayer} />
      <pixiGraphics ref={islandsRef} draw={noop} />
      <pixiGraphics ref={effectsRef} draw={noop} />
      <pixiGraphics ref={torpsRef} draw={noop} />
      <pixiGraphics ref={shipsRef} draw={noop} />
      <pixiGraphics ref={shellsRef} draw={noop} />
      <pixiGraphics ref={aimRef} draw={noop} />
    </pixiContainer>
  );
}
