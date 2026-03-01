import React, { useEffect, useRef, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import { playSound } from './utils/audio';

interface GameCanvasProps {
  mode: 'single' | 'party' | 'ranked';
  playerName?: string;
  onBack: () => void;
}

const GRAVITY = 2000;
const FLAP_SPEED = -600;
const PIPE_SPEED = 200;
const PIPE_SPAWN_RATE = 1.5;
const PIPE_GAP = 150;
const BIRD_RADIUS = 14;
const PIPE_WIDTH = 60;
const GROUND_HEIGHT = 100;

const COLORS = ['#FFD700', '#1E90FF', '#FF4757', '#2ED573']; // Yellow, Blue, Red, Green

export default function GameCanvas({ mode, playerName, onBack }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'gameover' | 'matchmaking' | 'countdown' | 'spectating' | 'waiting_restart'>('ready');
  const [score, setScore] = useState(0);
  const [medals, setMedals] = useState<string | null>(null);
  const [aliveStatus, setAliveStatus] = useState<boolean[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [countdown, setCountdown] = useState<number | string>(3);
  const [readyCount, setReadyCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const totalPlayersRef = useRef(0);

  // Multiplayer state
  const mqttClientRef = useRef<MqttClient | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const clientIdRef = useRef('fb_world_' + Math.random().toString(36).substring(2, 10));
  const waitingPlayersRef = useRef<{ id: string, name: string }[]>([]);
  const roomAliveCountRef = useRef(0);
  const roomReadySetRef = useRef<Set<number>>(new Set());
  const matchGenRef = useRef(0);
  const [waitingCount, setWaitingCount] = useState(0);
  const opponentsRef = useRef<Map<string, any>>(new Map());
  const playerIndexRef = useRef(0);
  const seedRef = useRef(Math.random());

  // Game state refs for loop
  const stateRef = useRef({
    birds: [] as any[],
    pipes: [] as any[],
    bgOffset: 0,
    groundOffset: 0,
    pipeTimer: 0,
    score: 0,
    flashAlpha: 0,
    shakeTime: 0,
    state: 'ready' as 'ready' | 'playing' | 'gameover' | 'matchmaking' | 'countdown' | 'spectating' | 'waiting_restart',
  });

  // RNG based on seed for deterministic pipes
  const random = () => {
    let x = Math.sin(seedRef.current++) * 10000;
    return x - Math.floor(x);
  };

  useEffect(() => {
    if (mode === 'ranked') {
      setGameState('matchmaking');
      stateRef.current.state = 'matchmaking';
      setConnectionStatus('connecting');

      // Connect to public MQTT WebSocket broker (no backend server required!)
      const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
      mqttClientRef.current = client;

      client.on('connect', () => {
        setConnectionStatus('connected');
        client.subscribe('flappybird/lobby');
        waitingPlayersRef.current = [{ id: clientIdRef.current, name: playerName || 'Guest' }];
        setWaitingCount(1);

        client.publish('flappybird/lobby', JSON.stringify({ type: 'hello', id: clientIdRef.current, name: playerName || 'Guest' }));
      });

      const startGameSequence = () => {
        let count: number | string = 3;
        setCountdown(count);
        playSound('hover');
        const iv = setInterval(() => {
          if (typeof count === 'number') count--;
          if (typeof count === 'number' && count > 0) {
            setCountdown(count);
            playSound('hover');
          } else if (count === 0) {
            setCountdown('GO!');
            count = 'GO!'; // switch type to stop decrement
            playSound('score');
          } else {
            clearInterval(iv);
            setGameState('playing');
            stateRef.current.state = 'playing';
            stateRef.current.birds.forEach(b => b.velocity = 0);
            const bird = stateRef.current.birds[0];
            if (bird && client) {
              client.publish(`flappybird/room/${roomIdRef.current}`, JSON.stringify({
                type: 'player_update',
                playerIndex: playerIndexRef.current,
                y: bird.y,
                velocity: bird.velocity,
                alive: bird.alive,
                score: stateRef.current.score
              }));
            }
          }
        }, 1000);
      };

      client.on('message', (topic, message) => {
        try {
          const data = JSON.parse(message.toString());

          if (topic === 'flappybird/lobby') {
            if ((data.type === 'hello' || data.type === 'presence') && data.id !== clientIdRef.current) {
              if (!waitingPlayersRef.current.find(p => p.id === data.id)) {
                waitingPlayersRef.current.push({ id: data.id, name: data.name });
                setWaitingCount(waitingPlayersRef.current.length);
              }
              if (data.type === 'hello') {
                client.publish('flappybird/lobby', JSON.stringify({ type: 'presence', id: clientIdRef.current, name: playerName || 'Guest' }));
              }
            }

            if (waitingPlayersRef.current.length >= 2 && stateRef.current.state === 'matchmaking') {
              const sorted = [...waitingPlayersRef.current].sort((a, b) => a.id.localeCompare(b.id));
              if (sorted[0].id === clientIdRef.current) {
                const roomId = 'room_' + Math.random().toString(36).substring(2, 10);
                const p = sorted.slice(0, 4);
                setTimeout(() => {
                  client.publish('flappybird/lobby', JSON.stringify({
                    type: 'match_found',
                    roomId,
                    seed: Math.random(),
                    players: p.map(player => player.id),
                    playerNames: p.map(player => player.name)
                  }));
                }, 500);
              }
            }

            if (data.type === 'match_found') {
              const myIdx = data.players.indexOf(clientIdRef.current);
              if (myIdx !== -1) {
                client.unsubscribe('flappybird/lobby');
                client.subscribe(`flappybird/room/${data.roomId}`);

                roomIdRef.current = data.roomId;
                seedRef.current = data.seed;
                playerIndexRef.current = myIdx;
                setTotalPlayers(data.players.length);
                totalPlayersRef.current = data.players.length;
                setPlayerNames(data.playerNames);
                // Only count opponents (not self) — self-death is handled separately
                roomAliveCountRef.current = data.players.length - 1;
                matchGenRef.current++;
                roomReadySetRef.current.clear();

                opponentsRef.current.clear();
                for (let i = 0; i < data.players.length; i++) {
                  if (i !== myIdx) {
                    opponentsRef.current.set(i.toString(), {
                      id: i.toString(),
                      playerIndex: i,
                      y: 300,
                      velocity: 0,
                      alive: true,
                      score: 0,
                      lastUpdate: performance.now()
                    });
                  }
                }
                initGame(data.players.length);
                setGameState('countdown');
                stateRef.current.state = 'countdown';
                startGameSequence();
              }
            }
          } else if (topic.startsWith('flappybird/room/')) {
            if (data.type === 'player_update' && data.playerIndex !== playerIndexRef.current) {
              const opp = opponentsRef.current.get(data.playerIndex.toString());
              if (opp) {
                // Directly use network position — do NOT simulate local gravity
                opp.y = data.y;
                opp.velocity = data.velocity;
                opp.alive = data.alive;
                opp.score = data.score;
                opp.lastUpdate = performance.now();
              }
            }
            if (data.type === 'player_died' && data.playerIndex !== playerIndexRef.current) {
              const opp = opponentsRef.current.get(data.playerIndex.toString());
              if (opp && opp.alive) {
                opp.alive = false;
                opp.velocity = 0;
                roomAliveCountRef.current = Math.max(0, roomAliveCountRef.current - 1);
                setAliveStatus(prev => {
                  const next = [...prev];
                  next[data.playerIndex] = false;
                  return next;
                });
                // Check if all opponents dead → transition to gameover
                if (roomAliveCountRef.current <= 0) {
                  const s = stateRef.current;
                  if (s.state === 'spectating' || s.state === 'playing') {
                    s.state = 'gameover';
                    setGameState('gameover');
                    let m = 'Bronze';
                    if (s.score >= 40) m = 'Platinum';
                    else if (s.score >= 30) m = 'Gold';
                    else if (s.score >= 20) m = 'Silver';
                    else if (s.score < 10) m = 'None';
                    setMedals(m);
                  }
                }
              }
            }
            if (data.type === 'player_ready_restart' && data.matchGen === matchGenRef.current) {
              roomReadySetRef.current.add(data.playerIndex);
              setReadyCount(roomReadySetRef.current.size);
              if (roomReadySetRef.current.size >= totalPlayersRef.current) {
                if (playerIndexRef.current === 0) {
                  client.publish(`flappybird/room/${roomIdRef.current}`, JSON.stringify({
                    type: 'restart_match',
                    seed: Math.random(),
                    matchGen: matchGenRef.current
                  }));
                }
              }
            }
            if (data.type === 'restart_match' && data.matchGen === matchGenRef.current) {
              matchGenRef.current++;
              roomReadySetRef.current.clear();
              setReadyCount(0);
              roomAliveCountRef.current = totalPlayersRef.current - 1;
              seedRef.current = data.seed;
              initGame(totalPlayersRef.current);
              setGameState('countdown');
              stateRef.current.state = 'countdown';
              startGameSequence();
            }
          }
        } catch (e) { console.error(e); }
      });

      return () => {
        client.end();
      };
    } else {
      initGame(mode === 'party' ? 4 : 1);
    }
  }, [mode, playerName]);

  const initGame = (numPlayers: number) => {
    const birds = [];
    if (mode === 'ranked') {
      birds.push({
        id: playerIndexRef.current,
        y: 300,
        velocity: 0,
        alive: true,
        score: 0,
        color: COLORS[playerIndexRef.current % COLORS.length],
        isLocal: true,
      });
    } else {
      for (let i = 0; i < numPlayers; i++) {
        birds.push({
          id: i,
          y: 300,
          velocity: 0,
          alive: true,
          score: 0,
          color: COLORS[i % COLORS.length],
          isLocal: true,
        });
      }
    }

    stateRef.current = {
      birds,
      pipes: [],
      bgOffset: 0,
      groundOffset: 0,
      pipeTimer: 0,
      score: 0,
      flashAlpha: 0,
      shakeTime: 0,
      state: 'ready',
    };
    setGameState('ready'); // Fix: ensure UI updates to ready state when restarting
    setScore(0);
    setMedals(null);
    setAliveStatus(new Array(numPlayers).fill(true));

    if (mode === 'ranked') {
      opponentsRef.current.forEach(opp => {
        opp.y = 300;
        opp.velocity = 0;
        opp.alive = true;
        opp.score = 0;
      });
    } else {
      opponentsRef.current.clear();
    }
  };

  const flap = (birdIndex: number) => {
    const s = stateRef.current;
    if (s.state === 'ready' && mode !== 'ranked') {
      s.state = 'playing';
      setGameState('playing');
    }
    if (s.state === 'playing') {
      const bird = mode === 'ranked' ? s.birds[0] : s.birds[birdIndex];
      if (bird && bird.alive) {
        playSound('flap');
        bird.velocity = FLAP_SPEED;
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); flap(playerIndexRef.current); }
      if (mode === 'party') {
        if (e.code === 'ArrowUp') { e.preventDefault(); flap(1); }
        if (e.code === 'KeyW') { e.preventDefault(); flap(2); }
        if (e.code === 'KeyP') { e.preventDefault(); flap(3); }
      }
    };
    const handleTouch = (e: TouchEvent) => {
      if (e.target instanceof Element && e.target.closest('button, input')) return;
      e.preventDefault();
      if (mode === 'party') {
        // Simple split screen touch for party
        const touchX = e.touches[0].clientX;
        const w = window.innerWidth;
        if (touchX < w / 2) flap(0);
        else flap(1);
      } else {
        flap(playerIndexRef.current);
      }
    };
    const handleClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('button, input')) return;
      flap(playerIndexRef.current);
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('touchstart', handleTouch, { passive: false });
    window.addEventListener('mousedown', handleClick);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('touchstart', handleTouch);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();
    let accumulator = 0;
    const TICK_RATE = 60;
    const TICK_DT = 1 / TICK_RATE;

    const render = (alpha: number) => {
      const s = stateRef.current;
      const width = canvas.width;
      const height = canvas.height;

      ctx.save();

      // Screen shake
      if (s.shakeTime > 0) {
        const dx = (Math.random() - 0.5) * 10;
        const dy = (Math.random() - 0.5) * 10;
        ctx.translate(dx, dy);
      }

      // Draw Background (Sky)
      const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
      skyGradient.addColorStop(0, '#38BDF8');
      skyGradient.addColorStop(1, '#BAE6FD');
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, width, height);

      // Draw Sunbeams
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.moveTo(width * 0.2, -50);
      ctx.lineTo(width * 0.4, -50);
      ctx.lineTo(width * 0.1, height);
      ctx.lineTo(-width * 0.1, height);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(width * 0.6, -50);
      ctx.lineTo(width * 0.9, -50);
      ctx.lineTo(width * 0.5, height);
      ctx.lineTo(width * 0.2, height);
      ctx.fill();

      // Draw Parallax City
      ctx.fillStyle = '#7DD3FC'; // lighter blue for distant city
      for (let i = 0; i < 15; i++) {
        const x = (i * 60 - s.bgOffset * 0.5) % (width + 60) - 60;
        const h = 100 + (i % 5) * 40;
        ctx.fillRect(x, height - GROUND_HEIGHT - h, 65, h);
      }
      ctx.fillStyle = '#38BDF8'; // closer city
      for (let i = 0; i < 10; i++) {
        const x = (i * 100 - s.bgOffset) % (width + 100) - 100;
        const h = 80 + (i % 3) * 50;
        ctx.fillRect(x, height - GROUND_HEIGHT - h, 80, h);
      }

      // Draw Pipes
      s.pipes.forEach(pipe => {
        const pipeGrad = ctx.createLinearGradient(pipe.x, 0, pipe.x + PIPE_WIDTH, 0);
        pipeGrad.addColorStop(0, '#22C55E');
        pipeGrad.addColorStop(0.3, '#4ADE80');
        pipeGrad.addColorStop(0.6, '#22C55E');
        pipeGrad.addColorStop(1, '#15803D');

        const capGrad = ctx.createLinearGradient(pipe.x - 4, 0, pipe.x + PIPE_WIDTH + 4, 0);
        capGrad.addColorStop(0, '#16A34A');
        capGrad.addColorStop(0.5, '#4ADE80');
        capGrad.addColorStop(1, '#166534');

        ctx.fillStyle = pipeGrad;
        ctx.strokeStyle = '#14532D';
        ctx.lineWidth = 3;

        // Top pipe
        ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
        ctx.strokeRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
        // Top cap
        ctx.fillStyle = capGrad;
        ctx.fillRect(pipe.x - 4, pipe.topHeight - 24, PIPE_WIDTH + 8, 24);
        ctx.strokeRect(pipe.x - 4, pipe.topHeight - 24, PIPE_WIDTH + 8, 24);

        // Bottom pipe
        const bottomY = pipe.topHeight + PIPE_GAP;
        const bottomHeight = height - GROUND_HEIGHT - bottomY;
        ctx.fillStyle = pipeGrad;
        ctx.fillRect(pipe.x, bottomY, PIPE_WIDTH, bottomHeight);
        ctx.strokeRect(pipe.x, bottomY, PIPE_WIDTH, bottomHeight);
        // Bottom cap
        ctx.fillStyle = capGrad;
        ctx.fillRect(pipe.x - 4, bottomY, PIPE_WIDTH + 8, 24);
        ctx.strokeRect(pipe.x - 4, bottomY, PIPE_WIDTH + 8, 24);
      });

      // Draw Ground
      ctx.fillStyle = '#DED895';
      ctx.fillRect(0, height - GROUND_HEIGHT, width, GROUND_HEIGHT);

      // Ground stripes
      ctx.fillStyle = 'rgba(217, 119, 6, 0.1)';
      for (let i = -2; i < width / 20 + 4; i++) {
        const x = (i * 30 - (s.groundOffset % 30));
        ctx.beginPath();
        ctx.moveTo(x, height - GROUND_HEIGHT);
        ctx.lineTo(x - 20, height);
        ctx.lineTo(x - 10, height);
        ctx.lineTo(x + 10, height - GROUND_HEIGHT);
        ctx.fill();
      }

      // Ground top border
      ctx.fillStyle = '#73bf2e';
      ctx.fillRect(0, height - GROUND_HEIGHT, width, 16);
      ctx.fillStyle = '#558f22';
      ctx.fillRect(0, height - GROUND_HEIGHT + 16, width, 4);

      // Draw Opponents (Online)
      if (mode === 'ranked') {
        opponentsRef.current.forEach(opp => {
          if (!opp.alive && opp.y >= height - GROUND_HEIGHT - BIRD_RADIUS) return;
          ctx.save();
          ctx.translate(100, opp.y);

          // Draw Name
          if (opp.playerIndex !== undefined && playerNames[opp.playerIndex]) {
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = 'bold 12px "Nunito", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(playerNames[opp.playerIndex], 0, -25);
            ctx.restore();
          }

          let angle = opp.velocity < 0 ? -0.35 : Math.min(Math.PI / 2, (opp.velocity / 800));
          ctx.rotate(angle);
          ctx.globalAlpha = 0.4;
          drawBird(ctx, '#fff', opp.velocity, opp.alive); // Ghost color
          ctx.restore();
        });
      }

      // Draw Local Birds
      s.birds.forEach((bird, idx) => {
        if (!bird.alive && bird.y >= height - GROUND_HEIGHT - BIRD_RADIUS) return; // Don't draw if dead on ground

        ctx.save();
        ctx.translate(100, bird.y);

        // Draw Name
        if (mode === 'ranked' && playerNames[playerIndexRef.current]) {
          ctx.save();
          ctx.fillStyle = 'white';
          ctx.font = 'bold 14px "Nunito", sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowColor = 'black';
          ctx.shadowBlur = 4;
          ctx.fillText(playerNames[playerIndexRef.current], 0, -25);
          ctx.restore();
        } else if (mode === 'party') {
          ctx.save();
          ctx.fillStyle = 'white';
          ctx.font = 'bold 12px "Nunito", sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowColor = 'black';
          ctx.shadowBlur = 4;
          ctx.fillText(`P${idx + 1}`, 0, -25);
          ctx.restore();
        }

        let angle = 0;
        if (bird.velocity < 0) {
          angle = -0.35; // ~ -20 deg
        } else {
          angle = Math.min(Math.PI / 2, (bird.velocity / 800));
        }
        ctx.rotate(angle);

        drawBird(ctx, bird.color, bird.velocity, bird.alive);

        ctx.restore();
      });

      // Draw Flash
      if (s.flashAlpha > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.flashAlpha})`;
        ctx.fillRect(0, 0, width, height);
      }

      ctx.restore();
    };

    const drawBird = (ctx: CanvasRenderingContext2D, color: string, velocity: number, alive: boolean) => {
      const now = performance.now() / 1000;

      // Determine wing animation and eye position
      let flapAngle = 0;
      let pupilOffset = 0;

      if (!alive) {
        flapAngle = Math.PI / 4; // Wing tucked down
        pupilOffset = 0;
      } else {
        if (velocity < 0) {
          // Flapping fast
          flapAngle = Math.sin(now * 30) * 0.5; // Fast motion [-0.5, 0.5]
          pupilOffset = -1; // Looking up slightly
        } else {
          // Gliding/falling gently
          flapAngle = Math.sin(now * 8) * 0.1 - 0.2; // Slow glide motion
          pupilOffset = Math.min(2, velocity / 150); // Looking down according to velocity
        }
      }

      // Body shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(2, 4, BIRD_RADIUS + 4, BIRD_RADIUS, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body background
      ctx.fillStyle = color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, BIRD_RADIUS + 4, BIRD_RADIUS, 0, 0, Math.PI * 2);
      ctx.fill();

      // Underbelly / highlight
      const highlightGrad = ctx.createRadialGradient(-4, -4, 0, -4, -4, BIRD_RADIUS + 4);
      highlightGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
      highlightGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = highlightGrad;
      ctx.fill();
      ctx.stroke();

      // Eye
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(8, -6, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pupil (animated with velocity/alive status)
      if (!alive) {
        // X dead eye
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(8 - 2.5, -6 - 2.5);
        ctx.lineTo(8 + 2.5, -6 + 2.5);
        ctx.moveTo(8 + 2.5, -6 - 2.5);
        ctx.lineTo(8 - 2.5, -6 + 2.5);
        ctx.stroke();
        ctx.lineWidth = 3; // Reset
      } else {
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(11, -6 + pupilOffset, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cheek blush
      if (alive) {
        ctx.fillStyle = 'rgba(255, 100, 100, 0.6)';
        ctx.beginPath();
        ctx.arc(4, 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Wing (Animated rotation)
      ctx.save();
      ctx.translate(-6, 2); // Wing pivot point
      ctx.rotate(flapAngle);
      ctx.fillStyle = '#fff';
      if (!alive) ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Wing feathers detail
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(4, 1);
      ctx.moveTo(-1, -2);
      ctx.lineTo(3, -1);
      ctx.stroke();
      ctx.restore();
      ctx.lineWidth = 3;

      // Beak
      ctx.fillStyle = '#F97316'; // Orange
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(13, 4, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Beak detail line
      ctx.beginPath();
      ctx.moveTo(4, 4);
      ctx.lineTo(22, 4);
      ctx.stroke();
    };

    const update = (dt: number) => {
      const s = stateRef.current;
      if (s.state === 'matchmaking') return;

      const width = canvas.width;
      const height = canvas.height;

      if (s.state === 'playing') {
        s.bgOffset += (PIPE_SPEED * 0.2) * dt;
        s.groundOffset += PIPE_SPEED * dt;

        // Spawn pipes
        s.pipeTimer += dt;
        if (s.pipeTimer >= PIPE_SPAWN_RATE) {
          s.pipeTimer = 0;
          const minHeight = 50;
          const maxHeight = height - GROUND_HEIGHT - PIPE_GAP - minHeight;
          const topHeight = minHeight + random() * (maxHeight - minHeight);

          s.pipes.push({
            x: width,
            topHeight,
            passed: false
          });
        }

        // Move pipes
        for (let i = s.pipes.length - 1; i >= 0; i--) {
          const p = s.pipes[i];
          p.x -= PIPE_SPEED * dt;

          if (p.x + PIPE_WIDTH < 0) {
            s.pipes.splice(i, 1);
          }
        }

        let allLocalDead = true;

        if (mode === 'ranked') {
          (s as any).updateTimer = ((s as any).updateTimer || 0) + dt;
          if ((s as any).updateTimer >= 0.05) { // 20 times a second heartbeat
            (s as any).updateTimer = 0;
            const bird = s.birds[0];
            if (bird && bird.alive) {
              mqttClientRef.current?.publish(`flappybird/room/${roomIdRef.current}`, JSON.stringify({
                type: 'player_update',
                playerIndex: playerIndexRef.current,
                y: bird.y,
                velocity: bird.velocity,
                alive: bird.alive,
                score: s.score
              }));
            }
          }
        }

        // Clamp opponent positions (no local physics — just use network data)
        if (mode === 'ranked') {
          opponentsRef.current.forEach(opp => {
            // Clamp to floor
            if (opp.y + BIRD_RADIUS >= height - GROUND_HEIGHT) {
              opp.y = height - GROUND_HEIGHT - BIRD_RADIUS;
            }
            // Clamp to ceiling
            if (opp.y - BIRD_RADIUS <= 0) {
              opp.y = BIRD_RADIUS;
            }
          });
        }

        // Update birds
        s.birds.forEach(bird => {
          if (!bird.alive) return;
          allLocalDead = false;

          bird.velocity += GRAVITY * dt;
          bird.y += bird.velocity * dt;

          // Floor collision
          if (bird.y + BIRD_RADIUS >= height - GROUND_HEIGHT) {
            bird.y = height - GROUND_HEIGHT - BIRD_RADIUS;
            die(bird);
          }
          // Ceiling collision
          if (bird.y - BIRD_RADIUS <= 0) {
            bird.y = BIRD_RADIUS;
            bird.velocity = 0;
          }

          // Pipe collision
          const birdX = 100;
          s.pipes.forEach(p => {
            if (birdX + BIRD_RADIUS > p.x && birdX - BIRD_RADIUS < p.x + PIPE_WIDTH) {
              if (bird.y - BIRD_RADIUS < p.topHeight || bird.y + BIRD_RADIUS > p.topHeight + PIPE_GAP) {
                die(bird);
              }
            }

            // Score
            if (!p.passed && birdX > p.x + PIPE_WIDTH) {
              p.passed = true;
              if (bird.isLocal) {
                playSound('score');
                s.score++;
                setScore(s.score);
              }
            }
          });
        });

        if (allLocalDead) {
          if (mode === 'ranked') {
            if (roomAliveCountRef.current <= 0) {
              s.state = 'gameover';
              setGameState('gameover');
              let m = 'Bronze';
              if (s.score >= 40) m = 'Platinum';
              else if (s.score >= 30) m = 'Gold';
              else if (s.score >= 20) m = 'Silver';
              else if (s.score < 10) m = 'None';
              setMedals(m);
            } else {
              s.state = 'spectating';
              setGameState('spectating');
            }
          } else {
            s.state = 'gameover';
            setGameState('gameover');

            let m = 'Bronze';
            if (s.score >= 40) m = 'Platinum';
            else if (s.score >= 30) m = 'Gold';
            else if (s.score >= 20) m = 'Silver';
            else if (s.score < 10) m = 'None';
            setMedals(m);
          }
        }
      } else if (s.state === 'gameover' || s.state === 'spectating') {
        // Continue moving background and pipes if spectating
        if (s.state === 'spectating') {
          s.bgOffset += (PIPE_SPEED * 0.2) * dt;
          s.groundOffset += PIPE_SPEED * dt;

          s.pipeTimer += dt;
          if (s.pipeTimer >= PIPE_SPAWN_RATE) {
            s.pipeTimer = 0;
            const minHeight = 50;
            const maxHeight = height - GROUND_HEIGHT - PIPE_GAP - minHeight;
            const topHeight = minHeight + random() * (maxHeight - minHeight);
            s.pipes.push({ x: width, topHeight, passed: false });
          }

          for (let i = s.pipes.length - 1; i >= 0; i--) {
            const p = s.pipes[i];
            p.x -= PIPE_SPEED * dt;
            if (p.x + PIPE_WIDTH < 0) s.pipes.splice(i, 1);
          }

          // Clamp opponent positions (no local physics)
          if (mode === 'ranked') {
            opponentsRef.current.forEach(opp => {
              if (opp.y + BIRD_RADIUS >= height - GROUND_HEIGHT) {
                opp.y = height - GROUND_HEIGHT - BIRD_RADIUS;
              }
            });
            // gameover transition is handled by player_died message handler
          }
        }

        // Fall to ground
        s.birds.forEach(bird => {
          if (bird.y + BIRD_RADIUS < height - GROUND_HEIGHT) {
            bird.velocity += GRAVITY * dt;
            bird.y += bird.velocity * dt;
          } else {
            bird.y = height - GROUND_HEIGHT - BIRD_RADIUS;
          }
        });
      }

      if (s.flashAlpha > 0) {
        s.flashAlpha -= dt * 2;
      }
      if (s.shakeTime > 0) {
        s.shakeTime -= dt;
      }
    };

    const die = (bird: any) => {
      if (!bird.alive) return;
      bird.alive = false;
      bird.velocity = 0;
      const s = stateRef.current;
      s.flashAlpha = 1;
      s.shakeTime = 0.3;

      if (bird.isLocal) {
        playSound('hit');
        setTimeout(() => playSound('die'), 300);
      }

      setAliveStatus(prev => {
        const next = [...prev];
        next[bird.id] = false;
        return next;
      });

      if (mode === 'ranked' && bird.isLocal) {
        // Don't decrement roomAliveCountRef for local player — it only tracks opponents
        mqttClientRef.current?.publish(`flappybird/room/${roomIdRef.current}`, JSON.stringify({
          type: 'player_died',
          playerIndex: playerIndexRef.current
        }));
      }
    };

    const loop = (time: number) => {
      animationFrameId = requestAnimationFrame(loop);
      let frameTime = (time - lastTime) / 1000;
      lastTime = time;
      if (frameTime > 0.25) frameTime = 0.25;

      accumulator += frameTime;
      while (accumulator >= TICK_DT) {
        update(TICK_DT);
        accumulator -= TICK_DT;
      }

      render(accumulator / TICK_DT);
    };

    animationFrameId = requestAnimationFrame(loop);

    const handleVisibilityChange = () => {
      const s = stateRef.current;
      if (document.visibilityState === 'hidden' && s.state === 'playing' && mode === 'ranked') {
        // Kill local birds if player tabs out during a ranked match
        s.birds.forEach(bird => {
          if (bird.isLocal && bird.alive) {
            die(bird);
          }
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [mode]);

  return (
    <div className="relative w-full h-screen bg-slate-900 flex items-center justify-center overflow-hidden font-['Fredoka_One',cursive]">
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#475569 2px, transparent 2px)', backgroundSize: '30px 30px' }}></div>
      <div className="relative w-full max-w-[500px] h-full max-h-[800px] bg-[#87CEEB] shadow-2xl overflow-hidden rounded-none md:rounded-3xl md:h-[95vh] md:border-8 md:border-slate-800">

        <canvas
          ref={canvasRef}
          width={500}
          height={800}
          className="w-full h-full object-cover"
        />

        {/* UI Overlay */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col justify-between p-6">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <div className="bg-white/90 backdrop-blur-md p-3 rounded-2xl shadow-lg border-2 border-slate-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-400 border-2 border-white flex items-center justify-center overflow-hidden shadow-inner">
                  <span className="material-symbols-outlined text-white text-2xl">person</span>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Mode</div>
                  <div className="text-xl font-['Fredoka_One',cursive] text-slate-800 uppercase leading-none">{mode}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center animate-bounce mt-4">
              {gameState === 'playing' && (
                <div className="text-6xl font-['Fredoka_One',cursive] text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] tracking-wider" style={{ WebkitTextStroke: '2px black' }}>
                  {score}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {mode !== 'single' && (
                <div className="bg-white/90 backdrop-blur-md p-3 rounded-2xl shadow-lg border-2 border-slate-200">
                  <div className="text-xs text-slate-500 font-bold uppercase mb-1">Alive</div>
                  <div className="flex -space-x-2">
                    {aliveStatus.map((alive, i) => (
                      <div key={i} className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold text-white shadow-sm transition-all ${alive ? '' : 'opacity-50 grayscale'}`} style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                        P{i + 1}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {mode === 'ranked' && (
                <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border-2 border-slate-200 flex items-center gap-2 mt-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></div>
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Offline'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {gameState === 'matchmaking' && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border-2 border-slate-600 p-8 rounded-3xl shadow-2xl flex flex-col items-center animate-pop-in w-full max-w-sm relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/20 blur-3xl rounded-full"></div>
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-500/20 blur-3xl rounded-full"></div>

              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6 relative z-10"></div>
              <h2 className="text-white font-['Fredoka_One',cursive] text-3xl mb-2 relative z-10 text-center">MATCHMAKING</h2>

              <div className="bg-slate-900/50 rounded-xl px-4 py-2 mb-8 border border-slate-700 relative z-10">
                <p className="text-blue-300 font-bold text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">search</span>
                  Looking for opponents... ({waitingCount}/4)
                </p>
              </div>

              <button onMouseEnter={() => playSound('hover')} onClick={() => { playSound('click'); onBack(); }} className="w-full px-6 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl border-b-4 border-red-700 active:translate-y-1 active:border-b-0 transition-all relative z-10">
                CANCEL
              </button>
            </div>
          </div>
        )}

        {gameState === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none bg-black/30 backdrop-blur-sm">
            <h2 className="text-white text-8xl mb-4 text-center drop-shadow-[0_4px_0_rgba(0,0,0,0.5)] animate-bounce" style={{ WebkitTextStroke: '4px black', textShadow: 'rgb(255, 71, 87) 4px 4px 0px' }}>
              {countdown}
            </h2>
            <p className="text-white text-xl bg-black/40 px-4 py-1 rounded-full mt-4">Get Ready!</p>
          </div>
        )}

        {gameState === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Get_Ready%21_Flappy_Bird.png/800px-Get_Ready%21_Flappy_Bird.png" alt="Get Ready" className="w-64 mb-8 opacity-80" style={{ filter: 'drop-shadow(0px 4px 0px rgba(0,0,0,0.5))' }} onError={(e) => e.currentTarget.style.display = 'none'} />
            <h2 className="text-white text-5xl mb-4 text-center drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]" style={{ WebkitTextStroke: '2px black' }}>GET READY!</h2>
            <p className="text-white text-xl bg-black/40 px-4 py-1 rounded-full">Tap or Space to flap</p>
            {mode === 'party' && <p className="text-white text-sm mt-2 bg-black/40 px-4 py-1 rounded-full">P1: Space/Left Screen | P2: Up/Right Screen | P3: W | P4: P</p>}
          </div>
        )}

        {gameState === 'gameover' && (
          <>
            <div className="absolute inset-0 z-30 bg-slate-900/60 backdrop-blur-sm"></div>
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-4">
              <div className="mb-6 animate-pop-in relative">
                <h1 className="font-display text-6xl md:text-8xl text-white text-stroke-lg drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] tracking-wide z-10 relative">
                  <span className="glossy-text">GAME OVER</span>
                </h1>
                <h1 className="font-display text-6xl md:text-8xl text-black absolute top-2 left-0 w-full h-full opacity-30 blur-sm z-0">
                  GAME OVER
                </h1>
              </div>
              <div className="w-full max-w-sm bg-[#e3cd8b] rounded-3xl p-1 border-4 border-[#5a3a18] shadow-2xl relative animate-pop-in [animation-delay:150ms]">
                <div className="bg-[#dcc076] rounded-[20px] p-6 border-2 border-[#c2a65d] card-glow flex flex-col gap-6 relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/20 blur-2xl rounded-full"></div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col items-center gap-2 w-1/2 border-r-2 border-[#bfa259]">
                      <span className="text-[#8c6722] font-display text-sm tracking-wider uppercase">Medal</span>
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        <div className="absolute inset-0 bg-yellow-400/30 blur-xl rounded-full animate-pulse"></div>
                        <div className={`w-16 h-16 rounded-full border-4 shadow-lg flex items-center justify-center relative z-10 animate-bounce-slow ${medals === 'Platinum' ? 'bg-gradient-to-br from-slate-100 via-slate-300 to-slate-500 border-slate-200' :
                          medals === 'Gold' ? 'bg-gradient-to-br from-yellow-300 via-yellow-500 to-yellow-700 border-yellow-200' :
                            medals === 'Silver' ? 'bg-gradient-to-br from-gray-300 via-gray-400 to-gray-600 border-gray-200' :
                              medals === 'Bronze' ? 'bg-gradient-to-br from-amber-500 via-amber-600 to-amber-800 border-amber-400' :
                                'bg-transparent border-dashed border-[#bfa259]'
                          }`}>
                          {medals !== 'None' && <i className="material-icons-round text-yellow-100 text-4xl drop-shadow-md">emoji_events</i>}
                          {medals !== 'None' && <div className="absolute top-2 left-3 w-3 h-3 bg-white rounded-full opacity-60"></div>}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 w-1/2 pl-4">
                      <span className="text-[#8c6722] font-display text-sm tracking-wider uppercase">Score</span>
                      <span className="font-display text-5xl text-white drop-shadow-md text-stroke">{score}</span>
                      <div className="bg-yellow-500/20 rounded px-2 py-0.5 mt-2 border border-yellow-600/30">
                        <span className="text-[#714d0f] font-bold text-xs uppercase">Best: {score}</span>
                      </div>
                    </div>
                  </div>
                  {mode !== 'single' && (
                    <div className="bg-[#c4a659]/50 rounded-xl p-3 flex items-center justify-between border border-[#bfa259]">
                      <span className="text-[#5a3a18] font-bold text-sm uppercase tracking-wide">Rank</span>
                      <span className="font-display text-2xl text-yellow-100 drop-shadow-sm flex items-center gap-1">
                        #1 <span className="text-sm text-yellow-800">WINNER!</span>
                      </span>
                    </div>
                  )}
                </div>
                {score > 0 && (
                  <div className="absolute -top-3 -right-3 bg-red-500 text-white font-display text-xs px-2 py-1 rounded shadow-md transform rotate-12 border-2 border-white">
                    NEW!
                  </div>
                )}
              </div>
              <div className="flex gap-4 mt-8 w-full max-w-sm justify-center animate-pop-in [animation-delay:300ms]">
                <button onMouseEnter={() => playSound('hover')} onClick={() => {
                  playSound('click');
                  if (mode === 'ranked') {
                    // Add self to ready set immediately (don't wait for MQTT echo)
                    roomReadySetRef.current.add(playerIndexRef.current);
                    setReadyCount(roomReadySetRef.current.size);
                    mqttClientRef.current?.publish(`flappybird/room/${roomIdRef.current}`, JSON.stringify({
                      type: 'player_ready_restart',
                      playerIndex: playerIndexRef.current,
                      matchGen: matchGenRef.current
                    }));
                    setGameState('waiting_restart');
                    // Check if all players ready
                    if (roomReadySetRef.current.size >= totalPlayersRef.current) {
                      if (playerIndexRef.current === 0) {
                        mqttClientRef.current?.publish(`flappybird/room/${roomIdRef.current}`, JSON.stringify({
                          type: 'restart_match',
                          seed: Math.random(),
                          matchGen: matchGenRef.current
                        }));
                      }
                    }
                  } else {
                    initGame(mode === 'party' ? 4 : 1);
                  }
                }} className="flex-1 group relative outline-none">
                  <div className="absolute inset-0 bg-green-700 rounded-xl translate-y-2"></div>
                  <div className="relative bg-gradient-to-b from-[#4ADE80] to-[#22C55E] hover:from-[#5eea8e] hover:to-[#2bd668] text-white p-4 rounded-xl border-b-4 border-green-800 btn-shadow flex items-center justify-center gap-2 transition-all">
                    <i className="material-icons-round text-3xl drop-shadow-sm">play_arrow</i>
                    <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-xl"></div>
                  </div>
                </button>
                <button onMouseEnter={() => playSound('hover')} onClick={() => { playSound('click'); onBack(); }} className="w-full sm:w-20 group relative outline-none">
                  <div className="absolute inset-0 bg-red-800 rounded-xl translate-y-2"></div>
                  <div className="relative bg-gradient-to-b from-[#F87171] to-[#EF4444] hover:from-[#fa8e8e] hover:to-[#f55959] text-white p-4 rounded-xl border-b-4 border-red-900 btn-shadow flex items-center justify-center transition-all">
                    <i className="material-icons-round text-3xl drop-shadow-sm">menu</i>
                    <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-xl"></div>
                  </div>
                </button>
              </div>
            </div>
            <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
              <div className="absolute top-[-20px] left-[10%] w-3 h-3 bg-red-500 animate-[float_4s_ease-in-out_infinite] rotate-45"></div>
              <div className="absolute top-[-20px] left-[30%] w-2 h-4 bg-yellow-400 animate-[float_5s_ease-in-out_infinite_1s] -rotate-12"></div>
              <div className="absolute top-[-20px] left-[70%] w-3 h-3 bg-blue-500 animate-[float_3s_ease-in-out_infinite_0.5s] rotate-12"></div>
              <div className="absolute top-[-20px] left-[50%] w-4 h-2 bg-green-400 animate-[float_4.5s_ease-in-out_infinite_1.5s] rotate-90"></div>
              <div className="absolute top-[-20px] left-[85%] w-2 h-2 bg-purple-500 animate-[float_6s_ease-in-out_infinite_2s] rotate-45"></div>
              <div className="absolute bottom-[20%] left-[5%] w-3 h-3 bg-pink-500 animate-[float_7s_ease-in-out_infinite] rotate-12 opacity-60"></div>
              <div className="absolute bottom-[40%] right-[10%] w-2 h-4 bg-orange-400 animate-[float_5s_ease-in-out_infinite] -rotate-45 opacity-60"></div>
            </div>
          </>
        )}

        {gameState === 'spectating' && (
          <div className="absolute inset-0 flex flex-col items-center justify-start pt-32 z-20 pointer-events-none">
            <div className="bg-black/50 backdrop-blur-sm px-6 py-2 rounded-full border border-white/20 animate-pulse">
              <h2 className="text-white text-2xl font-['Fredoka_One',cursive] tracking-wider">SPECTATING</h2>
            </div>
          </div>
        )}

        {gameState === 'waiting_restart' && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border-2 border-slate-600 p-8 rounded-3xl shadow-2xl flex flex-col items-center animate-pop-in w-full max-w-sm relative overflow-hidden">
              <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-6 relative z-10"></div>
              <h2 className="text-white font-['Fredoka_One',cursive] text-2xl mb-2 relative z-10 text-center">WAITING FOR PLAYERS</h2>
              <div className="bg-slate-900/50 rounded-xl px-4 py-2 mb-4 border border-slate-700 relative z-10">
                <p className="text-green-300 font-bold text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  Ready: {readyCount} / {totalPlayers}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
