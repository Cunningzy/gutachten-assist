"""
Style Profile Analyzer for Gutachten Assistant
Analyzes multiple example Gutachten documents to build a comprehensive StyleProfile.

This script:
1. Analyzes 5-10 example DOCX files
2. Extracts section headings and determines required vs optional
3. Extracts common phrases for each section
4. Extracts formatting information
5. Builds and saves a StyleProfile JSON

Usage:
    python style_profile_analyzer.py <documents_json> <output_path>

    documents_json: JSON array of document paths
    output_path: Where to save the StyleProfile JSON
"""

import sys
import os
import json
import re
from datetime import datetime
from collections import Counter, defaultdict
from typing import List, Dict, Tuple, Optional, Any
import zipfile
from xml.etree import ElementTree as ET

# Word XML namespaces
NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}


class StyleProfileAnalyzer:
    """Analyzes multiple Gutachten documents to build a StyleProfile."""

    # Known German medical report section headers
    KNOWN_SECTIONS = [
        # Patient info
        "ANGABEN ZUR PERSON", "PERSONALIEN", "PATIENTENDATEN",
        # Anamnesis sections
        "FAMILIENANAMNESE", "EIGENANAMNESE", "SOZIALANAMNESE",
        "ARBEITSANAMNESE", "BERUFSANAMNESE", "VEGETATIVE ANAMNESE",
        "AKTUELLE BESCHWERDEN", "JETZIGE BESCHWERDEN", "AKTUELLE ANAMNESE",
        "SUCHTANAMNESE", "MEDIKAMENTENANAMNESE",
        # Medical history
        "VORGESCHICHTE", "KRANKHEITSVORGESCHICHTE", "KRANKENGESCHICHTE",
        "BISHERIGE BEHANDLUNG", "BISHERIGE THERAPIE",
        # Findings
        "BEFUND", "BEFUNDE", "KÖRPERLICHER BEFUND", "SOMATISCHER BEFUND",
        "NEUROLOGISCHER BEFUND", "PSYCHIATRISCHER BEFUND",
        "PSYCHOPATHOLOGISCHER BEFUND", "PSYCHISCHER BEFUND",
        "INTERNISTISCHER BEFUND",
        # Diagnostics
        "APPARATIVE DIAGNOSTIK", "ZUSATZDIAGNOSTIK", "LABORDIAGNOSTIK",
        "LABORWERTE", "LABOR", "BILDGEBUNG", "EEG", "EKG", "MRT", "CT",
        "PSYCHOLOGISCHE TESTUNG", "NEUROPSYCHOLOGISCHE TESTUNG",
        "TESTPSYCHOLOGISCHE UNTERSUCHUNG",
        # Assessment
        "DIAGNOSE", "DIAGNOSEN", "BEURTEILUNG", "ZUSAMMENFASSUNG",
        "SOZIALMEDIZINISCHE BEURTEILUNG", "LEISTUNGSBEURTEILUNG",
        "EPIKRISE", "WÜRDIGUNG",
        # Prognosis and recommendations
        "PROGNOSE", "THERAPIEEMPFEHLUNG", "EMPFEHLUNG", "EMPFEHLUNGEN",
        "VERLAUF", "KRANKHEITSVERLAUF",
        # Medications
        "MEDIKATION", "MEDIKAMENTE", "AKTUELLE MEDIKATION",
    ]

    def __init__(self):
        self.documents_data: List[Dict] = []
        self.all_sections: List[Dict] = []  # All sections found across documents
        self.section_counts: Counter = Counter()  # How many docs have each section
        self.section_phrases: Dict[str, List[str]] = defaultdict(list)  # Phrases per section
        self.formatting_info: Dict = {}

    def analyze_documents(self, doc_paths: List[str]) -> Dict:
        """
        Analyze multiple documents and build a StyleProfile.

        Args:
            doc_paths: List of paths to DOCX files

        Returns:
            StyleProfile dictionary
        """
        print(f"Analyzing {len(doc_paths)} documents...", file=sys.stderr)

        total_docs = len(doc_paths)

        for i, doc_path in enumerate(doc_paths):
            print(f"Processing document {i+1}/{total_docs}: {os.path.basename(doc_path)}", file=sys.stderr)
            try:
                doc_data = self._analyze_single_document(doc_path)
                if doc_data:
                    self.documents_data.append(doc_data)
            except Exception as e:
                print(f"  Error analyzing {doc_path}: {e}", file=sys.stderr)

        # Build the combined profile
        profile = self._build_style_profile(total_docs)

        return profile

    def _analyze_single_document(self, doc_path: str) -> Optional[Dict]:
        """Analyze a single DOCX document."""
        if not os.path.exists(doc_path):
            print(f"  File not found: {doc_path}", file=sys.stderr)
            return None

        try:
            with zipfile.ZipFile(doc_path, 'r') as docx:
                # Extract document.xml
                doc_xml = docx.read('word/document.xml').decode('utf-8')

                # Extract styles.xml if present
                styles_xml = ""
                try:
                    styles_xml = docx.read('word/styles.xml').decode('utf-8')
                except KeyError:
                    pass

                # Parse the document
                sections = self._extract_sections(doc_xml)
                formatting = self._extract_formatting(doc_xml, styles_xml)

                return {
                    'path': doc_path,
                    'filename': os.path.basename(doc_path),
                    'sections': sections,
                    'formatting': formatting,
                }

        except zipfile.BadZipFile:
            print(f"  Invalid DOCX file: {doc_path}", file=sys.stderr)
            return None
        except Exception as e:
            print(f"  Error reading {doc_path}: {e}", file=sys.stderr)
            return None

    def _extract_sections(self, doc_xml: str) -> List[Dict]:
        """Extract sections (headings) and their content from document XML."""
        sections = []

        try:
            # Parse XML
            root = ET.fromstring(doc_xml)
            body = root.find('.//w:body', NAMESPACES)

            if body is None:
                return sections

            current_section = None
            current_content = []

            for para in body.findall('.//w:p', NAMESPACES):
                para_text = self._get_paragraph_text(para)
                is_heading = self._is_heading_paragraph(para, para_text)

                if is_heading and para_text.strip():
                    # Save previous section if exists
                    if current_section:
                        current_section['content'] = ' '.join(current_content)
                        current_section['phrases'] = self._extract_phrases(current_content)
                        sections.append(current_section)

                    # Start new section
                    heading_text = para_text.strip()
                    normalized = self._normalize_heading(heading_text)

                    current_section = {
                        'original_text': heading_text,
                        'normalized': normalized,
                        'order': len(sections),
                    }
                    current_content = []

                elif current_section:
                    # Add content to current section
                    if para_text.strip():
                        current_content.append(para_text.strip())

            # Save last section
            if current_section:
                current_section['content'] = ' '.join(current_content)
                current_section['phrases'] = self._extract_phrases(current_content)
                sections.append(current_section)

        except ET.ParseError as e:
            print(f"  XML parse error: {e}", file=sys.stderr)

        return sections

    def _get_paragraph_text(self, para) -> str:
        """Extract text from a paragraph element."""
        texts = []
        for t in para.findall('.//w:t', NAMESPACES):
            if t.text:
                texts.append(t.text)
        return ''.join(texts)

    def _is_heading_paragraph(self, para, para_text: str) -> bool:
        """Determine if a paragraph is a section heading."""
        text = para_text.strip().upper()

        # Check if matches known sections
        for known in self.KNOWN_SECTIONS:
            if known in text or text in known:
                return True

        # Check for heading style
        pStyle = para.find('.//w:pStyle', NAMESPACES)
        if pStyle is not None:
            style_val = pStyle.get(f'{{{NAMESPACES["w"]}}}val', '')
            if 'heading' in style_val.lower() or 'berschrift' in style_val.lower():
                return True

        # Check for bold + short text + all caps pattern
        is_bold = para.find('.//w:b', NAMESPACES) is not None
        is_short = len(para_text.strip()) < 60
        is_upper = para_text.strip().isupper()

        if is_bold and is_short and (is_upper or any(known in text for known in self.KNOWN_SECTIONS)):
            return True

        # Check for numbered sections like "I.", "II.", "1.", "2." at start
        numbered_pattern = re.match(r'^[IVX]+\.|^\d+\.|\([A-Za-z]\)', para_text.strip())
        if numbered_pattern and is_short:
            return True

        return False

    def _normalize_heading(self, heading: str) -> str:
        """Normalize a heading for comparison."""
        # Remove numbering
        text = re.sub(r'^[IVX]+\.\s*', '', heading)
        text = re.sub(r'^\d+\.\s*', '', text)
        text = re.sub(r'^\([A-Za-z]\)\s*', '', text)

        # Uppercase and clean
        text = text.upper().strip()
        text = re.sub(r'[:\-–]$', '', text).strip()

        return text

    def _extract_phrases(self, content_parts: List[str]) -> List[str]:
        """Extract common medical phrases from content."""
        phrases = []

        # Common phrase patterns in German medical reports
        phrase_patterns = [
            # Patient descriptions
            r'Der Patient (?:berichtet|gibt an|klagt über|leidet (?:seit|unter))[^.]+\.',
            r'Die Patientin (?:berichtet|gibt an|klagt über|leidet (?:seit|unter))[^.]+\.',
            r'Es (?:zeigt sich|findet sich|besteht)[^.]+\.',
            r'(?:Keine|Kein) (?:Hinweise?|Anhalt|Anzeichen) (?:für|auf)[^.]+\.',

            # Clinical findings
            r'(?:Unauffälliger?|Regelrechter?|Normaler?)[^.]+(?:Befund|Status)[^.]*\.',
            r'(?:Bei|Im Rahmen) der Untersuchung[^.]+\.',

            # Diagnoses
            r'(?:Diagnose|Verdacht auf|V\.a\.|DD)[:\s]+[^.]+\.',

            # Recommendations
            r'(?:Es wird empfohlen|Empfehlung|Empfohlen wird)[^.]+\.',
            r'(?:Eine|Die) (?:weitere|weiterführende)[^.]+(?:ist|wird|sollte)[^.]+\.',
        ]

        full_text = ' '.join(content_parts)

        for pattern in phrase_patterns:
            try:
                matches = re.findall(pattern, full_text, re.IGNORECASE)
                phrases.extend(matches[:3])  # Limit to 3 per pattern
            except re.error:
                pass

        # Also extract sentences that start with common medical terms
        sentences = re.split(r'(?<=[.!?])\s+', full_text)
        medical_starters = [
            'Der Patient', 'Die Patientin', 'Es besteht', 'Es zeigt sich',
            'Keine', 'Kein', 'Unauffällig', 'Regelrecht', 'Normal',
            'Bei der', 'Im Rahmen', 'Zusammenfassend', 'Abschließend',
        ]

        for sentence in sentences:
            for starter in medical_starters:
                if sentence.strip().startswith(starter) and len(sentence) < 200:
                    if sentence not in phrases:
                        phrases.append(sentence.strip())
                    break

        return phrases[:10]  # Limit total phrases per section

    def _extract_formatting(self, doc_xml: str, styles_xml: str) -> Dict:
        """Extract formatting information from document."""
        formatting = {
            'font_family': 'Times New Roman',
            'font_size_pt': 12,
            'line_spacing': 1.15,
            'paragraph_spacing_before_pt': 0,
            'paragraph_spacing_after_pt': 8,
            'heading_styles': [],
        }

        # Extract font family
        font_match = re.search(r'w:ascii="([^"]+)"', doc_xml)
        if font_match:
            formatting['font_family'] = font_match.group(1)

        # Extract font size (in half-points)
        size_match = re.search(r'<w:sz[^>]*w:val="(\d+)"', doc_xml)
        if size_match:
            formatting['font_size_pt'] = int(size_match.group(1)) / 2

        # Extract line spacing
        spacing_match = re.search(r'<w:spacing[^>]*w:line="(\d+)"', doc_xml)
        if spacing_match:
            formatting['line_spacing'] = int(spacing_match.group(1)) / 240

        return formatting

    def _build_style_profile(self, total_docs: int) -> Dict:
        """Build the combined StyleProfile from all analyzed documents."""
        print(f"\nBuilding StyleProfile from {len(self.documents_data)} documents...", file=sys.stderr)

        # Collect all sections across documents
        section_occurrences: Dict[str, int] = Counter()
        section_orders: Dict[str, List[int]] = defaultdict(list)
        section_original_names: Dict[str, List[str]] = defaultdict(list)
        section_all_phrases: Dict[str, List[str]] = defaultdict(list)

        for doc in self.documents_data:
            for section in doc['sections']:
                normalized = section['normalized']
                section_occurrences[normalized] += 1
                section_orders[normalized].append(section['order'])
                section_original_names[normalized].append(section['original_text'])
                section_all_phrases[normalized].extend(section.get('phrases', []))

        # Determine required vs optional sections
        analyzed_count = len(self.documents_data)
        sections_list = []

        for normalized, count in section_occurrences.items():
            # Required if in all or most documents (>= 80%)
            is_required = count >= (analyzed_count * 0.8)

            # Get most common original name
            original_names = section_original_names[normalized]
            most_common_name = Counter(original_names).most_common(1)[0][0] if original_names else normalized

            # Get average order
            orders = section_orders[normalized]
            avg_order = sum(orders) / len(orders) if orders else 0

            # Get unique phrases (most common ones)
            all_phrases = section_all_phrases[normalized]
            phrase_counter = Counter(all_phrases)
            common_phrases = [phrase for phrase, _ in phrase_counter.most_common(5)]

            sections_list.append({
                'normalized_name': normalized,
                'display_name': most_common_name,
                'is_required': is_required,
                'occurrence_count': count,
                'occurrence_percentage': round(count / analyzed_count * 100, 1),
                'average_order': round(avg_order, 1),
                'common_phrases': common_phrases,
            })

        # Sort by average order
        sections_list.sort(key=lambda x: x['average_order'])

        # Assign final order
        for i, section in enumerate(sections_list):
            section['order'] = i

        # Aggregate formatting (use most common values)
        formatting_values = {
            'font_family': [],
            'font_size_pt': [],
            'line_spacing': [],
        }

        for doc in self.documents_data:
            fmt = doc.get('formatting', {})
            if fmt.get('font_family'):
                formatting_values['font_family'].append(fmt['font_family'])
            if fmt.get('font_size_pt'):
                formatting_values['font_size_pt'].append(fmt['font_size_pt'])
            if fmt.get('line_spacing'):
                formatting_values['line_spacing'].append(fmt['line_spacing'])

        # Get most common formatting values
        formatting = {
            'font_family': Counter(formatting_values['font_family']).most_common(1)[0][0] if formatting_values['font_family'] else 'Times New Roman',
            'font_size_pt': Counter(formatting_values['font_size_pt']).most_common(1)[0][0] if formatting_values['font_size_pt'] else 12,
            'line_spacing': Counter(formatting_values['line_spacing']).most_common(1)[0][0] if formatting_values['line_spacing'] else 1.15,
        }

        # Build the final profile
        profile = {
            'version': '1.0',
            'created_at': datetime.now().isoformat(),
            'analyzed_documents': analyzed_count,
            'source_files': [doc['filename'] for doc in self.documents_data],
            'sections': sections_list,
            'formatting': formatting,
            'metadata': {
                'total_sections_found': len(sections_list),
                'required_sections': len([s for s in sections_list if s['is_required']]),
                'optional_sections': len([s for s in sections_list if not s['is_required']]),
            }
        }

        print(f"StyleProfile built successfully!", file=sys.stderr)
        print(f"  - Total sections: {len(sections_list)}", file=sys.stderr)
        print(f"  - Required: {profile['metadata']['required_sections']}", file=sys.stderr)
        print(f"  - Optional: {profile['metadata']['optional_sections']}", file=sys.stderr)

        return profile


