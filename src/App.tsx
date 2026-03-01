/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import TitleScreen from './TitleScreen';
import GameCanvas from './GameCanvas';

export default function App() {
  const [view, setView] = useState<'title' | 'single' | 'party' | 'ranked'>('title');
  const [playerName, setPlayerName] = useState<string>('');
  const [userDarkMode, setUserDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  const hour = new Date().getHours();
  // Ensure we're calculating based on client local time
  let timePhase: 'day' | 'sunset' | 'night' = 'day';
  if (hour >= 7 && hour < 17) timePhase = 'day';
  else if (hour >= 17 && hour < 22) timePhase = 'sunset';
  else timePhase = 'night';

  const isDarkMode = timePhase === 'night' ? true : userDarkMode;

  const toggleDarkMode = () => {
    if (timePhase === 'night') return; // Cannot disable during night
    const nextVal = !userDarkMode;
    setUserDarkMode(nextVal);
    localStorage.setItem('darkMode', String(nextVal));
  };

  if (view === 'title') {
    return (
      <TitleScreen
        onStartSingle={() => setView('single')}
        onStartRanked={(name) => {
          setPlayerName(name);
          setView('ranked');
        }}
        onStartParty={() => setView('party')}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        timePhase={timePhase}
      />
    );
  }

  return <GameCanvas mode={view} playerName={playerName} onBack={() => setView('title')} isDarkMode={isDarkMode} timePhase={timePhase} />;
}
