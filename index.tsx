import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import Peer, { DataConnection } from 'peerjs';
import { Copy, Play, RotateCcw } from 'lucide-react';

// ==========================================
// TYPES
// ==========================================
export type GameStatus = 'MENU' | 'LOBBY' | 'PLAYING' | 'GAME_OVER';

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
  | { type: 'START_GAME'; seed: number } 
  | { type: 'JUMP'; playerId: string; timestamp: number }
  | { type: 'SYNC'; birds: { [id: string]: BirdState }; pipes: PipeData[]; score: number }
  | { type: 'DIE'; playerId: string; y: number }
  | { type: 'RESTART' };

// ==========================================
// CONSTANTS
// ==========================================
export const GRAVITY = 0.45;
export const JUMP_STRENGTH = -7.5;
export const PIPE_SPEED = 3.2;
export const PIPE_SPAWN_RATE_MS = 1600; // 1.6 seconds
export const PIPE_GAP = 140; 
export const PIPE_WIDTH = 52;
export const BIRD_SIZE = 34;
export const GROUND_HEIGHT = 112;

export const GAME_WIDTH = 400; 
export const GAME_HEIGHT = 600;

export const BIRD_START_X = 80;
export const BIRD_START_Y = GAME_HEIGHT / 2.5;

// ==========================================
// PEER SERVICE
// ==========================================
class PeerService {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private myId: string = '';
  
  public onConnect?: (partnerId: string) => void;
  public onData?: (data: NetworkMessage) => void;
  public onDisconnect?: () => void;

  constructor() {}

  async init(givenId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer(givenId || '', { debug: 1 });

      this.peer.on('open', (id) => {
        this.myId = id;
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        // Don't reject immediately on error during runtime, only init
        if (!this.myId) reject(err);
      });
      
      this.peer.on('disconnected', () => {
        this.onDisconnect?.();
      });
    });
  }

  connect(peerId: string) {
    if (!this.peer) return;
    const conn = this.peer.connect(peerId);
    this.handleConnection(conn);
  }

  private handleConnection(conn: DataConnection) {
    this.conn = conn;

    this.conn.on('open', () => {
      this.onConnect?.(conn.peer);
    });

    this.conn.on('data', (data) => {
      this.onData?.(data as NetworkMessage);
    });

    this.conn.on('close', () => {
      this.onDisconnect?.();
      this.conn = null;
    });

    this.conn.on('error', (err) => {
        console.error('Connection error', err);
        this.onDisconnect?.();
    });
  }

  send(data: NetworkMessage) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    }
  }

  getId() {
    return this.myId;
  }

  destroy() {
    if (this.conn) this.conn.close();
    if (this.peer) this.peer.destroy();
  }
}

const peerService = new PeerService();

// ==========================================
// COMPONENTS
// ==========================================

