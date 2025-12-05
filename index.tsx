import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import Peer, { DataConnection } from 'peerjs';
import { Copy, Play, RotateCcw, Loader2 } from 'lucide-react';

// ==========================================
// TYPES
// ==========================================
export type GameStatus = 'MENU' | 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'GAME_OVER';

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
  score: number;
  birds: { [id: string]: BirdState };
  pipes: PipeData[];
}

export type NetworkMessage =
  | { type: 'JOIN'; playerId: string }
  | { type: 'START_REQ' }
  | { type: 'RESTART' }
  | { type: 'PLAYER_UPDATE'; id: string; y: number; velocity: number; rotation: number; isDead: boolean }
  | { type: 'PIPE_SYNC'; pipes: PipeData[]; score: number }
  | { type: 'DIE'; playerId: string; y: number };

// ==========================================
// CONSTANTS
// ==========================================
export const GRAVITY = 0.45;
export const JUMP_STRENGTH = -7.5;
export const PIPE_SPEED = 3.2; 
export const PIPE_SPAWN_RATE_MS = 1600; 
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
    if (this.peer && !this.peer.destroyed) {
      return this.myId;
    }

    return new Promise((resolve, reject) => {
      this.peer = new Peer(givenId || '', { debug: 1 });

      const timeout = setTimeout(() => {
          reject(new Error("Connection timed out."));
      }, 10000);

      this.peer.on('open', (id) => {
        clearTimeout(timeout);
        this.myId = id;
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        console.error('Peer error:', err);
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

  destroy() {
    if (this.conn) this.conn.close();
    if (this.peer) this.peer.destroy();
    this.peer = null;
    this.conn = null;
    this.myId = '';
  }
}

const peerService = new PeerService();

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

export default function App() {
  const [status, setStatus] = useState<GameStatus>('MENU');
  const [score, setScore] = useState(0); 
  const [countdown, setCountdown] = useState(0);
  
  const [myId, setMyId] = useState<string>('');
  const [loadingId, setLoadingId] = useState(true);
  const [hostId, setHostId] = useState<string>('');
  const [connectedPeer, setConnectedPeer] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // MUTEABLE GAME STATE (Refs)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState>({
    score: 0,
    birds: {},
    pipes: []
  });
  
  // Loop Control
  const gameLoopIdRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const syncTimerRef = useRef<number>(0);
  const groundXRef = useRef<number>(0);
  
  // Logic Control
  const isHostRef = useRef(false);
  const statusRef = useRef<GameStatus>('MENU');
  const myIdRef = useRef('');

  // Sync refs with state
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { myIdRef.current = myId; }, [myId]);

  // ==========================================
  // INITIALIZATION
  // ==========================================
  useEffect(() => {
    setLoadingId(true);
    peerService.init().then((id) => {
      setMyId(id);
      setLoadingId(false);
      gameStateRef.current.birds[id] = { ...INITIAL_BIRD, id, color: 'yellow' };
    }).catch(err => {
        console.error("Peer Init Error", err);
        setErrorMsg("Connection failed. Check network/Adblock.");
        setLoadingId(false);
    });

    peerService.onData = handleNetworkMessage;
    
    peerService.onDisconnect = () => {
        setConnectedPeer(null);
        setErrorMsg("Partner disconnected.");
        setStatus('MENU');
    };

    return () => {
      peerService.destroy();
      cancelAnimationFrame(gameLoopIdRef.current);
    };
  }, []);

  useEffect(() => {
    peerService.onConnect = (partnerId) => {
      setConnectedPeer(partnerId);
      if (isHost) {
          gameStateRef.current.birds[partnerId] = { ...INITIAL_BIRD, id: partnerId, color: 'red' };
      } else {
        setStatus('LOBBY');
      }
    };
  }, [isHost]);

  // ==========================================
  // NETWORK HANDLING
  // ==========================================
  const handleNetworkMessage = (msg: NetworkMessage) => {
    const current = gameStateRef.current;
    
    switch (msg.type) {
      case 'PLAYER_UPDATE':
        // Update the remote bird with authoritative data
        if (current.birds[msg.id]) {
            const b = current.birds[msg.id];
            // Smoothly interpolate or snap? Snapping is safer for "Flying Nowhere" bugs
            // but we can lerp y for smoothness if needed. For now, strict snap prevents desync.
            b.y = msg.y;
            b.velocity = msg.velocity;
            b.rotation = msg.rotation;
            b.isDead = msg.isDead;
        } else {
            // If bird doesn't exist yet (late join sync), create it
            current.birds[msg.id] = {
                id: msg.id,
                y: msg.y,
                velocity: msg.velocity,
                isDead: msg.isDead,
                rotation: msg.rotation,
                color: isHostRef.current ? 'red' : 'yellow' // Color logic might vary but OK for now
            };
        }
        break;
        
      case 'PIPE_SYNC':
        // Guest receives pipes from Host
        if (!isHostRef.current) {
            current.pipes = msg.pipes;
            current.score = msg.score;
            setScore(msg.score);
        }
        break;

      case 'START_REQ':
        // Guest requested start (if we add that feature), or Host broadcast start
        if (!isHostRef.current) startCountdownSequence();
        break;

      case 'RESTART':
        startCountdownSequence();
        break;

      case 'DIE':
        // Backup death event just in case
        if (current.birds[msg.playerId]) {
            current.birds[msg.playerId].isDead = true;
            current.birds[msg.playerId].y = msg.y;
        }
        break;
    }
  };

  const sendPlayerUpdate = () => {
      if (!connectedPeer) return;
      const myBird = gameStateRef.current.birds[myIdRef.current];
      if (!myBird) return;
      
      peerService.send({
          type: 'PLAYER_UPDATE',
          id: myIdRef.current,
          y: myBird.y,
          velocity: myBird.velocity,
          rotation: myBird.rotation,
          isDead: myBird.isDead
      });
  };

  const sendPipeSync = () => {
      if (!connectedPeer) return;
      peerService.send({
          type: 'PIPE_SYNC',
          pipes: gameStateRef.current.pipes,
          score: gameStateRef.current.score
      });
  };

  // ==========================================
  // GAME LOGIC
  // ==========================================
  
  const startCountdownSequence = () => {
      // 1. Reset Game State
      const current = gameStateRef.current;
      current.score = 0;
      current.pipes = [];
      Object.keys(current.birds).forEach(k => {
          current.birds[k].y = BIRD_START_Y;
          current.birds[k].velocity = 0;
          current.birds[k].rotation = 0;
          current.birds[k].isDead = false;
      });
      setScore(0);
      spawnTimerRef.current = 0;
      lastTimeRef.current = 0;
      
      // 2. Start Countdown UI
      setStatus('COUNTDOWN');
      setCountdown(3);
      
      let count = 3;
      const interval = setInterval(() => {
          count--;
          if (count > 0) {
              setCountdown(count);
          } else {
              clearInterval(interval);
              setStatus('PLAYING');
          }
      }, 1000);
  };

  const handleStartGame = () => {
      if (isHost) {
          peerService.send({ type: 'RESTART' }); // Use RESTART type for both start/restart
          startCountdownSequence();
      }
  };

  // ==========================================
  // GAME LOOP
  // ==========================================
  const loop = (time: number) => {
    if (lastTimeRef.current === 0) {
        lastTimeRef.current = time;
        gameLoopIdRef.current = requestAnimationFrame(loop);
        return;
    }

    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;
    
    const safeDt = Math.min(dt, 100);
    const timeScale = safeDt / 16.66; 

    update(safeDt, timeScale);
    draw();

    gameLoopIdRef.current = requestAnimationFrame(loop);
  };

  const update = (dt: number, timeScale: number) => {
    // animate ground in lobby/countdown/playing
    if (statusRef.current === 'LOBBY' || statusRef.current === 'MENU' || statusRef.current === 'COUNTDOWN' || statusRef.current === 'PLAYING') {
         groundXRef.current = (groundXRef.current - (PIPE_SPEED * timeScale)) % 24;
    }

    if (statusRef.current !== 'PLAYING') return;

    const current = gameStateRef.current;
    
    // -- HOST ONLY: Pipe Spawning --
    if (isHostRef.current) {
        spawnTimerRef.current += dt;
        if (spawnTimerRef.current >= PIPE_SPAWN_RATE_MS) {
            spawnTimerRef.current -= PIPE_SPAWN_RATE_MS;
            const minPipeH = 50;
            const maxPipeH = GAME_HEIGHT - GROUND_HEIGHT - PIPE_GAP - minPipeH;
            const randomH = Math.floor(Math.random() * (maxPipeH - minPipeH + 1)) + minPipeH;
            current.pipes.push({
                id: Date.now(),
                x: GAME_WIDTH,
                topHeight: randomH,
                passed: false
            });
            // Send sync immediately on spawn to ensure guest gets it
            sendPipeSync();
        }
    }

    // -- ALL: Pipe Movement --
    // Both move pipes locally for smoothness.
    // Guest will snap to Host positions when PIPE_SYNC arrives.
    for (let i = current.pipes.length - 1; i >= 0; i--) {
        const p = current.pipes[i];
        p.x -= PIPE_SPEED * timeScale;
        
        if (p.x + PIPE_WIDTH < -100) {
            current.pipes.splice(i, 1);
        }
    }

    // -- HOST ONLY: Scoring --
    if (isHostRef.current) {
        let scoreChanged = false;
        current.pipes.forEach(p => {
            if (!p.passed && p.x + PIPE_WIDTH < BIRD_START_X) {
                p.passed = true;
                current.score += 1;
                scoreChanged = true;
            }
        });
        if (scoreChanged) {
            setScore(current.score);
            sendPipeSync();
        }
    }

    // -- ALL: Physics (Authoritative Self, Interpolated Remote) --
    
    // 1. My Bird Logic
    const myBird = current.birds[myIdRef.current];
    if (myBird) {
        if (!myBird.isDead) {
            myBird.velocity += GRAVITY * timeScale;
            myBird.y += myBird.velocity * timeScale;

            // Rotation
            if (myBird.velocity < 0) {
                myBird.rotation = -25;
            } else if (myBird.velocity > 0) {
                myBird.rotation += 2 * timeScale;
                if (myBird.rotation > 90) myBird.rotation = 90;
            }

            // Boundaries
            if (myBird.y + BIRD_SIZE >= GAME_HEIGHT - GROUND_HEIGHT) {
                myBird.y = GAME_HEIGHT - GROUND_HEIGHT - BIRD_SIZE;
                myBird.isDead = true;
                triggerFlash();
            }
            if (myBird.y < 0) {
                myBird.y = 0;
                myBird.velocity = 0;
            }
            
            // Pipe Collision
            const hitbox = {
                t: myBird.y + 8,
                b: myBird.y + BIRD_SIZE - 8,
                l: BIRD_START_X + 8,
                r: BIRD_START_X + BIRD_SIZE - 8
            };

            for (const p of current.pipes) {
                if (hitbox.r > p.x && hitbox.l < p.x + PIPE_WIDTH) {
                    if (hitbox.t < p.topHeight || hitbox.b > p.topHeight + PIPE_GAP) {
                        myBird.isDead = true;
                        triggerFlash();
                    }
                }
            }
        } else {
             // Dead Fall
             if (myBird.y + BIRD_SIZE < GAME_HEIGHT - GROUND_HEIGHT) {
                myBird.y += 10 * timeScale;
                myBird.rotation = 90;
             }
        }
    }

    // 2. Remote Birds Logic (Simulate Gravity/Fall for smoothness between updates)
    (Object.values(current.birds) as BirdState[]).forEach(bird => {
        if (bird.id !== myIdRef.current) {
            if (!bird.isDead) {
                // Apply simple gravity prediction
                bird.velocity += GRAVITY * timeScale;
                bird.y += bird.velocity * timeScale;
                 // Rotation
                if (bird.velocity < 0) {
                    bird.rotation = -25;
                } else if (bird.velocity > 0) {
                    bird.rotation += 2 * timeScale;
                    if (bird.rotation > 90) bird.rotation = 90;
                }
            } else {
                 if (bird.y + BIRD_SIZE < GAME_HEIGHT - GROUND_HEIGHT) {
                    bird.y += 10 * timeScale;
                    bird.rotation = 90;
                 }
            }
        }
    });

    // -- SYNC TIMERS --
    // Send my updates frequently
    syncTimerRef.current += dt;
    if (syncTimerRef.current > 45) { // ~20 times per second
        sendPlayerUpdate();
        
        // Host also syncs pipes periodically to correct drift
        if (isHostRef.current) {
            sendPipeSync();
        }
        
        syncTimerRef.current = 0;
    }

    // Game Over Check
    const allDead = (Object.values(current.birds) as BirdState[]).every(b => b.isDead);
    if (allDead && Object.values(current.birds).length > 0) {
        setStatus('GAME_OVER');
    }
  };

  const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const current = gameStateRef.current;
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // --- 1. Pipes ---
      current.pipes.forEach(p => {
          ctx.fillStyle = '#73bf2e';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 4;
          
          // Top
          ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topHeight);
          ctx.strokeRect(p.x, -4, PIPE_WIDTH, p.topHeight + 4); 
          ctx.strokeRect(p.x - 4, p.topHeight - 32, PIPE_WIDTH + 8, 32);
          ctx.fillRect(p.x - 2, p.topHeight - 30, PIPE_WIDTH + 4, 28);
          // Highlight
          ctx.fillStyle = '#9ce659';
          ctx.globalAlpha = 0.3;
          ctx.fillRect(p.x + PIPE_WIDTH - 10, 0, 6, p.topHeight);
          ctx.globalAlpha = 1.0;

          // Bottom
          const bottomPipeY = p.topHeight + PIPE_GAP;
          const bottomPipeH = GAME_HEIGHT - GROUND_HEIGHT - bottomPipeY;
          ctx.fillStyle = '#73bf2e';
          ctx.fillRect(p.x, bottomPipeY, PIPE_WIDTH, bottomPipeH);
          ctx.strokeRect(p.x, bottomPipeY, PIPE_WIDTH, bottomPipeH + 4); 
          ctx.strokeRect(p.x - 4, bottomPipeY, PIPE_WIDTH + 8, 32);
          ctx.fillRect(p.x - 2, bottomPipeY + 2, PIPE_WIDTH + 4, 28);
          // Highlight
          ctx.fillStyle = '#9ce659';
          ctx.globalAlpha = 0.3;
          ctx.fillRect(p.x + PIPE_WIDTH - 10, bottomPipeY, 6, bottomPipeH);
          ctx.globalAlpha = 1.0;
      });

      // --- 2. Ground ---
      const gx = groundXRef.current;
      const gy = GAME_HEIGHT - GROUND_HEIGHT;
      ctx.fillStyle = '#ded895';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.rect(0, gy, GAME_WIDTH, GROUND_HEIGHT);
      ctx.fill();
      ctx.stroke();

      // Grass Top
      ctx.fillStyle = '#73bf2e';
      ctx.fillRect(0, gy, GAME_WIDTH, 16);
      ctx.strokeRect(0, gy, GAME_WIDTH, 16);
      
      // Pattern
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, gy + 16, GAME_WIDTH, GROUND_HEIGHT - 16);
      ctx.clip();
      ctx.strokeStyle = '#d0c874';
      ctx.lineWidth = 12;
      for (let i = -24; i < GAME_WIDTH + 24; i += 24) {
          ctx.beginPath();
          ctx.moveTo(i + gx, gy + 16);
          ctx.lineTo(i + gx - 24, GAME_HEIGHT);
          ctx.stroke();
      }
      ctx.restore();

      // --- 3. Birds ---
      const myId = myIdRef.current;
      const sortedBirds = (Object.values(current.birds) as BirdState[]).sort((a, b) => {
          if (a.id === myId) return 1;
          if (b.id === myId) return -1;
          return 0;
      });

      sortedBirds.forEach(bird => {
          ctx.save();
          ctx.translate(BIRD_START_X + BIRD_SIZE/2, bird.y + (BIRD_SIZE*0.7)/2);
          ctx.rotate((bird.rotation * Math.PI) / 180);
          ctx.translate(-(BIRD_START_X + BIRD_SIZE/2), -(bird.y + (BIRD_SIZE*0.7)/2));

          const x = BIRD_START_X;
          const y = bird.y;
          const w = BIRD_SIZE;
          const h = BIRD_SIZE * 0.7;

          // Color
          const isMe = bird.id === myId;
          const isYellow = isMe ? (isHostRef.current ? true : false) : (isHostRef.current ? false : true); 
          // Simplified: Host always yellow? No, Host is self, Guest is self. 
          // Let's stick to: My bird = yellow, Enemy = red for visibility.
          const colorHex = isMe ? '#facc15' : '#ef4444';
          
          ctx.fillStyle = bird.isDead ? '#999' : colorHex;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);

          // Eye
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x + w - 8, y + 4, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.arc(x + w - 6, y + 4, 2, 0, Math.PI * 2);
          ctx.fill();

          // Beak
          ctx.fillStyle = '#f97316';
          ctx.fillRect(x + w - 4, y + 10, 8, 8);
          ctx.strokeRect(x + w - 4, y + 10, 8, 8);

          // Wing
          ctx.fillStyle = '#fff';
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.ellipse(x + 10, y + 14, 8, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.globalAlpha = 1.0;

          if (!isMe) {
             ctx.fillStyle = '#fff';
             ctx.font = 'bold 10px sans-serif';
             ctx.fillText('P2', x + 10, y - 10);
          }
          ctx.restore();
      });
  };

  // ==========================================
  // INPUT
  // ==========================================
  const triggerFlash = () => {
    const flashEl = document.getElementById('flash-overlay');
    if (flashEl) {
        flashEl.style.opacity = '0.8';
        setTimeout(() => flashEl.style.opacity = '0', 50);
    }
  };

  const handleJump = useCallback(() => {
    if (statusRef.current !== 'PLAYING') return;
    const myBird = gameStateRef.current.birds[myIdRef.current];
    if (myBird && !myBird.isDead) {
        myBird.velocity = JUMP_STRENGTH;
        // Immediate send for responsiveness, though loop will send periodic updates too
        sendPlayerUpdate();
    }
  }, []);

  const handleRestart = () => {
    if (isHost) {
        handleStartGame();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(myId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Start Loop
  useEffect(() => {
    gameLoopIdRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(gameLoopIdRef.current);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            handleJump();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleJump]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 w-full relative overflow-hidden" 
         onTouchStart={handleJump} 
         onMouseDown={handleJump}>
      
      {/* Background Parallax */}
      <div className="absolute inset-0 z-0 bg-[#70c5ce]">
         <div className="absolute bottom-[100px] left-0 w-full opacity-50 h-[200px]"
              style={{ backgroundImage: 'linear-gradient(to top, #a3e6af 0%, transparent 100%)' }}>
            <div className="absolute bottom-0 left-10 w-10 h-32 bg-[#a3e6af] border-t-4 border-x-4 border-[#5ca66a]"></div>
            <div className="absolute bottom-0 left-60 w-8 h-40 bg-[#a3e6af] border-t-4 border-x-4 border-[#5ca66a]"></div>
            <div className="absolute bottom-0 left-80 w-16 h-24 bg-[#a3e6af] border-t-4 border-x-4 border-[#5ca66a]"></div>
         </div>
      </div>

      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center gap-6 pointer-events-none">
        
        {/* Title */}
        {status === 'MENU' && (
            <div className="animate-bounce mb-4 pointer-events-auto">
                 <h1 className="text-4xl md:text-6xl text-white font-bold tracking-widest drop-shadow-[4px_4px_0_#000]" 
                    style={{ textShadow: '4px 4px 0px #ea580c' }}>
                FLAP<br/>TOGETHER
                </h1>
            </div>
        )}

        {/* MENU UI */}
        {status === 'MENU' && (
             <div className="bg-[#ded895] p-6 rounded-lg border-4 border-black shadow-[8px_8px_0_#000] w-full max-w-md pointer-events-auto">
                {errorMsg && <div className="bg-red-500 text-white p-2 mb-4 text-xs font-bold border-2 border-black animate-pulse">{errorMsg}</div>}
                
                <div className="flex flex-col gap-4">
                    <button 
                        onClick={() => { setIsHost(true); setStatus('LOBBY'); }}
                        className="flex items-center justify-center gap-2 bg-[#f97316] hover:bg-[#ea580c] text-white font-bold py-4 border-b-4 border-r-4 border-black active:border-0 active:translate-y-1 transition-all disabled:opacity-50"
                        disabled={loadingId}
                    >
                         {loadingId ? <Loader2 className="animate-spin" /> : <Play size={20} />} CREATE GAME
                    </button>
                    
                    <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t-2 border-black/20"></div>
                        <span className="flex-shrink-0 mx-4 text-black/50 text-xs font-bold">OR JOIN FRIEND</span>
                        <div className="flex-grow border-t-2 border-black/20"></div>
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); if(hostId) { setIsHost(false); peerService.connect(hostId); } }} className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder={loadingId ? "LOADING..." : "PASTE ID HERE"}
                            value={hostId}
                            onChange={e => setHostId(e.target.value)}
                            disabled={loadingId}
                            className="flex-1 bg-white border-4 border-black p-2 outline-none font-mono uppercase text-sm placeholder-gray-400 text-black"
                        />
                        <button 
                            type="submit"
                            className="bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold px-4 border-b-4 border-r-4 border-black active:border-0 active:translate-y-1 transition-all disabled:opacity-50"
                            disabled={loadingId}
                        >
                            JOIN
                        </button>
                    </form>
                </div>
                
                <div className="mt-6 text-center text-[10px] text-black/60">
                    ID: <span className="font-mono bg-white border border-black px-1 text-black">{loadingId ? '...' : (myId || 'ERROR')}</span>
                </div>
             </div>
        )}

        {/* LOBBY UI */}
        {status === 'LOBBY' && (
             <div className="bg-[#ded895] p-6 rounded-lg border-4 border-black shadow-[8px_8px_0_#000] w-full max-w-md text-center pointer-events-auto">
                <h2 className="text-xl font-bold mb-6 text-[#f97316] drop-shadow-[1px_1px_0_#000]">LOBBY</h2>
                <div className="flex justify-center gap-8 mb-8">
                    <div className="flex flex-col items-center">
                        <div className="w-12 h-12 bg-[#facc15] border-4 border-black mb-2 animate-bounce rounded-sm"></div>
                        <span className="font-bold text-xs text-black">YOU</span>
                    </div>
                    <div className="flex items-center">
                        <div className="text-2xl font-bold animate-pulse text-black/50">VS</div>
                    </div>
                    <div className="flex flex-col items-center">
                        <div className={`w-12 h-12 border-4 border-black mb-2 rounded-sm transition-colors ${connectedPeer ? 'bg-[#ef4444] animate-bounce' : 'bg-gray-300'}`}></div>
                        <span className="font-bold text-xs text-black">{connectedPeer ? 'P2' : '...'}</span>
                    </div>
                </div>

                {isHost ? (
                    <div className="flex flex-col gap-4">
                         {!connectedPeer && (
                            <div className="bg-white border-4 border-black p-3 mb-2 flex flex-col gap-2">
                                <span className="text-[10px] text-gray-500 font-bold uppercase">Share this ID</span>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 text-xs font-mono bg-gray-100 p-1 truncate select-all text-black">{myId}</code>
                                    <button onClick={handleCopy} className={`p-1 border-2 border-black hover:bg-gray-100 ${copied ? 'bg-green-200' : ''}`}>
                                        <Copy size={14} className="text-black" />
                                    </button>
                                </div>
                            </div>
                         )}
                        <button 
                            onClick={handleStartGame}
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

        {/* COUNTDOWN UI */}
        {status === 'COUNTDOWN' && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 text-center animate-in zoom-in duration-300">
                <div className="text-8xl font-black text-white stroke-black drop-shadow-[4px_4px_0_#000]" style={{ WebkitTextStroke: '3px black' }}>
                    {countdown}
                </div>
            </div>
        )}

        {/* SCORE DISPLAY */}
        {(status === 'PLAYING' || status === 'COUNTDOWN') && (
            <div className="absolute top-16 w-full text-center z-40 pointer-events-none">
                <span className="text-5xl font-bold text-white drop-shadow-[3px_3px_0_#000] stroke-black" style={{ WebkitTextStroke: '2px black' }}>
                {score}
                </span>
            </div>
        )}

        {/* GAME OVER UI */}
        {status === 'GAME_OVER' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 pointer-events-auto">
                <div className="bg-[#ded895] border-4 border-black p-4 text-center shadow-[8px_8px_0_#000] animate-in zoom-in duration-300">
                    <h2 className="text-3xl text-[#f97316] font-bold mb-4 drop-shadow-[2px_2px_0_#000]">GAME OVER</h2>
                    <div className="flex gap-4 justify-center mb-6">
                        <div className="bg-[#cbb968] border-2 border-black p-2 w-24 rounded">
                            <p className="text-[10px] text-[#f97316] font-bold">SCORE</p>
                            <p className="text-2xl text-white font-bold drop-shadow-[1px_1px_0_#000]">{score}</p>
                        </div>
                    </div>
                    {isHost ? (
                         <button 
                            onClick={handleRestart}
                            className="bg-white text-black px-6 py-3 font-bold border-4 border-black shadow-[4px_4px_0_#000] hover:bg-gray-100 active:translate-y-1 active:shadow-none transition-all flex items-center gap-2 mx-auto"
                        >
                            <RotateCcw size={18} /> RESTART
                        </button>
                    ) : (
                        <div className="text-white text-shadow animate-pulse font-bold">
                            WAITING FOR RESTART...
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>

      {/* CANVAS LAYER */}
      <canvas 
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full object-contain max-w-[400px] aspect-[2/3] z-5 shadow-2xl ring-8 ring-black rounded-lg bg-transparent"
      />
      
      {/* Flash Effect */}
      <div id="flash-overlay" className="absolute inset-0 bg-white pointer-events-none opacity-0 transition-opacity duration-100 z-50"></div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);