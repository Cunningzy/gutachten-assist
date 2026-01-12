import React from 'react';
import { useLocation, Link } from 'react-router-dom';

const Header: React.FC = () => {
  const location = useLocation();

  const getPageTitle = (): string => {
    const path = location.pathname;
    
    if (path === '/') return 'Willkommen';
    if (path === '/projects') return 'Projekte';
    if (path.includes('/test/audio')) return 'Audio Component Test';
    if (path.includes('/setup/format-learning')) return 'Format-Einrichtung';
    if (path.includes('/documents')) return 'Dokumentenverarbeitung';
    if (path.includes('/dictation')) return 'Diktierung';
    if (path.includes('/review')) return 'Überprüfung';
    if (path === '/settings') return 'Einstellungen';
    
    return 'Gutachten Assistant';
  };

  // Don't show header on welcome page
  if (location.pathname === '/') {
    return null;
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="font-semibold text-gray-900">Gutachten Assistant</span>
          </Link>
        </div>

        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-semibold text-gray-900">
            {getPageTitle()}
          </h1>
          
          <Link 
            to="/settings" 
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Einstellungen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header;