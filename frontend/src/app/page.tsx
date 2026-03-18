import React from 'react';

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-950 via-dark-900 to-dark-950 flex items-center justify-center">
      <div className="text-center space-y-8">
        <h1 className="text-5xl font-bold gradient-text animate-pulse">
          🚀 Mentor Sessions
        </h1>
        <p className="text-2xl text-gray-300">
          Building your real-time collaboration platform...
        </p>
        <div className="flex justify-center gap-4">
          <div className="w-3 h-3 bg-primary-500 rounded-full animate-bounce"></div>
          <div className="w-3 h-3 bg-secondary-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-3 h-3 bg-accent-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    </div>
  );
}
