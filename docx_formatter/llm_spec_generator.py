"""
LLM Spec Generator - Converts natural language formatting requests to FormatSpec JSON.

This module provides:
1. A prompt template for the LLM to generate valid FormatSpec JSON
2. Validation and repair of LLM output
3. Integration with the Gutachten Assistant workflow
"""

import json
import re
from typing import Optional, Tuple, Dict, Any

from format_spec import FormatSpec, validate_spec


# Prompt template for LLM to generate FormatSpec JSON
LLM_SPEC_PROMPT_TEMPLATE = '''Du bist ein Assistent für die Formatierung von Word-Dokumenten.
Der Benutzer wird eine Formatierungsanfrage auf Deutsch stellen.
Du musst ein JSON-Objekt ausgeben, das die gewünschten Formatierungsänderungen beschreibt.

WICHTIG: Gib NUR gültiges JSON aus. Keine Erklärungen, keine Kommentare, nur JSON.

JSON-SCHEMA (FormatSpec):

{{
  "spec_version": "1.0",
  "scope": "whole_document",  // oder "body_only", "tables_only", "styles_only"

  "defaults": {{
    "font": {{
      "name": "Schriftart",      // z.B. "Times New Roman", "Arial"
      "size_pt": 12,             // Schriftgröße in Punkt
      "bold": false,             // Fett
      "italic": false            // Kursiv
    }},
    "paragraph": {{
      "line_spacing": 1.5,       // Zeilenabstand: 1.0, 1.15, 1.5, 2.0
      "space_after_pt": 6        // Abstand nach Absatz in Punkt
    }}
  }},

  "styles": {{
    "Heading1": {{
      "font": {{ "name": "Arial", "size_pt": 16, "bold": true }}
    }},
    "Heading2": {{
      "font": {{ "name": "Arial", "size_pt": 14, "bold": true }}
    }}
  }},

  "page": {{
    "margins": {{
      "top_mm": 25,
      "bottom_mm": 25,
      "left_mm": 25,
      "right_mm": 25
    }},
    "size": "A4"               // "A4" oder "Letter"
  }},

  "header": {{
    "enabled": true,
    "content": {{
      "center_text": "Kopfzeilentext",
      "font": {{ "name": "Arial", "size_pt": 10 }}
    }}
  }},

  "footer": {{
    "enabled": true,
    "page_number": {{
      "enabled": true,
      "format": "Seite 1 von 3",  // "1", "1/3", "Page 1 of 3", "Seite 1 von 3"
      "position": "center"        // "left", "center", "right"
    }}
  }},

  "title_page": {{
    "enabled": true,
    "title_text": "Titel des Dokuments",
    "subtitle_text": "Untertitel",
    "title_font": {{ "name": "Arial", "size_pt": 24, "bold": true }},
    "add_page_break_after": true
  }}
}}

BEISPIELE:

Benutzer: "Alles in Times New Roman 12, Überschriften 14 fett, A4 mit 25mm Rand"
JSON:
{{
  "spec_version": "1.0",
  "defaults": {{
    "font": {{ "name": "Times New Roman", "size_pt": 12 }}
  }},
  "styles": {{
    "Heading1": {{ "font": {{ "name": "Times New Roman", "size_pt": 14, "bold": true }} }},
    "Heading2": {{ "font": {{ "name": "Times New Roman", "size_pt": 14, "bold": true }} }}
  }},
  "page": {{
    "margins": {{ "top_mm": 25, "bottom_mm": 25, "left_mm": 25, "right_mm": 25 }},
    "size": "A4"
  }}
}}

Benutzer: "Kopfzeile 10pt mit Praxisname links, Seitenzahlen unten mittig"
JSON:
{{
  "spec_version": "1.0",
  "header": {{
    "enabled": true,
    "content": {{
      "left_text": "Praxisname",
      "font": {{ "size_pt": 10 }}
    }}
  }},
  "footer": {{
    "enabled": true,
    "page_number": {{ "enabled": true, "format": "1", "position": "center" }}
  }}
}}

Benutzer: "Erstelle eine Titelseite mit 'Gutachten über Herrn Müller' als Titel, fett und 18pt"
JSON:
{{
  "spec_version": "1.0",
  "title_page": {{
    "enabled": true,
    "title_text": "Gutachten über Herrn Müller",
    "title_font": {{ "size_pt": 18, "bold": true }},
    "add_page_break_after": true
  }}
}}

JETZT: Analysiere die folgende Benutzeranfrage und gib NUR das JSON aus:

Benutzeranfrage: "{user_request}"

JSON:'''


