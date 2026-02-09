/**
 * Template Editor Component
 * Allows users to edit the extracted template_spec.json visually
 * Each block/slot is shown as an editable card with formatting controls
 */

import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Types matching template_spec.json structure
interface TemplateSpecAnchor {
  id: string;
  canonical_text: string;
  match_mode: 'exact' | 'normalized' | 'fuzzy';
  min_similarity: number;
  occurrence_rate: number;
  styles: string[];
}

interface SkeletonParagraph {
  text: string;
  style: string;
}

interface SkeletonItem {
  type: 'fixed' | 'slot';
  id?: string;
  slot_id?: string;
  section_name?: string;
  paragraphs?: SkeletonParagraph[];
  allowed_styles?: string[];
  list_behavior?: 'bullets_allowed' | 'no_bullets';
  optional?: boolean;
}

interface StyleRoles {
  [key: string]: string;
}

interface TemplateSpec {
  version: string;
  family_id: string;
  family_name: string;
  anchors: TemplateSpecAnchor[];
  skeleton: SkeletonItem[];
  style_roles: StyleRoles;
  render_rules?: {
    spacing_after_heading?: number;
    spacing_after_paragraph?: number;
    blank_line_before_section?: boolean;
  };
  quality_metrics: {
    documents_analyzed: number;
    fixed_blocks_found: number;
    variable_blocks_found: number;
    anchors_detected: number;
  };
}

interface TemplateEditorProps {
  templateSpec: TemplateSpec;
  onSave: (updatedSpec: TemplateSpec) => void;
  onCancel: () => void;
}

// Available Word styles (common ones)
const AVAILABLE_STYLES = [
  'Normal',
  'Heading 1',
  'Heading 2',
  'Heading 3',
  'Body Text',
  'Body Text 2',
  'List Bullet',
  'List Number',
  'Title',
];

