"""
Style Profile Analyzer for Gutachten Assistant
Analyzes multiple example Gutachten to extract ONLY repeating patterns.

CRITICAL: This script extracts ONLY:
1. Section headings and their order
2. Template phrases that appear in MULTIPLE documents (not patient-specific)
3. Formatting information (font, spacing)

It does NOT extract patient-specific content!

Usage:
    python style_profile_analyzer.py <documents_json> <output_path>
"""

import sys
import os
import json
import re
from datetime import datetime
from collections import Counter, defaultdict
from typing import List, Dict, Set, Optional
import zipfile
from xml.etree import ElementTree as ET

NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
}

# Minimum number of documents a phrase must appear in to be considered a template
MIN_PHRASE_OCCURRENCES = 2


class StyleProfileAnalyzer:
    """Extracts ONLY repeating patterns from Gutachten documents."""

    # Known section headers in German medical reports
    KNOWN_SECTIONS = [
        "ANGABEN ZUR PERSON", "PERSONALIEN", "PATIENTENDATEN",
        "FAMILIENANAMNESE", "EIGENANAMNESE", "SOZIALANAMNESE",
        "ARBEITSANAMNESE", "BERUFSANAMNESE", "VEGETATIVE ANAMNESE",
        "AKTUELLE BESCHWERDEN", "JETZIGE BESCHWERDEN", "AKTUELLE ANAMNESE",
        "SUCHTANAMNESE", "MEDIKAMENTENANAMNESE",
        "VORGESCHICHTE", "KRANKHEITSVORGESCHICHTE", "KRANKENGESCHICHTE",
        "BISHERIGE BEHANDLUNG", "BISHERIGE THERAPIE",
        "BEFUND", "BEFUNDE", "KÖRPERLICHER BEFUND", "SOMATISCHER BEFUND",
        "NEUROLOGISCHER BEFUND", "PSYCHIATRISCHER BEFUND",
        "PSYCHOPATHOLOGISCHER BEFUND", "PSYCHISCHER BEFUND",
        "INTERNISTISCHER BEFUND",
        "APPARATIVE DIAGNOSTIK", "ZUSATZDIAGNOSTIK", "LABORDIAGNOSTIK",
        "LABORWERTE", "LABOR", "BILDGEBUNG", "EEG", "EKG", "MRT", "CT",
        "PSYCHOLOGISCHE TESTUNG", "NEUROPSYCHOLOGISCHE TESTUNG",
        "TESTPSYCHOLOGISCHE UNTERSUCHUNG",
        "DIAGNOSE", "DIAGNOSEN", "BEURTEILUNG", "ZUSAMMENFASSUNG",
        "SOZIALMEDIZINISCHE BEURTEILUNG", "LEISTUNGSBEURTEILUNG",
        "EPIKRISE", "WÜRDIGUNG",
        "PROGNOSE", "THERAPIEEMPFEHLUNG", "EMPFEHLUNG", "EMPFEHLUNGEN",
        "VERLAUF", "KRANKHEITSVERLAUF",
        "MEDIKATION", "MEDIKAMENTE", "AKTUELLE MEDIKATION",
    ]

    def __init__(self):
        self.documents_data: List[Dict] = []

    def analyze_documents(self, doc_paths: List[str]) -> Dict:
        """Analyze documents and extract ONLY repeating patterns."""
        print(f"Analyzing {len(doc_paths)} documents for repeating patterns...", file=sys.stderr)

        total_docs = len(doc_paths)

        for i, doc_path in enumerate(doc_paths):
            print(f"Processing {i+1}/{total_docs}: {os.path.basename(doc_path)}", file=sys.stderr)
            try:
                doc_data = self._analyze_single_document(doc_path)
                if doc_data:
                    self.documents_data.append(doc_data)
            except Exception as e:
                print(f"  Error: {e}", file=sys.stderr)

        return self._build_style_profile(total_docs)

    def _analyze_single_document(self, doc_path: str) -> Optional[Dict]:
        """Extract sections and formatting from a single document."""
        if not os.path.exists(doc_path):
            return None

        try:
            with zipfile.ZipFile(doc_path, 'r') as docx:
                doc_xml = docx.read('word/document.xml').decode('utf-8')
                sections = self._extract_sections(doc_xml)
                formatting = self._extract_formatting(doc_xml)

                return {
                    'filename': os.path.basename(doc_path),
                    'sections': sections,
                    'formatting': formatting,
                }
        except Exception as e:
            print(f"  Error reading: {e}", file=sys.stderr)
            return None

    def _extract_sections(self, doc_xml: str) -> List[Dict]:
        """Extract section headings from document."""
        sections = []

        try:
            root = ET.fromstring(doc_xml)
            body = root.find('.//w:body', NAMESPACES)
            if body is None:
                return sections

            for para in body.findall('.//w:p', NAMESPACES):
                para_text = self._get_paragraph_text(para)
                if self._is_heading_paragraph(para, para_text):
                    heading = para_text.strip()
                    if heading:
                        normalized = self._normalize_heading(heading)
                        sections.append({
                            'original': heading,
                            'normalized': normalized,
                            'order': len(sections),
                        })

        except ET.ParseError:
            pass

        return sections

    def _get_paragraph_text(self, para) -> str:
        """Get text content of a paragraph."""
        texts = []
        for t in para.findall('.//w:t', NAMESPACES):
            if t.text:
                texts.append(t.text)
        return ''.join(texts)

    def _is_heading_paragraph(self, para, para_text: str) -> bool:
        """Check if paragraph is a section heading."""
        text = para_text.strip().upper()

        # Match known sections
        for known in self.KNOWN_SECTIONS:
            if known in text or text in known:
                return True

        # Check for heading style
        pStyle = para.find('.//w:pStyle', NAMESPACES)
        if pStyle is not None:
            style_val = pStyle.get(f'{{{NAMESPACES["w"]}}}val', '')
            if 'heading' in style_val.lower() or 'berschrift' in style_val.lower():
                return True

        # Bold + short + uppercase pattern
        is_bold = para.find('.//w:b', NAMESPACES) is not None
        is_short = len(para_text.strip()) < 60
        is_upper = para_text.strip().isupper()

        if is_bold and is_short and is_upper:
            return True

        # Numbered sections
        if re.match(r'^[IVX]+\.|^\d+\.', para_text.strip()) and is_short:
            return True

        return False

    def _normalize_heading(self, heading: str) -> str:
        """Normalize heading for comparison."""
        text = re.sub(r'^[IVX]+\.\s*', '', heading)
        text = re.sub(r'^\d+\.\s*', '', text)
        text = text.upper().strip()
        text = re.sub(r'[:\-–]$', '', text).strip()
        return text

    def _extract_formatting(self, doc_xml: str) -> Dict:
        """Extract formatting information."""
        formatting = {
            'font_family': 'Times New Roman',
            'font_size_pt': 12,
            'line_spacing': 1.15,
        }

        font_match = re.search(r'w:ascii="([^"]+)"', doc_xml)
        if font_match:
            formatting['font_family'] = font_match.group(1)

        size_match = re.search(r'<w:sz[^>]*w:val="(\d+)"', doc_xml)
        if size_match:
            formatting['font_size_pt'] = int(size_match.group(1)) / 2

        return formatting

    def _build_style_profile(self, total_docs: int) -> Dict:
        """Build StyleProfile with ONLY repeating patterns."""
        print(f"\nBuilding StyleProfile from {len(self.documents_data)} documents...", file=sys.stderr)

        # Count section occurrences across documents
        section_occurrences: Dict[str, int] = Counter()
        section_original_names: Dict[str, List[str]] = defaultdict(list)
        section_orders: Dict[str, List[int]] = defaultdict(list)

        for doc in self.documents_data:
            seen_in_doc: Set[str] = set()
            for section in doc['sections']:
                normalized = section['normalized']
                if normalized not in seen_in_doc:
                    section_occurrences[normalized] += 1
                    seen_in_doc.add(normalized)
                section_original_names[normalized].append(section['original'])
                section_orders[normalized].append(section['order'])

        # Build sections list
        analyzed_count = len(self.documents_data)
        sections_list = []

        for normalized, count in section_occurrences.items():
            # Required if in >= 80% of documents
            is_required = count >= (analyzed_count * 0.8)

            # Most common original name
            original_names = section_original_names[normalized]
            display_name = Counter(original_names).most_common(1)[0][0] if original_names else normalized

            # Average order
            orders = section_orders[normalized]
            avg_order = sum(orders) / len(orders) if orders else 0

            sections_list.append({
                'normalized_name': normalized,
                'display_name': display_name,
                'is_required': is_required,
                'occurrence_count': count,
                'occurrence_percentage': round(count / analyzed_count * 100, 1),
                'average_order': round(avg_order, 1),
            })

        # Sort by average order
        sections_list.sort(key=lambda x: x['average_order'])
        for i, section in enumerate(sections_list):
            section['order'] = i

        # Aggregate formatting
        font_families = [d['formatting']['font_family'] for d in self.documents_data if d.get('formatting')]
        font_sizes = [d['formatting']['font_size_pt'] for d in self.documents_data if d.get('formatting')]

        formatting = {
            'font_family': Counter(font_families).most_common(1)[0][0] if font_families else 'Times New Roman',
            'font_size_pt': Counter(font_sizes).most_common(1)[0][0] if font_sizes else 12,
            'line_spacing': 1.15,
        }

        profile = {
            'version': '2.0',
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

        print(f"StyleProfile created:", file=sys.stderr)
        print(f"  - {len(sections_list)} sections", file=sys.stderr)
        print(f"  - {profile['metadata']['required_sections']} required", file=sys.stderr)
        print(f"  - {profile['metadata']['optional_sections']} optional", file=sys.stderr)

        return profile


def main():
    if len(sys.argv) < 3:
        print("Usage: python style_profile_analyzer.py <documents_json> <output_path>", file=sys.stderr)
        sys.exit(1)

    docs_input = sys.argv[1]
    output_path = sys.argv[2]

    try:
        if os.path.isfile(docs_input):
            with open(docs_input, 'r', encoding='utf-8') as f:
                doc_paths = json.load(f)
        else:
            doc_paths = json.loads(docs_input)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}", file=sys.stderr)
        sys.exit(1)

    if not doc_paths:
        print("No documents provided", file=sys.stderr)
        sys.exit(1)

    analyzer = StyleProfileAnalyzer()
    profile = analyzer.analyze_documents(doc_paths)

    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)
        print(f"Saved to: {output_path}", file=sys.stderr)
    except Exception as e:
        print(f"Error saving: {e}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(profile, ensure_ascii=False))


if __name__ == "__main__":
    main()
