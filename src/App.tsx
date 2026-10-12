import { useCallback, useRef, useState } from 'react';
import { Application } from '@pixi/react';
import { createWorld } from './game/sim';
import type { World } from './game/types';
import { GameScene } from './render/GameScene';
import { Hud, type HudSnapshot } from './render/Hud';

export function App() {
  // The world is mutable simulation state, not React state: GameScene steps and draws it each frame.
  const worldRef = useRef<World>(createWorld());
  const [hud, setHud] = useState<HudSnapshot | null>(null);

  const restart = useCallback(() => {
    worldRef.current = createWorld();
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Application resizeTo={window} background={0x0b2a3f} antialias>
        <GameScene worldRef={worldRef} onHud={setHud} />
      </Application>
      {hud && <Hud snapshot={hud} onRestart={restart} />}
    </div>
  );
}