const TemplateEditor: React.FC<TemplateEditorProps> = ({ templateSpec, onSave, onCancel }) => {
  const [editedSpec, setEditedSpec] = useState<TemplateSpec>({ ...templateSpec });
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Mouse-based drag and drop state (HTML5 drag doesn't work well in Tauri)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mouse-based drag handlers
  const handleMouseDown = (index: number) => {
    setDraggedIndex(index);
    // Debug removed:(`MouseDown: started dragging card ${index}`);
  };

  // Effect to handle mouse move and mouse up globally
  useEffect(() => {
    if (draggedIndex === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const cards = containerRef.current.querySelectorAll('[data-card-index]');
      let targetIndex: number | null = null;

      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const idx = parseInt(card.getAttribute('data-card-index') || '-1', 10);
          if (idx !== draggedIndex) {
            targetIndex = idx;
          }
        }
      });

      if (targetIndex !== null) {
        setDragOverIndex(targetIndex);
        // Debug removed:(`MouseMove: over card ${targetIndex}, dragging card ${draggedIndex}`);
      } else {
        setDragOverIndex(null);
      }
    };

    const handleMouseUp = () => {
      if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
        // Debug removed:(`MouseUp: REORDER from ${draggedIndex} to ${dragOverIndex}`);

        // Perform the reorder
        const newSkeleton = [...editedSpec.skeleton];
        const [draggedItem] = newSkeleton.splice(draggedIndex, 1);
        const insertIndex = draggedIndex < dragOverIndex ? dragOverIndex - 1 : dragOverIndex;
        newSkeleton.splice(insertIndex, 0, draggedItem);

        setEditedSpec({ ...editedSpec, skeleton: newSkeleton });
        setHasChanges(true);

        // Update expanded card if needed
        if (expandedCard !== null) {
          if (expandedCard === draggedIndex) {
            setExpandedCard(insertIndex);
          } else if (draggedIndex < expandedCard && dragOverIndex >= expandedCard) {
            setExpandedCard(expandedCard - 1);
          } else if (draggedIndex > expandedCard && dragOverIndex <= expandedCard) {
            setExpandedCard(expandedCard + 1);
          }
        }
      } else {
        // Debug removed:(`MouseUp: cancelled (same position or no target)`);
      }

      setDraggedIndex(null);
      setDragOverIndex(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedIndex, dragOverIndex, editedSpec, expandedCard]);

  // Get unique styles from the template
  const availableStyles = React.useMemo(() => {
    const styles = new Set<string>(AVAILABLE_STYLES);
    // Add styles from style_roles
    Object.values(editedSpec.style_roles).forEach(s => styles.add(s));
    // Add styles from anchors
    editedSpec.anchors.forEach(a => a.styles.forEach(s => styles.add(s)));
    return Array.from(styles).sort();
  }, [editedSpec]);

  const updateSkeletonItem = (index: number, updates: Partial<SkeletonItem>) => {
    const newSkeleton = [...editedSpec.skeleton];
    newSkeleton[index] = { ...newSkeleton[index], ...updates };
    setEditedSpec({ ...editedSpec, skeleton: newSkeleton });
    setHasChanges(true);
  };

  const updateParagraph = (skeletonIndex: number, paragraphIndex: number, updates: Partial<SkeletonParagraph>) => {
    const newSkeleton = [...editedSpec.skeleton];
    const item = { ...newSkeleton[skeletonIndex] };
    if (item.paragraphs) {
      item.paragraphs = [...item.paragraphs];
      item.paragraphs[paragraphIndex] = { ...item.paragraphs[paragraphIndex], ...updates };
      newSkeleton[skeletonIndex] = item;
      setEditedSpec({ ...editedSpec, skeleton: newSkeleton });
      setHasChanges(true);
    }
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= editedSpec.skeleton.length) return;

    const newSkeleton = [...editedSpec.skeleton];
    [newSkeleton[index], newSkeleton[newIndex]] = [newSkeleton[newIndex], newSkeleton[index]];
    setEditedSpec({ ...editedSpec, skeleton: newSkeleton });
    setHasChanges(true);
  };

  const deleteItem = (index: number) => {
    if (!confirm('Diesen Block wirklich löschen?')) return;
    const newSkeleton = editedSpec.skeleton.filter((_, i) => i !== index);
    setEditedSpec({ ...editedSpec, skeleton: newSkeleton });
    setHasChanges(true);
    setExpandedCard(null);
  };

  const addFixedBlock = () => {
    const newItem: SkeletonItem = {
      type: 'fixed',
      id: `new_fixed_${Date.now()}`,
      paragraphs: [{ text: 'Neue Überschrift', style: 'Heading 2' }]
    };
    setEditedSpec({ ...editedSpec, skeleton: [...editedSpec.skeleton, newItem] });
    setHasChanges(true);
    setExpandedCard(editedSpec.skeleton.length);
  };

  const addSlot = () => {
    const newItem: SkeletonItem = {
      type: 'slot',
      slot_id: `new_slot_${Date.now()}_body`,
      section_name: 'Neuer Abschnitt',
      allowed_styles: ['BODY', 'BULLET'],
      list_behavior: 'bullets_allowed',
      optional: false
    };
    setEditedSpec({ ...editedSpec, skeleton: [...editedSpec.skeleton, newItem] });
    setHasChanges(true);
    setExpandedCard(editedSpec.skeleton.length);
  };

  const handleSave = () => {
    onSave(editedSpec);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '85vh',
      minHeight: '500px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb',
      }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1f2937' }}>
          Template Editor
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={addFixedBlock}
            style={{
              padding: '6px 12px',
              backgroundColor: '#e0e7ff',
              color: '#3730a3',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '500',
            }}
          >
            + Fester Block
          </button>
          <button
            onClick={addSlot}
            style={{
              padding: '6px 12px',
              backgroundColor: '#dbeafe',
              color: '#1e40af',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '500',
            }}
          >
            + Slot
          </button>
        </div>
      </div>

      {/* Scrollable cards list */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          minHeight: 0, // Important for flex scrolling
          cursor: draggedIndex !== null ? 'grabbing' : 'default',
        }}
      >
        {editedSpec.skeleton.map((item, index) => (
          <SkeletonCard
            key={`${item.type}-${item.id || item.slot_id}-${index}`}
            item={item}
            index={index}
            isExpanded={expandedCard === index}
            onToggleExpand={() => setExpandedCard(expandedCard === index ? null : index)}
            onUpdate={(updates) => updateSkeletonItem(index, updates)}
            onUpdateParagraph={(pIndex, updates) => updateParagraph(index, pIndex, updates)}
            onMoveUp={() => moveItem(index, 'up')}
            onMoveDown={() => moveItem(index, 'down')}
            onDelete={() => deleteItem(index)}
            canMoveUp={index > 0}
            canMoveDown={index < editedSpec.skeleton.length - 1}
            availableStyles={availableStyles}
            // Mouse-based drag props
            isDragging={draggedIndex === index}
            isDragOver={dragOverIndex === index}
            onDragHandleMouseDown={() => handleMouseDown(index)}
          />
        ))}
      </div>

      {/* Footer with save/cancel */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        padding: '16px',
        borderTop: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb',
      }}>
        <button
          onClick={onCancel}
          style={{
            padding: '10px 20px',
            backgroundColor: 'white',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          Abbrechen
        </button>
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          style={{
            padding: '10px 20px',
            backgroundColor: hasChanges ? '#22c55e' : '#9ca3af',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: hasChanges ? 'pointer' : 'not-allowed',
            fontSize: '0.9rem',
            fontWeight: '600',
          }}
        >
          Template speichern
        </button>
      </div>
    </div>
  );
};

