import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PeerService } from './services/peerService';
import { GameCanvas } from './components/GameCanvas';
import { GameState, GameStatus, BirdState, PipeData, NetworkMessage } from './types';
import { 
    GAME_WIDTH, GAME_HEIGHT, GRAVITY, JUMP_STRENGTH, 
    PIPE_SPEED, PIPE_SPAWN_RATE, PIPE_GAP, BIRD_SIZE, 
    PIPE_WIDTH, GROUND_HEIGHT, BIRD_START_X, BIRD_START_Y 
} from './constants';
import { Copy, Users, Play, RotateCcw, Share2, AlertCircle } from 'lucide-react';

// Initialize PeerService outside component to avoid re-instantiation
const peerService = new PeerService();

// --- Initial States ---
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

  // Refs for Game Loop to avoid closure staleness
  const stateRef = useRef<GameState>(INITIAL_GAME_STATE);
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const pipesRef = useRef<PipeData[]>([]); // Keep pipes ref for easy access
  
  // Audio Refs (Optional simple oscillator beeps could go here, skipping for simplicity)

  // --- Networking Setup ---
  useEffect(() => {
    peerService.init().then((id) => {
      setMyId(id);
      // Initialize my bird in the state
      updateState(prev => ({
        ...prev,
        birds: { [id]: { ...INITIAL_BIRD, id, color: 'yellow' } }
      }));
    }).catch(err => setErrorMsg("Could not connect to PeerServer. Refresh?"));

    peerService.onConnect = (partnerId) => {
      setConnectedPeer(partnerId);
      // If I am host, I add the partner to my state
      if (isHost) {
          updateState(prev => ({
              ...prev,
              status: 'LOBBY',
              birds: {
                  ...prev.birds,
                  [partnerId]: { ...INITIAL_BIRD, id: partnerId, color: 'red' }
              }
          }));
          // Send initial sync
          setTimeout(() => sendSync(), 500);
      } else {
        // If I am client, I just wait for sync
        setGameState(prev => ({ ...prev, status: 'LOBBY' }));
      }
    };

    peerService.onData = handleNetworkMessage;
    peerService.onDisconnect = () => {
        setConnectedPeer(null);
        setErrorMsg("Partner disconnected.");
        setGameState(prev => ({ ...prev, status: 'MENU' }));
    };

    return () => {
      peerService.destroy();
      cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost]);

  // --- Helper to update ref and state simultaneously ---
  const updateState = (updater: (prev: GameState) => GameState) => {
    const newState = updater(stateRef.current);
    stateRef.current = newState;
    setGameState(newState);
  };

  // --- Network Message Handler ---
  const handleNetworkMessage = (msg: NetworkMessage) => {
    switch (msg.type) {
      case 'JUMP':
        // Apply jump to the specific bird
        if (stateRef.current.birds[msg.playerId]) {
            const birds = { ...stateRef.current.birds };
            birds[msg.playerId].velocity = JUMP_STRENGTH;
            updateState(prev => ({ ...prev, birds }));
        }
        break;
      case 'SYNC':
        // Client receives authoritative state from host
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
        resetGame();
        startGameLogic();
        break;
      case 'DIE':
        // Mark that bird as dead
        if (stateRef.current.birds[msg.playerId]) {
            const birds = { ...stateRef.current.birds };
            birds[msg.playerId].isDead = true;
            birds[msg.playerId].y = msg.y; // Snap to death spot
            updateState(prev => ({ ...prev, birds }));
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

  // --- Game Loop ---
  const loop = (time: number) => {
    const dt = time - lastTimeRef.current;
    
    if (stateRef.current.status === 'PLAYING') {
        let needsSync = false;
        const current = stateRef.current;
        const nextBirds = { ...current.birds };
        let nextPipes = [...current.pipes];
        let nextScore = current.score;
        let nextStatus = current.status;

        // 1. Physics for all birds
        Object.keys(nextBirds).forEach(key => {
            const bird = nextBirds[key];
            if (!bird.isDead) {
                bird.velocity += GRAVITY;
                bird.y += bird.velocity;
                
                // Rotation based on velocity
                bird.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (bird.velocity * 0.1))) * (180 / Math.PI);

                // Floor collision
                if (bird.y + BIRD_SIZE >= GAME_HEIGHT - GROUND_HEIGHT) {
                    bird.y = GAME_HEIGHT - GROUND_HEIGHT - BIRD_SIZE;
                    bird.isDead = true;
                    // If it's ME, send DIE
                    if (bird.id === myId) {
                        peerService.send({ type: 'DIE', playerId: myId, y: bird.y });
                    }
                }
                // Ceiling collision
                 if (bird.y < 0) {
                     bird.y = 0;
                     bird.velocity = 0;
                 }
            }
        });

        // 2. Pipe Logic (Host only generates, both simulate movement)
        // Actually, to keep it synced, Host generates and moves. Client interpolates? 
        // For simplicity: Both move pipes. Host handles spawning and scoring to be authoritative.
        // Client receives pipes via SYNC every ~1s or relies on deterministic spawn if we synced seeds.
        // Let's go with: Host moves pipes and sends updates. Client simulates but snaps to host.
        // To make client smooth, client moves pipes too.
        
        // Move pipes
        nextPipes.forEach(p => p.x -= PIPE_SPEED);

        // Remove off-screen pipes
        if (nextPipes.length > 0 && nextPipes[0].x + PIPE_WIDTH < 0) {
            nextPipes.shift();
        }

        // Host Spawning & Scoring
        if (isHost) {
            // Spawn
            if (time % PIPE_SPAWN_RATE < 16) { // Approx every 100 frames logic
                // Better: track last spawn time
            }
            // Logic using frame counter for consistency
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

            // Scoring
            nextPipes.forEach(p => {
                if (!p.passed && p.x + PIPE_WIDTH < BIRD_START_X) {
                    p.passed = true;
                    nextScore += 1;
                    needsSync = true;
                }
            });
            
            // Host checks collisions for EVERYONE (Authoritative)? 
            // Or everyone checks their own? 
            // Better: Everyone checks their own to avoid latency death.
        }

        // Collision with pipes (Client checks self, Host checks self)
        const myBird = nextBirds[myId];
        if (myBird && !myBird.isDead) {
            // Check pipe collision
            const birdRect = { t: myBird.y + 4, b: myBird.y + BIRD_SIZE - 4, l: BIRD_START_X + 4, r: BIRD_START_X + BIRD_SIZE - 4 };
            
            for (const p of nextPipes) {
                // Pipe Hitbox
                const pipeLeft = p.x;
                const pipeRight = p.x + PIPE_WIDTH;
                
                // Within horizontal range?
                if (birdRect.r > pipeLeft && birdRect.l < pipeRight) {
                     // Hit top pipe?
                     if (birdRect.t < p.topHeight) {
                         myBird.isDead = true;
                         peerService.send({ type: 'DIE', playerId: myId, y: myBird.y });
                     }
                     // Hit bottom pipe?
                     else if (birdRect.b > p.topHeight + PIPE_GAP) {
                         myBird.isDead = true;
                         peerService.send({ type: 'DIE', playerId: myId, y: myBird.y });
                     }
                }
            }
        }

        // Check Game Over (Both dead)
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

        if (isHost && (needsSync || frameRef.current % 30 === 0)) {
            sendSync();
        }
    }
    
    lastTimeRef.current = time;
    frameRef.current++;
    requestAnimationFrame(loop);
  };

  const startGameLogic = () => {
      // Reset positions but keep IDs
      updateState(prev => {
          const resetBirds: {[id:string]: BirdState} = {};
          Object.keys(prev.birds).forEach(k => {
              resetBirds[k] = { ...prev.birds[k], y: BIRD_START_Y, velocity: 0, isDead: false, rotation: 0 };
          });
          return {
              ...prev,
              status: 'PLAYING',
              score: 0,
              pipes: [],
              birds: resetBirds
          };
      });
      lastTimeRef.current = performance.now();
      frameRef.current = 0;
      requestAnimationFrame(loop);
  };

  const resetGame = () => {
     if (isHost) {
         peerService.send({ type: 'RESTART' });
         startGameLogic();
     }
  };

  // --- Actions ---
  const handleJump = useCallback(() => {
    if (gameState.status !== 'PLAYING') return;
    
    const myBird = stateRef.current.birds[myId];
    if (myBird && !myBird.isDead) {
        // Immediate local update
        const birds = { ...stateRef.current.birds };
        birds[myId].velocity = JUMP_STRENGTH;
        updateState(prev => ({ ...prev, birds }));
        
        // Network update
        peerService.send({ type: 'JUMP', playerId: myId, timestamp: Date.now() });
    }
  }, [gameState.status, myId]);

  const handleCreateGame = () => {
    setIsHost(true);
    // Peer ID is already generated on init
    setGameState(prev => ({ ...prev, status: 'LOBBY' }));
  };

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostId) return;
    setIsHost(false);
    peerService.connect(hostId);
  };

  const handleStartGame = () => {
      if (isHost) {
          peerService.send({ type: 'START_GAME', seed: Date.now() });
          startGameLogic();
      }
  };

  // --- Input Listeners ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.code === 'Space') {
            handleJump();
          }
      };
      const handleTouch = (e: TouchEvent) => {
          // Prevent default to stop scrolling/zooming
          // e.preventDefault(); 
          // Actually preventDefault on body is better, but here we just trigger jump
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
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      {/* Container */}
      <div className="relative w-full max-w-2xl flex flex-col items-center gap-6">
        
        {/* Header / Title */}
        <h1 className="text-4xl md:text-6xl text-white font-bold tracking-widest drop-shadow-[4px_4px_0_#000]" 
            style={{ fontFamily: '"Press Start 2P", cursive', textShadow: '4px 4px 0px #ea580c' }}>
          FLAP TOGETHER
        </h1>

        {gameState.status === 'MENU' && (
             <div className="bg-white p-8 rounded-lg border-4 border-black shadow-[8px_8px_0_#000] w-full max-w-md">
                {errorMsg && <div className="bg-red-100 text-red-600 p-2 mb-4 text-sm border-l-4 border-red-500">{errorMsg}</div>}
                
                <div className="flex flex-col gap-4">
                    <button 
                        onClick={handleCreateGame}
                        className="flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-4 border-b-4 border-r-4 border-black active:border-0 active:translate-y-1 transition-all"
                    >
                        <Play size={20} /> CREATE NEW GAME
                    </button>
                    
                    <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t border-gray-400"></div>
                        <span className="flex-shrink-0 mx-4 text-gray-500 text-xs">OR JOIN A FRIEND</span>
                        <div className="flex-grow border-t border-gray-400"></div>
                    </div>

                    <form onSubmit={handleJoinGame} className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder="ENTER FRIEND'S ID"
                            value={hostId}
                            onChange={e => setHostId(e.target.value)}
                            className="flex-1 bg-gray-100 border-2 border-black p-2 outline-none focus:bg-white font-mono uppercase"
                        />
                        <button 
                            type="submit"
                            className="bg-blue-400 hover:bg-blue-500 text-black p-2 border-b-4 border-r-4 border-black active:border-0 active:translate-y-1 transition-all"
                        >
                            JOIN
                        </button>
                    </form>
                </div>
                
                <div className="mt-6 text-center text-xs text-gray-400">
                    Your ID: <span className="font-mono bg-gray-200 px-1 rounded">{myId || 'Connecting...'}</span>
                </div>
             </div>
        )}

        {gameState.status === 'LOBBY' && (
             <div className="bg-white p-8 rounded-lg border-4 border-black shadow-[8px_8px_0_#000] w-full max-w-md text-center">
                <h2 className="text-xl font-bold mb-6">LOBBY</h2>
                
                <div className="flex justify-center gap-8 mb-8">
                     {/* Player 1 */}
                    <div className="flex flex-col items-center">
                        <div className="w-16 h-16 bg-yellow-400 border-4 border-black mb-2 animate-bounce"></div>
                        <span className="font-bold text-sm">YOU</span>
                    </div>
                    {/* Player 2 */}
                    <div className="flex flex-col items-center">
                        <div className={`w-16 h-16 border-4 border-black mb-2 ${connectedPeer ? 'bg-red-500 animate-bounce' : 'bg-gray-300 animate-pulse'}`}></div>
                        <span className="font-bold text-sm">{connectedPeer ? 'FRIEND' : 'WAITING...'}</span>
                    </div>
                </div>

                {isHost ? (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between bg-gray-100 p-2 border-2 border-black rounded">
                            <span className="font-mono text-xs truncate">{myId}</span>
                            <button onClick={() => navigator.clipboard.writeText(myId)} className="text-gray-500 hover:text-black">
                                <Copy size={16} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500">Share this ID with your friend</p>

                        <button 
                            onClick={handleStartGame}
                            className="mt-4 bg-green-500 hover:bg-green-600 text-white font-bold py-4 w-full border-b-4 border-r-4 border-black active:border-0 active:translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!connectedPeer}
                        >
                            START GAME
                        </button>
                    </div>
                ) : (
                    <div className="text-gray-500 animate-pulse">
                        Waiting for host to start...
                    </div>
                )}
             </div>
        )}

        {(gameState.status === 'PLAYING' || gameState.status === 'GAME_OVER') && (
            <div className="flex flex-col gap-4 w-full items-center">
                <GameCanvas gameState={gameState} myId={myId} />
                
                {gameState.status === 'GAME_OVER' && isHost && (
                    <button 
                         onClick={resetGame}
                         className="bg-white text-black px-8 py-3 font-bold border-4 border-black shadow-[4px_4px_0_#000] hover:bg-gray-100 active:translate-y-1 active:shadow-none transition-all flex items-center gap-2"
                    >
                        <RotateCcw size={20} /> PLAY AGAIN
                    </button>
                )}
                 {gameState.status === 'GAME_OVER' && !isHost && (
                    <div className="text-white text-shadow animate-pulse">
                        Waiting for host to restart...
                    </div>
                )}
                
                <div className="text-white/50 text-xs mt-2">
                    Tap Space or Screen to Jump
                </div>
            </div>
        )}

      </div>
    </div>
  );
}