def main():
    """Main entry point."""
    if len(sys.argv) < 3:
        print("Usage: python style_profile_analyzer.py <documents_json> <output_path>", file=sys.stderr)
        print("  documents_json: JSON array of document paths, or path to JSON file", file=sys.stderr)
        print("  output_path: Where to save the StyleProfile JSON", file=sys.stderr)
        sys.exit(1)

    docs_input = sys.argv[1]
    output_path = sys.argv[2]

    # Parse document paths
    try:
        if os.path.isfile(docs_input):
            with open(docs_input, 'r', encoding='utf-8') as f:
                doc_paths = json.load(f)
        else:
            doc_paths = json.loads(docs_input)
    except json.JSONDecodeError as e:
        print(f"Error parsing documents JSON: {e}", file=sys.stderr)
        sys.exit(1)

    if not doc_paths:
        print("No documents provided", file=sys.stderr)
        sys.exit(1)

    print(f"Starting analysis of {len(doc_paths)} documents...", file=sys.stderr)

    # Analyze documents
    analyzer = StyleProfileAnalyzer()
    profile = analyzer.analyze_documents(doc_paths)

    # Save profile
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)
        print(f"StyleProfile saved to: {output_path}", file=sys.stderr)
    except Exception as e:
        print(f"Error saving profile: {e}", file=sys.stderr)
        sys.exit(1)

    # Output the profile as JSON to stdout for Tauri
    print(json.dumps(profile, ensure_ascii=False))

    sys.exit(0)


if __name__ == "__main__":
    main()