// Individual card component for each skeleton item
interface SkeletonCardProps {
  item: SkeletonItem;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<SkeletonItem>) => void;
  onUpdateParagraph: (pIndex: number, updates: Partial<SkeletonParagraph>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  availableStyles: string[];
  // Mouse-based drag props
  isDragging: boolean;
  isDragOver: boolean;
  onDragHandleMouseDown: () => void;
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({
  item,
  index,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onUpdateParagraph,
  onMoveUp,
  onMoveDown,
  onDelete,
  canMoveUp,
  canMoveDown,
  availableStyles,
  isDragging,
  isDragOver,
  onDragHandleMouseDown,
}) => {
  const isFixed = item.type === 'fixed';
  const displayText = isFixed
    ? (item.paragraphs?.[0]?.text || item.id || 'Fester Block')
    : (item.section_name || item.slot_id || 'Slot');

  return (
    <div
      data-card-index={index}
      style={{
        border: `3px solid ${isDragOver ? '#22c55e' : (isFixed ? '#c7d2fe' : '#bfdbfe')}`,
        borderRadius: '8px',
        backgroundColor: isDragOver ? '#bbf7d0' : (isFixed ? '#eef2ff' : '#eff6ff'),
        overflow: 'hidden',
        flexShrink: 0, // Prevent cards from shrinking
        opacity: isDragging ? 0.5 : 1,
        transition: 'border-color 0.15s, background-color 0.15s, opacity 0.15s, transform 0.15s',
        transform: isDragOver ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {/* Card header - always visible */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '16px 20px',
          gap: '16px',
          minHeight: '60px',
        }}
      >
        {/* Drag handle - click and hold to drag */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDragHandleMouseDown();
          }}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            color: '#6b7280',
            padding: '12px 8px',
            userSelect: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            borderRadius: '6px',
            backgroundColor: isDragging ? '#93c5fd' : '#e5e7eb',
            border: `1px solid ${isDragging ? '#3b82f6' : '#d1d5db'}`,
            transition: 'background-color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!isDragging) {
              (e.currentTarget as HTMLElement).style.backgroundColor = '#d1d5db';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDragging) {
              (e.currentTarget as HTMLElement).style.backgroundColor = '#e5e7eb';
            }
          }}
          title="Klicken und halten zum Verschieben"
        >
          <div style={{ display: 'flex', gap: '3px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#6b7280' }} />
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#6b7280' }} />
          </div>
          <div style={{ display: 'flex', gap: '3px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#6b7280' }} />
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#6b7280' }} />
          </div>
          <div style={{ display: 'flex', gap: '3px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#6b7280' }} />
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#6b7280' }} />
          </div>
        </div>

        {/* Type badge */}
        <span
          onClick={onToggleExpand}
          style={{
            cursor: 'pointer',
          padding: '6px 12px',
          backgroundColor: isFixed ? '#4f46e5' : '#2563eb',
          color: 'white',
          borderRadius: '6px',
          fontSize: '0.85rem',
          fontWeight: '700',
          minWidth: '50px',
          textAlign: 'center',
        }}>
          {isFixed ? 'FIX' : 'SLOT'}
        </span>

        {/* Title - clickable to expand */}
        <span
          onClick={onToggleExpand}
          style={{
            flex: 1,
            fontWeight: '600',
            color: '#1f2937',
            fontSize: '1.05rem',
            cursor: 'pointer',
          }}
        >
          {displayText}
        </span>

        {/* Style info */}
        <span
          onClick={onToggleExpand}
          style={{
            fontSize: '0.85rem',
            color: '#6b7280',
            padding: '4px 12px',
            backgroundColor: 'rgba(255,255,255,0.7)',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          {isFixed ? item.paragraphs?.[0]?.style : item.allowed_styles?.join(', ')}
        </span>

        {/* Expand arrow - clickable */}
        <span
          onClick={onToggleExpand}
          style={{
            color: '#6b7280',
            fontSize: '1.2rem',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            cursor: 'pointer',
            padding: '4px',
          }}
        >
          ▼
        </span>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{
          padding: '20px 24px',
          borderTop: '2px solid rgba(0,0,0,0.1)',
          backgroundColor: 'rgba(255,255,255,0.7)',
        }}>
          {isFixed ? (
            <FixedBlockEditor
              item={item}
              onUpdate={onUpdate}
              onUpdateParagraph={onUpdateParagraph}
              availableStyles={availableStyles}
            />
          ) : (
            <SlotEditor
              item={item}
              onUpdate={onUpdate}
              availableStyles={availableStyles}
            />
          )}

          {/* Action buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid #e5e7eb',
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                disabled={!canMoveUp}
                style={{
                  padding: '6px 12px',
                  backgroundColor: canMoveUp ? '#f3f4f6' : '#e5e7eb',
                  color: canMoveUp ? '#374151' : '#9ca3af',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: canMoveUp ? 'pointer' : 'not-allowed',
                  fontSize: '0.8rem',
                }}
              >
                ↑ Hoch
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                disabled={!canMoveDown}
                style={{
                  padding: '6px 12px',
                  backgroundColor: canMoveDown ? '#f3f4f6' : '#e5e7eb',
                  color: canMoveDown ? '#374151' : '#9ca3af',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: canMoveDown ? 'pointer' : 'not-allowed',
                  fontSize: '0.8rem',
                }}
              >
                ↓ Runter
              </button>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Löschen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Editor for fixed blocks
interface FixedBlockEditorProps {
  item: SkeletonItem;
  onUpdate: (updates: Partial<SkeletonItem>) => void;
  onUpdateParagraph: (pIndex: number, updates: Partial<SkeletonParagraph>) => void;
  availableStyles: string[];
}

const FixedBlockEditor: React.FC<FixedBlockEditorProps> = ({
  item,
  onUpdate,
  onUpdateParagraph,
  availableStyles,
}) => {
  const paragraph = item.paragraphs?.[0] || { text: '', style: 'Normal' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Text input */}
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>
          Text (Überschrift):
        </label>
        <input
          type="text"
          value={paragraph.text}
          onChange={(e) => onUpdateParagraph(0, { text: e.target.value })}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '0.95rem',
          }}
        />
      </div>

      {/* Style dropdown */}
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>
          Stil:
        </label>
        <select
          value={paragraph.style}
          onChange={(e) => onUpdateParagraph(0, { style: e.target.value })}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '0.9rem',
            backgroundColor: 'white',
          }}
        >
          {availableStyles.map(style => (
            <option key={style} value={style}>{style}</option>
          ))}
        </select>
      </div>

      {/* ID field */}
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>
          ID (intern):
        </label>
        <input
          type="text"
          value={item.id || ''}
          onChange={(e) => onUpdate({ id: e.target.value })}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '0.85rem',
            fontFamily: 'monospace',
            color: '#6b7280',
          }}
        />
      </div>
    </div>
  );
};