def extract_json_from_response(response: str) -> Optional[str]:
    """
    Extract JSON from LLM response, handling various formats.
    """
    # Try to find JSON in the response
    response = response.strip()

    # If response starts with {, assume it's JSON
    if response.startswith('{'):
        # Find matching closing brace
        depth = 0
        end_idx = 0
        for i, char in enumerate(response):
            if char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
                if depth == 0:
                    end_idx = i + 1
                    break
        if end_idx > 0:
            return response[:end_idx]

    # Try to find JSON block
    json_match = re.search(r'\{[\s\S]*\}', response)
    if json_match:
        return json_match.group()

    return None


def parse_llm_response(response: str) -> Tuple[Optional[FormatSpec], list]:
    """
    Parse LLM response into FormatSpec.

    Returns:
        Tuple of (FormatSpec or None, list of errors/warnings)
    """
    messages = []

    # Extract JSON
    json_str = extract_json_from_response(response)
    if not json_str:
        messages.append("ERROR: No valid JSON found in response")
        return None, messages

    # Parse JSON
    try:
        spec_dict = json.loads(json_str)
    except json.JSONDecodeError as e:
        messages.append(f"ERROR: Invalid JSON: {e}")
        # Try to repair common issues
        repaired = repair_json(json_str)
        if repaired:
            try:
                spec_dict = json.loads(repaired)
                messages.append("WARNING: JSON was repaired")
            except:
                return None, messages
        else:
            return None, messages

    # Validate spec
    errors = validate_spec(spec_dict)
    if errors:
        for error in errors:
            messages.append(f"WARNING: {error}")
        # Continue anyway, try to use what we got

    # Parse into FormatSpec
    try:
        spec = FormatSpec.from_dict(spec_dict)
        return spec, messages
    except Exception as e:
        messages.append(f"ERROR: Could not create FormatSpec: {e}")
        return None, messages


def repair_json(json_str: str) -> Optional[str]:
    """
    Attempt to repair common JSON issues.
    """
    # Remove trailing commas before } or ]
    repaired = re.sub(r',\s*([}\]])', r'\1', json_str)

    # Remove comments
    repaired = re.sub(r'//.*$', '', repaired, flags=re.MULTILINE)

    # Try to fix unquoted keys (very basic)
    repaired = re.sub(r'(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', repaired)

    return repaired


def generate_spec_prompt(user_request: str) -> str:
    """
    Generate a prompt for the LLM to create a FormatSpec.
    """
    return LLM_SPEC_PROMPT_TEMPLATE.format(user_request=user_request)


def is_formatting_request(text: str) -> bool:
    """
    Detect if a user message is a formatting request (vs. a text edit request).
    """
    formatting_keywords = [
        # German
        'schriftart', 'schriftgröße', 'schrift', 'font', 'pt', 'punkt',
        'fett', 'bold', 'kursiv', 'italic', 'unterstrichen',
        'kopfzeile', 'header', 'fußzeile', 'footer',
        'seitenzahl', 'seite', 'page',
        'rand', 'margin', 'ränder', 'margins',
        'zeilenabstand', 'spacing', 'abstand',
        'titelseite', 'title page', 'deckblatt',
        'überschrift', 'heading', 'formatierung', 'formatieren',
        'arial', 'times new roman', 'calibri',
        'a4', 'letter',
        # Common patterns
        r'\d+\s*pt', r'\d+\s*mm',
    ]

    text_lower = text.lower()

    for keyword in formatting_keywords:
        if keyword.startswith('r'):
            # Regex pattern
            if re.search(keyword[1:], text_lower):
                return True
        elif keyword in text_lower:
            return True

    return False


# Example usage and testing
if __name__ == '__main__':
    # Test the prompt generator
    test_requests = [
        "Alles in Arial 11pt, Überschriften 14pt fett",
        "Kopfzeile mit 'Praxis Dr. Müller' in 10pt, Seitenzahlen unten rechts",
        "Erstelle eine Titelseite mit 'Gutachten' als Titel, 24pt fett",
        "Ränder auf 30mm, Zeilenabstand 1.5"
    ]

    for request in test_requests:
        print(f"\nRequest: {request}")
        print("-" * 50)
        print("Is formatting request:", is_formatting_request(request))
        print("\nGenerated prompt (first 500 chars):")
        prompt = generate_spec_prompt(request)
        print(prompt[:500] + "...")
