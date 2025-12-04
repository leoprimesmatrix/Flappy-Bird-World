export type GameStatus = 'MENU' | 'LOBBY' | 'PLAYING' | 'GAME_OVER';

export interface Position {
  x: number;
  y: number;
}

export interface BirdState {
  id: string;
  y: number;
  velocity: number;
  isDead: boolean;
  color: 'yellow' | 'red';
  rotation: number;
}

export interface PipeData {
  id: number;
  x: number;
  topHeight: number;
  passed: boolean;
}

export interface GameState {
  status: GameStatus;
  score: number;
  birds: { [id: string]: BirdState };
  pipes: PipeData[];
  groundX: number;
}

export type NetworkMessage =
  | { type: 'JOIN'; playerId: string }
  | { type: 'START_GAME'; seed: number } // Host sends start
  | { type: 'JUMP'; playerId: string; timestamp: number }
  | { type: 'SYNC'; birds: { [id: string]: BirdState }; pipes: PipeData[]; score: number }
  | { type: 'DIE'; playerId: string; y: number }
  | { type: 'RESTART' };
