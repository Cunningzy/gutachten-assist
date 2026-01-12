// System information component using Tauri API

import React, { useState, useEffect } from 'react';
// Use mock API for web testing
import { tauriApi, SystemInfo, MemoryStatus } from '../../services/tauriApiMock';

interface SystemStatusProps {
  className?: string;
}

export const TauriSystemInfo: React.FC<SystemStatusProps> = ({ className = '' }) => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requirementsMet, setRequirementsMet] = useState<boolean>(false);

  useEffect(() => {
    loadSystemInformation();
  }, []);

  const loadSystemInformation = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load system information and memory status in parallel
      const [sysInfo, memStatus, reqsMet] = await Promise.all([
        tauriApi.getSystemInfo(),
        tauriApi.getMemoryStatus(),
        tauriApi.checkSystemRequirements(),
      ]);

      setSystemInfo(sysInfo);
      setMemoryStatus(memStatus);
      setRequirementsMet(reqsMet);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system information');
    } finally {
      setLoading(false);
    }
  };

  const refreshSystemInfo = () => {
    loadSystemInformation();
  };

  if (loading) {
    return (
      <div className={`medical-card p-6 ${className}`}>
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Systeminformationen werden geladen...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`medical-card p-6 ${className}`}>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <div className="flex items-center justify-between">
            <div>
              <strong className="font-bold">Fehler: </strong>
              <span>{error}</span>
            </div>
            <button
              onClick={refreshSystemInfo}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-sm"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`medical-card p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-blue-700">
          Systeminformationen
        </h3>
        <button
          onClick={refreshSystemInfo}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm transition-colors"
        >
          Aktualisieren
        </button>
      </div>

      {/* System Requirements Status */}
      <div className="mb-4">
        <div className={`p-3 rounded-lg ${requirementsMet 
          ? 'bg-green-100 border border-green-300' 
          : 'bg-yellow-100 border border-yellow-300'
        }`}>
          <div className="flex items-center">
            <span className={`w-3 h-3 rounded-full mr-2 ${requirementsMet ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
            <span className={requirementsMet ? 'text-green-800' : 'text-yellow-800'}>
              {requirementsMet 
                ? 'System erfüllt alle Mindestanforderungen für AI-Modelle' 
                : 'Warnung: System erfüllt möglicherweise nicht alle Mindestanforderungen'
              }
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* System Information */}
        <div>
          <h4 className="font-medium text-gray-700 mb-3">System</h4>
          {systemInfo && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Plattform:</span>
                <span className="font-medium">{systemInfo.platform}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Architektur:</span>
                <span className="font-medium">{systemInfo.architecture}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">App Version:</span>
                <span className="font-medium">v{systemInfo.app_version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Gesamtspeicher:</span>
                <span className="font-medium">{tauriApi.formatMemorySize(systemInfo.total_memory)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Memory Information */}
        <div>
          <h4 className="font-medium text-gray-700 mb-3">Arbeitsspeicher</h4>
          {memoryStatus && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Verfügbar:</span>
                <span className="font-medium">{tauriApi.formatMemorySize(memoryStatus.available_bytes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Von Modellen genutzt:</span>
                <span className="font-medium">{tauriApi.formatMemorySize(memoryStatus.used_by_models)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Gesamtnutzung:</span>
                <span className="font-medium">{memoryStatus.percentage_used.toFixed(1)}%</span>
              </div>
              
              {/* Memory Usage Bar */}
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Speichernutzung</span>
                  <span>{memoryStatus.percentage_used.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      memoryStatus.percentage_used > 80 ? 'bg-red-600' :
                      memoryStatus.percentage_used > 60 ? 'bg-yellow-600' :
                      'bg-green-600'
                    }`}
                    style={{ width: `${Math.min(memoryStatus.percentage_used, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Desktop App Status */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
            <span className="text-sm text-gray-700">
              Desktop-Anwendung mit eingebetteten AI-Modellen
            </span>
          </div>
          {tauriApi.isDesktop() && (
            <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
              Tauri v2.0
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TauriSystemInfo;