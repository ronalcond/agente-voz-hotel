import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  volume: number;
  color: string;
  isActive: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ volume, color, isActive }) => {
  const bars = 5;
  
  return (
    <div className="flex items-center justify-center space-x-1 h-8">
      {Array.from({ length: bars }).map((_, i) => {
        // Calculate dynamic height based on volume
        // Volume is approx 0-255. Normalize to 0-1.
        const normalizedVol = Math.min(volume / 100, 1); 
        // Add some randomness so bars don't move perfectly in sync
        const height = isActive 
            ? Math.max(4, normalizedVol * 32 * (Math.random() * 0.5 + 0.8)) 
            : 4;

        return (
          <div
            key={i}
            className={`w-1.5 rounded-full transition-all duration-75 ease-in-out ${color}`}
            style={{ height: `${height}px` }}
          />
        );
      })}
    </div>
  );
};

export default AudioVisualizer;