const Bird: React.FC<{ bird: BirdState; isMe: boolean }> = ({ bird, isMe }) => {
  return (
    <div
      style={{
        transform: `translate(${BIRD_START_X}px, ${bird.y}px) rotate(${bird.rotation}deg)`,
        width: BIRD_SIZE,
        height: BIRD_SIZE * 0.7, 
        position: 'absolute',
        left: 0,
        top: 0,
        zIndex: isMe ? 20 : 10,
        opacity: bird.isDead ? 0.8 : 1,
        transition: 'none', 
      }}
    >
      <div className={`w-full h-full relative ${bird.isDead ? 'grayscale' : ''}`}>
        <div className={`absolute inset-0 rounded-sm border-2 border-black ${bird.color === 'yellow' ? 'bg-[#facc15]' : 'bg-[#ef4444]'}`}></div>
        <div className="absolute top-[-4px] right-2 w-4 h-4 bg-white border-2 border-black rounded-full z-10"></div>
        <div className="absolute top-[-2px] right-2 w-1.5 h-1.5 bg-black rounded-full z-20 animate-pulse"></div>
        <div className="absolute top-[8px] left-[-2px] w-5 h-3 bg-white border-2 border-black rounded-full z-10 opacity-80"></div>
        <div className="absolute bottom-[-2px] right-[-6px] w-4 h-3 bg-[#f97316] border-2 border-black rounded-sm z-10"></div>
        {!isMe && (
           <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-white font-bold drop-shadow-[1px_1px_0_#000] tracking-tighter">
             P2
           </div>
        )}
      </div>
    </div>
  );
};

const GameCanvas: React.FC<{ gameState: GameState; myId: string }> = ({ gameState, myId }) => {
  const sortedBirds = (Object.values(gameState.birds) as BirdState[]).sort((a, b) => {
    if (a.id === myId) return 1;
    if (b.id === myId) return -1;
    return 0;
  });

  return (
    <div 
      className="relative overflow-hidden bg-[#70c5ce] shadow-2xl ring-8 ring-black rounded-lg select-none"
      style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
    >
      {/* Background */}
      <div 
        className="absolute bottom-[100px] left-0 w-full opacity-50 pointer-events-none"
        style={{
            height: '200px',
            backgroundImage: 'linear-gradient(to top, #a3e6af 0%, transparent 100%)', 
            backgroundRepeat: 'repeat-x'
        }}
      >
        <div className="absolute bottom-0 left-10 w-10 h-32 bg-[#a3e6af] border-t-4 border-x-4 border-[#5ca66a]"></div>
        <div className="absolute bottom-0 left-32 w-14 h-20 bg-[#a3e6af] border-t-4 border-x-4 border-[#5ca66a]"></div>
        <div className="absolute bottom-0 left-60 w-8 h-40 bg-[#a3e6af] border-t-4 border-x-4 border-[#5ca66a]"></div>
        <div className="absolute bottom-0 left-80 w-16 h-24 bg-[#a3e6af] border-t-4 border-x-4 border-[#5ca66a]"></div>
        <div className="absolute bottom-0 left-0 w-full h-4 bg-[#5ca66a]"></div>
      </div>

      {/* Pipes */}
      {gameState.pipes.map((pipe) => (
        <React.Fragment key={pipe.id}>
          <div
            className="absolute border-x-4 border-b-4 border-black bg-[#73bf2e]"
            style={{
              left: pipe.x,
              top: 0,
              width: PIPE_WIDTH,
              height: pipe.topHeight,
            }}
          >
             <div className="absolute bottom-0 left-[-4px] w-[calc(100%+8px)] h-8 border-4 border-black bg-[#73bf2e]"></div>
             <div className="absolute top-0 right-2 w-2 h-full bg-[#9ce659] opacity-40"></div>
          </div>
          <div
            className="absolute border-x-4 border-t-4 border-black bg-[#73bf2e]"
            style={{
              left: pipe.x,
              bottom: GROUND_HEIGHT, 
              width: PIPE_WIDTH,
              height: GAME_HEIGHT - GROUND_HEIGHT - pipe.topHeight - PIPE_GAP,
            }}
          >
             <div className="absolute top-0 left-[-4px] w-[calc(100%+8px)] h-8 border-4 border-black bg-[#73bf2e]"></div>
             <div className="absolute top-0 right-2 w-2 h-full bg-[#9ce659] opacity-40"></div>
          </div>
        </React.Fragment>
      ))}

      {/* Ground */}
      <div 
        className={`absolute bottom-0 w-full z-30 border-t-4 border-black bg-[#ded895] ${gameState.status === 'PLAYING' || gameState.status === 'LOBBY' ? 'animate-ground' : ''} ${gameState.status === 'GAME_OVER' ? 'paused' : ''}`}
        style={{ 
            height: GROUND_HEIGHT,
            backgroundImage: `linear-gradient(135deg, #ded895 25%, #d0c874 25%, #d0c874 50%, #ded895 50%, #ded895 75%, #d0c874 75%, #d0c874 100%)`,
            backgroundSize: '24px 24px'
        }}
      >
        <div className="w-full h-4 bg-[#73bf2e] border-b-4 border-black absolute top-0 relative">
             <div className="absolute top-0 w-full h-full opacity-30 bg-[repeating-linear-gradient(90deg,transparent,transparent_2px,#000_2px,#000_4px)]"></div>
        </div>
      </div>

      {/* Birds */}
      {sortedBirds.map((bird) => (
        <Bird key={bird.id} bird={bird} isMe={bird.id === myId} />
      ))}

      {/* Score */}
      {gameState.status !== 'MENU' && (
        <div className="absolute top-16 w-full text-center z-40 pointer-events-none">
            <span className="text-5xl font-bold text-white drop-shadow-[3px_3px_0_#000] stroke-black" style={{ WebkitTextStroke: '2px black' }}>
            {gameState.score}
            </span>
        </div>
      )}
      
      {/* Messages */}
      {gameState.status === 'LOBBY' && (
        <div className="absolute top-1/3 w-full text-center animate-bounce">
            <span className="text-2xl font-bold text-[#f97316] drop-shadow-[2px_2px_0_#fff] bg-black/50 px-4 py-2 rounded">GET READY!</span>
        </div>
      )}

      {/* Game Over */}
      {gameState.status === 'GAME_OVER' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20">
            <div className="bg-[#ded895] border-4 border-black p-4 text-center shadow-[8px_8px_0_#000] animate-in zoom-in duration-300">
                <h2 className="text-3xl text-[#f97316] font-bold mb-4 drop-shadow-[2px_2px_0_#000]">GAME OVER</h2>
                <div className="flex gap-4 justify-center">
                    <div className="bg-[#cbb968] border-2 border-black p-2 w-24 rounded">
                        <p className="text-[10px] text-[#f97316] font-bold">SCORE</p>
                        <p className="text-2xl text-white font-bold drop-shadow-[1px_1px_0_#000]">{gameState.score}</p>
                    </div>
                </div>
            </div>
        </div>
      )}
      
      {/* Flash */}
      <div id="flash-overlay" className="absolute inset-0 bg-white pointer-events-none opacity-0 transition-opacity duration-100"></div>
    </div>
  );
};

