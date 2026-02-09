// Template extraction and DOCX rendering service
import { invoke } from '@tauri-apps/api/core';

export interface TemplateSlot {
  slot_id: string;
  heading?: string;
  type: 'slot';
}

export interface TemplateSpec {
  version: string;
  family_id: string;
  family_name: string;
  anchors: AnchorDef[];
  skeleton: SkeletonItem[];
  style_roles: Record<string, StyleDef>;
  quality_metrics: QualityMetrics;
}

export interface AnchorDef {
  id: string;
  text: string;
  match_mode: 'exact' | 'normalized' | 'fuzzy';
  min_similarity?: number;
  role: string;
  frequency: number;
}

export interface SkeletonItem {
  type: 'fixed' | 'slot';
  slot_id?: string;
  heading?: string;
  anchor_ref?: string;
  text?: string;
}

export interface StyleDef {
  font_name?: string;
  font_size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  alignment?: string;
}

export interface QualityMetrics {
  documents_analyzed: number;
  anchor_coverage: number;
  slot_coverage: number;
}

export interface ExtractionResult {
  success: boolean;
  message: string;
  template_spec_path?: string;
  anchors_found: number;
  documents_analyzed: number;
}

export interface RenderResult {
  success: boolean;
  message: string;
  output_path?: string;
  unclear_count: number;
  missing_sections: string[];
}

export interface StructuredContent {
  slots: Record<string, string[]>;
  unclear_spans: UnclearSpan[];
  missing_slots: string[];
  processing_time_ms: number;
  tokens_per_sec?: number;
}

export interface UnclearSpan {
  slot_id: string;
  text: string;
  reason: string;
}

export class TemplateService {
  /**
   * Extract template from example Gutachten documents
   */
  static async extractTemplate(
    inputFolder: string,
    outputFolder?: string
  ): Promise<ExtractionResult> {
    try {
      const result = await invoke('extract_template', {
        input_folder: inputFolder,
        output_folder: outputFolder
      });
      return result as ExtractionResult;
    } catch (error) {
      console.error('Template extraction failed:', error);
      throw new Error(`Template extraction failed: ${error}`);
    }
  }

  /**
   * Get the current template specification
   */
  static async getTemplateSpec(): Promise<TemplateSpec> {
    try {
      const result = await invoke('get_template_spec');
      return result as TemplateSpec;
    } catch (error) {
      console.error('Failed to get template spec:', error);
      throw new Error(`Failed to get template spec: ${error}`);
    }
  }

  /**
   * Get list of available slots from template
   */
  static async getTemplateSlots(): Promise<TemplateSlot[]> {
    try {
      const result = await invoke('get_template_slots');
      return result as TemplateSlot[];
    } catch (error) {
      console.error('Failed to get template slots:', error);
      throw new Error(`Failed to get template slots: ${error}`);
    }
  }

  /**
   * Check if template has been extracted and is ready
   */
  static async isTemplateReady(): Promise<boolean> {
    try {
      const result = await invoke('is_template_ready');
      return result as boolean;
    } catch (error) {
      console.error('Failed to check template readiness:', error);
      return false;
    }
  }

  /**
   * Structure transcript into Gutachten sections using Qwen
   */
  static async structureTranscript(transcript: string): Promise<StructuredContent> {
    try {
      const result = await invoke('structure_gutachten_transcript', {
        transcript
      });
      return result as StructuredContent;
    } catch (error) {
      console.error('Transcript structuring failed:', error);
      throw new Error(`Transcript structuring failed: ${error}`);
    }
  }

  /**
   * Render a DOCX document from structured content (with save dialog)
   */
  static async renderDocx(
    contentJson: StructuredContent,
    templateSpecPath?: string,
    baseTemplatePath?: string
  ): Promise<RenderResult> {
    try {
      const result = await invoke('render_gutachten_docx', {
        content_json: contentJson,
        template_spec_path: templateSpecPath,
        base_template_path: baseTemplatePath
      });
      return result as RenderResult;
    } catch (error) {
      console.error('DOCX rendering failed:', error);
      throw new Error(`DOCX rendering failed: ${error}`);
    }
  }

  /**
   * Full pipeline: transcript -> structured -> DOCX (with save dialog)
   */
  static async processTranscriptToDocx(
    transcript: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<RenderResult> {
    try {
      // Step 1: Check template is ready
      onProgress?.('Prüfe Vorlage...', 10);
      const templateReady = await this.isTemplateReady();
      if (!templateReady) {
        throw new Error('Keine Vorlage gefunden. Bitte zuerst Beispiel-Gutachten hochladen.');
      }

      // Step 2: Structure the transcript
      onProgress?.('Strukturiere Text mit KI...', 30);
      const structuredContent = await this.structureTranscript(transcript);

      // Step 3: Render to DOCX (dialog handled in backend)
      onProgress?.('Erstelle DOCX-Dokument...', 70);
      const result = await this.renderDocx(structuredContent);

      onProgress?.('Fertig!', 100);
      return result;
    } catch (error) {
      console.error('Full pipeline failed:', error);
      throw error;
    }
  }

  /**
   * Format slot name for display (German)
   * Maps slot_id from template_spec.json to human-readable German headings
   */
  static formatSlotName(slotId: string): string {
    const translations: Record<string, string> = {
      // Main sections (from template_spec.json)
      'gutachterliche_fragestellung_body': 'Gutachterliche Fragestellung',
      '1._anamnese_body': '1. Anamnese',
      '2._untersuchungsbefunde_body': '2. Untersuchungsbefunde',
      '3._diagnosen_body': '3. Diagnosen',
      '4._epikrise_body': '4. Epikrise',
      '5._sozialmedizinische_leistungsbeurteilung_body': '5. Sozialmedizinische Leistungsbeurteilung',
      // Sub-sections
      '1.1_anamnese_medizinischer_daten_body': '1.1 Anamnese medizinischer Daten',
      '1.2_biografische_anamnese_body': '1.2 Biografische Anamnese',
      'familienanamnese_body': 'Familienanamnese',
      'eigenanamnese_body': 'Eigenanamnese',
      'vegetative_anamnese_body': 'Vegetative Anamnese',
      'aktuelle_beschwerden_body': 'Aktuelle Beschwerden',
      'aktuelle_medikation_body': 'Aktuelle Medikation',
      'therapie_und_behandelnde_ärzte_body': 'Therapie und behandelnde Ärzte',
      'psychischer_befund_body': 'Psychischer Befund',
      'neurologischer/körperlicher_untersuchungsbefund_body': 'Neurologischer/körperlicher Untersuchungsbefund',
      'hamilton_depression_scale_body': 'Hamilton Depression Scale',
      'diagnosen_body': 'Diagnosen',
      // Legacy slot names (backward compatibility)
      'fragestellung_body': 'Fragestellung',
      'sozialanamnese_body': 'Sozialanamnese',
      'befund_body': 'Untersuchungsbefund',
      'beurteilung_body': 'Beurteilung',
      'raw_content': 'Unstrukturierter Inhalt'
    };
    return translations[slotId] || slotId;
  }
}
