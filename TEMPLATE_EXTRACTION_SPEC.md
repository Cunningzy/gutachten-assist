# Template Extraction & DOCX Rendering Specification

## Overview

This system extracts a reusable template from 10-100 example Gutachten documents, then uses it to render new documents from LLM-structured content.

**Key Principle:** LLM only cleans and structures text into slots. All formatting is deterministic via python-docx.

---

## Phase 0 — Ingest

**Input:** 10-100 .docx Gutachten (same practice/template family)
**Output:** DocProfile JSON per file

For each DOCX, extract:
- Paragraphs in order with:
  - raw text
  - style name (paragraph style)
  - outline/heading level (infer from style or numbering)
  - list/numbering info (best-effort)
  - spacing/indents (if accessible)
- Headers/footers (Kopfzeile/Fußzeile) per section
- Save as JSON DocProfile (never re-parse during tuning)

**Output file:** `doc_profiles/{filename}.json`

---

## Phase 0.5 — Template Family Clustering (NEW)

**Why:** Users often upload 2-3 slightly different templates (old/new letterhead, different numbering).

**Process:**
1. Cluster documents by:
   - Style histogram (which styles used, how often)
   - Anchor fingerprints (which headings appear)
   - Header/footer content similarity
2. Produce one TemplateSpec per family
3. Let user choose default family

**Output:** `template_families.json` with cluster assignments

---

## Phase 1 — Normalize Text

Create normalized variants for boilerplate comparison:

| Variant | Transformation |
|---------|----------------|
| `norm_basic` | lowercase, trim, collapse whitespace, unify punctuation |
| `norm_no_dates` | replace dates (27.11.2025, 2025-11-27) with `<DATE>` |
| `norm_no_ids` | replace Aktenzeichen, Versicherungsnr with `<ID>` |
| `norm_no_names` | **Conservative only:** replace "Herr/Frau + Word", "geb. + DATE" patterns |

**Important:** Don't over-normalize names. German medical texts have many capitalized terms (Diagnosen, Medikamente). Only replace clear patterns.

Keep original text alongside normalized variants.

---

## Phase 2 — Find Boilerplate Blocks

### 2A) Paragraph Fingerprinting

For each paragraph, compute:
```
fingerprint = (style_name, sha1(norm_no_dates))
```

Count occurrences across all documents in the template family.

### 2B) Fixed vs Variable Classification

Mark as **FixedBlock** if:
- Appears in ≥85-90% of documents (configurable threshold)
- Text length > minimal threshold (avoid ":" etc.)
- Style is stable (or small set of variants)

Everything else is **candidate variable** (Slot content).

### 2C) Sequence Detection (n-grams)

Detect runs of 2-10 paragraphs that appear together:
- Build sequences of paragraph fingerprints
- Keep sequences appearing in most documents

This yields blocks like "Fragestellung heading + standard intro paragraph".

**Output:** Set of FixedBlocks with:
- Ordered sequence of paragraph signatures
- Preferred style per paragraph
- Typical spacing

---

## Phase 3 — Define Section Slots

### 3A) Identify Anchors

Choose stable anchors from FixedBlocks as section boundaries:
- "Fragestellung"
- "Familienanamnese"
- "Eigenanamnese"
- "Aktuelle Beschwerden"
- "Befund"
- "Diagnosen"
- "Beurteilung"

**Fuzzy Anchor Matching (NEW):**

Store anchors with matching configuration:
```json
{
  "anchor_text": "Aktuelle Beschwerden",
  "match_mode": "fuzzy",
  "min_similarity": 0.88,
  "variants_seen": ["Aktuelle Beschwerden:", "Aktuelle Beschwerden -", "Aktuelle Beschwerden"]
}
```

Match modes: `exact` | `normalized` | `fuzzy` (Levenshtein/token Jaccard)

### 3B) Build Template Skeleton

Construct ordered skeleton:
```
FixedBlock A (e.g., header boilerplate)
  ↓
Slot S1 (fragestellung_body)
  ↓
FixedBlock B (e.g., "1. Anamnese" heading)
  ↓
Slot S2 (anamnese_body)
  ↓
...
```

For each Slot, store:
- `slot_id` (e.g., "familienanamnese_body")
- `expected_section_name`
- `allowed_styles` (usually body text style)
- `list_behavior` (bullets allowed? numbering?)
- `optional` (true if section can be missing)

**Output:** TemplateSkeleton

---

## Phase 4 — Extract Formatting Rules

### 4A) Style Map

From reference document (or consensus), determine most common styles for:
- Main heading (H1)
- Subheading (H2)
- Body text (BODY)
- Bullet list (BULLET)
- Table text (if any)

Store as role → style name mapping:
```json
{
  "H1": "Heading 1",
  "H2": "Heading 2",
  "BODY": "Normal",
  "BULLET": "List Bullet"
}
```

### 4B) Numbering Strategy

**Decision: Manual numbering in headings** (most robust)

- Headings contain number in text: "1. Anamnese", "1.1 Familienanamnese"
- Avoid Word auto-numbering (causes renumbering chaos)
- Define heading styles with correct spacing/indentation in base template

### 4C) Kopfzeile/Fußzeile