// ==========================================
// MAIN APP
// ==========================================

const INITIAL_BIRD: BirdState = {
  id: '',
  y: BIRD_START_Y,
  velocity: 0,
  isDead: false,
  color: 'yellow',
  rotation: 0,
};

const INITIAL_GAME_STATE: GameState = {
  status: 'MENU',
  score: 0,
  birds: {},
  pipes: [],
  groundX: 0
};

function App() {
  const [myId, setMyId] = useState<string>('');
  const [hostId, setHostId] = useState<string>('');
  const [connectedPeer, setConnectedPeer] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);
  const [isHost, setIsHost] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Refs for Game Loop
  const stateRef = useRef<GameState>(INITIAL_GAME_STATE);
  const isHostRef = useRef(false); // Critical: Ref for loop access to host status
  const lastTimeRef = useRef<number>(0);
  const gameLoopRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const syncTimerRef = useRef<number>(0);
  
  // Sync isHost state to Ref
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  // Initialize Peer
  useEffect(() => {
    peerService.init().then((id) => {
      setMyId(id);
      updateState(prev => ({
        ...prev,
        birds: { [id]: { ...INITIAL_BIRD, id, color: 'yellow' } }
      }));
    }).catch(err => {
        console.error("Peer Init Error", err);
        setErrorMsg("Connection failed.");
    });

    peerService.onConnect = (partnerId) => {
      setConnectedPeer(partnerId);
      if (isHost) {
          updateState(prev => ({
              ...prev,
              status: 'LOBBY',
              birds: {
                  ...prev.birds,
                  [partnerId]: { ...INITIAL_BIRD, id: partnerId, color: 'red' }
              }
          }));
          setTimeout(() => sendSync(), 200);
      } else {
        setGameState(prev => ({ ...prev, status: 'LOBBY' }));
      }
    };

    peerService.onData = handleNetworkMessage;
    
    peerService.onDisconnect = () => {
        setConnectedPeer(null);
        setErrorMsg("Partner disconnected.");
        setGameState(prev => ({ ...prev, status: 'MENU' }));
        cancelAnimationFrame(gameLoopRef.current);
    };

    return () => {
      peerService.destroy();
      cancelAnimationFrame(gameLoopRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost]);

  const updateState = (updater: (prev: GameState) => GameState) => {
    const newState = updater(stateRef.current);
    stateRef.current = newState;
    setGameState(newState);
  };

  const triggerFlash = () => {
      const flashEl = document.getElementById('flash-overlay');
      if (flashEl) {
          flashEl.style.opacity = '0.8';
          setTimeout(() => flashEl.style.opacity = '0', 50);
      }
  };

  const handleNetworkMessage = (msg: NetworkMessage) => {
    switch (msg.type) {
      case 'JUMP':
        if (stateRef.current.birds[msg.playerId]) {
            const birds = { ...stateRef.current.birds };
            birds[msg.playerId] = { ...birds[msg.playerId], velocity: JUMP_STRENGTH };
            updateState(prev => ({ ...prev, birds }));
        }
        break;
      case 'SYNC':
        if (!isHost) {
            updateState(prev => ({
                ...prev,
                score: msg.score,
                pipes: msg.pipes,
                birds: msg.birds,
                status: prev.status === 'MENU' ? 'LOBBY' : prev.status
            }));
        }
        break;
      case 'START_GAME':
        startGameLogic();
        break;
      case 'RESTART':
        resetGameLocal();
        startGameLogic();
        break;
      case 'DIE':
        if (stateRef.current.birds[msg.playerId]) {
            const birds = { ...stateRef.current.birds };
            if (!birds[msg.playerId].isDead) {
                birds[msg.playerId] = { ...birds[msg.playerId], isDead: true, y: msg.y };
                updateState(prev => ({ ...prev, birds }));
            }
        }
        break;
    }
  };

  const sendSync = () => {
      if (!connectedPeer) return;
      peerService.send({
          type: 'SYNC',
          birds: stateRef.current.birds,
          pipes: stateRef.current.pipes,
          score: stateRef.current.score
      });
  };

  // ==========================================
  // GAME LOOP (DELTA TIME)
  // ==========================================
  const loop = (time: number) => {
    if (lastTimeRef.current === 0) {
        lastTimeRef.current = time;
        gameLoopRef.current = requestAnimationFrame(loop);
        return;
    }

    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;
    const safeDt = Math.min(dt, 100);
    const timeScale = safeDt / 16.66;
    
    // Check status directly from ref
    if (stateRef.current.status === 'PLAYING') {
        let needsSync = false;
        const current = stateRef.current;
        
        const nextBirds: { [id: string]: BirdState } = {};
        Object.keys(current.birds).forEach(k => {
            nextBirds[k] = { ...current.birds[k] };
        });

        let nextPipes = [...current.pipes];
        let nextScore = current.score;
        let nextStatus = current.status;

        // Use isHostRef to avoid stale closures
        if (isHostRef.current) {
            spawnTimerRef.current += safeDt;
            syncTimerRef.current += safeDt;
        }

        // 1. Physics
        Object.keys(nextBirds).forEach(key => {
            const bird = nextBirds[key];
            if (!bird.isDead) {
                bird.velocity += GRAVITY * timeScale;
                bird.y += bird.velocity * timeScale;
                
                if (bird.velocity < 0) {
                    bird.rotation = -25;
                } else if (bird.velocity > 0) {
                    bird.rotation += 2 * timeScale;
                    if (bird.rotation > 90) bird.rotation = 90;
                }

                if (bird.y + BIRD_SIZE >= GAME_HEIGHT - GROUND_HEIGHT) {
                    bird.y = GAME_HEIGHT - GROUND_HEIGHT - BIRD_SIZE;
                    bird.isDead = true;
                    if (bird.id === myId) {
                        triggerFlash();
                        peerService.send({ type: 'DIE', playerId: myId, y: bird.y });
                    }
                }
                if (bird.y < 0) {
                    bird.y = 0;
                    bird.velocity = 0;
                }
            } else {
                 if (bird.y + BIRD_SIZE < GAME_HEIGHT - GROUND_HEIGHT) {
                     bird.y += 10 * timeScale;
                     bird.rotation = 90;
                 }
            }
        });

        // 2. Pipes Movement
        nextPipes.forEach(p => p.x -= PIPE_SPEED * timeScale);
        if (nextPipes.length > 0 && nextPipes[0].x + PIPE_WIDTH < -50) {
            nextPipes.shift();
        }

        // 3. Spawning & Score (Host Only)
        if (isHostRef.current) {
            // Subtracting interval instead of resetting to 0 for smoother cadence
            if (spawnTimerRef.current >= PIPE_SPAWN_RATE_MS) {
                 spawnTimerRef.current -= PIPE_SPAWN_RATE_MS; 
                 const minPipeH = 50;
                 const maxPipeH = GAME_HEIGHT - GROUND_HEIGHT - PIPE_GAP - minPipeH;
                 const randomH = Math.floor(Math.random() * (maxPipeH - minPipeH + 1)) + minPipeH;
                 nextPipes.push({
                     id: Date.now(),
                     x: GAME_WIDTH,
                     topHeight: randomH,
                     passed: false
                 });
                 needsSync = true;
            }
            
            nextPipes.forEach(p => {
                if (!p.passed && p.x + PIPE_WIDTH < BIRD_START_X) {
                    p.passed = true;
                    nextScore += 1;
                    needsSync = true;
                }
            });
        }

        // 4. Collisions
        const myBird = nextBirds[myId];
        if (myBird && !myBird.isDead) {
            const birdHitbox = { 
                t: myBird.y + 8, 
                b: myBird.y + BIRD_SIZE - 8, 
                l: BIRD_START_X + 8, 
                r: BIRD_START_X + BIRD_SIZE - 8 
            };
            
            for (const p of nextPipes) {
                if (birdHitbox.r > p.x && birdHitbox.l < p.x + PIPE_WIDTH) {
                     if (birdHitbox.t < p.topHeight || birdHitbox.b > p.topHeight + PIPE_GAP) {
                         myBird.isDead = true;
                         triggerFlash();
                         peerService.send({ type: 'DIE', playerId: myId, y: myBird.y });
                     }
                }
            }
        }

        // 5. Game Over
        const allDead = (Object.values(nextBirds) as BirdState[]).every(b => b.isDead);
        if (allDead) {
            nextStatus = 'GAME_OVER';
        }

        updateState(prev => ({
            ...prev,
            birds: nextBirds,
            pipes: nextPipes,
            score: nextScore,
            status: nextStatus as GameStatus
        }));

        if (isHostRef.current && (needsSync || syncTimerRef.current > 200)) {
            sendSync();
            if (syncTimerRef.current > 200) syncTimerRef.current = 0;
        }
    }
    
    gameLoopRef.current = requestAnimationFrame(loop);
  };

  const startGameLogic = () => {
      updateState(prev => {
          const resetBirds: {[id:string]: BirdState} = {};
          Object.keys(prev.birds).forEach(k => {
              resetBirds[k] = { 
                  ...prev.birds[k], 
                  y: BIRD_START_Y, 
                  velocity: 0, 
                  isDead: false, 
                  rotation: 0 
              };
          });
          return {
              ...prev,
              status: 'PLAYING',
              score: 0,
              pipes: [],
              birds: resetBirds
          };
      });
      
      spawnTimerRef.current = 0;
      syncTimerRef.current = 0;
      lastTimeRef.current = 0; 

      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      gameLoopRef.current = requestAnimationFrame(loop);
  };

  const resetGameLocal = () => {};

  const handleRestart = () => {
     if (isHost) {
         peerService.send({ type: 'RESTART' });
         startGameLogic();
     }
  };

  const handleJump = useCallback(() => {
    if (gameState.status !== 'PLAYING') return;
    const myBird = stateRef.current.birds[myId];
    if (myBird && !myBird.isDead) {
        const birds = { ...stateRef.current.birds };
        birds[myId] = { ...birds[myId], velocity: JUMP_STRENGTH };
        updateState(prev => ({ ...prev, birds }));
        peerService.send({ type: 'JUMP', playerId: myId, timestamp: Date.now() });
    }
  }, [gameState.status, myId]);

  const handleCopy = () => {
      navigator.clipboard.writeText(myId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            handleJump();
          }
      };
      const handleTouch = (e: TouchEvent) => {
          handleJump();
      }
      
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('touchstart', handleTouch);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('touchstart', handleTouch);
      };
  }, [handleJump]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 w-full relative">
      <div className="absolute inset-0 bg-[#333] z-0 overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-500 via-gray-900 to-black"></div>
      </div>

      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center gap-6">
        
        {gameState.status === 'MENU' && (
            <div className="animate-bounce mb-4">
                 <h1 className="text-4xl md:text-6xl text-white font-bold tracking-widest drop-shadow-[4px_4px_0_#000]" 
                    style={{ textShadow: '4px 4px 0px #ea580c' }}>
                FLAP<br/>TOGETHER
                </h1>
            </div>
        )}

        {gameState.status === 'MENU' && (
             <div className="bg-[#ded895] p-6 rounded-lg border-4 border-black shadow-[8px_8px_0_#000] w-full max-w-md">
                {errorMsg && <div className="bg-red-500 text-white p-2 mb-4 text-xs font-bold border-2 border-black animate-pulse">{errorMsg}</div>}
                
                <div className="flex flex-col gap-4">
                    <button 
                        onClick={() => { setIsHost(true); setGameState(p => ({...p, status: 'LOBBY'})); }}
                        className="flex items-center justify-center gap-2 bg-[#f97316] hover:bg-[#ea580c] text-white font-bold py-4 border-b-4 border-r-4 border-black active:border-0 active:translate-y-1 transition-all"
                    >
                        <Play size={20} /> CREATE GAME
                    </button>
                    
                    <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t-2 border-black/20"></div>
                        <span className="flex-shrink-0 mx-4 text-black/50 text-xs font-bold">OR JOIN FRIEND</span>
                        <div className="flex-grow border-t-2 border-black/20"></div>
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); if(hostId) { setIsHost(false); peerService.connect(hostId); } }} className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder="PASTE ID HERE"
                            value={hostId}
                            onChange={e => setHostId(e.target.value)}
                            className="flex-1 bg-white border-4 border-black p-2 outline-none font-mono uppercase text-sm placeholder-gray-400"
                        />
                        <button 
                            type="submit"
                            className="bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold px-4 border-b-4 border-r-4 border-black active:border-0 active:translate-y-1 transition-all"
                        >
                            JOIN
                        </button>
                    </form>
                </div>
                
                <div className="mt-6 text-center text-[10px] text-black/60">
                    ID: <span className="font-mono bg-white border border-black px-1">{myId || '...'}</span>
                </div>
             </div>
        )}

        {gameState.status === 'LOBBY' && (
             <div className="bg-[#ded895] p-6 rounded-lg border-4 border-black shadow-[8px_8px_0_#000] w-full max-w-md text-center">
                <h2 className="text-xl font-bold mb-6 text-[#f97316] drop-shadow-[1px_1px_0_#000]">LOBBY</h2>
                <div className="flex justify-center gap-8 mb-8">
                    <div className="flex flex-col items-center">
                        <div className="w-12 h-12 bg-[#facc15] border-4 border-black mb-2 animate-bounce rounded-sm"></div>
                        <span className="font-bold text-xs">YOU</span>
                    </div>
                    <div className="flex items-center">
                        <div className="text-2xl font-bold animate-pulse text-black/50">VS</div>
                    </div>
                    <div className="flex flex-col items-center">
                        <div className={`w-12 h-12 border-4 border-black mb-2 rounded-sm transition-colors ${connectedPeer ? 'bg-[#ef4444] animate-bounce' : 'bg-gray-300'}`}></div>
                        <span className="font-bold text-xs">{connectedPeer ? 'P2' : '...'}</span>
                    </div>
                </div>

                {isHost ? (
                    <div className="flex flex-col gap-4">
                         {!connectedPeer && (
                            <div className="bg-white border-4 border-black p-3 mb-2 flex flex-col gap-2">
                                <span className="text-[10px] text-gray-500 font-bold uppercase">Share this ID</span>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 text-xs font-mono bg-gray-100 p-1 truncate select-all">{myId}</code>
                                    <button onClick={handleCopy} className={`p-1 border-2 border-black hover:bg-gray-100 ${copied ? 'bg-green-200' : ''}`}>
                                        <Copy size={14} />
                                    </button>
                                </div>
                            </div>
                         )}
                        <button 
                            onClick={() => { peerService.send({ type: 'START_GAME', seed: Date.now() }); startGameLogic(); }}
                            className="bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold py-4 w-full border-b-4 border-r-4 border-black active:border-0 active:translate-y-1 transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                            disabled={!connectedPeer}
                        >
                            {connectedPeer ? 'START GAME' : 'WAITING FOR PLAYER...'}
                        </button>
                    </div>
                ) : (
                    <div className="text-black/70 animate-pulse font-bold text-sm bg-white/50 p-2 rounded border-2 border-black/20">
                        WAITING FOR HOST TO START...
                    </div>
                )}
             </div>
        )}

        {(gameState.status === 'PLAYING' || gameState.status === 'GAME_OVER') && (
            <div className="flex flex-col gap-4 w-full items-center">
                <GameCanvas gameState={gameState} myId={myId} />
                {gameState.status === 'GAME_OVER' && isHost && (
                    <button 
                         onClick={handleRestart}
                         className="bg-white text-black px-6 py-3 font-bold border-4 border-black shadow-[4px_4px_0_#000] hover:bg-gray-100 active:translate-y-1 active:shadow-none transition-all flex items-center gap-2"
                    >
                        <RotateCcw size={18} /> RESTART
                    </button>
                )}
                 {gameState.status === 'GAME_OVER' && !isHost && (
                    <div className="text-white text-shadow animate-pulse font-bold">
                        WAITING FOR RESTART...
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);