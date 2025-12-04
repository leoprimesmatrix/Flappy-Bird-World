import React from 'react';
import { GameState, BirdState, PipeData } from '../types';
import { GAME_WIDTH, GAME_HEIGHT, BIRD_SIZE, PIPE_WIDTH, GROUND_HEIGHT } from '../constants';

interface GameCanvasProps {
  gameState: GameState;
  myId: string;
}

const Bird: React.FC<{ bird: BirdState; isMe: boolean }> = ({ bird, isMe }) => {
  return (
    <div
      style={{
        transform: `translate(${BIRD_START_X}px, ${bird.y}px) rotate(${bird.rotation}deg)`,
        width: BIRD_SIZE,
        height: BIRD_SIZE,
        position: 'absolute',
        left: 0,
        top: 0,
        transition: 'transform 0.05s linear', // smooth interpolation
        zIndex: isMe ? 20 : 10,
        opacity: bird.isDead ? 0.6 : 1,
        filter: bird.isDead ? 'grayscale(100%)' : 'none'
      }}
    >
      {/* Pixel Art Bird Body */}
      <div className={`w-full h-full rounded-sm border-2 border-black ${bird.color === 'yellow' ? 'bg-yellow-400' : 'bg-red-500'} relative overflow-hidden`}>
        {/* Eye */}
        <div className="absolute top-1 right-2 w-3 h-3 bg-white border-2 border-black rounded-full">
           <div className="absolute top-1 right-0 w-1 h-1 bg-black rounded-full"></div>
        </div>
        {/* Wing */}
        <div className="absolute top-4 left-2 w-4 h-3 bg-white opacity-50 rounded-full border border-black"></div>
        {/* Beak */}
        <div className="absolute top-4 -right-1 w-3 h-2 bg-orange-500 border border-black rounded-sm"></div>
      </div>
      {!isMe && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] bg-black/50 text-white px-1 rounded whitespace-nowrap">
          P2
        </div>
      )}
    </div>
  );
};

// Start X is constant for local view, but relative for logic.
// However, in this implementation, birds don't move X, pipes move X.
const BIRD_START_X = 100;

export const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, myId }) => {
  
  const sortedBirds = (Object.values(gameState.birds) as BirdState[]).sort((a, b) => {
    // Render me last (on top)
    if (a.id === myId) return 1;
    if (b.id === myId) return -1;
    return 0;
  });

  return (
    <div 
      className="relative overflow-hidden bg-sky-300 shadow-2xl ring-8 ring-black rounded-lg"
      style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
    >
        {/* Background Clouds */}
        <div className="absolute top-20 left-10 text-white/40 animate-pulse">
            <CloudIcon size={64} />
        </div>
        <div className="absolute top-40 left-60 text-white/30">
            <CloudIcon size={48} />
        </div>
        <div className="absolute top-10 left-80 text-white/50">
             <CloudIcon size={80} />
        </div>

      {/* Pipes */}
      {gameState.pipes.map((pipe) => (
        <React.Fragment key={pipe.id}>
          {/* Top Pipe */}
          <div
            className="absolute border-x-4 border-b-4 border-black bg-green-500"
            style={{
              left: pipe.x,
              top: 0,
              width: PIPE_WIDTH,
              height: pipe.topHeight,
            }}
          >
             {/* Pipe Cap */}
             <div className="absolute bottom-0 left-[-4px] w-[calc(100%+8px)] h-6 border-4 border-black bg-green-500"></div>
             {/* Highlight */}
             <div className="absolute top-0 right-2 w-2 h-full bg-green-400 opacity-50"></div>
          </div>

          {/* Bottom Pipe */}
          <div
            className="absolute border-x-4 border-t-4 border-black bg-green-500"
            style={{
              left: pipe.x,
              bottom: GROUND_HEIGHT, // Sit on ground
              width: PIPE_WIDTH,
              top: pipe.topHeight + 160, // GAP is 150 hardcoded in logic usually, but we use dynamic. Let's use constant.
            }}
          >
             {/* Pipe Cap */}
             <div className="absolute top-0 left-[-4px] w-[calc(100%+8px)] h-6 border-4 border-black bg-green-500"></div>
             {/* Highlight */}
             <div className="absolute top-0 right-2 w-2 h-full bg-green-400 opacity-50"></div>
          </div>
        </React.Fragment>
      ))}

      {/* Ground */}
      <div 
        className="absolute bottom-0 w-full z-30 border-t-4 border-black"
        style={{ 
            height: GROUND_HEIGHT,
            background: `repeating-linear-gradient(
                -45deg,
                #d1fae5,
                #d1fae5 10px,
                #86efac 10px,
                #86efac 20px
              )`
        }}
      >
        <div 
            className="w-full h-4 bg-green-600 border-b-4 border-black absolute top-0"
        />
        {/* Scrolling effect simulated by logic moving groundX, but simplified CSS here for pure visuals if we wanted. 
            However, we rely on React rendering for now or simple static texture.
            For polished feel, let's use the groundX from state if available, or just static repeating pattern. 
        */}
      </div>

      {/* Birds */}
      {sortedBirds.map((bird) => (
        <Bird key={bird.id} bird={bird} isMe={bird.id === myId} />
      ))}

      {/* Score */}
      <div className="absolute top-10 w-full text-center z-40 pointer-events-none">
        <span className="text-6xl font-bold text-white drop-shadow-[4px_4px_0_#000] stroke-black" style={{ WebkitTextStroke: '2px black'}}>
          {gameState.score}
        </span>
      </div>
      
      {/* Game Over / Waiting Overlay */}
      {gameState.status === 'GAME_OVER' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-[#ded895] border-4 border-black p-6 text-center shadow-[8px_8px_0_#000]">
                <h2 className="text-3xl text-orange-500 font-bold mb-4 drop-shadow-md" style={{ textShadow: '2px 2px 0 #000'}}>GAME OVER</h2>
                <div className="bg-[#cbb968] border-2 border-black p-4 mb-4 rounded">
                     <p className="text-black mb-1">SCORE</p>
                     <p className="text-4xl text-white font-bold drop-shadow-[2px_2px_0_#000]">{gameState.score}</p>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

// Simple SVG Cloud for decoration
const CloudIcon = ({ size }: { size: number }) => (
    <svg 
        width={size} 
        height={size * 0.6} 
        viewBox="0 0 24 24" 
        fill="currentColor" 
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M17.5,19c-3.037,0-5.5-2.463-5.5-5.5c0-0.106,0.005-0.211,0.014-0.316C11.583,13.064,11.054,13,10.5,13 c-2.485,0-4.5,2.015-4.5,4.5c0,0.178,0.016,0.353,0.046,0.524C4.191,18.427,3,20.061,3,22h14.5c3.037,0,5.5-2.463,5.5-5.5 S20.537,11,17.5,11c-0.146,0-0.29,0.008-0.432,0.023c-0.235-3.873-3.483-6.93-7.44-6.93c-2.392,0-4.536,1.119-5.941,2.872 C3.532,7.408,3.5,7.893,3.616,8.354C4.555,12.067,7.915,14.805,11.97,14.992C12.009,14.997,12.049,15,12.088,15 c0.043,0,0.086-0.003,0.128-0.008C12.162,17.229,14.072,19,16.5,19h1z" />
    </svg>
);