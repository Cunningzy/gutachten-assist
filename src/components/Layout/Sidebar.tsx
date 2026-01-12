/**
 * Sidebar Navigation Component
 * Gutachten Assistant - Medical documentation navigation
 * 
 * Updated for Component 2.1B: Added Whisper Integration Testing
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface NavigationItem {
  name: string;
  path: string;
  icon: string;
  description?: string;
  category?: string;
}

const Sidebar: React.FC = () => {
  const location = useLocation();

  const navigationItems: NavigationItem[] = [
    // Main Application
    {
      name: 'Willkommen',
      path: '/',
      icon: '🏠',
      description: 'Startseite und Übersicht',
      category: 'main'
    },

    // Project Management
    {
      name: 'Neues Projekt',
      path: '/project/new',
      icon: '📝',
      description: 'Neues Gutachten erstellen',
      category: 'project'
    },
    {
      name: 'Projekt Öffnen',
      path: '/project/open',
      icon: '📂',
      description: 'Vorhandenes Projekt öffnen',
      category: 'project'
    },

    // Core Features
    {
      name: 'Diktat',
      path: '/dictation',
      icon: '🎤',
      description: 'Sprachdiktat und Transkription',
      category: 'features'
    },
    {
      name: 'Dokumente',
      path: '/documents',
      icon: '📄',
      description: 'Dokumentenverarbeitung und OCR',
      category: 'features'
    },
    {
      name: 'Stil-Training',
      path: '/style-training',
      icon: '📚',
      description: 'Dokumente hochladen für persönlichen Stil',
      category: 'features'
    },
    {
      name: 'Text-Korrektur',
      path: '/text-correction',
      icon: '✏️',
      description: 'AI-Grammatikkorrektur mit persönlichem Stil',
      category: 'features'
    },

    // Tauri System (v2.0)
    {
      name: 'System Info',
      path: '/system',
      icon: '💻',
      description: 'Systemstatus und Speichernutzung',
      category: 'tauri'
    },
    {
      name: 'AI-Modelle',
      path: '/models',
      icon: '🧠',
      description: 'AI-Modell Verwaltung und Status',
      category: 'tauri'
    },

    // Component Testing (Development)
    {
      name: 'Audio Test',
      path: '/test/audio',
      icon: '🎧',
      description: 'Audio-Aufnahme System testen',
      category: 'testing'
    },
    {
      name: 'Whisper Test',
      path: '/test/whisper',
      icon: '🎙️',
      description: 'Whisper Spracherkennung testen',
      category: 'testing'
    },
    {
      name: 'Llama Test',
      path: '/test/llama',
      icon: '🧠',
      description: 'Llama 3.1 8B Grammatikkorrektur testen',
      category: 'testing'
    },
    {
      name: 'Audio Debug',
      path: '/test/audio-debug',
      icon: '🔧',
      description: 'Debug Audio Recording & Playback',
      category: 'testing'
    },
    {
      name: 'Echtzeit-Transkription',
      path: '/test/transcription',
      icon: '📝',
      description: 'Live Transkription mit Bearbeitung',
      category: 'testing'
    },
    {
      name: 'Diktiergerät Test',
      path: '/test/diktiergeraet',
      icon: '🎙️',
      description: 'Professionelles Diktiergerät Interface',
      category: 'testing'
    },
    {
      name: 'Einfache Aufnahme',
      path: '/test/simple-recorder',
      icon: '🎤',
      description: 'Neue vereinfachte Tauri-Backend Architektur',
      category: 'testing'
    },

    // Settings and Help
    {
      name: 'Einstellungen',
      path: '/settings',
      icon: '⚙️',
      description: 'Anwendungseinstellungen',
      category: 'system'
    },
    {
      name: 'Hilfe',
      path: '/help',
      icon: '❓',
      description: 'Hilfe und Dokumentation',
      category: 'system'
    }
  ];

  const groupedItems = navigationItems.reduce((acc, item) => {
    const category = item.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, NavigationItem[]>);

  const categoryTitles = {
    main: 'Hauptmenü',
    project: 'Projekt',
    features: 'Funktionen',
    tauri: 'Tauri v2.0',
    testing: 'Komponententests',
    system: 'System'
  };

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const renderNavigationItem = (item: NavigationItem) => (
    <Link
      key={item.path}
      to={item.path}
      className={`
        flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200
        ${isActive(item.path)
          ? 'bg-blue-100 text-blue-800 border-l-4 border-blue-600 shadow-sm'
          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
        }
      `}
      title={item.description}
    >
      <span className="text-xl flex-shrink-0">{item.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{item.name}</div>
        {item.description && (
          <div className="text-xs text-gray-500 truncate mt-0.5">
            {item.description}
          </div>
        )}
      </div>
    </Link>
  );

  const renderCategory = (categoryKey: string, items: NavigationItem[]) => (
    <div key={categoryKey} className="mb-6">
      <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {categoryTitles[categoryKey as keyof typeof categoryTitles] || categoryKey}
      </h3>
      <nav className="space-y-1">
        {items.map(renderNavigationItem)}
      </nav>
    </div>
  );

  return (
    <div className="w-64 bg-white border-r border-gray-200 h-full flex flex-col">
      {/* Logo/Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">GA</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Gutachten Assistant</h1>
            <p className="text-xs text-gray-500">v2.0.0 (Phase 1.1)</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-6">
        <div className="px-2 space-y-6">
          {/* Main Application */}
          {groupedItems.main && renderCategory('main', groupedItems.main)}
          
          {/* Project Management */}
          {groupedItems.project && renderCategory('project', groupedItems.project)}
          
          {/* Core Features */}
          {groupedItems.features && renderCategory('features', groupedItems.features)}
          
          {/* Tauri v2.0 System */}
          {groupedItems.tauri && renderCategory('tauri', groupedItems.tauri)}
          
          {/* Component Testing */}
          {groupedItems.testing && renderCategory('testing', groupedItems.testing)}
          
          {/* System */}
          {groupedItems.system && renderCategory('system', groupedItems.system)}
        </div>
      </div>

      {/* Development Status */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-600">
          <div className="font-medium mb-1">Entwicklungsstatus v2.0</div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Phase 1.1:</span>
              <span className="text-blue-600">🔄 In Arbeit</span>
            </div>
            <div className="flex justify-between">
              <span>AI-Modelle:</span>
              <span className="text-green-600">✅ Bereit</span>
            </div>
            <div className="flex justify-between">
              <span>Tauri Backend:</span>
              <span className="text-green-600">✅ Komplett</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-center">
          <div className="text-xs text-gray-500">
            DSGVO-konform • 100% Offline
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Alle Daten bleiben lokal
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;