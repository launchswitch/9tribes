import Phaser from 'phaser';
import type { GameController } from '../controller/GameController';
import { BootScene } from './scenes/BootScene';
import { MapScene } from './scenes/MapScene';

export function createGame(parent: HTMLDivElement, controller: GameController) {
  try {
    return new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#17130e',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: parent.clientWidth || 1280,
        height: parent.clientHeight || 720,
      },
      input: {
        windowEvents: false,
      },
      render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true,
      },
      scene: [new BootScene(), new MapScene(controller)],
    });
  } catch (e) {
    console.error('Phaser game creation error:', e);
    throw e;
  }
}