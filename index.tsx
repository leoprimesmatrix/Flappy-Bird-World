
import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import Peer, { DataConnection } from 'peerjs';
import { Copy, Play, RotateCcw, Loader2, AlertTriangle, X } from 'lucide-react';

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

export interface GameEngineState {
  score: number;
  birds: Map<string, BirdState>;
  pipes: PipeData[];
  status: GameStatus;
  groundX: number;
}

// Network Payload Types
export type NetworkMessage =
  | { type: 'JOIN'; playerId: string }
  | { type: 'WELCOME'; hostId: string; initialState: any }
  | { type: 'START_REQ' }
  | { type: 'RESTART' }
  | { type: 'SYNC_PACKET'; 
      t: number; // Timestamp
      b: { y: number; v: number; r: number; d: boolean }; // Bird Data
      p?: PipeData[]; // Pipes (Host only)
      s?: number; // Score (Host only)
    }
  | { type: 'DIE'; playerId: string; y: number };

// ==========================================
// CONSTANTS
// ==========================================
export const GRAVITY = 0.5;
export const JUMP_STRENGTH = -8;
export const PIPE_SPEED = 3; 
export const PIPE_SPAWN_RATE_MS = 1500; 
export const PIPE_GAP = 150; 
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
  public myId: string = '';
  
  public onConnect?: (partnerId: string) => void;
  public onData?: (data: NetworkMessage) => void;
  public onDisconnect?: () => void;

  constructor() {}

  async init(givenId?: string): Promise<string> {
    if (this.peer && !this.peer.destroyed) return this.myId;

    return new Promise((resolve, reject) => {
      // Use a random ID if none provided
      this.peer = new Peer(givenId || '', { debug: 0 });

      const timeout = setTimeout(() => reject(new Error("Connection timed out")), 10000);

      this.peer.on('open', (id) => {
        clearTimeout(timeout);
        this.myId = id;
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        if (this.conn) {
            conn.close(); // Only 1 player allowed
            return;
        }
        this.setupConnection(conn);
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        console.error('Peer error:', err);
      });
      
      this.peer.on('disconnected', () => {
        this.onDisconnect?.();
      });
    });
  }

  connect(peerId: string) {
    if (!this.peer) return;
    const conn = this.peer.connect(peerId, { reliable: true });
    this.setupConnection(conn);
  }

  private setupConnection(conn: DataConnection) {
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
        console.error('Conn error', err);
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

export default function App() {
  // REACT STATE (UI ONLY)
  const [uiStatus, setUiStatus] = useState<GameStatus>('MENU');
  const [uiScore, setUiScore] = useState(0); 
  const [uiCountdown, setUiCountdown] = useState(0);
  const [myId, setMyId] = useState<string>('');
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joinInput, setJoinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [copied, setCopied] = useState(false);

  // GAME ENGINE STATE (MUTABLE REF)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngineState>({
    score: 0,
    birds: new Map(),
    pipes: [],
    status: 'MENU',
    groundX: 0
  });

  // Loop & Logic Refs
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const syncTimerRef = useRef<number>(0);

  // ==========================================
  // INITIALIZATION
  // ==========================================
  useEffect(() => {
    const initPeer = async () => {
        try {
            const id = await peerService.init();
            setMyId(id);
            setLoading(false);
            
            // Initialize my bird in engine
            engineRef.current.birds.set(id, {
                id, y: BIRD_START_Y, velocity: 0, isDead: false, color: 'yellow', rotation: 0
            });
        } catch (e) {
            setErrorMsg("Failed to connect to network.");
            setLoading(false);
        }
    };
    initPeer();

    // Setup Network Callbacks
    peerService.onConnect = (pid) => {
        // Handshake logic
        // If I am host, I wait for JOIN. If I am guest, I send JOIN.
        // We handle this via the connection establishing direction primarily.
    };

    peerService.onData = handleNetworkPacket;
    
    peerService.onDisconnect = () => {
        setPartnerId(null);
        setUiStatus('MENU');
        engineRef.current.status = 'MENU';
        setErrorMsg("Partner disconnected");
        
        // Remove partner bird
        if (partnerId) engineRef.current.birds.delete(partnerId);
    };

    // Start Game Loop
    requestRef.current = requestAnimationFrame(gameLoop);

    return () => {
        peerService.destroy();
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // Handle Host/Join Logic
  useEffect(() => {
      if (partnerId) {
          // If I am guest, send JOIN immediately
          if (!isHost) {
              peerService.send({ type: 'JOIN', playerId: myId });
          }
      }
  }, [partnerId, isHost, myId]);

  // ==========================================
  // NETWORK HANDLER
  // ==========================================
  const handleNetworkPacket = (msg: NetworkMessage) => {
      const eng = engineRef.current;

      switch (msg.type) {
          case 'JOIN':
              // Host receives JOIN
              if (isHost) {
                  setPartnerId(msg.playerId);
                  eng.birds.set(msg.playerId, {
                      id: msg.playerId, y: BIRD_START_Y, velocity: 0, isDead: false, color: 'red', rotation: 0
                  });
                  // Send WELCOME back
                  peerService.send({ 
                      type: 'WELCOME', 
                      hostId: myId,
                      initialState: { /* specific config if needed */ }
                  });
                  setUiStatus('LOBBY');
                  eng.status = 'LOBBY';
              }
              break;

          case 'WELCOME':
              // Guest receives WELCOME
              if (!isHost) {
                  setPartnerId(msg.hostId);
                  eng.birds.set(msg.hostId, {
                      id: msg.hostId, y: BIRD_START_Y, velocity: 0, isDead: false, color: 'red', rotation: 0
                  });
                  setUiStatus('LOBBY');
                  eng.status = 'LOBBY';
              }
              break;

          case 'START_REQ':
              startCountdown();
              break;

          case 'RESTART':
              startCountdown();
              break;

          case 'SYNC_PACKET':
              // Update Remote Bird
              // Find the OTHER bird (not me)
              const partner = partnerId ? eng.birds.get(partnerId) : null;
              if (partner) {
                  partner.y = msg.b.y;
                  partner.velocity = msg.b.v;
                  partner.rotation = msg.b.r;
                  partner.isDead = msg.b.d;
              }

              // Update Pipes (Guest Only)
              if (!isHost && msg.p) {
                  eng.pipes = msg.p;
              }
              
              // Update Score (Guest Only)
              if (!isHost && msg.s !== undefined) {
                  eng.score = msg.s;
                  setUiScore(msg.s);
              }
              break;
      }
  };

  // ==========================================
  // GAME ACTIONS
  // ==========================================
  const triggerHostStart = () => {
      if (isHost && partnerId) {
          peerService.send({ type: 'START_REQ' });
          startCountdown();
      }
  };

  const triggerJump = () => {
      if (engineRef.current.status !== 'PLAYING') return;
      
      const me = engineRef.current.birds.get(myId);
      if (me && !me.isDead) {
          me.velocity = JUMP_STRENGTH;
      }
  };

  const startCountdown = () => {
      // Reset State
      const eng = engineRef.current;
      eng.pipes = [];
      eng.score = 0;
      eng.status = 'COUNTDOWN';
      setUiScore(0);
      setUiStatus('COUNTDOWN');
      
      // Reset Birds
      eng.birds.forEach(b => {
          b.y = BIRD_START_Y;
          b.velocity = 0;
          b.isDead = false;
          b.rotation = 0;
      });

      // UI Timer
      let count = 3;
      setUiCountdown(3);
      const iv = setInterval(() => {
          count--;
          if (count > 0) {
              setUiCountdown(count);
          } else {
              clearInterval(iv);
              eng.status = 'PLAYING';
              setUiStatus('PLAYING');
              lastTimeRef.current = performance.now();
          }
      }, 1000);
  };

  // ==========================================
  // GAME LOOP (60 FPS)
  // ==========================================
  const gameLoop = (time: number) => {
      const dt = Math.min(time - lastTimeRef.current, 50); // Cap dt
      lastTimeRef.current = time;
      
      const eng = engineRef.current;
      
      updatePhysics(dt, eng);
      draw(eng);
      
      requestRef.current = requestAnimationFrame(gameLoop);
  };

  const updatePhysics = (dt: number, eng: GameEngineState) => {
      // Always scroll ground
      if (eng.status === 'LOBBY' || eng.status === 'PLAYING' || eng.status === 'COUNTDOWN') {
          eng.groundX = (eng.groundX - (PIPE_SPEED * (dt / 16))) % 24;
      }

      if (eng.status !== 'PLAYING') return;
      
      const timeScale = dt / 16.66; // Normalize to 60fps
      
      // 1. Update MY Physics
      const me = eng.birds.get(myId);
      if (me) {
          if (!me.isDead) {
              me.velocity += GRAVITY * timeScale;
              me.y += me.velocity * timeScale;
              
              // Rotation
              if (me.velocity < 0) me.rotation = -25;
              else {
                  me.rotation += 2 * timeScale;
                  if (me.rotation > 90) me.rotation = 90;
              }

              // Ceiling
              if (me.y < 0) { me.y = 0; me.velocity = 0; }
              
              // Floor
              if (me.y + BIRD_SIZE >= GAME_HEIGHT - GROUND_HEIGHT) {
                  me.y = GAME_HEIGHT - GROUND_HEIGHT - BIRD_SIZE;
                  me.isDead = true;
                  triggerFlash();
              }
              
              // Pipes Collision
              // Shrink hitbox slightly
              const hitbox = {
                  l: BIRD_START_X + 6,
                  r: BIRD_START_X + BIRD_SIZE - 6,
                  t: me.y + 6,
                  b: me.y + BIRD_SIZE - 6
              };

              for (const p of eng.pipes) {
                  // X Overlap
                  if (hitbox.r > p.x && hitbox.l < p.x + PIPE_WIDTH) {
                      // Y Overlap (Hit top pipe OR Hit bottom pipe)
                      if (hitbox.t < p.topHeight || hitbox.b > p.topHeight + PIPE_GAP) {
                          me.isDead = true;
                          triggerFlash();
                      }
                  }
              }

          } else {
              // Dead Fall
              if (me.y + BIRD_SIZE < GAME_HEIGHT - GROUND_HEIGHT) {
                  me.y += 10 * timeScale;
                  me.rotation = 90;
              }
          }
      }

      // 2. Pipes Logic
      if (isHost) {
          // Spawn
          spawnTimerRef.current += dt;
          if (spawnTimerRef.current >= PIPE_SPAWN_RATE_MS) {
              spawnTimerRef.current = 0;
              const minH = 50;
              const maxH = GAME_HEIGHT - GROUND_HEIGHT - PIPE_GAP - minH;
              const h = Math.floor(Math.random() * (maxH - minH)) + minH;
              
              eng.pipes.push({
                  id: Date.now(),
                  x: GAME_WIDTH,
                  topHeight: h,
                  passed: false
              });
          }

          // Move
          for (let i = eng.pipes.length - 1; i >= 0; i--) {
              const p = eng.pipes[i];
              p.x -= PIPE_SPEED * timeScale;
              if (p.x < -100) eng.pipes.splice(i, 1);
              
              // Score
              if (!p.passed && p.x + PIPE_WIDTH < BIRD_START_X) {
                  p.passed = true;
                  eng.score++;
                  setUiScore(eng.score);
              }
          }
      } else {
          // Guest moves pipes locally for smoothness, 
          // but they get overwritten by Sync Packet
          eng.pipes.forEach(p => {
              p.x -= PIPE_SPEED * timeScale;
          });
      }

      // 3. Network Sync (Send updates)
      syncTimerRef.current += dt;
      if (syncTimerRef.current >= 33 && me) { // ~30 times a second
          syncTimerRef.current = 0;
          
          const packet: NetworkMessage = {
              type: 'SYNC_PACKET',
              t: Date.now(),
              b: { 
                  y: Math.round(me.y), 
                  v: me.velocity, 
                  r: Math.round(me.rotation), 
                  d: me.isDead 
              }
          };

          if (isHost) {
              packet.p = eng.pipes; // Host sends pipes
              packet.s = eng.score; // Host sends score
          }

          peerService.send(packet);
      }

      // 4. Game Over Check
      const birds = Array.from(eng.birds.values());
      if (birds.length > 0 && birds.every(b => b.isDead) && eng.status === 'PLAYING') {
          eng.status = 'GAME_OVER';
          setUiStatus('GAME_OVER');
      }
  };

  const draw = (eng: GameEngineState) => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const ctx = cvs.getContext('2d');
      if (!ctx) return;

      // Clear
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // --- Background ---
      // Sky
      // ctx.fillStyle = '#70c5ce';
      // ctx.fillRect(0,0, GAME_WIDTH, GAME_HEIGHT);
      
      // Pipes
      eng.pipes.forEach(p => {
          // Top
          ctx.fillStyle = '#73bf2e';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 3;
          ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topHeight);
          ctx.strokeRect(p.x, -2, PIPE_WIDTH, p.topHeight + 2);
          
          // Cap
          ctx.fillRect(p.x - 2, p.topHeight - 24, PIPE_WIDTH + 4, 24);
          ctx.strokeRect(p.x - 2, p.topHeight - 24, PIPE_WIDTH + 4, 24);

          // Bottom
          const bY = p.topHeight + PIPE_GAP;
          const bH = GAME_HEIGHT - GROUND_HEIGHT - bY;
          ctx.fillRect(p.x, bY, PIPE_WIDTH, bH);
          ctx.strokeRect(p.x, bY - 2, PIPE_WIDTH, bH + 2);
          
          // Cap
          ctx.fillRect(p.x - 2, bY, PIPE_WIDTH + 4, 24);
          ctx.strokeRect(p.x - 2, bY, PIPE_WIDTH + 4, 24);
      });

      // Ground
      const gy = GAME_HEIGHT - GROUND_HEIGHT;
      ctx.fillStyle = '#ded895';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.fillRect(0, gy, GAME_WIDTH, GROUND_HEIGHT);
      ctx.strokeRect(-2, gy, GAME_WIDTH + 4, GROUND_HEIGHT + 2);
      
      // Grass line
      ctx.fillStyle = '#73bf2e';
      ctx.fillRect(0, gy, GAME_WIDTH, 12);
      ctx.strokeRect(-2, gy, GAME_WIDTH + 4, 12);

      // Scroll Pattern
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, gy + 12, GAME_WIDTH, GROUND_HEIGHT - 12);
      ctx.clip();
      ctx.strokeStyle = '#d0c874';
      ctx.lineWidth = 4;
      for (let i = -24; i < GAME_WIDTH + 24; i += 24) {
          ctx.beginPath();
          ctx.moveTo(i + eng.groundX, gy + 12);
          ctx.lineTo(i + eng.groundX - 16, GAME_HEIGHT);
          ctx.stroke();
      }
      ctx.restore();

      // Birds
      eng.birds.forEach(b => {
          ctx.save();
          ctx.translate(BIRD_START_X + BIRD_SIZE/2, b.y + BIRD_SIZE/2);
          ctx.rotate((b.rotation * Math.PI) / 180);
          ctx.translate(-(BIRD_START_X + BIRD_SIZE/2), -(b.y + BIRD_SIZE/2));

          const isMe = b.id === myId;
          const color = b.color === 'yellow' ? '#facc15' : '#ef4444';
          
          ctx.fillStyle = b.isDead ? '#666' : color;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          ctx.fillRect(BIRD_START_X, b.y, BIRD_SIZE, BIRD_SIZE * 0.7);
          ctx.strokeRect(BIRD_START_X, b.y, BIRD_SIZE, BIRD_SIZE * 0.7);

          // Eye
          ctx.fillStyle = '#fff';
          ctx.fillRect(BIRD_START_X + BIRD_SIZE - 10, b.y + 2, 8, 8);
          ctx.strokeRect(BIRD_START_X + BIRD_SIZE - 10, b.y + 2, 8, 8);
          
          // Wing
          ctx.fillStyle = '#fff';
          ctx.fillRect(BIRD_START_X + 6, b.y + 12, 10, 6);
          ctx.strokeRect(BIRD_START_X + 6, b.y + 12, 10, 6);
          
          // Beak
          ctx.fillStyle = '#f97316';
          ctx.fillRect(BIRD_START_X + BIRD_SIZE - 4, b.y + 12, 8, 6);
          ctx.strokeRect(BIRD_START_X + BIRD_SIZE - 4, b.y + 12, 8, 6);

          // Label
          if (!isMe) {
              ctx.fillStyle = '#fff';
              ctx.font = '10px monospace';
              ctx.fillText('P2', BIRD_START_X + 10, b.y - 5);
          }

          ctx.restore();
      });
  };

  const triggerFlash = () => {
    const el = document.getElementById('flash-fx');
    if (el) {
        el.style.opacity = '1';
        setTimeout(() => el.style.opacity = '0', 100);
    }
  };

  const handleCopy = () => {
      navigator.clipboard.writeText(myId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center relative overflow-hidden font-sans"
         onMouseDown={triggerJump}
         onTouchStart={(e) => { e.preventDefault(); triggerJump(); }}>
      
      {/* Background Decor */}
      <div className="absolute inset-0 z-0 bg-[#70c5ce]">
         <div className="absolute bottom-[100px] left-0 w-full opacity-60 h-[200px]"
              style={{ backgroundImage: 'linear-gradient(to top, #a3e6af 0%, transparent 100%)' }}>
            <div className="absolute bottom-0 left-10 w-10 h-32 bg-[#5ca66a] border-t-4 border-x-4 border-black/20"></div>
            <div className="absolute bottom-0 left-60 w-8 h-40 bg-[#5ca66a] border-t-4 border-x-4 border-black/20"></div>
            <div className="absolute bottom-0 left-96 w-16 h-24 bg-[#5ca66a] border-t-4 border-x-4 border-black/20"></div>
         </div>
      </div>

      {/* --- UI LAYER --- */}
      <div className="relative z-20 pointer-events-none w-full max-w-md px-4 flex flex-col items-center">
        
        {/* Title */}
        {uiStatus === 'MENU' && (
            <div className="mb-8 animate-bounce">
                <h1 className="text-5xl font-black text-[#facc15] stroke-black drop-shadow-[4px_4px_0_#000]" 
                    style={{ WebkitTextStroke: '2px black' }}>
                    FLAP<br/>TOGETHER
                </h1>
            </div>
        )}

        {/* --- MENUS --- */}
        {uiStatus === 'MENU' && (
            <div className="bg-[#ded895] w-full p-6 border-4 border-black shadow-[8px_8px_0_#000] pointer-events-auto rounded-xl">
                 {errorMsg && (
                    <div className="bg-red-500 text-white font-bold text-xs p-2 mb-4 border-2 border-black animate-pulse flex items-center justify-between">
                        {errorMsg}
                        <X size={14} onClick={() => setErrorMsg('')} className="cursor-pointer" />
                    </div>
                 )}
                 
                 <div className="flex flex-col gap-4">
                     <button onClick={() => { setIsHost(true); setUiStatus('LOBBY'); engineRef.current.status = 'LOBBY'; }}
                             disabled={loading}
                             className="bg-[#f97316] text-white font-bold py-4 border-b-4 border-r-4 border-black active:border-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 hover:brightness-110">
                          {loading ? <Loader2 className="animate-spin" /> : <Play fill="currentColor" />} CREATE GAME
                     </button>
                     
                     <div className="flex items-center gap-2 py-2">
                         <div className="h-0.5 flex-1 bg-black/20"></div>
                         <span className="text-xs font-bold text-black/50">OR</span>
                         <div className="h-0.5 flex-1 bg-black/20"></div>
                     </div>

                     <form onSubmit={(e) => { e.preventDefault(); if(joinInput) { setIsHost(false); peerService.connect(joinInput); } }} className="flex gap-2">
                         <input type="text" placeholder="ENTER ID" 
                                value={joinInput} onChange={e => setJoinInput(e.target.value)}
                                className="flex-1 border-4 border-black p-2 font-mono uppercase bg-white text-black outline-none focus:bg-blue-50" />
                         <button type="submit" disabled={loading}
                                 className="bg-[#3b82f6] text-white font-bold px-4 border-b-4 border-r-4 border-black active:border-0 active:translate-y-1 transition-all hover:brightness-110">
                            JOIN
                         </button>
                     </form>
                 </div>
                 
                 <div className="mt-4 text-center">
                     <span className="text-[10px] font-bold text-black/40">YOUR ID:</span>
                     <div className="font-mono text-xs bg-white/50 border border-black/10 inline-block px-2 rounded ml-2 select-all text-black">
                         {loading ? '...' : myId}
                     </div>
                 </div>
            </div>
        )}

        {/* --- LOBBY --- */}
        {uiStatus === 'LOBBY' && (
            <div className="bg-[#ded895] w-full p-6 border-4 border-black shadow-[8px_8px_0_#000] pointer-events-auto rounded-xl text-center">
                <h2 className="text-2xl font-black text-[#f97316] drop-shadow-[2px_2px_0_#000] mb-6">LOBBY</h2>
                
                <div className="flex justify-center items-end gap-6 mb-8">
                     <div className="flex flex-col items-center">
                         <div className="w-12 h-10 bg-[#facc15] border-4 border-black rounded mb-2 animate-bounce"></div>
                         <span className="text-xs font-bold bg-black text-white px-2 py-1 rounded">YOU</span>
                     </div>
                     <span className="font-black text-2xl text-black/20 mb-4">VS</span>
                     <div className="flex flex-col items-center">
                         <div className={`w-12 h-10 border-4 border-black rounded mb-2 transition-colors ${partnerId ? 'bg-[#ef4444] animate-bounce' : 'bg-black/10'}`}></div>
                         <span className="text-xs font-bold bg-black text-white px-2 py-1 rounded">{partnerId ? 'P2' : '...'}</span>
                     </div>
                </div>

                {isHost ? (
                    <>
                        {!partnerId && (
                            <div className="bg-white border-4 border-black p-3 mb-4 text-left">
                                <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Send this ID to friend:</p>
                                <div className="flex gap-2">
                                    <code className="bg-gray-100 flex-1 p-2 font-mono text-sm truncate select-all text-black">{myId}</code>
                                    <button onClick={handleCopy} className={`border-2 border-black p-2 hover:bg-gray-100 ${copied ? 'bg-green-300' : ''}`}>
                                        <Copy size={16} className="text-black" />
                                    </button>
                                </div>
                            </div>
                        )}
                        <button onClick={triggerHostStart} disabled={!partnerId}
                                className="w-full bg-[#22c55e] text-white font-bold py-4 border-b-4 border-r-4 border-black active:border-0 active:translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                            {partnerId ? 'START GAME' : 'WAITING FOR PLAYER...'}
                        </button>
                    </>
                ) : (
                    <div className="bg-white/50 border-2 border-dashed border-black/30 p-4 rounded text-black font-bold animate-pulse">
                        WAITING FOR HOST...
                    </div>
                )}
            </div>
        )}

        {/* --- COUNTDOWN --- */}
        {uiStatus === 'COUNTDOWN' && (
            <div className="animate-in zoom-in duration-300">
                <span className="text-9xl font-black text-white stroke-black drop-shadow-[8px_8px_0_#000]" 
                      style={{ WebkitTextStroke: '4px black' }}>
                    {uiCountdown}
                </span>
            </div>
        )}

        {/* --- SCORE --- */}
        {(uiStatus === 'PLAYING' || uiStatus === 'GAME_OVER') && (
            <div className="absolute top-8 pointer-events-none">
                 <span className="text-6xl font-black text-white stroke-black drop-shadow-[4px_4px_0_#000]" 
                      style={{ WebkitTextStroke: '3px black' }}>
                    {uiScore}
                </span>
            </div>
        )}

        {/* --- GAME OVER --- */}
        {uiStatus === 'GAME_OVER' && (
            <div className="bg-[#ded895] border-4 border-black shadow-[8px_8px_0_#000] p-6 text-center pointer-events-auto animate-in zoom-in duration-300">
                <h2 className="text-3xl font-black text-[#f97316] drop-shadow-[2px_2px_0_#000] mb-4">GAME OVER</h2>
                
                <div className="flex justify-center gap-4 mb-6">
                    <div className="bg-[#d4c678] border-2 border-black p-2 rounded w-24">
                        <div className="text-[10px] font-bold text-[#f97316]">SCORE</div>
                        <div className="text-2xl font-bold text-white drop-shadow-[1px_1px_0_#000]">{uiScore}</div>
                    </div>
                </div>

                {isHost ? (
                     <button onClick={triggerHostStart} 
                             className="bg-white text-black font-bold px-6 py-3 border-4 border-black shadow-[4px_4px_0_#000] hover:translate-y-px hover:shadow-[3px_3px_0_#000] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2 mx-auto">
                        <RotateCcw size={18} /> PLAY AGAIN
                    </button>
                ) : (
                    <div className="text-white font-bold text-shadow animate-pulse">WAITING FOR HOST...</div>
                )}
            </div>
        )}

      </div>

      {/* --- CANVAS --- */}
      <canvas 
          ref={canvasRef}
          width={GAME_WIDTH} 
          height={GAME_HEIGHT}
          className="absolute z-10 w-full max-w-[400px] aspect-[2/3] object-contain rounded-xl border-4 border-black shadow-2xl bg-[#70c5ce]"
      />

      {/* FX */}
      <div id="flash-fx" className="absolute inset-0 bg-white pointer-events-none z-50 opacity-0 transition-opacity duration-100"></div>

      {/* DISCLAIMER */}
      {showDisclaimer && (
          <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm pointer-events-auto">
              <div className="bg-[#ded895] border-4 border-black p-6 rounded shadow-[8px_8px_0_#fff] max-w-sm w-full animate-in zoom-in duration-300">
                  <div className="flex justify-center mb-4">
                      <AlertTriangle size={48} className="text-[#f97316] animate-bounce" />
                  </div>
                  <h2 className="text-xl font-bold text-center mb-4 text-black">BETA BUILD</h2>
                  <p className="text-xs text-center font-mono mb-6 leading-relaxed text-black">
                      This is a P2P multiplayer experiment.<br/>
                      Expect bugs, sync issues, or connection drops.<br/>
                      <br/>
                      <strong>TIP:</strong> If connection fails, both players should refresh.
                  </p>
                  <button 
                      onClick={() => setShowDisclaimer(false)}
                      className="w-full bg-[#3b82f6] text-white font-bold py-3 border-b-4 border-r-4 border-black hover:bg-[#2563eb] active:border-0 active:translate-y-1 transition-all"
                  >
                      I UNDERSTAND
                  </button>
              </div>
          </div>
      )}

    </div>
  );
}
