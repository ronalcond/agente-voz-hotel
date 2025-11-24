import React, { useRef, useEffect } from 'react';
import { TranscriptItem } from '../types';

interface TranscriptProps {
  items: TranscriptItem[];
}

const Transcript: React.FC<TranscriptProps> = ({ items }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [items]);

  // Filter out temporary partial items for the history view, or keep them if you want real-time stream effect.
  // We will display them but visually distinguish incomplete ones.
  const displayItems = items.filter(i => i.text.trim().length > 0);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-white/50 backdrop-blur-sm rounded-lg border border-hotel-gold/20 shadow-inner">
      {displayItems.length === 0 && (
        <div className="text-center text-gray-500 italic mt-10">
          Click "Connect" to speak with Sarah at the Reception Desk.
        </div>
      )}
      
      {displayItems.map((item, index) => {
        const isUser = item.sender === 'user';
        return (
            <div key={item.id + index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div 
                    className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm
                    ${isUser 
                        ? 'bg-hotel-navy text-white rounded-br-none' 
                        : 'bg-white text-hotel-navy border border-hotel-gold/30 rounded-bl-none'
                    } ${!item.isComplete ? 'opacity-70 animate-pulse' : ''}`}
                >
                    <div className="text-xs opacity-50 mb-1 uppercase tracking-wider font-bold">
                        {isUser ? 'Guest' : 'Sarah (Reception)'}
                    </div>
                    {item.text}
                </div>
            </div>
        );
      })}
    </div>
  );
};

export default Transcript;