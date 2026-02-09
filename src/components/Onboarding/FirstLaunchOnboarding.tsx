/**
 * First Launch Onboarding Component
 * Collects 5-10 example Gutachten documents to build a StyleProfile
 * The StyleProfile teaches the AI the user's personal formatting style
 *
 * WORKFLOW:
 * 1. Upload example documents
 * 2. Build StyleProfile -> Template generated
 * 3. Review template (preview sections, download, upload corrected, or approve)
 * 4. Template approved -> onComplete
 */

import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import TemplateEditor from './TemplateEditor';

interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  uploadDate: Date;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  filePath?: string;
  errorMessage?: string;
}

interface StyleProfileStatus {
  exists: boolean;
  document_count: number;
  section_count: number;
  created_at: string | null;
  source_files: string[];
}

interface FormattingInfo {
  font_family: string;
  font_size_pt: number;
  line_spacing: number;
}

interface TemplateInfo {
  exists: boolean;
  template_path: string;
  is_approved: boolean;
  sections: string[];
  formatting: FormattingInfo | null;
}

// New interface for template_spec.json data
interface TemplateSpecAnchor {
  id: string;
  canonical_text: string;
  occurrence_rate: number;
  styles: string[];
}

interface TemplateSpecSlot {
  type: 'fixed' | 'slot';
  slot_id?: string;
  section_name?: string;
  id?: string;
  paragraphs?: { text: string; style: string }[];
}

interface TemplateSpecData {
  version: string;
  family_id: string;
  family_name: string;
  anchors: TemplateSpecAnchor[];
  skeleton: TemplateSpecSlot[];
  style_roles: Record<string, string>;
  quality_metrics: {
    documents_analyzed: number;
    fixed_blocks_found: number;
    variable_blocks_found: number;
    anchors_detected: number;
  };
}

interface ExtractionResult {
  success: boolean;
  message: string;
  template_spec_path?: string;
  anchors_found: number;
  documents_analyzed: number;
}

interface FirstLaunchOnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

const DOCUMENTS_KEY = 'gutachten_example_documents';
const MIN_DOCUMENTS = 5;
const MAX_DOCUMENTS = 10;

// Check if StyleProfile exists
export const hasStyleProfile = async (): Promise<boolean> => {
  try {
    if (!(window as any).__TAURI_INTERNALS__?.invoke) {
      // Fallback for development
      const saved = localStorage.getItem(DOCUMENTS_KEY);
      if (!saved) return false;
      const docs = JSON.parse(saved);
      return docs.filter((d: any) => d.status === 'uploaded').length >= MIN_DOCUMENTS;
    }
    const status = await invoke('get_style_profile_status') as StyleProfileStatus;
    return status.exists && status.document_count >= MIN_DOCUMENTS;
  } catch {
    return false;
  }
};

