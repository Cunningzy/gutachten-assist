/**
 * WORKING DESKTOP APPLICATION
 * Fixed: Manual routing + original Welcome component
 * Added: First-launch onboarding for example Gutachten collection
 */

import React, { useState, useEffect } from 'react';
import Welcome from './components/Welcome/Welcome';
import SimpleRecorderComponent from './components/Audio/SimpleRecorderComponent';
import SimpleWhisperTest from './components/Audio/SimpleWhisperTest';
import StyleTrainingComponent from './components/StyleTraining/StyleTrainingComponent';
import LlamaTestComponent from './components/Grammar/LlamaTestComponent';
import DiktiergeraetComponent from './components/Audio/DiktiergeraetComponent';
import RealTimeTranscriptionComponent from './components/Audio/RealTimeTranscriptionComponent';
import AudioTestComponent from './components/Audio/AudioTestComponent';
import GutachtenWorkflowComponent from './components/Workflow/GutachtenWorkflowComponent';
import FirstLaunchOnboarding, { hasExampleDocuments } from './components/Onboarding/FirstLaunchOnboarding';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<string>('home');
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);

  // Check on mount if onboarding needs to be shown
  // Shows every launch UNTIL user has uploaded at least one document
  useEffect(() => {
    const hasDocuments = hasExampleDocuments();
    if (!hasDocuments) {
      setShowOnboarding(true);
    }
  }, []);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    // Navigate to main workflow after onboarding
    setCurrentPage('gutachten-workflow');
  };

  const handleOnboardingSkip = () => {
    // Just dismiss for this session - will show again next launch
    setShowOnboarding(false);
  };

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'gutachten-workflow':
        return <GutachtenWorkflowComponent />;
      case 'simple-recorder':
        return <SimpleRecorderComponent />;
      case 'whisper-test':
        return <SimpleWhisperTest />;
      case 'style-training':
        return <StyleTrainingComponent />;
      case 'llama-test':
        return <LlamaTestComponent />;
      case 'professional-dictation':
        return <DiktiergeraetComponent />;
      case 'real-time-transcription':
        return <RealTimeTranscriptionComponent />;
      case 'audio-test':
        return <AudioTestComponent />;
      case 'audio-debug':
        return <div style={{ padding: '20px' }}>
          <h2>🔧 Audio Debug</h2>
          <p>Audio debugging tools will be implemented here.</p>
        </div>;
      case 'home':
      default:
        return <Welcome onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* First Launch Onboarding Modal - shows until user uploads example documents */}
      {showOnboarding && (
        <FirstLaunchOnboarding
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}

      {/* Working Sidebar with functional buttons */}
      <div style={{
        width: '220px',
        backgroundColor: '#f8fafc',
        padding: '20px',
        borderRight: '2px solid #e2e8f0'
      }}>
        <h2 style={{ fontSize: '1.25rem', color: '#1e293b', marginBottom: '20px' }}>
          🧠 Gutachten Assistant
        </h2>

        <nav>
          {/* MAIN WORKFLOW - Prominent at top */}
          <button
            onClick={() => setCurrentPage('gutachten-workflow')}
            style={{
              display: 'block',
              width: '100%',
              padding: '14px',
              marginBottom: '16px',
              backgroundColor: currentPage === 'gutachten-workflow' ? '#22c55e' : '#16a34a',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '15px',
              fontWeight: '600',
              color: 'white',
              boxShadow: '0 2px 4px rgba(22, 163, 74, 0.3)'
            }}
          >
            📋 Gutachten Diktat
          </button>

          <div style={{ borderTop: '1px solid #e5e7eb', margin: '12px 0', paddingTop: '12px' }}>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase' }}>
              Weitere Tools
            </div>
          </div>

          <button
            onClick={() => setCurrentPage('home')}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              marginBottom: '10px',
              backgroundColor: currentPage === 'home' ? '#dbeafe' : 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px',
              fontWeight: currentPage === 'home' ? '600' : '400',
              color: currentPage === 'home' ? '#1e40af' : '#374151'
            }}
          >
            🏠 Willkommen
          </button>

          <button
            onClick={() => setCurrentPage('simple-recorder')}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              marginBottom: '10px',
              backgroundColor: currentPage === 'simple-recorder' ? '#dbeafe' : 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px',
              fontWeight: currentPage === 'simple-recorder' ? '600' : '400',
              color: currentPage === 'simple-recorder' ? '#1e40af' : '#374151'
            }}
          >
            🎤 Simple Recorder
          </button>

          <button
            onClick={() => setCurrentPage('whisper-test')}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              marginBottom: '10px',
              backgroundColor: currentPage === 'whisper-test' ? '#dbeafe' : 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px',
              fontWeight: currentPage === 'whisper-test' ? '600' : '400',
              color: currentPage === 'whisper-test' ? '#1e40af' : '#374151'
            }}
          >
            🧪 Whisper Test
          </button>

          <button
            onClick={() => setCurrentPage('style-training')}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              marginBottom: '10px',
              backgroundColor: currentPage === 'style-training' ? '#dbeafe' : 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px',
              fontWeight: currentPage === 'style-training' ? '600' : '400',
              color: currentPage === 'style-training' ? '#1e40af' : '#374151'
            }}
          >
            📚 Stil-Training
          </button>

          <button
            onClick={() => setCurrentPage('llama-test')}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              marginBottom: '10px',
              backgroundColor: currentPage === 'llama-test' ? '#dbeafe' : 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px',
              fontWeight: currentPage === 'llama-test' ? '600' : '400',
              color: currentPage === 'llama-test' ? '#1e40af' : '#374151'
            }}
          >
            🧠 Llama Test
          </button>

          <button
            onClick={() => setCurrentPage('professional-dictation')}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              marginBottom: '10px',
              backgroundColor: currentPage === 'professional-dictation' ? '#dbeafe' : 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px',
              fontWeight: currentPage === 'professional-dictation' ? '600' : '400',
              color: currentPage === 'professional-dictation' ? '#1e40af' : '#374151'
            }}
          >
            🎙️ Diktiergerät
          </button>

          <button
            onClick={() => setCurrentPage('real-time-transcription')}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              marginBottom: '10px',
              backgroundColor: currentPage === 'real-time-transcription' ? '#dbeafe' : 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px',
              fontWeight: currentPage === 'real-time-transcription' ? '600' : '400',
              color: currentPage === 'real-time-transcription' ? '#1e40af' : '#374151'
            }}
          >
            📝 Echtzeit-Transkription
          </button>

          <button
            onClick={() => setCurrentPage('audio-test')}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              marginBottom: '10px',
              backgroundColor: currentPage === 'audio-test' ? '#dbeafe' : 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px',
              fontWeight: currentPage === 'audio-test' ? '600' : '400',
              color: currentPage === 'audio-test' ? '#1e40af' : '#374151'
            }}
          >
            🔧 Audio Test
          </button>
        </nav>

        <div style={{
          marginTop: '30px',
          padding: '15px',
          backgroundColor: '#f1f5f9',
          borderRadius: '6px'
        }}>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
            ✅ Desktop App Working
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {renderCurrentPage()}
      </div>
    </div>
  );
};

export default App;