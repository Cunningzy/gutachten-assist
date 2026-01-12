/**
 * Component 2.2A: Document Upload UI for Style Learning
 * Allows users to upload their previous Gutachten documents
 * to analyze and learn their personal formatting style
 */

import React, { useState, useRef } from 'react';

interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadDate: Date;
  status: 'pending' | 'analyzing' | 'processed' | 'error';
  analysisProgress?: number;
  styleFeatures?: {
    fontFamily: string;
    fontSize: number;
    lineSpacing: number;
    headingStyle: string;
    paragraphStyle: string;
  };
  rawAnalysisResult?: any; // Store the complete raw result for debugging
}

const StyleTrainingComponent: React.FC = () => {
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [isInitialSetup, setIsInitialSetup] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [systemStatus, setSystemStatus] = useState({
    documentAnalyzer: false,
    styleExtractor: false,
    templateStorage: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // Check if user has already uploaded documents
    checkExistingTemplates();
    runSystemChecks();
  }, []);

  const checkExistingTemplates = async () => {
    // TODO: Check if user already has style templates
    // For now, assume this is initial setup
    setIsInitialSetup(true);
  };

  const runSystemChecks = async () => {
    console.log('🔍 Running style training system checks...');

    // Simulate system checks
    setTimeout(() => {
      setSystemStatus({
        documentAnalyzer: true,
        styleExtractor: true,
        templateStorage: true,
      });
    }, 1000);
  };

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
        id: Date.now().toString() + Math.random(),
        name: file.name,
        size: file.size,
        type: file.type,
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

      // Save file to backend
      const filePath = await invoke('save_uploaded_document', {
        fileData: Array.from(uint8Array),
        filename: file.name,
        documentId: documentId
      });

      console.log('File uploaded to:', filePath);

      // Start real document analysis
      await performDocumentAnalysis(documentId, filePath);

    } catch (error) {
      console.error('File upload failed:', error);

      // Update status to error and store error details
      setUploadedDocuments(prev =>
        prev.map(doc =>
          doc.id === documentId
            ? {
                ...doc,
                status: 'error',
                analysisProgress: 0,
                rawAnalysisResult: { error: error.toString(), details: error }
              }
            : doc
        )
      );

      alert(`Fehler beim Upload: ${error}`);
    }
  };

  const performDocumentAnalysis = async (documentId: string, filePath: string) => {
    // Update status to analyzing
    setUploadedDocuments(prev =>
      prev.map(doc =>
        doc.id === documentId
          ? { ...doc, status: 'analyzing', analysisProgress: 0 }
          : doc
      )
    );

    try {
      // Check if Tauri API is available
      if (!(window as any).__TAURI_INTERNALS__?.invoke) {
        console.warn('Tauri API not available, falling back to simulation');
        await simulateDocumentAnalysis(documentId);
        return;
      }

      const invoke = (window as any).__TAURI_INTERNALS__.invoke;

      // Listen for progress events (optional)
      let unlisten = null;
      try {
        if ((window as any).__TAURI_INTERNALS__?.event?.listen) {
          unlisten = await (window as any).__TAURI_INTERNALS__.event.listen(
            'document_analysis_progress',
            (event: any) => {
              if (event.payload.document_id === documentId) {
                setUploadedDocuments(prev =>
                  prev.map(doc =>
                    doc.id === documentId
                      ? { ...doc, analysisProgress: event.payload.progress }
                      : doc
                  )
                );
              }
            }
          );
        }
      } catch (error) {
        console.warn('Progress events not available:', error);
      }

      // Simulate progress during analysis
      const progressInterval = setInterval(() => {
        setUploadedDocuments(prev =>
          prev.map(doc =>
            doc.id === documentId && doc.analysisProgress < 90
              ? { ...doc, analysisProgress: Math.min(90, (doc.analysisProgress || 0) + 15) }
              : doc
          )
        );
      }, 500);

      try {
        // Call real document analysis
        const result = await invoke('analyze_document_style', {
          filePath: filePath,
          documentId: documentId
        });

        // Clear progress simulation
        clearInterval(progressInterval);

        // Clean up event listener if it exists
        if (unlisten) {
          try {
            unlisten();
          } catch (error) {
            console.warn('Error cleaning up event listener:', error);
          }
        }

        // Update with real analysis results
        setUploadedDocuments(prev =>
          prev.map(doc =>
            doc.id === documentId
              ? {
                  ...doc,
                  status: 'processed',
                  analysisProgress: 100,
                  rawAnalysisResult: result, // Store complete raw result for debugging
                  styleFeatures: {
                    fontFamily: result.font_family,
                    fontSize: result.font_size,
                    lineSpacing: result.line_spacing,
                    headingStyle: result.header_footer_info?.has_header && result.header_footer_info?.header_style
                      ? `Kopfzeile: ${result.header_footer_info.header_style.font_family} (${result.header_footer_info.header_style.font_size}pt)`
                      : result.heading_styles.length > 0
                      ? `${result.heading_styles.length} Überschriftenebenen (${result.heading_styles[0].font_family}, ${result.heading_styles[0].font_size}pt)`
                      : 'Keine Überschriften oder Kopfzeile erkannt',
                    paragraphStyle: `${result.font_family}, ${result.font_size}pt, ${result.text_alignment}`
                  }
                }
              : doc
          )
        );

        console.log('Document analysis completed:', result);

      } catch (analysisError) {
        // Clear progress simulation on error
        clearInterval(progressInterval);

        console.error('Document analysis failed:', analysisError);

        // Update status to error and store error details
        setUploadedDocuments(prev =>
          prev.map(doc =>
            doc.id === documentId
              ? {
                  ...doc,
                  status: 'error',
                  analysisProgress: 0,
                  rawAnalysisResult: { error: analysisError.toString(), details: analysisError }
                }
              : doc
          )
        );
      }
    } catch (outerError) {
      // Handle any outer errors (file upload, API issues, etc.)
      console.error('Document analysis process failed:', outerError);

      setUploadedDocuments(prev =>
        prev.map(doc =>
          doc.id === documentId
            ? {
                ...doc,
                status: 'error',
                analysisProgress: 0,
                rawAnalysisResult: { error: outerError.toString(), details: outerError }
              }
            : doc
        )
      );
    }
  };

  const simulateDocumentAnalysis = async (documentId: string) => {
    // Fallback simulation for testing
    for (let progress = 0; progress <= 100; progress += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      setUploadedDocuments(prev =>
        prev.map(doc =>
          doc.id === documentId
            ? { ...doc, analysisProgress: progress }
            : doc
        )
      );
    }

    // Complete analysis with mock style features
    setUploadedDocuments(prev =>
      prev.map(doc =>
        doc.id === documentId
          ? {
              ...doc,
              status: 'processed',
              analysisProgress: 100,
              styleFeatures: {
                fontFamily: 'Times New Roman',
                fontSize: 12,
                lineSpacing: 1.15,
                headingStyle: 'Arial, 14pt, Bold',
                paragraphStyle: 'Times New Roman, 12pt, Justify'
              }
            }
          : doc
      )
    );
  };

  const removeDocument = (documentId: string) => {
    setUploadedDocuments(prev => prev.filter(doc => doc.id !== documentId));
  };

  const completeSetup = () => {
    const processedDocs = uploadedDocuments.filter(doc => doc.status === 'processed');
    if (processedDocs.length === 0) {
      alert('Bitte laden Sie mindestens ein Dokument hoch und warten Sie, bis die Analyse abgeschlossen ist.');
      return;
    }

    setIsInitialSetup(false);
    // TODO: Save style template to user data
    console.log('Style training completed with', processedDocs.length, 'documents');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderSystemCheck = (label: string, status: boolean, icon: string) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '8px 12px',
      backgroundColor: status ? '#f0f9ff' : '#fef3c7',
      border: `1px solid ${status ? '#3b82f6' : '#f59e0b'}`,
      borderRadius: '6px',
      marginBottom: '8px'
    }}>
      <span style={{ marginRight: '8px', fontSize: '16px' }}>
        {status ? '✅' : '⚠️'}
      </span>
      <span style={{ flex: 1, color: status ? '#1e40af' : '#92400e' }}>
        {icon} {label}
      </span>
    </div>
  );

  return (
    <div style={{ padding: '20px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '2rem', color: '#1f2937', marginBottom: '1rem' }}>
        📚 Stil-Training: Persönliche Formatierung lernen
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        Component 2.2A: Laden Sie Ihre bisherigen Gutachten hoch, damit die KI Ihren persönlichen Schreibstil und Ihre Formatierung lernt.
      </p>

      {/* System Status */}
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <h2 style={{ fontSize: '1.5rem', color: '#1e40af', marginBottom: '1rem' }}>
          🔍 System-Status
        </h2>
        {renderSystemCheck('Dokument-Analyzer', systemStatus.documentAnalyzer, '📄')}
        {renderSystemCheck('Stil-Extraktor', systemStatus.styleExtractor, '🎨')}
        {renderSystemCheck('Vorlagen-Speicher', systemStatus.templateStorage, '💾')}
      </div>

      {isInitialSetup && (
        <div style={{
          backgroundColor: '#fff7ed',
          border: '1px solid #fed7aa',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <h3 style={{ color: '#9a3412', marginBottom: '10px' }}>
            🚀 Erstes Setup: Stil-Training erforderlich
          </h3>
          <p style={{ color: '#9a3412', marginBottom: '0' }}>
            Um Ihren persönlichen Schreibstil zu lernen, laden Sie bitte 3-5 Ihrer bisherigen Gutachten hoch.
            Die KI analysiert Ihre Formatierung, Stil-Präferenzen und erstellt eine persönliche Vorlage.
          </p>
        </div>
      )}

      {/* Document Upload Area */}
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <h2 style={{ fontSize: '1.5rem', color: '#1e40af', marginBottom: '1rem' }}>
          📤 Dokumente hochladen
        </h2>

        <div
          style={{
            border: `2px dashed ${dragActive ? '#3b82f6' : '#d1d5db'}`,
            borderRadius: '8px',
            padding: '40px',
            textAlign: 'center',
            backgroundColor: dragActive ? '#f0f9ff' : '#f9fafb',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📁</div>
          <h3 style={{ color: '#374151', marginBottom: '8px' }}>
            Word-Dokumente hier ablegen oder klicken zum Auswählen
          </h3>
          <p style={{ color: '#6b7280', marginBottom: '16px' }}>
            Unterstützte Formate: .docx, .doc (max. 10 MB pro Datei)
          </p>
          <button style={{
            backgroundColor: '#3b82f6',
            color: 'white',
            padding: '12px 24px',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600'
          }}>
            📁 Dateien auswählen
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
      </div>

      {/* Uploaded Documents List */}
      {uploadedDocuments.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <h2 style={{ fontSize: '1.5rem', color: '#1e40af', marginBottom: '1rem' }}>
            📋 Hochgeladene Dokumente ({uploadedDocuments.length})
          </h2>

          <div style={{ space: '8px' }}>
            {uploadedDocuments.map((doc) => (
              <div key={doc.id} style={{
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '16px',
                marginBottom: '12px',
                backgroundColor: '#f9fafb'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ color: '#374151', fontSize: '16px', marginBottom: '4px' }}>
                      📄 {doc.name}
                    </h3>
                    <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>
                      {formatFileSize(doc.size)} • {doc.uploadDate.toLocaleString('de-DE')}
                    </p>

                    {/* Status and Progress */}
                    <div style={{ marginBottom: '8px' }}>
                      {doc.status === 'pending' && (
                        <span style={{ color: '#f59e0b', fontSize: '14px' }}>⏳ Warteschlange</span>
                      )}
                      {doc.status === 'analyzing' && (
                        <div>
                          <span style={{ color: '#3b82f6', fontSize: '14px' }}>🔍 Analysiere... {doc.analysisProgress}%</span>
                          <div style={{
                            width: '100%',
                            height: '4px',
                            backgroundColor: '#e5e7eb',
                            borderRadius: '2px',
                            marginTop: '4px'
                          }}>
                            <div style={{
                              width: `${doc.analysisProgress}%`,
                              height: '100%',
                              backgroundColor: '#3b82f6',
                              borderRadius: '2px',
                              transition: 'width 0.3s'
                            }} />
                          </div>
                        </div>
                      )}
                      {doc.status === 'processed' && (
                        <span style={{ color: '#22c55e', fontSize: '14px' }}>✅ Analyse abgeschlossen</span>
                      )}
                      {doc.status === 'error' && (
                        <span style={{ color: '#ef4444', fontSize: '14px' }}>❌ Fehler bei der Analyse</span>
                      )}
                    </div>

                    {/* Style Features Preview */}
                    {doc.styleFeatures && (
                      <div style={{
                        backgroundColor: '#f0f9ff',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        padding: '8px',
                        fontSize: '12px',
                        color: '#1e40af',
                        marginBottom: '8px'
                      }}>
                        <strong>Erkannte Stilmerkmale:</strong><br />
                        Schrift: {doc.styleFeatures.fontFamily} ({doc.styleFeatures.fontSize}pt)<br />
                        Zeilenabstand: {doc.styleFeatures.lineSpacing}<br />
                        {doc.styleFeatures.headingStyle}
                      </div>
                    )}

                  </div>

                  <button
                    onClick={() => removeDocument(doc.id)}
                    style={{
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      marginLeft: '12px'
                    }}
                  >
                    🗑️ Entfernen
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Setup Completion */}
          {isInitialSetup && uploadedDocuments.some(doc => doc.status === 'processed') && (
            <div style={{
              backgroundColor: '#dcfce7',
              border: '1px solid #22c55e',
              borderRadius: '6px',
              padding: '16px',
              marginTop: '16px',
              textAlign: 'center'
            }}>
              <h3 style={{ color: '#166534', marginBottom: '8px' }}>
                🎉 Bereit für Stil-Training!
              </h3>
              <p style={{ color: '#166534', marginBottom: '12px', fontSize: '14px' }}>
                {uploadedDocuments.filter(doc => doc.status === 'processed').length} Dokument(e) erfolgreich analysiert.
                Persönliche Stil-Vorlage kann erstellt werden.
              </p>
              <button
                onClick={completeSetup}
                style={{
                  backgroundColor: '#22c55e',
                  color: 'white',
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                ✅ Stil-Training abschließen
              </button>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '20px'
      }}>
        <h2 style={{ fontSize: '1.5rem', color: '#1e40af', marginBottom: '1rem' }}>
          💡 Anleitung
        </h2>
        <div style={{ color: '#374151', lineHeight: '1.6' }}>
          <p><strong>1. Dokumente vorbereiten:</strong> Sammeln Sie 3-5 Ihrer typischen Gutachten im Word-Format (.docx oder .doc).</p>
          <p><strong>2. Hochladen:</strong> Ziehen Sie die Dateien in den Upload-Bereich oder klicken Sie zum Auswählen.</p>
          <p><strong>3. Analyse abwarten:</strong> Die KI analysiert automatisch Ihre Formatierung, Schriftarten, Abstände und Stilpräferenzen.</p>
          <p><strong>4. Training abschließen:</strong> Nach der Analyse wird eine persönliche Stil-Vorlage erstellt.</p>
          <p><strong>5. Verwendung:</strong> Bei zukünftigen Textkorrekturen wird Ihr persönlicher Stil automatisch angewendet.</p>
        </div>
      </div>
    </div>
  );
};

export default StyleTrainingComponent;