// Legacy function for compatibility
export const hasExampleDocuments = (): boolean => {
  try {
    const saved = localStorage.getItem(DOCUMENTS_KEY);
    if (!saved) return false;
    const docs = JSON.parse(saved);
    return docs.filter((d: any) => d.status === 'uploaded').length >= MIN_DOCUMENTS;
  } catch {
    return false;
  }
};

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
  const [isBuildingProfile, setIsBuildingProfile] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildStatus, setBuildStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Template review state
  const [showTemplateReview, setShowTemplateReview] = useState(false);
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null);
  const [templateSpec, setTemplateSpec] = useState<TemplateSpecData | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Load previously uploaded documents
  useEffect(() => {
    const loadDocuments = async () => {
      try {
        const saved = localStorage.getItem(DOCUMENTS_KEY);
        if (saved) {
          const docs = JSON.parse(saved).map((d: any) => ({
            ...d,
            uploadDate: new Date(d.uploadDate)
          }));
          setUploadedDocuments(docs);
        }
      } catch (e) {
        console.error('Failed to load saved documents:', e);
      }
    };
    loadDocuments();
  }, []);

  // Save documents to localStorage
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
    setError(null);

    const validFiles = files.filter(file =>
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'application/msword' ||
      file.name.endsWith('.docx') ||
      file.name.endsWith('.doc')
    );

    if (validFiles.length === 0) {
      setError('Bitte laden Sie nur Word-Dokumente (.doc oder .docx) hoch.');
      return;
    }

    // Check max limit
    const currentCount = uploadedDocuments.length;
    const remainingSlots = MAX_DOCUMENTS - currentCount;

    if (remainingSlots <= 0) {
      setError(`Maximal ${MAX_DOCUMENTS} Dokumente erlaubt. Bitte entfernen Sie zuerst einige Dokumente.`);
      return;
    }

    const filesToUpload = validFiles.slice(0, remainingSlots);

    for (const file of filesToUpload) {
      const newDocument: UploadedDocument = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        uploadDate: new Date(),
        status: 'pending',
      };

      setUploadedDocuments(prev => [...prev, newDocument]);
      await uploadDocument(file, newDocument.id);
    }

    if (validFiles.length > remainingSlots) {
      setError(`Nur ${filesToUpload.length} von ${validFiles.length} Dateien hochgeladen (Maximum: ${MAX_DOCUMENTS}).`);
    }
  };

  const uploadDocument = async (file: File, documentId: string) => {
    try {
      setUploadedDocuments(prev =>
        prev.map(doc => doc.id === documentId ? { ...doc, status: 'uploading' } : doc)
      );

      if (!(window as any).__TAURI_INTERNALS__?.invoke) {
        // Simulation for development
        await new Promise(resolve => setTimeout(resolve, 500));
        setUploadedDocuments(prev =>
          prev.map(doc => doc.id === documentId
            ? { ...doc, status: 'uploaded', filePath: `/mock/path/${file.name}` }
            : doc)
        );
        return;
      }

      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const filePath = await invoke('save_uploaded_document', {
        fileData: Array.from(uint8Array),
        filename: file.name,
        documentId: documentId
      }) as string;

      setUploadedDocuments(prev =>
        prev.map(doc => doc.id === documentId
          ? { ...doc, status: 'uploaded', filePath }
          : doc)
      );

    } catch (err) {
      console.error('Upload failed:', err);
      setUploadedDocuments(prev =>
        prev.map(doc => doc.id === documentId
          ? { ...doc, status: 'error', errorMessage: String(err) }
          : doc)
      );
    }
  };

  const removeDocument = (documentId: string) => {
    setUploadedDocuments(prev => prev.filter(doc => doc.id !== documentId));
    setError(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const buildStyleProfile = async () => {
    setIsBuildingProfile(true);
    setBuildProgress(10);
    setBuildStatus('Bereite Analyse vor...');
    setError(null);

    try {
      const uploadedDocs = uploadedDocuments.filter(d => d.status === 'uploaded' && d.filePath);
      const documentPaths = uploadedDocs.map(d => d.filePath!);

      if (documentPaths.length < MIN_DOCUMENTS) {
        throw new Error(`Mindestens ${MIN_DOCUMENTS} Dokumente erforderlich.`);
      }

      // Get the folder containing the uploaded documents
      // All docs are in src-tauri/user-data/uploads/
      const uploadsFolder = 'C:\\Users\\kalin\\Desktop\\gutachten-assistant\\src-tauri\\user-data\\uploads';

      setBuildProgress(20);
      setBuildStatus('Analysiere Dokumentstruktur...');

      if (!(window as any).__TAURI_INTERNALS__?.invoke) {
        // Simulation for development
        for (let i = 30; i <= 90; i += 20) {
          await new Promise(resolve => setTimeout(resolve, 500));
          setBuildProgress(i);
          setBuildStatus(`Lerne Stil-Muster... ${i}%`);
        }
        setBuildProgress(100);
        setBuildStatus('Vorlage erstellt!');
        await new Promise(resolve => setTimeout(resolve, 500));
        // Show template review in dev mode with mock data
        setTemplateSpec({
          version: '1.0',
          family_id: 'default',
          family_name: 'Default Template',
          anchors: [
            { id: 'familienanamnese', canonical_text: 'Familienanamnese', occurrence_rate: 1.0, styles: ['Heading 2'] },
            { id: 'eigenanamnese', canonical_text: 'Eigenanamnese', occurrence_rate: 1.0, styles: ['Normal'] },
          ],
          skeleton: [
            { type: 'slot', slot_id: 'familienanamnese_body', section_name: 'Familienanamnese' },
            { type: 'slot', slot_id: 'eigenanamnese_body', section_name: 'Eigenanamnese' },
          ],
          style_roles: { H1: 'Heading 1', H2: 'Heading 2', BODY: 'Normal' },
          quality_metrics: { documents_analyzed: 5, fixed_blocks_found: 10, variable_blocks_found: 50, anchors_detected: 5 }
        });
        setTemplateInfo({
          exists: true,
          template_path: '/mock/template.docx',
          is_approved: false,
          sections: ['FAMILIENANAMNESE', 'EIGENANAMNESE', 'BEFUND', 'DIAGNOSE', 'BEURTEILUNG'],
          formatting: { font_family: 'Times New Roman', font_size_pt: 12, line_spacing: 1.15 }
        });
        setIsBuildingProfile(false);
        setShowTemplateReview(true);
        return;
      }

      setBuildProgress(30);
      setBuildStatus('Extrahiere Abschnitte und Formatierung...');

      // Call the StyleProfile analyzer (for formatting info)
      const profile = await invoke('analyze_example_documents', {
        documentPaths
      });

      setBuildProgress(50);
      setBuildStatus('Extrahiere Template-Struktur mit KI...');

      // NEW: Call template extraction to create template_spec.json
      console.log('=== EXTRACTING TEMPLATE ===');
      console.log('Input folder:', uploadsFolder);

      const extractionResult = await invoke('extract_template', {
        inputFolder: uploadsFolder,
        outputFolder: null  // Uses default: template_output
      }) as ExtractionResult;

      console.log('Extraction result:', extractionResult);

      if (!extractionResult.success) {
        throw new Error(extractionResult.message);
      }

      setBuildProgress(80);
      setBuildStatus(`${extractionResult.anchors_found} Anker aus ${extractionResult.documents_analyzed} Dokumenten extrahiert...`);

      // Load the generated template_spec.json
      const spec = await invoke('get_template_spec') as TemplateSpecData;
      console.log('Template spec loaded:', spec);
      setTemplateSpec(spec);

      setBuildProgress(90);
      setBuildStatus('Erstelle Vorlage...');

      await new Promise(resolve => setTimeout(resolve, 300));

      setBuildProgress(100);
      setBuildStatus(`Template erstellt! ${spec.anchors.length} Abschnitte erkannt.`);

      await new Promise(resolve => setTimeout(resolve, 500));

      // Get template info and show review step
      const info = await invoke('get_template_info') as TemplateInfo;
      // Override sections with the ones from template_spec
      info.sections = spec.anchors.map(a => a.canonical_text);
      setTemplateInfo(info);
      setIsBuildingProfile(false);
      setShowTemplateReview(true);

    } catch (err) {
      console.error('Failed to build StyleProfile:', err);
      setError(`Fehler beim Erstellen des Stil-Profils: ${err}`);
      setIsBuildingProfile(false);
      setBuildProgress(0);
      setBuildStatus('');
    }
  };

  const approveTemplate = async () => {
    if (!(window as any).__TAURI_INTERNALS__?.invoke) {
      onComplete();
      return;
    }

    setIsApproving(true);
    setError(null);

    try {
      await invoke('approve_template');
      onComplete();
    } catch (err) {
      console.error('Failed to approve template:', err);
      setError(`Fehler beim Genehmigen: ${err}`);
      setIsApproving(false);
    }
  };

  // Handle saving edited template from TemplateEditor
  const handleSaveTemplate = async (updatedSpec: TemplateSpecData) => {
    setIsSavingTemplate(true);
    setError(null);

    try {
      // Save the updated template spec to disk
      await invoke('save_template_spec', {
        specJson: JSON.stringify(updatedSpec, null, 2)
      });

      // Update local state
      setTemplateSpec(updatedSpec);
      setShowTemplateEditor(false);

      console.log('Template saved successfully');
    } catch (err) {
      console.error('Failed to save template:', err);
      setError(`Fehler beim Speichern des Templates: ${err}`);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleSkip = () => {
    const message = uploadedDocuments.length < MIN_DOCUMENTS
      ? `Sie haben nur ${uploadedDocuments.length} von mindestens ${MIN_DOCUMENTS} Dokumenten hochgeladen. Ohne vollständiges Stil-Profil kann die KI Ihren Schreibstil nicht lernen. Trotzdem fortfahren?`
      : 'Ohne Stil-Profil kann die KI Ihren Schreibstil nicht lernen. Sie werden bei jedem Start erneut gefragt. Trotzdem fortfahren?';

    if (window.confirm(message)) {
      onSkip();
    }
  };

  const uploadedCount = uploadedDocuments.filter(d => d.status === 'uploaded').length;
  const hasMinimumDocuments = uploadedCount >= MIN_DOCUMENTS;
  const isDocumentUploading = uploadedDocuments.some(d => d.status === 'uploading' || d.status === 'pending');

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
        maxWidth: '750px',
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
            Gutachten Stil-Lernsystem
          </h1>
          <p style={{ margin: 0, opacity: 0.9, fontSize: '1rem' }}>
            Laden Sie {MIN_DOCUMENTS}-{MAX_DOCUMENTS} Ihrer bisherigen Gutachten hoch
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
              Was lernt die KI aus Ihren Beispielen?
            </h3>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#0c4a6e', fontSize: '0.9rem', lineHeight: '1.6' }}>
              <li><strong>Abschnitts-Struktur:</strong> Reihenfolge und Namen (Familienanamnese, Befund, etc.)</li>
              <li><strong>Typische Formulierungen:</strong> Ihre medizinischen Standardphrasen</li>
              <li><strong>Formatierung:</strong> Schriftart, Abstände, Überschriften-Stil</li>
              <li><strong>Pflicht vs. Optional:</strong> Welche Abschnitte immer/manchmal vorkommen</li>
            </ul>
          </div>

          {/* Progress indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '20px',
          }}>
            {[...Array(MAX_DOCUMENTS)].map((_, i) => (
              <div
                key={i}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: i < uploadedCount
                    ? (i < MIN_DOCUMENTS ? '#22c55e' : '#3b82f6')
                    : (i < MIN_DOCUMENTS ? '#fef3c7' : '#f3f4f6'),
                  border: i < MIN_DOCUMENTS
                    ? '2px solid ' + (i < uploadedCount ? '#22c55e' : '#f59e0b')
                    : '1px solid #d1d5db',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: '600',
                  color: i < uploadedCount ? 'white' : '#6b7280',
                }}
              >
                {i + 1}
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.85rem', marginBottom: '16px' }}>
            {uploadedCount < MIN_DOCUMENTS
              ? `Noch ${MIN_DOCUMENTS - uploadedCount} Dokument(e) erforderlich (Minimum: ${MIN_DOCUMENTS})`
              : `${uploadedCount} Dokumente hochgeladen - Sie können weitere hinzufugen (Max: ${MAX_DOCUMENTS})`
            }
          </p>

          {/* Upload Area */}
          {!isBuildingProfile && !showTemplateReview && (
            <div
              style={{
                border: `2px dashed ${dragActive ? '#3b82f6' : '#d1d5db'}`,
                borderRadius: '8px',
                padding: '32px',
                textAlign: 'center',
                backgroundColor: dragActive ? '#f0f9ff' : '#f9fafb',
                cursor: uploadedCount >= MAX_DOCUMENTS ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                marginBottom: '24px',
                opacity: uploadedCount >= MAX_DOCUMENTS ? 0.6 : 1,
              }}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={uploadedCount >= MAX_DOCUMENTS ? undefined : handleDrop}
              onClick={() => uploadedCount < MAX_DOCUMENTS && fileInputRef.current?.click()}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📄</div>
              <h3 style={{ color: '#374151', marginBottom: '8px', fontSize: '1.1rem' }}>
                {uploadedCount >= MAX_DOCUMENTS
                  ? 'Maximale Anzahl erreicht'
                  : 'Gutachten hier ablegen oder klicken'
                }
              </h3>
              <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '0.9rem' }}>
                Word-Dokumente (.docx, .doc)
              </p>
              {uploadedCount < MAX_DOCUMENTS && (
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
                  Dateien auswahlen
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {/* Building Profile Progress */}
          {isBuildingProfile && (
            <div style={{
              backgroundColor: '#f0f9ff',
              border: '1px solid #3b82f6',
              borderRadius: '8px',
              padding: '24px',
              marginBottom: '24px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🧠</div>
              <h3 style={{ color: '#1e40af', marginBottom: '16px' }}>
                KI lernt Ihren Schreibstil...
              </h3>
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: '#dbeafe',
                borderRadius: '4px',
                marginBottom: '12px',
              }}>
                <div style={{
                  width: `${buildProgress}%`,
                  height: '100%',
                  backgroundColor: '#3b82f6',
                  borderRadius: '4px',
                  transition: 'width 0.3s',
                }} />
              </div>
              <p style={{ color: '#1e40af', fontSize: '0.9rem', margin: 0 }}>
                {buildStatus}
              </p>
            </div>
          )}

          {/* Template Review Step */}
          {showTemplateReview && templateInfo && (
            <div style={{
              backgroundColor: '#f0fdf4',
              border: '1px solid #22c55e',
              borderRadius: '8px',
              padding: '24px',
              marginBottom: '24px',
            }}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📋</div>
                <h3 style={{ color: '#166534', marginBottom: '8px', fontSize: '1.2rem' }}>
                  Vorlage erstellt!
                </h3>
                <p style={{ color: '#15803d', fontSize: '0.9rem', margin: 0 }}>
                  Bitte uberprufen Sie die erkannten Abschnitte
                </p>
              </div>

              {/* Template Spec Preview - Detailed View */}
              {templateSpec && (
                <div style={{
                  backgroundColor: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  padding: '16px',
                  marginBottom: '20px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                }}>
                  {/* Quality Metrics */}
                  <div style={{
                    display: 'flex',
                    gap: '16px',
                    marginBottom: '16px',
                    padding: '12px',
                    backgroundColor: '#f0f9ff',
                    borderRadius: '6px',
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e40af' }}>
                        {templateSpec.quality_metrics.documents_analyzed}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Dokumente</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#059669' }}>
                        {templateSpec.quality_metrics.anchors_detected}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Anker</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#7c3aed' }}>
                        {templateSpec.skeleton.filter(s => s.type === 'slot').length}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Slots</div>
                    </div>
                  </div>

                  {/* Anchors (Section Headings) */}
                  <h4 style={{ margin: '0 0 12px 0', color: '#374151', fontSize: '0.95rem' }}>
                    Erkannte Abschnitts-Überschriften ({templateSpec.anchors.length}):
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                    {templateSpec.anchors.map((anchor, index) => (
                      <div key={index} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '4px',
                        border: '1px solid #e5e7eb',
                      }}>
                        <span style={{ fontWeight: '500', color: '#1f2937' }}>
                          {anchor.canonical_text}
                        </span>
                        <span style={{
                          fontSize: '0.75rem',
                          color: anchor.occurrence_rate >= 0.9 ? '#059669' : '#d97706',
                          backgroundColor: anchor.occurrence_rate >= 0.9 ? '#d1fae5' : '#fef3c7',
                          padding: '2px 8px',
                          borderRadius: '12px',
                        }}>
                          {(anchor.occurrence_rate * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Skeleton Structure (Slots) */}
                  <h4 style={{ margin: '0 0 12px 0', color: '#374151', fontSize: '0.95rem' }}>
                    Template-Struktur (Reihenfolge):
                  </h4>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '12px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                  }}>
                    {templateSpec.skeleton.map((item, index) => (
                      <div key={index} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: item.type === 'fixed' ? '#6b7280' : '#1e40af',
                      }}>
                        <span style={{
                          width: '50px',
                          color: item.type === 'fixed' ? '#9ca3af' : '#3b82f6',
                          fontWeight: '500',
                        }}>
                          {item.type === 'fixed' ? '[FIX]' : '[SLOT]'}
                        </span>
                        <span>
                          {item.type === 'fixed'
                            ? (item.paragraphs?.[0]?.text || item.id || '—')
                            : (item.section_name || item.slot_id || '—')
                          }
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Style Roles */}
                  <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                    <h4 style={{ margin: '0 0 8px 0', color: '#374151', fontSize: '0.9rem' }}>
                      Stil-Zuordnung:
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {Object.entries(templateSpec.style_roles).map(([role, style]) => (
                        <span key={role} style={{
                          fontSize: '0.75rem',
                          padding: '4px 8px',
                          backgroundColor: '#e0e7ff',
                          color: '#3730a3',
                          borderRadius: '4px',
                        }}>
                          {role}: {style}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Fallback: Old sections preview if no templateSpec */}
              {!templateSpec && templateInfo && (
                <div style={{
                  backgroundColor: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  padding: '16px',
                  marginBottom: '20px',
                }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#374151', fontSize: '0.95rem' }}>
                    Erkannte Abschnitte ({templateInfo.sections.length}):
                  </h4>
                  {templateInfo.sections.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {templateInfo.sections.map((section, index) => (
                        <span key={index} style={{
                          backgroundColor: '#dbeafe',
                          color: '#1e40af',
                          padding: '4px 12px',
                          borderRadius: '16px',
                          fontSize: '0.85rem',
                          fontWeight: '500',
                        }}>
                          {section}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0 }}>
                      Keine Abschnitte erkannt (wird beim Diktieren automatisch strukturiert)
                    </p>
                  )}

                  {templateInfo.formatting && (
                    <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                      <h4 style={{ margin: '0 0 8px 0', color: '#374151', fontSize: '0.9rem' }}>
                        Formatierung:
                      </h4>
                      <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>
                        {templateInfo.formatting.font_family}, {templateInfo.formatting.font_size_pt}pt,
                        Zeilenabstand {templateInfo.formatting.line_spacing.toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Approve Button */}
              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button
                  onClick={() => setShowTemplateEditor(true)}
                  disabled={!templateSpec}
                  style={{
                    flex: 1,
                    backgroundColor: 'white',
                    color: '#4f46e5',
                    padding: '14px 24px',
                    border: '2px solid #4f46e5',
                    borderRadius: '6px',
                    cursor: templateSpec ? 'pointer' : 'not-allowed',
                    fontSize: '1rem',
                    fontWeight: '600',
                    opacity: templateSpec ? 1 : 0.6,
                  }}
                >
                  Template bearbeiten
                </button>
                <button
                  onClick={approveTemplate}
                  disabled={isApproving}
                  style={{
                    flex: 1,
                    backgroundColor: '#22c55e',
                    color: 'white',
                    padding: '14px 24px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isApproving ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '700',
                    opacity: isApproving ? 0.6 : 1,
                  }}
                >
                  {isApproving ? 'Wird gespeichert...' : 'Template übernehmen'}
                </button>
              </div>

              <p style={{
                color: '#6b7280',
                fontSize: '0.8rem',
                textAlign: 'center',
                marginTop: '12px',
                marginBottom: 0,
              }}>
                Mit "Template bearbeiten" können Sie Abschnitte anpassen, neu ordnen oder löschen.
              </p>
            </div>
          )}

          {/* Template Editor Modal */}
          {showTemplateEditor && templateSpec && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1100,
              padding: '20px',
            }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                width: '95%',
                maxWidth: '900px',
                height: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              }}>
                <TemplateEditor
                  templateSpec={templateSpec as any}
                  onSave={handleSaveTemplate as any}
                  onCancel={() => setShowTemplateEditor(false)}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #ef4444',
              borderRadius: '6px',
              padding: '12px 16px',
              marginBottom: '16px',
            }}>
              <p style={{ margin: 0, color: '#dc2626', fontSize: '0.9rem' }}>
                {error}
              </p>
            </div>
          )}

          {/* Uploaded Documents List */}
          {uploadedDocuments.length > 0 && !isBuildingProfile && !showTemplateReview && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: '#374151', marginBottom: '12px', fontSize: '1rem' }}>
                Hochgeladene Gutachten ({uploadedDocuments.length}/{MAX_DOCUMENTS})
              </h3>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {uploadedDocuments.map((doc, index) => (
                  <div key={doc.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    backgroundColor: doc.status === 'error' ? '#fef2f2' : '#f9fafb',
                    border: `1px solid ${doc.status === 'error' ? '#fca5a5' : '#e5e7eb'}`,
                    borderRadius: '6px',
                    marginBottom: '8px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                      <span style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: index < MIN_DOCUMENTS ? '#22c55e' : '#3b82f6',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                      }}>
                        {index + 1}
                      </span>
                      <div>
                        <div style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>
                          {doc.name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                          {formatFileSize(doc.size)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {doc.status === 'pending' && (
                        <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>Warteschlange</span>
                      )}
                      {doc.status === 'uploading' && (
                        <span style={{ color: '#3b82f6', fontSize: '0.8rem' }}>Hochladen...</span>
                      )}
                      {doc.status === 'uploaded' && (
                        <span style={{ color: '#22c55e', fontSize: '0.8rem' }}>Bereit</span>
                      )}
                      {doc.status === 'error' && (
                        <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>Fehler</span>
                      )}
                      <button
                        onClick={() => removeDocument(doc.id)}
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

          {/* Action Buttons */}
          {!isBuildingProfile && !showTemplateReview && (
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
                Ohne Stil-Lernen fortfahren
              </button>
              <button
                onClick={buildStyleProfile}
                disabled={!hasMinimumDocuments || isDocumentUploading}
                style={{
                  backgroundColor: hasMinimumDocuments && !isDocumentUploading ? '#22c55e' : '#9ca3af',
                  color: 'white',
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: hasMinimumDocuments && !isDocumentUploading ? 'pointer' : 'not-allowed',
                  fontSize: '1rem',
                  fontWeight: '600',
                }}
              >
                {isDocumentUploading
                  ? 'Hochladen...'
                  : hasMinimumDocuments
                    ? 'Stil-Profil erstellen'
                    : `Noch ${MIN_DOCUMENTS - uploadedCount} Dokument(e) notig`
                }
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FirstLaunchOnboarding;
