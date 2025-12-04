import React from 'react';
import { GameState, BirdState, PipeData } from '../types';
import { GAME_WIDTH, GAME_HEIGHT, BIRD_SIZE, PIPE_WIDTH, GROUND_HEIGHT, PIPE_GAP, BIRD_START_X } from '../constants';

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
        height: BIRD_SIZE * 0.7, // Bird is slightly wider than tall
        position: 'absolute',
        left: 0,
        top: 0,
        zIndex: isMe ? 20 : 10,
        opacity: bird.isDead ? 0.8 : 1,
        transition: 'transform 0.05s linear', // Interpolate network stutter
      }}
    >
      {/* Flappy Style Bird */}
      <div className={`w-full h-full relative ${bird.isDead ? 'grayscale' : ''}`}>
        <div className={`absolute inset-0 rounded-sm border-2 border-black ${bird.color === 'yellow' ? 'bg-[#facc15]' : 'bg-[#ef4444]'}`}></div>
        
        {/* White Eye Background */}
        <div className="absolute top-[-4px] right-2 w-4 h-4 bg-white border-2 border-black rounded-full z-10"></div>
        {/* Pupil */}
        <div className="absolute top-[-2px] right-2 w-1.5 h-1.5 bg-black rounded-full z-20 animate-pulse"></div>
        
        {/* Wing */}
        <div className="absolute top-[8px] left-[-2px] w-5 h-3 bg-white border-2 border-black rounded-full z-10 opacity-80"></div>
        
        {/* Beak */}
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

export const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, myId }) => {
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
      {/* City Skyline Background (Parallax Layer) */}
      <div 
        className="absolute bottom-[100px] left-0 w-full opacity-50 pointer-events-none"
        style={{
            height: '200px',
            backgroundImage: 'linear-gradient(to top, #a3e6af 0%, transparent 100%)', // Simple bush effect placeholder
            backgroundRepeat: 'repeat-x'
        }}
      >
        {/* Simple CSS Buildings */}
        <div className="absolute bottom-0 left-10 w-10 h-32 bg-[#a3e6af] border-t-4 border-x-4 border-[#5ca66a]"></div>
        <div className="absolute bottom-0 left-32 w-14 h-20 bg-[#a3e6af] border-t-4 border-x-4 border-[#5ca66a]"></div>
        <div className="absolute bottom-0 left-60 w-8 h-40 bg-[#a3e6af] border-t-4 border-x-4 border-[#5ca66a]"></div>
        <div className="absolute bottom-0 left-80 w-16 h-24 bg-[#a3e6af] border-t-4 border-x-4 border-[#5ca66a]"></div>
        <div className="absolute bottom-0 left-0 w-full h-4 bg-[#5ca66a]"></div>
      </div>

      {/* Pipes */}
      {gameState.pipes.map((pipe) => (
        <React.Fragment key={pipe.id}>
          {/* Top Pipe */}
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

          {/* Bottom Pipe */}
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

      {/* Game Over / Waiting Overlay */}
      {gameState.status === 'GAME_OVER' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20">
            <div className="bg-[#ded895] border-4 border-black p-4 text-center shadow-[8px_8px_0_#000] animate-in zoom-in duration-300">
                <h2 className="text-3xl text-[#f97316] font-bold mb-4 drop-shadow-[2px_2px_0_#000]">GAME OVER</h2>
                <div className="flex gap-4 justify-center">
                    <div className="bg-[#cbb968] border-2 border-black p-2 w-24 rounded">
                        <p className="text-[10px] text-[#f97316] font-bold">SCORE</p>
                        <p className="text-2xl text-white font-bold drop-shadow-[1px_1px_0_#000]">{gameState.score}</p>
                    </div>
                     <div className="bg-[#cbb968] border-2 border-black p-2 w-24 rounded">
                        <p className="text-[10px] text-[#f97316] font-bold">BEST</p>
                        <p className="text-2xl text-white font-bold drop-shadow-[1px_1px_0_#000]">{gameState.score}</p>
                    </div>
                </div>
            </div>
        </div>
      )}
      
      {/* Flash Effect on Death */}
      <div id="flash-overlay" className="absolute inset-0 bg-white pointer-events-none opacity-0 transition-opacity duration-100"></div>
    </div>
  );
};