// Editor for slots
interface SlotEditorProps {
  item: SkeletonItem;
  onUpdate: (updates: Partial<SkeletonItem>) => void;
  availableStyles: string[];
}

const SlotEditor: React.FC<SlotEditorProps> = ({
  item,
  onUpdate,
  availableStyles,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Section name */}
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>
          Abschnittsname:
        </label>
        <input
          type="text"
          value={item.section_name || ''}
          onChange={(e) => onUpdate({ section_name: e.target.value })}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '0.95rem',
          }}
        />
      </div>

      {/* Slot ID */}
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>
          Slot-ID (intern):
        </label>
        <input
          type="text"
          value={item.slot_id || ''}
          onChange={(e) => onUpdate({ slot_id: e.target.value })}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '0.85rem',
            fontFamily: 'monospace',
            color: '#6b7280',
          }}
        />
      </div>

      {/* Toggles row */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {/* Bullets toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={item.list_behavior === 'bullets_allowed'}
            onChange={(e) => onUpdate({
              list_behavior: e.target.checked ? 'bullets_allowed' : 'no_bullets'
            })}
            style={{ width: '18px', height: '18px' }}
          />
          <span style={{ fontSize: '0.9rem', color: '#374151' }}>
            Aufzählungen erlaubt
          </span>
        </label>

        {/* Optional toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={item.optional === true}
            onChange={(e) => onUpdate({ optional: e.target.checked })}
            style={{ width: '18px', height: '18px' }}
          />
          <span style={{ fontSize: '0.9rem', color: '#374151' }}>
            Optional (darf leer sein)
          </span>
        </label>
      </div>

      {/* Allowed styles */}
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>
          Erlaubte Stile:
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {['BODY', 'BULLET', 'H1', 'H2', 'H3'].map(style => (
            <label
              key={style}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                backgroundColor: item.allowed_styles?.includes(style) ? '#dbeafe' : '#f3f4f6',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              <input
                type="checkbox"
                checked={item.allowed_styles?.includes(style) || false}
                onChange={(e) => {
                  const current = item.allowed_styles || [];
                  const updated = e.target.checked
                    ? [...current, style]
                    : current.filter(s => s !== style);
                  onUpdate({ allowed_styles: updated });
                }}
                style={{ width: '14px', height: '14px' }}
              />
              {style}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TemplateEditor;
