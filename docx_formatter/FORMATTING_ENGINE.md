# DOCX Formatting Engine

## Overview

The DOCX Formatting Engine is a specification-driven system for applying formatting changes to Word documents. It separates the *what* (formatting specification) from the *how* (deterministic application using python-docx).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Formatting Request                       │
│         "Kopfzeile 10pt, Titel 18pt fett, A4 Ränder 25mm"       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LLM (Llama 3.2 3B)                           │
│         Converts natural language → FormatSpec JSON              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       FormatSpec JSON                            │
│  {                                                               │
│    "header": { "content": { "font": { "size_pt": 10 } } },      │
│    "title_page": { "title_font": { "size_pt": 18, "bold": true }}│
│    "page": { "margins": { "top_mm": 25, ... } }                 │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DocxFormatter (python-docx)                   │
│         Applies FormatSpec to DOCX deterministically             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Formatted DOCX Output                         │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. FormatSpec (`format_spec.py`)

The data model defining what formatting changes to apply.

```python
from format_spec import FormatSpec, FontSpec, HeaderSpec

spec = FormatSpec()
spec.header = HeaderSpec(
    enabled=True,
    content=HeaderFooterText(
        center_text="Praxis Dr. Müller",
        font=FontSpec(size_pt=10)
    )
)
```

### 2. DocxFormatter (`docx_formatter.py`)

The engine that applies FormatSpec to documents.

```python
from docx_formatter import format_docx

result = format_docx("input.docx", "output.docx", spec)
print(result.applied_changes)  # {'headers_updated': 1, ...}
```

### 3. LLM Spec Generator (`llm_spec_generator.py`)

Converts natural language requests to FormatSpec JSON.

```python
from llm_spec_generator import generate_spec_prompt, parse_llm_response

prompt = generate_spec_prompt("Kopfzeile 10pt, Seitenzahlen unten")
# Send to LLM, get JSON response
spec, messages = parse_llm_response(llm_response)
```

## FormatSpec JSON Schema

### Document Defaults

```json
{
  "defaults": {
    "font": {
      "name": "Times New Roman",
      "size_pt": 12,
      "bold": false,
      "italic": false
    },
    "paragraph": {
      "line_spacing": 1.5,
      "space_before_pt": 0,
      "space_after_pt": 6,
      "alignment": "justify"
    }
  }
}
```

### Styles

```json
{
  "styles": {
    "Heading1": {
      "font": { "name": "Arial", "size_pt": 16, "bold": true }
    },
    "Heading2": {
      "font": { "name": "Arial", "size_pt": 14, "bold": true }
    },
    "Normal": {
      "font": { "name": "Times New Roman", "size_pt": 12 }
    }
  }
}
```

### Page Layout

```json
{
  "page": {
    "margins": {
      "top_mm": 25,
      "bottom_mm": 25,
      "left_mm": 25,
      "right_mm": 25
    },
    "size": "A4",
    "orientation": "portrait"
  }
}
```

### Header & Footer

```json
{
  "header": {
    "enabled": true,
    "content": {
      "center_text": "Gutachten",
      "font": { "name": "Arial", "size_pt": 10 }
    }
  },
  "footer": {
    "enabled": true,
    "page_number": {
      "enabled": true,
      "format": "Seite 1 von 3",
      "position": "center"
    }
  }
}
```

### Title Page

```json
{
  "title_page": {
    "enabled": true,
    "title_text": "Gutachten über Herrn Müller",
    "subtitle_text": "Neurologisches Gutachten",
    "title_font": {
      "name": "Arial",
      "size_pt": 24,
      "bold": true
    },
    "add_page_break_after": true
  }
}
```

## CLI Usage

```bash
# Show example spec
python format_docx.py --example-spec

# Apply formatting from spec file
python format_docx.py --in input.docx --out output.docx --spec my_spec.json

# Apply formatting from inline JSON
python format_docx.py --in input.docx --out output.docx \
    --spec-json '{"header": {"content": {"center_text": "Test"}}}'

# Validate spec only
python format_docx.py --spec my_spec.json --validate-only
```

## Integration with Tauri App

The `docx_format_tauri.py` script provides integration:

```bash
# Apply formatting from natural language
python docx_format_tauri.py input.docx output.docx --request "Kopfzeile 10pt"

# Check if a request is about formatting
python docx_format_tauri.py --detect-only --request "Mache die Schrift größer"
```

## Supported Formatting Options

| Category | Option | Description |
|----------|--------|-------------|
| **Font** | name | Font family (Arial, Times New Roman, etc.) |
| | size_pt | Font size in points |
| | bold | Bold text |
| | italic | Italic text |
| | underline | Underlined text |
| | color_hex | Font color (hex) |
| **Paragraph** | line_spacing | Line spacing (1.0, 1.15, 1.5, 2.0) |
| | space_before_pt | Space before paragraph |
| | space_after_pt | Space after paragraph |
| | alignment | Text alignment (left, center, right, justify) |
| **Page** | margins | Top, bottom, left, right in mm |
| | size | A4 or Letter |
| | orientation | Portrait or landscape |
| **Header** | enabled | Enable/disable header |
| | content | Left, center, right text |
| | font | Header font settings |
| **Footer** | enabled | Enable/disable footer |
| | content | Left, center, right text |
| | page_number | Page numbering options |
| **Title Page** | enabled | Create title page |
| | title_text | Main title |
| | subtitle_text | Subtitle |
| | title_font | Title font settings |

## Requirements

- Python 3.8+
- python-docx
- llama-cpp-python (for LLM integration)

```bash
pip install python-docx
pip install llama-cpp-python
```

## Error Handling

The formatter returns a `FormattingResult` with:
- `success`: Boolean indicating success
- `applied_changes`: Dict of changes made
- `warnings`: List of non-fatal issues
- `errors`: List of fatal errors

```python
result = format_docx("in.docx", "out.docx", spec)
if not result.success:
    print("Errors:", result.errors)
else:
    print("Changes:", result.applied_changes)
    if result.warnings:
        print("Warnings:", result.warnings)
```
