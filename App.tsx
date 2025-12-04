import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PeerService } from './services/peerService';
import { GameCanvas } from './components/GameCanvas';
import { GameState, GameStatus, BirdState, PipeData, NetworkMessage } from './types';
import { 
    GAME_WIDTH, GAME_HEIGHT, GRAVITY, JUMP_STRENGTH, 
    PIPE_SPEED, PIPE_SPAWN_RATE, PIPE_GAP, BIRD_SIZE, 
    PIPE_WIDTH, GROUND_HEIGHT, BIRD_START_X, BIRD_START_Y 
} from './constants';
import { Copy, Play, RotateCcw, Twitter, Github, Globe } from 'lucide-react';

const peerService = new PeerService();

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

export default function App() {
  const [myId, setMyId] = useState<string>('');
  const [hostId, setHostId] = useState<string>('');
  const [connectedPeer, setConnectedPeer] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);
  const [isHost, setIsHost] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Refs for Game Loop
  const stateRef = useRef<GameState>(INITIAL_GAME_STATE);
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const gameLoopRef = useRef<number>(0);
  
  // Initialize ID
  useEffect(() => {
    peerService.init().then((id) => {
      setMyId(id);
      updateState(prev => ({
        ...prev,
        birds: { [id]: { ...INITIAL_BIRD, id, color: 'yellow' } }
      }));
    }).catch(err => {
        console.error("Peer Init Error", err);
        setErrorMsg("Connection failed. Adblocker?");
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
            birds[msg.playerId].velocity = JUMP_STRENGTH;
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
                birds[msg.playerId].isDead = true;
                birds[msg.playerId].y = msg.y;
                updateState(prev => ({ ...prev, birds }));
                // If it's the partner who died, we might not need to flash locally, 
                // but let's do it for impact if we want.
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

  const loop = (time: number) => {
    const dt = time - lastTimeRef.current; // Delta time unused but good for future
    
    if (stateRef.current.status === 'PLAYING') {
        let needsSync = false;
        const current = stateRef.current;
        const nextBirds = { ...current.birds };
        let nextPipes = [...current.pipes];
        let nextScore = current.score;
        let nextStatus = current.status;

        // 1. Physics
        Object.keys(nextBirds).forEach(key => {
            const bird = nextBirds[key];
            if (!bird.isDead) {
                bird.velocity += GRAVITY;
                bird.y += bird.velocity;
                
                // Rotation logic: -45 deg when jumping, 90 deg when falling
                if (bird.velocity < 0) {
                    bird.rotation = -25;
                } else if (bird.velocity > 0) {
                    bird.rotation += 2;
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
                 // Fall to ground if dead in air
                 if (bird.y + BIRD_SIZE < GAME_HEIGHT - GROUND_HEIGHT) {
                     bird.y += 10;
                     bird.rotation = 90;
                 }
            }
        });

        // 2. Pipes
        nextPipes.forEach(p => p.x -= PIPE_SPEED);
        if (nextPipes.length > 0 && nextPipes[0].x + PIPE_WIDTH < -50) {
            nextPipes.shift();
        }

        if (isHost) {
            // Spawn
            if (frameRef.current % PIPE_SPAWN_RATE === 0) {
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
            // Score
            nextPipes.forEach(p => {
                if (!p.passed && p.x + PIPE_WIDTH < BIRD_START_X) {
                    p.passed = true;
                    nextScore += 1;
                    needsSync = true;
                }
            });
        }

        // 3. Collisions (Self Check)
        const myBird = nextBirds[myId];
        if (myBird && !myBird.isDead) {
            const birdHitbox = { 
                t: myBird.y + 8, // Forgive margins
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

        // 4. Game Over Check
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

        if (isHost && (needsSync || frameRef.current % 15 === 0)) {
            sendSync();
        }
    }
    
    lastTimeRef.current = time;
    frameRef.current++;
    gameLoopRef.current = requestAnimationFrame(loop);
  };

  const startGameLogic = () => {
      // Reset
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
      frameRef.current = 0;
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      gameLoopRef.current = requestAnimationFrame(loop);
  };

  const resetGameLocal = () => {
     // Just helper for restart
  };

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
        birds[myId].velocity = JUMP_STRENGTH;
        updateState(prev => ({ ...prev, birds }));
        peerService.send({ type: 'JUMP', playerId: myId, timestamp: Date.now() });
    }
  }, [gameState.status, myId]);

  const handleCopy = () => {
      navigator.clipboard.writeText(myId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  // Input Listeners
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            handleJump();
          }
      };
      const handleTouch = (e: TouchEvent) => {
          // e.preventDefault(); // handled in passive listener usually
          // Only jump if touching canvas area ideally, but fullscreen is fine
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
      
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[#333] z-0 overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-500 via-gray-900 to-black"></div>
      </div>

      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center gap-6">
        
        {/* Title */}
        {gameState.status === 'MENU' && (
            <div className="animate-bounce mb-4">
                 <h1 className="text-4xl md:text-6xl text-white font-bold tracking-widest drop-shadow-[4px_4px_0_#000]" 
                    style={{ textShadow: '4px 4px 0px #ea580c' }}>
                FLAP<br/>TOGETHER
                </h1>
            </div>
        )}

        {/* MENU */}
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

        {/* LOBBY */}
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

        {/* GAME CANVAS */}
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