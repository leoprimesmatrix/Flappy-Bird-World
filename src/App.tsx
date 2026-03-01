/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import TitleScreen from './TitleScreen';
import GameCanvas from './GameCanvas';

// Returns 'day' (7-17), 'dusk' (17-22), or 'night' (22-7) based on local browser time.
// Browser's Date uses the system timezone automatically — so this is inherently timezone-correct.
function getTimeOfDay(): 'day' | 'dusk' | 'night' {
  const hour = new Date().getHours(); // Local timezone, 0-23
  if (hour >= 7 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'dusk';
  return 'night'; // 22:00–06:59
}

export default function App() {
  const [view, setView] = useState<'title' | 'single' | 'party' | 'ranked'>('title');
  const [playerName, setPlayerName] = useState<string>('');
  const [timeOfDay, setTimeOfDay] = useState<'day' | 'dusk' | 'night'>(getTimeOfDay);

  // User-controlled dark mode — only respected during day/dusk
  const [userDarkMode, setUserDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  // During night, force dark mode. User cannot override.
  const isNightForced = timeOfDay === 'night';
  const isDarkMode = isNightForced || userDarkMode;

  // Update time-of-day every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeOfDay(getTimeOfDay());
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleDarkMode = useCallback(() => {
    if (isNightForced) return; // Cannot toggle during night
    const nextVal = !userDarkMode;
    setUserDarkMode(nextVal);
    localStorage.setItem('darkMode', String(nextVal));
  }, [isNightForced, userDarkMode]);

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
        timeOfDay={timeOfDay}
        isNightForced={isNightForced}
      />
    );
  }

  return <GameCanvas mode={view} playerName={playerName} onBack={() => setView('title')} isDarkMode={isDarkMode} />;
}
