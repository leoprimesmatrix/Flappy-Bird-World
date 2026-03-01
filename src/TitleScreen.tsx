import React, { useState } from 'react';
import { isNameAppropriate } from './utils/profanity';
import { playSound } from './utils/audio';

interface TitleScreenProps {
  onStartSingle: () => void;
  onStartRanked: (name: string) => void;
  onStartParty: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  timeOfDay: 'day' | 'dusk' | 'night';
  isNightForced: boolean;
}

export default function TitleScreen({ onStartSingle, onStartRanked, onStartParty, isDarkMode, toggleDarkMode, timeOfDay, isNightForced }: TitleScreenProps) {
  const [showNameModal, setShowNameModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPatchNotesModal, setShowPatchNotesModal] = useState(false);
  const [tempName, setTempName] = useState('');
  const [nameError, setNameError] = useState('');

  const handleRankedClick = () => {
    setShowNameModal(true);
  };

  const submitName = () => {
    const check = isNameAppropriate(tempName);
    if (!check.valid) {
      setNameError(check.error || 'Invalid name');
      return;
    }
    setShowNameModal(false);
    onStartRanked(tempName.trim());
  };

  // Pick background image & overlay based on time of day
  const getBgStyle = () => {
    if (timeOfDay === 'night') {
      return 'linear-gradient(rgba(5, 8, 20, 0.85) 0%, rgba(5, 8, 20, 0.97) 100%), url("https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=2094&auto=format&fit=crop")';
    }
    if (timeOfDay === 'dusk') {
      return 'linear-gradient(rgba(30, 15, 40, 0.6) 0%, rgba(120, 50, 10, 0.55) 100%), url("https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070&auto=format&fit=crop")';
    }
    // day
    return 'linear-gradient(rgba(135, 206, 235, 0.6) 0%, rgba(255, 255, 255, 0.2) 100%), url("https://lh3.googleusercontent.com/aida-public/AB6AXuBqt2GkUtmvsqv54zLthuZ4MnjX3FxzqhNIRmBrxqKDSit9dLmrlhlytm4wOUJsRrHA5KRCjO5mwgt4e-wTE-BcVkU15VN-w4XJ0gf1y4BQ4udZ0xRZXcms_JKdt7yJKGBETzEAmSu4S7qpkVZqK_GZGW4Tqa17YGQaj19mbVso0WW-ghlzWOJwQzt4sBWpzc1_QJBLaXoVIqG5Qz8NGnu9SEctMQiAg_hqylJuFd4PKBYE1QcRJAJlln5t0VGVZZHrsiE96DHh5fI")';
  };

  const getRootBg = () => {
    if (timeOfDay === 'night') return 'bg-slate-950 text-slate-100';
    if (timeOfDay === 'dusk') return 'bg-[#1C0A2A] text-slate-100';
    return isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-[#87CEEB] text-slate-900';
  };

  return (
    <div className={`relative flex min-h-screen w-full flex-col overflow-y-auto overflow-x-hidden transition-colors duration-1000 font-['Nunito',sans-serif] selection:bg-[#FF4757] selection:text-white ${getRootBg()}`}>
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat transition-all duration-1000"
        style={{ backgroundImage: getBgStyle() }}
      ></div>

      {/* Ambient glow orbs — colour-coded per time of day */}
      {timeOfDay === 'night' && (
        <>
          <div className="fixed top-10 left-10 w-24 h-24 bg-pink-500/20 rounded-full blur-2xl"></div>
          <div className="fixed bottom-20 right-20 w-32 h-32 bg-cyan-400/20 rounded-full blur-2xl"></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-900/20 rounded-full blur-3xl"></div>
        </>
      )}
      {timeOfDay === 'dusk' && (
        <>
          <div className="fixed top-10 left-10 w-24 h-24 bg-orange-400/30 rounded-full blur-2xl"></div>
          <div className="fixed bottom-20 right-20 w-32 h-32 bg-purple-500/25 rounded-full blur-2xl"></div>
          <div className="fixed bottom-0 left-0 w-48 h-48 bg-pink-600/15 rounded-full blur-3xl"></div>
        </>
      )}
      {timeOfDay === 'day' && !isDarkMode && (
        <>
          <div className="fixed top-10 left-10 w-24 h-24 bg-white/30 rounded-full blur-2xl"></div>
          <div className="fixed bottom-20 right-20 w-32 h-32 bg-yellow-400/20 rounded-full blur-2xl"></div>
        </>
      )}
      {timeOfDay === 'day' && isDarkMode && (
        <>
          <div className="fixed top-10 left-10 w-24 h-24 bg-pink-500/20 rounded-full blur-2xl"></div>
          <div className="fixed bottom-20 right-20 w-32 h-32 bg-cyan-400/20 rounded-full blur-2xl"></div>
        </>
      )}

      <div className="fixed bottom-6 right-6 z-20 flex flex-col gap-3">
        <a href="https://x.com/PrimeDevv" target="_blank" rel="noopener noreferrer" className={`group relative flex h-14 w-14 items-center justify-center rounded-2xl ${isDarkMode ? 'bg-slate-800 border-b-4 border-slate-900 shadow-[0px_6px_0px_0px_rgba(0,0,0,0.5)]' : 'bg-black border-b-4 border-gray-800 shadow-[0px_6px_0px_0px_rgba(0,0,0,0.2)]'} hover:-translate-y-1 hover:brightness-110 active:border-b-0 active:translate-y-1 transition-all duration-150`}>
          <svg aria-hidden="true" className="w-7 h-7 fill-white" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
        </a>
        <a href="https://discord.gg/bcXduuG3Da" target="_blank" rel="noopener noreferrer" className={`group relative flex h-14 w-14 items-center justify-center rounded-2xl ${isDarkMode ? 'bg-[#5865F2] border-b-4 border-indigo-900 shadow-[0px_6px_0px_0px_rgba(0,0,0,0.5)]' : 'bg-[#5865F2] border-b-4 border-indigo-900 shadow-[0px_6px_0px_0px_rgba(0,0,0,0.2)]'} hover:-translate-y-1 hover:brightness-110 active:border-b-0 active:translate-y-1 transition-all duration-150`}>
          <svg aria-hidden="true" className="w-8 h-8 fill-white" viewBox="0 0 127.14 96.36"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.11,77.11,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"></path></svg>
        </a>
      </div>

      <div className="relative z-10 flex h-full grow flex-col justify-center items-center">
        <div className="flex flex-col w-full max-w-[1200px] flex-1 px-4 lg:px-20 py-4 md:py-6 justify-between items-center">

          <div className="flex flex-col items-center justify-center pt-4 lg:pt-10 transform hover:scale-105 transition-transform duration-500 ease-in-out">
            <div className="relative mb-2">
              <h1
                className="relative z-10 text-white text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-['Fredoka_One',cursive] tracking-wide uppercase text-center drop-shadow-[0_8px_0_rgba(0,0,0,0.25)]"
                style={{ WebkitTextStroke: '6px black', paintOrder: 'stroke fill', textShadow: 'rgb(255, 71, 87) 4px 4px 0px' }}
              >
                FLAPPY<br /><span className="text-[#FFD700]" style={{ textShadow: 'rgb(230, 126, 34) 4px 4px 0px' }}>BIRD WORLD</span>
              </h1>
              <div className="absolute -right-4 -top-4 md:-right-8 md:-top-8 rotate-12 bg-white rounded-full p-2 border-4 border-black shadow-[0px_6px_0px_0px_rgba(0,0,0,0.2)] hidden sm:block">
                <span className="material-symbols-outlined text-[#FF4757] text-3xl md:text-5xl font-black" style={{ fontVariationSettings: '"FILL" 1, "wght" 700' }}>flutter_dash</span>
              </div>
            </div>
            <div className={`bg-black/20 backdrop-blur-sm px-4 md:px-6 py-2 rounded-full mt-4 border-2 ${timeOfDay === 'night' ? 'border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.3)]' :
                timeOfDay === 'dusk' ? 'border-orange-400/50 shadow-[0_0_15px_rgba(251,146,60,0.3)]' :
                  isDarkMode ? 'border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.3)]' :
                    'border-white/30'
              } text-center`}>
              <h2 className={`text-sm md:text-lg lg:text-xl font-black tracking-wider uppercase drop-shadow-md ${timeOfDay === 'night' ? 'text-pink-100' :
                  timeOfDay === 'dusk' ? 'text-orange-100' :
                    isDarkMode ? 'text-pink-100' : 'text-white'
                }`}>
                CLASSIC FLAPPY BIRD RE-IMAGINED WITH ONLINE PLAY!
              </h2>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center w-full max-w-[480px] gap-3 md:gap-5 py-4">
            <button onMouseEnter={() => playSound('hover')} onClick={() => { playSound('click'); onStartSingle(); }} className="group relative w-full h-16 md:h-20 cursor-pointer rounded-3xl bg-[#FF4757] border-b-8 border-rose-800 active:border-b-0 active:translate-y-2 transition-all duration-150 ease-out shadow-xl hover:brightness-110 overflow-hidden">
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent)', backgroundSize: '1rem 1rem' }}></div>
              <div className="relative h-full flex items-center justify-between px-6 md:px-8">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="bg-white/20 p-2 rounded-2xl">
                    <span className="material-symbols-outlined text-white text-2xl md:text-3xl font-black">person</span>
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-white text-xl md:text-2xl font-['Fredoka_One',cursive] tracking-wide drop-shadow-md">SINGLE PLAYER</span>
                    <span className="text-rose-200 text-[10px] md:text-xs font-bold uppercase tracking-wider">Classic Mode</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-white text-3xl md:text-4xl group-hover:translate-x-2 transition-transform font-bold">play_arrow</span>
              </div>
            </button>

            <button onMouseEnter={() => playSound('hover')} onClick={() => { playSound('click'); handleRankedClick(); }} className="group relative w-full h-16 md:h-20 cursor-pointer rounded-3xl bg-[#1E90FF] border-b-8 border-blue-800 active:border-b-0 active:translate-y-2 transition-all duration-150 ease-out shadow-xl hover:brightness-110 overflow-hidden">
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent)', backgroundSize: '1rem 1rem' }}></div>
              <div className="relative h-full flex items-center justify-between px-6 md:px-8">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="bg-white/20 p-2 rounded-2xl relative">
                    <span className="material-symbols-outlined text-white text-2xl md:text-3xl font-black">public</span>
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#2ED573] border-2 border-[#1E90FF] rounded-full animate-ping"></div>
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#2ED573] border-2 border-[#1E90FF] rounded-full"></div>
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-white text-xl md:text-2xl font-['Fredoka_One',cursive] tracking-wide drop-shadow-md">RANKED</span>
                    <span className="text-blue-200 text-[10px] md:text-xs font-bold uppercase tracking-wider">Compete Online</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-white text-3xl md:text-4xl group-hover:rotate-12 transition-transform font-bold">trophy</span>
              </div>
            </button>

            <button onMouseEnter={() => playSound('hover')} onClick={() => { playSound('click'); onStartParty(); }} className="group relative w-full h-16 md:h-20 cursor-pointer rounded-3xl bg-[#2ED573] border-b-8 border-green-700 active:border-b-0 active:translate-y-2 transition-all duration-150 ease-out shadow-xl hover:brightness-110 overflow-hidden">
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent)', backgroundSize: '1rem 1rem' }}></div>
              <div className="relative h-full flex items-center justify-between px-6 md:px-8">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="bg-white/20 p-2 rounded-2xl">
                    <span className="material-symbols-outlined text-white text-2xl md:text-3xl font-black">videogame_asset</span>
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-white text-xl md:text-2xl font-['Fredoka_One',cursive] tracking-wide drop-shadow-md">PARTY BRAWL</span>
                    <span className="text-green-100 text-[10px] md:text-xs font-bold uppercase tracking-wider">4 Player Local</span>
                  </div>
                </div>
                <div className="flex -space-x-3 bg-black/20 p-2 rounded-xl hidden sm:flex">
                  <div className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-[#FF4757] border-2 border-white flex items-center justify-center text-[10px] md:text-xs text-white font-bold">P1</div>
                  <div className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-[#1E90FF] border-2 border-white flex items-center justify-center text-[10px] md:text-xs text-white font-bold">P2</div>
                  <div className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-yellow-400 border-2 border-white flex items-center justify-center text-[10px] md:text-xs text-white font-bold">P3</div>
                </div>
              </div>
            </button>

            {/* Time-of-day ambient badge */}
            {timeOfDay !== 'day' && (
              <div className={`w-full max-w-[480px] py-1.5 px-4 rounded-full text-center text-xs font-bold uppercase tracking-wider ${timeOfDay === 'night' ? 'bg-indigo-950/80 text-cyan-300 border border-cyan-800/50' : 'bg-orange-950/60 text-orange-200 border border-orange-700/50'
                }`}>
                {timeOfDay === 'night' ? '🌙 Midnight Mode — Cozy & Relaxed' : '🌅 Winding Down — Dusk Mode'}
              </div>
            )}

            <div className="flex gap-4 w-full mt-2">
              <button onMouseEnter={() => playSound('hover')} onClick={() => { playSound('click'); setShowSettingsModal(true); }} className={`flex-1 h-10 md:h-12 rounded-2xl ${isDarkMode ? 'bg-slate-800 border-b-4 border-slate-900 text-slate-200 hover:bg-slate-700' : 'bg-white border-b-4 border-slate-300 text-slate-700 hover:bg-slate-50'} font-bold active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 shadow-lg text-sm md:text-base`}>
                <span className="material-symbols-outlined">settings</span> Settings
              </button>
              <button onMouseEnter={() => playSound('hover')} onClick={() => { playSound('click'); setShowPatchNotesModal(true); }} className={`flex-1 h-10 md:h-12 rounded-2xl ${isDarkMode ? 'bg-slate-800 border-b-4 border-slate-900 text-slate-200 hover:bg-slate-700' : 'bg-white border-b-4 border-slate-300 text-slate-700 hover:bg-slate-50'} font-bold active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 shadow-lg text-sm md:text-base`}>
                <span className="material-symbols-outlined">article</span> Patch Notes
              </button>
            </div>
          </div>

          <div className="w-full pb-6 pt-2 md:pt-4">
            <div className="flex flex-wrap justify-center gap-4 md:gap-6">
              <div className="relative group cursor-default transform hover:-translate-y-1 transition-transform">
                <div className="relative flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-3xl bg-[#FF4757] shadow-[0px_6px_0px_0px_rgba(0,0,0,0.2)] border-4 border-white z-10">
                  <span className="material-symbols-outlined text-white text-4xl md:text-5xl drop-shadow-md" style={{ fontVariationSettings: '"FILL" 1' }}>pets</span>
                  <div className="absolute -top-3 -right-3 h-6 w-6 md:h-8 md:w-8 rounded-full bg-[#2ED573] border-4 border-white flex items-center justify-center shadow-md animate-bounce">
                    <span className="material-symbols-outlined text-xs md:text-sm text-white font-black">check</span>
                  </div>
                </div>
                <div className="mt-2 md:mt-3 bg-black/40 backdrop-blur-md rounded-full px-3 md:px-4 py-1 text-center border-2 border-white/20">
                  <span className="block text-[10px] md:text-xs font-black text-white uppercase tracking-wider">Player 1</span>
                </div>
              </div>

              <div className="relative group cursor-pointer transform hover:-translate-y-1 transition-transform">
                <div className="relative flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-3xl bg-white/80 border-4 border-dashed border-[#1E90FF]/50 group-hover:border-[#1E90FF] group-hover:bg-white transition-all shadow-sm">
                  <span className="material-symbols-outlined text-[#1E90FF]/50 text-3xl md:text-4xl group-hover:scale-110 transition-transform">add_circle</span>
                </div>
                <div className="mt-2 md:mt-3 text-center opacity-80 group-hover:opacity-100">
                  <span className="block text-[10px] md:text-xs font-black text-white bg-[#1E90FF]/80 rounded-full px-2 md:px-3 py-1 uppercase tracking-wider shadow-sm">Join</span>
                </div>
              </div>

              <div className="relative group cursor-pointer transform hover:-translate-y-1 transition-transform">
                <div className="relative flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-3xl bg-white/80 border-4 border-dashed border-[#FFD700]/50 group-hover:border-[#FFD700] group-hover:bg-white transition-all shadow-sm">
                  <span className="material-symbols-outlined text-[#FFD700]/50 text-3xl md:text-4xl group-hover:scale-110 transition-transform">add_circle</span>
                </div>
                <div className="mt-2 md:mt-3 text-center opacity-80 group-hover:opacity-100">
                  <span className="block text-[10px] md:text-xs font-black text-white bg-[#FFD700]/80 rounded-full px-2 md:px-3 py-1 uppercase tracking-wider shadow-sm">Join</span>
                </div>
              </div>

              <div className="relative group cursor-pointer transform hover:-translate-y-1 transition-transform hidden sm:block">
                <div className="relative flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-3xl bg-white/80 border-4 border-dashed border-purple-400/50 group-hover:border-purple-400 group-hover:bg-white transition-all shadow-sm">
                  <span className="material-symbols-outlined text-purple-400/50 text-3xl md:text-4xl group-hover:scale-110 transition-transform">add_circle</span>
                </div>
                <div className="mt-2 md:mt-3 text-center opacity-80 group-hover:opacity-100">
                  <span className="block text-[10px] md:text-xs font-black text-white bg-purple-400/80 rounded-full px-2 md:px-3 py-1 uppercase tracking-wider shadow-sm">Join</span>
                </div>
              </div>
            </div>

            <div className="mt-4 md:mt-6 text-center">
              <p className="text-[10px] md:text-xs text-white/90 font-bold bg-black/20 inline-block px-4 py-1 rounded-full backdrop-blur-sm">© PrimeDev Studios 2026 | Build Version 1.0</p>
            </div>
          </div>
        </div>
      </div>

      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-pop-in">
          <div className="bg-slate-800 border-2 border-slate-600 rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl relative">
            <button
              onMouseEnter={() => playSound('hover')}
              onClick={() => { playSound('click'); setShowNameModal(false); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            <h2 className="text-white font-['Fredoka_One',cursive] text-2xl md:text-3xl mb-2 text-center">ENTER YOUR NAME</h2>
            <p className="text-slate-400 text-sm text-center mb-6">You need a name to compete online.</p>

            <input
              type="text"
              value={tempName}
              onChange={(e) => {
                setTempName(e.target.value);
                setNameError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  playSound('click');
                  submitName();
                }
              }}
              placeholder="Player Name"
              className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-500 transition-colors mb-2"
              maxLength={12}
            />
            {nameError && (
              <p className="text-red-400 text-xs font-bold mb-4 text-center animate-pulse">{nameError}</p>
            )}

            <button
              onMouseEnter={() => playSound('hover')}
              onClick={() => { playSound('click'); submitName(); }}
              className="w-full mt-4 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 transition-all"
            >
              JOIN MATCHMAKING
            </button>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-pop-in">
          <div className={`border-2 rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl relative ${isDarkMode ? 'bg-slate-900 border-pink-500/50 shadow-[0_0_30px_rgba(236,72,153,0.2)]' : 'bg-slate-800 border-slate-600'}`}>
            <button
              onMouseEnter={() => playSound('hover')}
              onClick={() => { playSound('click'); setShowSettingsModal(false); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            <h2 className="text-white font-['Fredoka_One',cursive] text-2xl md:text-3xl mb-6 text-center">SETTINGS</h2>

            <div className="flex flex-col gap-4">
              <div className={`flex items-center justify-between p-4 rounded-xl ${isDarkMode ? 'bg-slate-800' : 'bg-slate-700'}`}>
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-white">dark_mode</span>
                  <span className="text-white font-bold">Dark Mode</span>
                </div>
                <button
                  onClick={() => { if (!isNightForced) { playSound('click'); toggleDarkMode(); } }}
                  title={isNightForced ? "Dark mode is locked during night hours (10 PM – 7 AM)" : undefined}
                  className={`relative w-14 h-8 rounded-full transition-colors duration-300 ${isNightForced ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    } ${isDarkMode ? 'bg-pink-500' : 'bg-slate-500'}`}
                >
                  <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-transform duration-300 ${isDarkMode ? 'left-7' : 'left-1'}`}></div>
                </button>
              </div>

              {isNightForced && (
                <div className="bg-indigo-950/80 border border-cyan-800/50 rounded-xl px-4 py-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-cyan-400 text-sm">bedtime</span>
                  <p className="text-cyan-200 text-xs font-semibold">
                    It's late! Dark mode is locked from 10 PM – 7 AM for a cozy experience. 🌙
                  </p>
                </div>
              )}

              <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-slate-800' : 'bg-slate-700'} mt-2`}>
                <p className="text-xs text-slate-400 text-center">
                  {timeOfDay === 'night'
                    ? '🌙 Midnight Mode: Cozy neon night. Sweet dreams after gaming!'
                    : timeOfDay === 'dusk'
                      ? '🌅 Dusk Mode: The sun is setting. Time to wind down.'
                      : 'Tip: Dark Mode also changes gameplay graphics to an energetic neon night mode.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPatchNotesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-pop-in">
          <div className={`border-2 rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl relative max-h-[80vh] flex flex-col ${isDarkMode ? 'bg-slate-900 border-cyan-500/50 shadow-[0_0_30px_rgba(34,211,238,0.2)]' : 'bg-slate-800 border-slate-600'}`}>
            <button
              onMouseEnter={() => playSound('hover')}
              onClick={() => { playSound('click'); setShowPatchNotesModal(false); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            <h2 className="text-white font-['Fredoka_One',cursive] text-2xl md:text-3xl mb-4 text-center">PATCH NOTES</h2>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-6">

              <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-700/80 border-slate-600'}`}>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-green-400 font-bold text-lg">Beta v1.0.3</h3>
                  <span className="text-slate-400 text-xs font-mono">Today</span>
                </div>
                <ul className="text-slate-200 text-sm flex flex-col gap-2 list-disc pl-4">
                  <li>Added Settings Modal with Dark Mode toggle</li>
                  <li>Dark Mode now completely overhauls gameplay aesthetics to a vibrant neon night!</li>
                  <li>Replaced Ranks with Patch Notes functionality</li>
                  <li>Updated game environment ambient lighting</li>
                </ul>
              </div>

              <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-700/80 border-slate-600'}`}>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-blue-400 font-bold text-lg">Beta v1.0.2</h3>
                  <span className="text-slate-400 text-xs font-mono">Yesterday</span>
                </div>
                <ul className="text-slate-200 text-sm flex flex-col gap-2 list-disc pl-4">
                  <li>CRITICAL FIX: Opponents no longer fall through the world floor</li>
                  <li>CRITICAL FIX: Removed premature Game Over screens when opponents disconnect</li>
                  <li>CRITICAL FIX: Fixed the common 0/2 waiting text when clicking play again</li>
                  <li>Improved Ranked mode synchronization</li>
                </ul>
              </div>

              <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-700/80 border-slate-600'}`}>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-slate-300 font-bold text-lg">Beta v1.0.1</h3>
                  <span className="text-slate-400 text-xs font-mono">Last Week</span>
                </div>
                <ul className="text-slate-200 text-sm flex flex-col gap-2 list-disc pl-4">
                  <li>Initial release of the Ranked Public Matchmaking!</li>
                  <li>Added real-time multiplayer websockets using MQTT</li>
                  <li>Added medals (Bronze, Silver, Gold, Platinum)</li>
                  <li>Improved pixel-perfect bird collision</li>
                </ul>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
