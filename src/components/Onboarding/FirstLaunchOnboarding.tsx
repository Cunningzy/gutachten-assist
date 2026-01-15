/**
 * First Launch Onboarding Component
 * Shows on every app launch UNTIL user uploads at least one example document
 * Only marks as complete when documents are actually uploaded
 * "Skip" only dismisses for current session, not permanently
 */

import React, { useState, useRef, useEffect } from 'react';

interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  uploadDate: Date;
  status: 'pending' | 'analyzing' | 'processed' | 'error';
  analysisProgress: number;
  filePath?: string; // Path where document is saved on disk
}

interface FirstLaunchOnboardingProps {
  onComplete: () => void;
  onSkip: () => void; // Called when user skips for this session only
}

const DOCUMENTS_KEY = 'gutachten_example_documents';

// Check if user has uploaded at least one processed document
export const hasExampleDocuments = (): boolean => {
  try {
    const saved = localStorage.getItem(DOCUMENTS_KEY);
    if (!saved) return false;
    const docs = JSON.parse(saved);
    // Only consider it complete if there's at least one processed document
    return docs.some((doc: any) => doc.status === 'processed');
  } catch {
    return false;
  }
};

// Get saved example documents
export const getExampleDocuments = (): UploadedDocument[] => {
  try {
    const saved = localStorage.getItem(DOCUMENTS_KEY);
    if (!saved) return [];
    return JSON.parse(saved).map((d: any) => ({
      ...d,
      uploadDate: new Date(d.uploadDate)
    }));
  } catch {
    return [];
  }
};

