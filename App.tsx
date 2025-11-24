import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectionState, TranscriptItem, VolumeLevel } from './types';
import { GeminiLiveService } from './services/geminiLiveService';
import AudioVisualizer from './components/AudioVisualizer';
import Transcript from './components/Transcript';

// Placeholder image for the avatar/background
const SYDNEY_BG = "https://picsum.photos/id/164/1920/1080"; // A nice architectural/city view
const RECEPTIONIST_AVATAR = "https://picsum.photos/id/64/200/200"; // Portrait placeholder

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [volumes, setVolumes] = useState<VolumeLevel>({ input: 0, output: 0 });
  const [error, setError] = useState<string | null>(null);
  
  const serviceRef = useRef<GeminiLiveService | null>(null);

  const handleTranscriptUpdate = useCallback((newItem: TranscriptItem) => {
    setTranscripts(prev => {
        // If the item ID exists (streaming update), replace it.
        // If not, add it.
        // We use a simplified logic: if id starts with 'current-', replace that specific temp item.
        // If it is a completed item (timestamp id), append it and remove relevant current- item.
        
        const isTemp = newItem.id.startsWith('current-');
        const listWithoutTemps = prev.filter(i => !i.id.startsWith(isTemp ? newItem.id : `current-${newItem.sender}`));
        
        return [...listWithoutTemps, newItem];
    });
  }, []);

  const toggleConnection = async () => {
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) {
        setConnectionState(ConnectionState.DISCONNECTED);
        await serviceRef.current?.disconnect();
        serviceRef.current = null;
        return;
    }

    setConnectionState(ConnectionState.CONNECTING);
    setError(null);
    setTranscripts([]);

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        setError("API Key not found in environment.");
        setConnectionState(ConnectionState.ERROR);
        return;
    }

    const service = new GeminiLiveService({
        apiKey,
        onConnect: () => setConnectionState(ConnectionState.CONNECTED),
        onDisconnect: () => setConnectionState(ConnectionState.DISCONNECTED),
        onError: (err) => {
            console.error(err);
            setError(err.message);
            setConnectionState(ConnectionState.ERROR);
        },
        onTranscriptUpdate: handleTranscriptUpdate,
        onVolumeChange: (input, output) => setVolumes({ input, output })
    });

    serviceRef.current = service;
    await service.connect();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
        serviceRef.current?.disconnect();
    };
  }, []);

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gray-900 overflow-hidden font-sans">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img src={SYDNEY_BG} alt="Sydney Hotel View" className="w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-t from-hotel-navy via-hotel-navy/80 to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-4xl p-4 h-[90vh] flex flex-col">
        
        {/* Header */}
        <header className="flex items-center justify-between mb-6 px-4">
            <div className="text-white">
                <h1 className="font-serif text-3xl text-hotel-gold tracking-wide">Harbour View Hotel</h1>
                <p className="text-sm opacity-80 uppercase tracking-widest text-gray-300">Concierge Desk &bull; Sydney</p>
            </div>
            <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${connectionState === ConnectionState.CONNECTED ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-xs text-white uppercase font-bold tracking-wider">
                    {connectionState}
                </span>
            </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl flex flex-col md:flex-row overflow-hidden">
            
            {/* Left Column: Avatar & Visualizer */}
            <div className="w-full md:w-1/3 bg-hotel-navy/60 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-white/10 relative">
                
                {/* Avatar Circle */}
                <div className="relative mb-6 group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-hotel-gold to-yellow-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                    <img 
                        src={RECEPTIONIST_AVATAR} 
                        alt="Sarah Receptionist" 
                        className="relative w-32 h-32 rounded-full border-4 border-hotel-gold object-cover shadow-xl"
                    />
                    <div className="absolute bottom-1 right-1 bg-white text-hotel-navy text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">
                        AI
                    </div>
                </div>

                <h2 className="text-xl text-white font-serif mb-1">Sarah</h2>
                <p className="text-xs text-gray-300 uppercase tracking-widest mb-8">Receptionist</p>

                {/* Audio Visualizers */}
                <div className="w-full space-y-6">
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] text-gray-400 uppercase mb-2">Voice Input (You)</span>
                        <AudioVisualizer 
                            volume={volumes.input} 
                            color="bg-blue-400" 
                            isActive={connectionState === ConnectionState.CONNECTED}
                        />
                    </div>
                    
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] text-gray-400 uppercase mb-2">Voice Output (Sarah)</span>
                        <AudioVisualizer 
                            volume={volumes.output} 
                            color="bg-hotel-gold" 
                            isActive={connectionState === ConnectionState.CONNECTED}
                        />
                    </div>
                </div>
            </div>

            {/* Right Column: Transcript */}
            <div className="w-full md:w-2/3 flex flex-col bg-slate-50">
                <Transcript items={transcripts} />
            </div>
        </div>

        {/* Footer / Controls */}
        <div className="mt-6 flex flex-col items-center justify-center space-y-4">
            {error && (
                <div className="bg-red-500/90 text-white px-4 py-2 rounded-lg text-sm shadow-lg backdrop-blur-sm">
                    {error}
                </div>
            )}

            <button
                onClick={toggleConnection}
                disabled={connectionState === ConnectionState.CONNECTING}
                className={`
                    px-8 py-3 rounded-full font-bold uppercase tracking-widest text-sm transition-all duration-300 shadow-lg transform hover:scale-105
                    ${connectionState === ConnectionState.CONNECTED 
                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                        : 'bg-hotel-gold hover:bg-yellow-600 text-hotel-navy'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                `}
            >
                {connectionState === ConnectionState.CONNECTING ? 'Connecting...' : 
                 connectionState === ConnectionState.CONNECTED ? 'End Call' : 'Call Reception'}
            </button>
            
            <p className="text-gray-400 text-xs text-center max-w-md">
                Microphone access required. Audio is processed in real-time by Google Gemini.
            </p>
        </div>
      </div>
    </div>
  );
};

export default App;
