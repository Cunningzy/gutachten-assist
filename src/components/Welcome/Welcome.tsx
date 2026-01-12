import React from 'react';

interface WelcomeProps {
  onNavigate: (page: string) => void;
}

const Welcome: React.FC<WelcomeProps> = ({ onNavigate }) => {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '2rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>

        <h1 style={{
          fontSize: '3rem',
          fontWeight: 'bold',
          color: '#1f2937',
          marginBottom: '1rem'
        }}>
          🧠 Gutachten Assistant v2.0
        </h1>

        <p style={{
          fontSize: '1.25rem',
          color: '#6b7280',
          marginBottom: '2rem'
        }}>
          AI-Powered Medical Documentation Desktop Application
        </p>

        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: '600',
            color: '#1e40af',
            marginBottom: '1rem'
          }}>
            🎤 New Simplified Audio Architecture
          </h2>

          <p style={{ color: '#4b5563', marginBottom: '2rem' }}>
            MediaRecorder → Tauri Backend → Python Whisper Pipeline
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            <button
              onClick={() => onNavigate('simple-recorder')}
              style={{
                backgroundColor: '#2563eb',
                color: 'white',
                padding: '1rem',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                display: 'block',
                textAlign: 'center'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎤</div>
              <div style={{ fontWeight: '600' }}>Simple Recorder</div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>New Architecture Test</div>
            </button>

            <button
              onClick={() => onNavigate('audio-debug')}
              style={{
                backgroundColor: '#16a34a',
                color: 'white',
                padding: '1rem',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                display: 'block',
                textAlign: 'center'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#15803d'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#16a34a'}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔧</div>
              <div style={{ fontWeight: '600' }}>Audio Debug</div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Troubleshooting Tools</div>
            </button>

          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          padding: '1.5rem'
        }}>
          <h3 style={{
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#1e40af',
            marginBottom: '1rem'
          }}>
            ✅ Build Completed Successfully
          </h3>

          <p style={{ color: '#059669', fontWeight: '600', marginBottom: '1rem' }}>
            Desktop App Location: src-tauri/target/release/gutachten-assistant.exe
          </p>

          <div style={{ textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ marginBottom: '0.5rem' }}>✅ Tauri 2.0 + React + TypeScript Foundation</div>
            <div style={{ marginBottom: '0.5rem' }}>✅ Enhanced Tauri Backend Commands</div>
            <div style={{ marginBottom: '0.5rem' }}>✅ Simplified Recording Component</div>
            <div style={{ marginBottom: '0.5rem' }}>🔄 FFmpeg Integration for WAV Conversion</div>
            <div style={{ marginBottom: '0.5rem' }}>🔄 Python Whisper Subprocess Pipeline</div>
          </div>
        </div>

        <p style={{
          marginTop: '2rem',
          color: '#6b7280',
          fontSize: '0.875rem'
        }}>
          Offline • DSGVO-konform • Deutsche Ärzte
        </p>

      </div>
    </div>
  );
};

export default Welcome;