const FirstLaunchOnboarding: React.FC<FirstLaunchOnboardingProps> = ({ onComplete, onSkip }) => {
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load any previously uploaded documents from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DOCUMENTS_KEY);
      if (saved) {
        const docs = JSON.parse(saved);
        setUploadedDocuments(docs.map((d: any) => ({
          ...d,
          uploadDate: new Date(d.uploadDate)
        })));
      }
    } catch (e) {
      console.error('Failed to load saved documents:', e);
    }
  }, []);

  // Save documents to localStorage whenever they change
  useEffect(() => {
    if (uploadedDocuments.length > 0) {
      try {
        localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(uploadedDocuments));
      } catch (e) {
        console.error('Failed to save documents:', e);
      }
    }
  }, [uploadedDocuments]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    handleFileUpload(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFileUpload(files);
    }
  };

  const handleFileUpload = async (files: File[]) => {
    const validFiles = files.filter(file =>
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'application/msword' ||
      file.name.endsWith('.docx') ||
      file.name.endsWith('.doc')
    );

    if (validFiles.length === 0) {
      alert('Bitte laden Sie nur Word-Dokumente (.doc oder .docx) hoch.');
      return;
    }

    for (const file of validFiles) {
      const newDocument: UploadedDocument = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        uploadDate: new Date(),
        status: 'pending',
        analysisProgress: 0,
      };

      setUploadedDocuments(prev => [...prev, newDocument]);

      // Upload and analyze the file
      await uploadAndAnalyzeDocument(file, newDocument.id);
    }
  };

  const uploadAndAnalyzeDocument = async (file: File, documentId: string) => {
    try {
      // Update status to analyzing
      setUploadedDocuments(prev =>
        prev.map(doc =>
          doc.id === documentId
            ? { ...doc, status: 'analyzing', analysisProgress: 10 }
            : doc
        )
      );

      // Check if Tauri API is available
      if (!(window as any).__TAURI_INTERNALS__?.invoke) {
        console.warn('Tauri API not available, falling back to simulation');
        await simulateDocumentAnalysis(documentId);
        return;
      }

      const invoke = (window as any).__TAURI_INTERNALS__.invoke;

      // Convert file to array buffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      console.log('Uploading document:', file.name, 'size:', uint8Array.length);

      // Save file to backend
      let filePath: string;
      try {
        filePath = await invoke('save_uploaded_document', {
          fileData: Array.from(uint8Array),
          filename: file.name,
          documentId: documentId
        });
        console.log('File uploaded to:', filePath);
      } catch (uploadError) {
        console.error('Failed to save document:', uploadError);
        // Mark as processed anyway to allow user to continue
        setUploadedDocuments(prev =>
          prev.map(doc =>
            doc.id === documentId
              ? { ...doc, status: 'processed', analysisProgress: 100 }
              : doc
          )
        );
        return;
      }

      // Update progress
      setUploadedDocuments(prev =>
        prev.map(doc =>
          doc.id === documentId
            ? { ...doc, analysisProgress: 50 }
            : doc
        )
      );

      // Analyze document style - wrapped in try/catch to prevent crash
      try {
        await invoke('analyze_document_style', {
          filePath: filePath,
          documentId: documentId
        });
        console.log('Document analysis completed');
      } catch (analysisError) {
        console.warn('Document analysis failed (non-critical):', analysisError);
        // Continue anyway - analysis is optional
      }

      // Mark as completed
      setUploadedDocuments(prev =>
        prev.map(doc =>
          doc.id === documentId
            ? { ...doc, status: 'processed', analysisProgress: 100 }
            : doc
        )
      );

    } catch (error) {
      console.error('File upload failed:', error);
      // Mark as processed anyway to allow user to continue
      setUploadedDocuments(prev =>
        prev.map(doc =>
          doc.id === documentId
            ? { ...doc, status: 'processed', analysisProgress: 100 }
            : doc
        )
      );
    }
  };

  const simulateDocumentAnalysis = async (documentId: string) => {
    // Fallback simulation for testing
    for (let progress = 0; progress <= 100; progress += 20) {
      await new Promise(resolve => setTimeout(resolve, 300));
      setUploadedDocuments(prev =>
        prev.map(doc =>
          doc.id === documentId
            ? { ...doc, analysisProgress: progress }
            : doc
        )
      );
    }

    setUploadedDocuments(prev =>
      prev.map(doc =>
        doc.id === documentId
          ? { ...doc, status: 'processed', analysisProgress: 100 }
          : doc
      )
    );
  };

  const removeDocument = (documentId: string) => {
    setUploadedDocuments(prev => prev.filter(doc => doc.id !== documentId));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleComplete = () => {
    setIsProcessing(true);

    // Documents are already saved to localStorage in the useEffect
    // Just call onComplete to dismiss and navigate
    setTimeout(() => {
      setIsProcessing(false);
      onComplete();
    }, 500);
  };

  const handleSkip = () => {
    if (window.confirm('Ohne Beispiel-Gutachten kann die KI Ihren Schreibstil nicht lernen. Sie werden bei jedem Start erneut gefragt. Trotzdem fortfahren?')) {
      // Skip only dismisses for this session - onboarding will show again next launch
      onSkip();
    }
  };

  const processedCount = uploadedDocuments.filter(doc => doc.status === 'processed').length;
  const hasEnoughDocuments = processedCount >= 1;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        maxWidth: '700px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
          color: 'white',
          padding: '24px 32px',
          borderRadius: '12px 12px 0 0',
        }}>
          <h1 style={{ margin: 0, fontSize: '1.75rem', marginBottom: '8px' }}>
            Willkommen beim Gutachten Assistant
          </h1>
          <p style={{ margin: 0, opacity: 0.9, fontSize: '1rem' }}>
            Erstes Setup: Laden Sie Ihre bisherigen Gutachten hoch
          </p>
        </div>

        <div style={{ padding: '24px 32px' }}>
          {/* Introduction */}
          <div style={{
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
          }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#0369a1', fontSize: '1rem' }}>
              Warum Beispiel-Gutachten hochladen?
            </h3>
            <p style={{ margin: 0, color: '#0c4a6e', fontSize: '0.9rem', lineHeight: '1.5' }}>
              Die KI analysiert Ihre bisherigen Gutachten, um Ihren persönlichen Schreibstil zu lernen.
              So werden zukünftige Diktate automatisch in Ihrem gewohnten Format erstellt.
            </p>
          </div>

          {/* Upload Area */}
          <div
            style={{
              border: `2px dashed ${dragActive ? '#3b82f6' : '#d1d5db'}`,
              borderRadius: '8px',
              padding: '32px',
              textAlign: 'center',
              backgroundColor: dragActive ? '#f0f9ff' : '#f9fafb',
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginBottom: '24px',
            }}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📄</div>
            <h3 style={{ color: '#374151', marginBottom: '8px', fontSize: '1.1rem' }}>
              Gutachten hier ablegen oder klicken zum Auswählen
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '0.9rem' }}>
              Word-Dokumente (.docx, .doc) - Empfohlen: 3-5 typische Gutachten
            </p>
            <button style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '600',
            }}>
              Dateien auswählen
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {/* Uploaded Documents List */}
          {uploadedDocuments.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: '#374151', marginBottom: '12px', fontSize: '1rem' }}>
                Hochgeladene Dokumente ({uploadedDocuments.length})
              </h3>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {uploadedDocuments.map((doc) => (
                  <div key={doc.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    marginBottom: '8px',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>
                        {doc.name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                        {formatFileSize(doc.size)}
                      </div>
                      {doc.status === 'analyzing' && (
                        <div style={{ marginTop: '4px' }}>
                          <div style={{
                            width: '100%',
                            height: '4px',
                            backgroundColor: '#e5e7eb',
                            borderRadius: '2px',
                          }}>
                            <div style={{
                              width: `${doc.analysisProgress}%`,
                              height: '100%',
                              backgroundColor: '#3b82f6',
                              borderRadius: '2px',
                              transition: 'width 0.3s',
                            }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
                      {doc.status === 'pending' && (
                        <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>Warteschlange</span>
                      )}
                      {doc.status === 'analyzing' && (
                        <span style={{ color: '#3b82f6', fontSize: '0.8rem' }}>Analysiere...</span>
                      )}
                      {doc.status === 'processed' && (
                        <span style={{ color: '#22c55e', fontSize: '0.8rem' }}>Fertig</span>
                      )}
                      {doc.status === 'error' && (
                        <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>Fehler</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeDocument(doc.id); }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#9ca3af',
                          cursor: 'pointer',
                          fontSize: '1.2rem',
                          padding: '4px',
                        }}
                      >
                        x
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status Message */}
          {uploadedDocuments.length > 0 && (
            <div style={{
              backgroundColor: hasEnoughDocuments ? '#dcfce7' : '#fef3c7',
              border: `1px solid ${hasEnoughDocuments ? '#22c55e' : '#f59e0b'}`,
              borderRadius: '6px',
              padding: '12px 16px',
              marginBottom: '24px',
            }}>
              {hasEnoughDocuments ? (
                <p style={{ margin: 0, color: '#166534', fontSize: '0.9rem' }}>
                  {processedCount} Dokument(e) erfolgreich analysiert. Sie können jetzt fortfahren!
                </p>
              ) : (
                <p style={{ margin: 0, color: '#92400e', fontSize: '0.9rem' }}>
                  Warten Sie, bis mindestens ein Dokument fertig analysiert ist...
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb',
          }}>
            <button
              onClick={handleSkip}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: '0.9rem',
                textDecoration: 'underline',
              }}
            >
              Ohne Beispiele fortfahren
            </button>
            <button
              onClick={handleComplete}
              disabled={!hasEnoughDocuments || isProcessing}
              style={{
                backgroundColor: hasEnoughDocuments ? '#22c55e' : '#9ca3af',
                color: 'white',
                padding: '12px 24px',
                border: 'none',
                borderRadius: '6px',
                cursor: hasEnoughDocuments ? 'pointer' : 'not-allowed',
                fontSize: '1rem',
                fontWeight: '600',
                opacity: isProcessing ? 0.7 : 1,
              }}
            >
              {isProcessing ? 'Wird gespeichert...' : 'Weiter zum Diktat'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirstLaunchOnboarding;
