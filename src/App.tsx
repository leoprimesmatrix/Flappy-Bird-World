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

  if (view === 'title') {
    return (
      <TitleScreen 
        onStartSingle={() => setView('single')}
        onStartRanked={(name) => {
          setPlayerName(name);
          setView('ranked');
        }}
        onStartParty={() => setView('party')}
      />
    );
  }

  return <GameCanvas mode={view} playerName={playerName} onBack={() => setView('title')} />;
}
