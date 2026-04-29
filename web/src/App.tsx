import { useEffect, useState } from 'react';
import { MenuClient } from './app/routes/MenuClient';
import { PlayClient } from './app/routes/PlayClient';
import { syncMusicForMode } from './app/audio/musicManager';

function App() {
  const [mode, setMode] = useState<string>('menu');
  const [testClicksWork, setTestClicksWork] = useState(false);

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

  const handleTestClick = () => {
    setTestClicksWork(true);
    console.log('TEST BUTTON CLICKED!');
  };

  if (mode === 'play') {
    return (
      <>
        <button 
          style={{ position: 'absolute', top: 10, left: 10, zIndex: 9999, background: 'red', color: 'white', padding: '10px' }}
          onClick={handleTestClick}
        >
          TEST CLICK {testClicksWork ? 'WORKS!' : ''}
        </button>
        <PlayClient />
      </>
    );
  }

  return <MenuClient />;
}

export default App;
