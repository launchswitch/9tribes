import { useEffect, useState } from 'react';
import { MenuClient } from './app/routes/MenuClient';
import { PlayClient } from './app/routes/PlayClient';
import { syncMusicForMode } from './app/audio/musicManager';

function App() {
  const [mode, setMode] = useState<string>('menu');

  useEffect(() => {
    try {
      const m = new URLSearchParams(window.location.search).get('mode');
      setMode(m ?? 'menu');
    } catch (e) {
      console.error('Error getting mode:', e);
      setMode('menu');
    }
  }, []);

  useEffect(() => {
    syncMusicForMode(mode);
  }, [mode]);

  if (mode === 'play') {
    return <PlayClient />;
  }

  return <MenuClient />;
}

export default App;