Extract header/footer content:
- Left/center/right sections
- Logo placeholder (if present)
- Practice name, address, contact info

---

## Phase 5 — Output: TemplateSpec

Save per template family:

### `template_spec.json`
```json
{
  "version": "1.0",
  "created_at": "2026-01-27T12:00:00Z",
  "family_id": "family_001",
  "family_name": "Standard Gutachten 2024",

  "anchors": [
    {
      "id": "fragestellung",
      "text": "Fragestellung",
      "match_mode": "fuzzy",
      "min_similarity": 0.88,
      "variants_seen": ["Fragestellung", "Fragestellung:"]
    }
  ],

  "skeleton": [
    {
      "type": "fixed",
      "paragraphs": [
        {"text": "GUTACHTEN", "style": "Title"},
        {"text": "", "style": "Normal"}
      ]
    },
    {
      "type": "slot",
      "slot_id": "fragestellung_body",
      "section_name": "Fragestellung",
      "allowed_styles": ["BODY"],
      "list_behavior": "none",
      "optional": false
    },
    {
      "type": "fixed",
      "paragraphs": [
        {"text": "1. Anamnese", "style": "H1"}
      ]
    },
    {
      "type": "slot",
      "slot_id": "anamnese_body",
      "section_name": "Anamnese",
      "allowed_styles": ["BODY", "BULLET"],
      "list_behavior": "bullets_allowed",
      "optional": false
    }
  ],

  "style_roles": {
    "H1": "Heading 1",
    "H2": "Heading 2",
    "BODY": "Normal",
    "BULLET": "List Bullet",
    "TITLE": "Title"
  },

  "kopfzeile": {
    "left": "Dr. med. Max Mustermann\nFacharzt für Innere Medizin",
    "center": "",
    "right": "Musterstraße 1\n12345 Musterstadt"
  },

  "render_rules": {
    "spacing_after_heading": 12,
    "spacing_after_paragraph": 6,
    "blank_line_before_section": true
  },

  "quality_metrics": {
    "documents_analyzed": 47,
    "boilerplate_coverage": 0.91,
    "conflicts_found": 3
  }
}
```

### `base_template.docx`
- Empty document with all style definitions
- Kopfzeile/Fußzeile set up
- Page margins configured
- Manual numbering styles ready

---

## Runtime: Per-Dictation Flow

### Step 1: Whisper Transcription
```
Audio → Whisper → Raw German text with dictation tokens
```

### Step 2: LLM Structuring (Qwen2.5-7B-Instruct)

**Input:** Raw transcript
**Output:** content.json

```json
{
  "slots": {
    "fragestellung_body": [
      "Die Begutachtung erfolgt auf Veranlassung der DRV Bund."
    ],
    "anamnese_body": [
      "Der Patient berichtet über Beschwerden seit 2019.",
      "Eine Operation wurde {unclear:im Jahr 2020 oder 2021} durchgeführt."
    ],
    "aktuelle_beschwerden_body": [
      "Aktuell klagt der Patient über {unclear:Schmerzen im Bereich des} Rückens."
    ]
  },
  "unclear_spans": [
    {
      "slot_id": "anamnese_body",
      "text": "im Jahr 2020 oder 2021",
      "reason": "ambiguous_date"
    },
    {
      "slot_id": "aktuelle_beschwerden_body",
      "text": "Schmerzen im Bereich des",
      "reason": "garbled_transcription"
    }
  ],
  "missing_slots": ["familienanamnese_body"]
}
```

**LLM Rules:**
- Use ONLY content from input transcript
- NEVER add medical facts, diagnoses, conclusions
- Convert dictation tokens (Punkt→., Absatz→new paragraph)
- Fix spelling/grammar with minimal changes
- Mark uncertain text with `{unclear:...}`
- Output empty array or list in `missing_slots` if section not in transcript
- Output ONLY valid JSON

### Step 3: DOCX Rendering

**Input:** template_spec.json + base_template.docx + content.json
**Output:** Final Gutachten.docx

Process:
1. Load base_template.docx
2. Walk skeleton in order:
   - FixedBlock → write paragraphs exactly as specified
   - Slot → fill with content.json[slot_id], apply styles
3. For `{unclear:...}` text → apply yellow highlight
4. For missing_slots → leave empty or insert placeholder "[Abschnitt fehlt]"
5. Insert Kopfzeile/Fußzeile
6. Save as .docx

---

## File Structure

```
template_extraction/
├── template_extractor.py      # Phases 0-5
├── doc_profiles/              # Phase 0 output
│   ├── gutachten_001.json
│   ├── gutachten_002.json
│   └── ...
├── template_families.json     # Phase 0.5 output
├── templates/
│   ├── family_001/
│   │   ├── template_spec.json
│   │   └── base_template.docx
│   └── family_002/
│       ├── template_spec.json
│       └── base_template.docx
├── qwen_structurer.py         # LLM content structuring
└── docx_renderer.py           # Final DOCX generation
```

---

## Quality & Conflicts Report

After extraction, generate report:
- Paragraphs that should be fixed but differ in 5-10% of docs
- Style mismatches across documents
- Missing anchors in some documents
- Suggested threshold adjustments

Let user review and adjust before finalizing template.
