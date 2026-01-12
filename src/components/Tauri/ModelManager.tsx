// AI Model management component for Tauri application

import React, { useState, useEffect, useCallback } from 'react';
// Use mock API for web testing
import { tauriApi, ModelInfo, ModelLoadingEvent } from '../../services/tauriApiMock';

interface ModelManagerProps {
  className?: string;
}

export const ModelManager: React.FC<ModelManagerProps> = ({ className = '' }) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<{
    isLoading: boolean;
    progress: number;
    stage: string;
    message: string;
  }>({
    isLoading: false,
    progress: 0,
    stage: '',
    message: '',
  });

  const loadModelInformation = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const modelInfo = await tauriApi.getAvailableModels();
      setModels(modelInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model information');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModelInformation();

    // Set up progress listener
    const cleanup = tauriApi.onProgress('model_loading', (event: ModelLoadingEvent) => {
      setLoadingProgress({
        isLoading: event.progress < 1.0,
        progress: event.progress,
        stage: event.stage,
        message: event.message,
      });

      // Reload model info when loading completes
      if (event.progress >= 1.0) {
        setTimeout(() => {
          loadModelInformation();
          setLoadingProgress(prev => ({ ...prev, isLoading: false }));
        }, 1000);
      }
    });

    return cleanup;
  }, [loadModelInformation]);

  const handleLoadWhisperModel = async () => {
    try {
      setLoadingProgress({
        isLoading: true,
        progress: 0,
        stage: 'initializing',
        message: 'Whisper-Modell wird geladen...',
      });

      await tauriApi.loadWhisperModel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Whisper model');
      setLoadingProgress(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleCleanupModels = async () => {
    try {
      await tauriApi.cleanupModels();
      await loadModelInformation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cleanup models');
    }
  };

  const getModelStatusBadge = (model: ModelInfo) => {
    if (model.loaded) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <span className="w-2 h-2 mr-1 bg-green-400 rounded-full"></span>
          Geladen
        </span>
      );
    } else if (model.status === 'Available') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          <span className="w-2 h-2 mr-1 bg-blue-400 rounded-full"></span>
          Verfügbar
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          <span className="w-2 h-2 mr-1 bg-gray-400 rounded-full"></span>
          {model.status}
        </span>
      );
    }
  };

  if (loading) {
    return (
      <div className={`medical-card p-6 ${className}`}>
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">AI-Modelle werden geladen...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`medical-card p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-blue-700">
          AI-Modell Verwaltung
        </h3>
        <div className="flex space-x-2">
          <button
            onClick={loadModelInformation}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors"
          >
            Aktualisieren
          </button>
          <button
            onClick={handleCleanupModels}
            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors"
          >
            Aufräumen
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded">
          <strong>Fehler: </strong>{error}
        </div>
      )}

      {/* Loading Progress */}
      {loadingProgress.isLoading && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-800 font-medium">
              {tauriApi.translateModelStage(loadingProgress.stage)}
            </span>
            <span className="text-blue-700 text-sm">
              {Math.round(loadingProgress.progress * 100)}%
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${loadingProgress.progress * 100}%` }}
            />
          </div>
          <p className="text-blue-700 text-sm">{loadingProgress.message}</p>
        </div>
      )}

      {/* Model List */}
      <div className="space-y-4">
        {models.map((model) => (
          <div 
            key={model.name}
            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <h4 className="text-md font-medium text-gray-900 mr-3">
                  {model.name}
                </h4>
                {getModelStatusBadge(model)}
              </div>
              <div className="text-sm text-gray-500">
                v{model.version}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Größe:</span>
                <span className="ml-2 font-medium">
                  {tauriApi.formatMemorySize(model.size_bytes)}
                </span>
              </div>
              
              <div>
                <span className="text-gray-600">Speichernutzung:</span>
                <span className="ml-2 font-medium">
                  {model.memory_usage > 0 
                    ? tauriApi.formatMemorySize(model.memory_usage)
                    : 'Nicht geladen'
                  }
                </span>
              </div>

              <div className="flex justify-end">
                {model.name === 'Whisper Large-v3' && model.status === 'Available' && !model.loaded && (
                  <button
                    onClick={handleLoadWhisperModel}
                    disabled={loadingProgress.isLoading}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-1 px-3 rounded text-sm transition-colors"
                  >
                    {loadingProgress.isLoading ? 'Wird geladen...' : 'Laden'}
                  </button>
                )}
                
                {model.loaded && (
                  <span className="inline-flex items-center text-green-700 text-sm">
                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Bereit
                  </span>
                )}

                {model.status === 'Planned' && (
                  <span className="text-gray-500 text-sm">
                    Geplant für spätere Phase
                  </span>
                )}
              </div>
            </div>

            {/* Model-specific information */}
            {model.name === 'Whisper Large-v3' && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-600">
                  Hochqualitative Spracherkennung für deutsche medizinische Aufnahmen. 
                  Optimiert für medizinische Terminologie und Abkürzungen.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-sm text-gray-600">
          <span>
            Verfügbare Modelle: {models.length} | 
            Geladene Modelle: {models.filter(m => m.loaded).length}
          </span>
          <span>
            Gesamtspeicher: {tauriApi.formatMemorySize(
              models.reduce((total, model) => total + model.memory_usage, 0)
            )}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ModelManager;