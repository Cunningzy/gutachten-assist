import React, { useState, useEffect } from 'react';
import { LlamaService, LlamaModelInfo, GrammarCorrectionResponse } from '../../services/llamaService';

const LlamaTestComponent: React.FC = () => {
  const [modelInfo, setModelInfo] = useState<LlamaModelInfo | null>(null);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initProgress, setInitProgress] = useState(0);
  const [initStep, setInitStep] = useState('');

  // Grammar correction state
  const [inputText, setInputText] = useState(`Der Patient hat keine beschwerden und fühlt sich gut. Er ist sehr zufriden mit der behandlung und möchte keine weitere termine.`);
  const [correctedText, setCorrectedText] = useState('');
  const [isCorrectingGrammar, setIsCorrectingGrammar] = useState(false);
  const [correctionResult, setCorrectionResult] = useState<GrammarCorrectionResponse | null>(null);
  const [preserveStyle, setPreserveStyle] = useState(true);

  useEffect(() => {
    loadModelInfo();
    checkModelReadiness();
  }, []);

  const loadModelInfo = async () => {
    try {
      const info = await LlamaService.getModelInfo();
      setModelInfo(info);
    } catch (error) {
      console.error('Failed to load model info:', error);
    }
  };

  const checkModelReadiness = async () => {
    try {
      const ready = await LlamaService.isModelReady();
      setIsModelReady(ready);
    } catch (error) {
      console.error('Failed to check model readiness:', error);
    }
  };

  const handleInitializeModel = async () => {
    setIsInitializing(true);
    setInitProgress(0);
    setInitStep('Initialisierung...');

    try {
      await LlamaService.initializeModel((step, progress) => {
        setInitStep(step);
        setInitProgress(progress);
      });

      await checkModelReadiness();
      await loadModelInfo();
    } catch (error) {
      console.error('Model initialization failed:', error);
      alert(`Modell-Initialisierung fehlgeschlagen: ${error}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleCorrectGrammar = async () => {
    if (!inputText.trim()) {
      alert('Bitte geben Sie Text ein.');
      return;
    }

    setIsCorrectingGrammar(true);
    setCorrectedText('');
    setCorrectionResult(null);

    try {
      const result = await LlamaService.correctGrammar(inputText, preserveStyle);
      setCorrectedText(result.corrected_text);
      setCorrectionResult(result);
    } catch (error) {
      console.error('Grammar correction failed:', error);
      alert(`Grammatikkorrektur fehlgeschlagen: ${error}`);
    } finally {
      setIsCorrectingGrammar(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'loaded': return 'text-green-600';
      case 'downloaded': return 'text-yellow-600';
      case 'not_downloaded': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'loaded': return 'Geladen und bereit';
      case 'downloaded': return 'Heruntergeladen (nicht geladen)';
      case 'not_downloaded': return 'Nicht heruntergeladen';
      default: return 'Unbekannt';
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-blue-900 mb-2">
          Component 2.2C: Llama 3.1 8B Grammatikkorrektur
        </h1>
        <p className="text-gray-600">
          KI-gestützte deutsche Grammatikkorrektur für medizinische Texte
        </p>
      </div>

      {/* Model Status */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-blue-800 mb-4">🧠 Modell-Status</h2>

        {modelInfo ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="font-medium">Status:</span>
                <span className={`ml-2 ${getStatusColor(modelInfo.status)}`}>
                  {getStatusText(modelInfo.status)}
                </span>
              </div>
              <div>
                <span className="font-medium">Größe:</span>
                <span className="ml-2 text-gray-700">
                  {LlamaService.formatModelSize(modelInfo.size_mb)}
                </span>
              </div>
              {modelInfo.model_name && (
                <div>
                  <span className="font-medium">Modell:</span>
                  <span className="ml-2 text-gray-700">{modelInfo.model_name}</span>
                </div>
              )}
              {modelInfo.quantization && (
                <div>
                  <span className="font-medium">Quantisierung:</span>
                  <span className="ml-2 text-gray-700">{modelInfo.quantization}</span>
                </div>
              )}
            </div>

            <div className="mt-4">
              <span className="font-medium">Pfad:</span>
              <span className="ml-2 text-sm text-gray-600 font-mono break-all">
                {modelInfo.model_path}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-gray-500">Lade Modell-Informationen...</div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isModelReady ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm">
            {isModelReady ? 'Modell bereit für Verwendung' : 'Modell nicht bereit'}
          </span>
        </div>
      </div>

      {/* Model Initialization */}
      {!isModelReady && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-yellow-800 mb-3">
            🚀 Modell-Initialisierung
          </h3>

          {isInitializing ? (
            <div className="space-y-3">
              <div className="text-sm text-yellow-700">{initStep}</div>
              <div className="w-full bg-yellow-200 rounded-full h-2">
                <div
                  className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${initProgress}%` }}
                ></div>
              </div>
              <div className="text-xs text-yellow-600">{initProgress}%</div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-yellow-700">
                Das Llama 3.1 8B Modell muss heruntergeladen und initialisiert werden.
              </p>
              <button
                onClick={handleInitializeModel}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-medium"
              >
                Modell herunterladen und laden (~5-8 GB)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Grammar Correction Interface */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-blue-800 mb-4">✍️ Grammatikkorrektur</h2>

        {!isModelReady ? (
          <div className="text-gray-500 text-center py-8">
            Modell muss initialisiert werden, bevor die Grammatikkorrektur verwendet werden kann.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Style Preservation Setting */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preserveStyle}
                  onChange={(e) => setPreserveStyle(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Individuellen Schreibstil beibehalten</span>
              </label>
            </div>

            {/* Input Text */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Eingabetext (Deutsch):
              </label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="w-full h-32 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Geben Sie deutschen Text ein, der grammatikalisch korrigiert werden soll..."
              />
              <div className="text-xs text-gray-500 mt-1">
                Zeichen: {inputText.length} | Geschätzte Verarbeitungszeit: {LlamaService.estimateProcessingTime(inputText.length)}s
              </div>
            </div>

            {/* Correct Button */}
            <button
              onClick={handleCorrectGrammar}
              disabled={isCorrectingGrammar || !inputText.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium"
            >
              {isCorrectingGrammar ? 'Korrigiere Grammatik...' : 'Grammatik korrigieren'}
            </button>

            {/* Results */}
            {correctedText && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Korrigierter Text:
                  </label>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-gray-800 whitespace-pre-wrap">{correctedText}</div>
                  </div>
                </div>

                {correctionResult && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Änderungen:</span>
                      <ul className="mt-1 space-y-1">
                        {correctionResult.changes_made.map((change, index) => (
                          <li key={index} className="text-gray-600">• {change}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <span className="font-medium">Konfidenz:</span>
                      <div className="mt-1 text-gray-600">
                        {(correctionResult.confidence * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <span className="font-medium">Verarbeitungszeit:</span>
                      <div className="mt-1 text-gray-600">
                        {correctionResult.processing_time_ms}ms
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LlamaTestComponent;