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
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  const toggleDarkMode = () => {
    const nextVal = !isDarkMode;
    setIsDarkMode(nextVal);
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
      />
    );
  }

  return <GameCanvas mode={view} playerName={playerName} onBack={() => setView('title')} isDarkMode={isDarkMode} />;
}
