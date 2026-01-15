"""
FormatSpec - Data model for DOCX formatting specifications.
This defines the contract between the LLM (which generates specs) and the formatter (which applies them).
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from enum import Enum
import json


class Scope(Enum):
    WHOLE_DOCUMENT = "whole_document"
    BODY_ONLY = "body_only"
    TABLES_ONLY = "tables_only"
    STYLES_ONLY = "styles_only"


class PageOrientation(Enum):
    PORTRAIT = "portrait"
    LANDSCAPE = "landscape"


class PageSize(Enum):
    A4 = "A4"
    LETTER = "Letter"


class BorderStyle(Enum):
    NONE = "none"
    SINGLE = "single"


@dataclass
class FontSpec:
    """Font specification"""
    name: Optional[str] = None  # e.g., "Times New Roman", "Arial"
    size_pt: Optional[float] = None  # e.g., 12
    bold: Optional[bool] = None
    italic: Optional[bool] = None
    underline: Optional[bool] = None
    color_hex: Optional[str] = None  # e.g., "000000" for black


@dataclass
class ParagraphSpec:
    """Paragraph formatting specification"""
    line_spacing: Optional[float] = None  # 1.0, 1.15, 1.5, 2.0
    space_before_pt: Optional[float] = None
    space_after_pt: Optional[float] = None
    alignment: Optional[str] = None  # "left", "center", "right", "justify"
    first_line_indent_mm: Optional[float] = None


@dataclass
class StyleSpec:
    """Style specification for Word styles"""
    font: Optional[FontSpec] = None
    paragraph: Optional[ParagraphSpec] = None


@dataclass
class DefaultsSpec:
    """Document-wide default settings"""
    font: Optional[FontSpec] = None
    paragraph: Optional[ParagraphSpec] = None


@dataclass
class HeadingNormalizationRule:
    """Rule for detecting and normalizing headings"""
    condition: str  # Description of condition
    min_font_size: Optional[float] = None
    max_length: Optional[int] = None
    is_bold: Optional[bool] = None
    numbering_pattern: Optional[str] = None  # Regex pattern like r"^\d+\."
    target_style: str = "Heading1"  # Target Word style


@dataclass
class HeadingNormalization:
    """Settings for automatic heading detection and normalization"""
    enabled: bool = False
    rules: List[HeadingNormalizationRule] = field(default_factory=list)


@dataclass
class PageMargins:
    """Page margin settings in millimeters"""
    top_mm: Optional[float] = None
    bottom_mm: Optional[float] = None
    left_mm: Optional[float] = None
    right_mm: Optional[float] = None


@dataclass
class PageSpec:
    """Page layout specification"""
    margins: Optional[PageMargins] = None
    orientation: Optional[str] = None  # "portrait" or "landscape"
    size: Optional[str] = None  # "A4" or "Letter"


@dataclass
class HeaderFooterText:
    """Header or footer text specification"""
    left_text: Optional[str] = None
    center_text: Optional[str] = None
    right_text: Optional[str] = None
    font: Optional[FontSpec] = None


@dataclass
class PageNumberSpec:
    """Page number specification"""
    enabled: bool = False
    format: str = "1"  # "1", "1/3", "Page 1 of 3", "Seite 1 von 3"
    position: str = "center"  # "left", "center", "right"


@dataclass
class HeaderSpec:
    """Document header specification"""
    enabled: bool = True
    content: Optional[HeaderFooterText] = None


@dataclass
class FooterSpec:
    """Document footer specification"""
    enabled: bool = True
    content: Optional[HeaderFooterText] = None
    page_number: Optional[PageNumberSpec] = None


@dataclass
class TableSpec:
    """Table formatting specification"""
    default_font_name: Optional[str] = None
    default_font_size_pt: Optional[float] = None
    borders: Optional[str] = None  # "none" or "single"
    header_row_bold: bool = False


@dataclass
class ListSpec:
    """List formatting specification"""
    normalize: bool = False  # Light normalization


@dataclass
class TitlePageSpec:
    """Title page specification"""
    enabled: bool = False
    title_text: Optional[str] = None
    subtitle_text: Optional[str] = None
    author_text: Optional[str] = None
    date_text: Optional[str] = None
    title_font: Optional[FontSpec] = None
    add_page_break_after: bool = True


@dataclass
class FormatSpec:
    """
    Complete formatting specification for a DOCX document.
    This is the contract between the LLM and the formatter.
    """
    # Metadata
    spec_version: str = "1.0"
    created_by: str = "gutachten-assistant"

    # Scope
    scope: str = "whole_document"  # whole_document, body_only, tables_only, styles_only

    # Document defaults
    defaults: Optional[DefaultsSpec] = None

    # Style definitions
    styles: Dict[str, StyleSpec] = field(default_factory=dict)
    # Common keys: "Normal", "Heading1", "Heading2", "Heading3", "Title", "Subtitle"

    # Heading normalization
    normalize_headings: Optional[HeadingNormalization] = None

    # Page layout
    page: Optional[PageSpec] = None

    # Header and footer
    header: Optional[HeaderSpec] = None
    footer: Optional[FooterSpec] = None

    # Tables
    tables: Optional[TableSpec] = None

    # Lists
    lists: Optional[ListSpec] = None

    # Title page
    title_page: Optional[TitlePageSpec] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        def convert(obj):
            if obj is None:
                return None
            if isinstance(obj, Enum):
                return obj.value
            if hasattr(obj, '__dataclass_fields__'):
                return {k: convert(v) for k, v in obj.__dict__.items() if v is not None}
            if isinstance(obj, dict):
                return {k: convert(v) for k, v in obj.items() if v is not None}
            if isinstance(obj, list):
                return [convert(i) for i in obj]
            return obj
        return convert(self)

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string"""
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'FormatSpec':
        """Create FormatSpec from dictionary"""

        def parse_font(d: Optional[Dict]) -> Optional[FontSpec]:
            if not d:
                return None
            return FontSpec(**{k: v for k, v in d.items() if k in FontSpec.__dataclass_fields__})

        def parse_paragraph(d: Optional[Dict]) -> Optional[ParagraphSpec]:
            if not d:
                return None
            return ParagraphSpec(**{k: v for k, v in d.items() if k in ParagraphSpec.__dataclass_fields__})

        def parse_style(d: Optional[Dict]) -> Optional[StyleSpec]:
            if not d:
                return None
            return StyleSpec(
                font=parse_font(d.get('font')),
                paragraph=parse_paragraph(d.get('paragraph'))
            )

        spec = cls()
        spec.spec_version = data.get('spec_version', '1.0')
        spec.created_by = data.get('created_by', 'gutachten-assistant')
        spec.scope = data.get('scope', 'whole_document')

        # Parse defaults
        if 'defaults' in data and data['defaults']:
            spec.defaults = DefaultsSpec(
                font=parse_font(data['defaults'].get('font')),
                paragraph=parse_paragraph(data['defaults'].get('paragraph'))
            )

        # Parse styles
        if 'styles' in data and data['styles']:
            spec.styles = {name: parse_style(style) for name, style in data['styles'].items()}

        # Parse page
        if 'page' in data and data['page']:
            page_data = data['page']
            margins = None
            if 'margins' in page_data and page_data['margins']:
                margins = PageMargins(**page_data['margins'])
            spec.page = PageSpec(
                margins=margins,
                orientation=page_data.get('orientation'),
                size=page_data.get('size')
            )

        # Parse header
        if 'header' in data and data['header']:
            header_data = data['header']
            content = None
            if 'content' in header_data and header_data['content']:
                content_data = header_data['content']
                content = HeaderFooterText(
                    left_text=content_data.get('left_text'),
                    center_text=content_data.get('center_text'),
                    right_text=content_data.get('right_text'),
                    font=parse_font(content_data.get('font'))
                )
            spec.header = HeaderSpec(
                enabled=header_data.get('enabled', True),
                content=content
            )

        # Parse footer
        if 'footer' in data and data['footer']:
            footer_data = data['footer']
            content = None
            if 'content' in footer_data and footer_data['content']:
                content_data = footer_data['content']
                content = HeaderFooterText(
                    left_text=content_data.get('left_text'),
                    center_text=content_data.get('center_text'),
                    right_text=content_data.get('right_text'),
                    font=parse_font(content_data.get('font'))
                )
            page_number = None
            if 'page_number' in footer_data and footer_data['page_number']:
                pn_data = footer_data['page_number']
                page_number = PageNumberSpec(
                    enabled=pn_data.get('enabled', False),
                    format=pn_data.get('format', '1'),
                    position=pn_data.get('position', 'center')
                )
            spec.footer = FooterSpec(
                enabled=footer_data.get('enabled', True),
                content=content,
                page_number=page_number
            )

        # Parse tables
        if 'tables' in data and data['tables']:
            spec.tables = TableSpec(**{k: v for k, v in data['tables'].items() if k in TableSpec.__dataclass_fields__})

        # Parse lists
        if 'lists' in data and data['lists']:
            spec.lists = ListSpec(**{k: v for k, v in data['lists'].items() if k in ListSpec.__dataclass_fields__})

        # Parse title page
        if 'title_page' in data and data['title_page']:
            tp_data = data['title_page']
            spec.title_page = TitlePageSpec(
                enabled=tp_data.get('enabled', False),
                title_text=tp_data.get('title_text'),
                subtitle_text=tp_data.get('subtitle_text'),
                author_text=tp_data.get('author_text'),
                date_text=tp_data.get('date_text'),
                title_font=parse_font(tp_data.get('title_font')),
                add_page_break_after=tp_data.get('add_page_break_after', True)
            )

        return spec

    @classmethod
    def from_json(cls, json_str: str) -> 'FormatSpec':
        """Create FormatSpec from JSON string"""
        data = json.loads(json_str)
        return cls.from_dict(data)


# JSON Schema for validation (as a Python dict)
FORMAT_SPEC_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "FormatSpec",
    "description": "DOCX formatting specification",
    "type": "object",
    "properties": {
        "spec_version": {"type": "string", "default": "1.0"},
        "created_by": {"type": "string"},
        "scope": {
            "type": "string",
            "enum": ["whole_document", "body_only", "tables_only", "styles_only"],
            "default": "whole_document"
        },
        "defaults": {
            "type": "object",
            "properties": {
                "font": {"$ref": "#/definitions/font"},
                "paragraph": {"$ref": "#/definitions/paragraph"}
            }
        },
        "styles": {
            "type": "object",
            "additionalProperties": {
                "type": "object",
                "properties": {
                    "font": {"$ref": "#/definitions/font"},
                    "paragraph": {"$ref": "#/definitions/paragraph"}
                }
            }
        },
        "page": {
            "type": "object",
            "properties": {
                "margins": {
                    "type": "object",
                    "properties": {
                        "top_mm": {"type": "number"},
                        "bottom_mm": {"type": "number"},
                        "left_mm": {"type": "number"},
                        "right_mm": {"type": "number"}
                    }
                },
                "orientation": {"type": "string", "enum": ["portrait", "landscape"]},
                "size": {"type": "string", "enum": ["A4", "Letter"]}
            }
        },
        "header": {
            "type": "object",
            "properties": {
                "enabled": {"type": "boolean", "default": True},
                "content": {"$ref": "#/definitions/header_footer_content"}
            }
        },
        "footer": {
            "type": "object",
            "properties": {
                "enabled": {"type": "boolean", "default": True},
                "content": {"$ref": "#/definitions/header_footer_content"},
                "page_number": {
                    "type": "object",
                    "properties": {
                        "enabled": {"type": "boolean"},
                        "format": {"type": "string"},
                        "position": {"type": "string", "enum": ["left", "center", "right"]}
                    }
                }
            }
        },
        "tables": {
            "type": "object",
            "properties": {
                "default_font_name": {"type": "string"},
                "default_font_size_pt": {"type": "number"},
                "borders": {"type": "string", "enum": ["none", "single"]},
                "header_row_bold": {"type": "boolean"}
            }
        },
        "lists": {
            "type": "object",
            "properties": {
                "normalize": {"type": "boolean"}
            }
        },
        "title_page": {
            "type": "object",
            "properties": {
                "enabled": {"type": "boolean"},
                "title_text": {"type": "string"},
                "subtitle_text": {"type": "string"},
                "author_text": {"type": "string"},
                "date_text": {"type": "string"},
                "title_font": {"$ref": "#/definitions/font"},
                "add_page_break_after": {"type": "boolean"}
            }
        }
    },
    "definitions": {
        "font": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "size_pt": {"type": "number"},
                "bold": {"type": "boolean"},
                "italic": {"type": "boolean"},
                "underline": {"type": "boolean"},
                "color_hex": {"type": "string", "pattern": "^[0-9A-Fa-f]{6}$"}
            }
        },
        "paragraph": {
            "type": "object",
            "properties": {
                "line_spacing": {"type": "number"},
                "space_before_pt": {"type": "number"},
                "space_after_pt": {"type": "number"},
                "alignment": {"type": "string", "enum": ["left", "center", "right", "justify"]},
                "first_line_indent_mm": {"type": "number"}
            }
        },
        "header_footer_content": {
            "type": "object",
            "properties": {
                "left_text": {"type": "string"},
                "center_text": {"type": "string"},
                "right_text": {"type": "string"},
                "font": {"$ref": "#/definitions/font"}
            }
        }
    }
}


def validate_spec(spec_dict: Dict[str, Any]) -> List[str]:
    """
    Validate a spec dictionary against the schema.
    Returns a list of validation errors (empty if valid).
    """
    errors = []

    # Basic type checks
    if not isinstance(spec_dict, dict):
        errors.append("Spec must be a dictionary/object")
        return errors

    # Check scope
    valid_scopes = ["whole_document", "body_only", "tables_only", "styles_only"]
    if 'scope' in spec_dict and spec_dict['scope'] not in valid_scopes:
        errors.append(f"Invalid scope: {spec_dict['scope']}. Must be one of {valid_scopes}")

    # Check font sizes are positive
    def check_font(font_dict, path):
        if font_dict and isinstance(font_dict, dict):
            if 'size_pt' in font_dict and font_dict['size_pt'] is not None:
                if not isinstance(font_dict['size_pt'], (int, float)) or font_dict['size_pt'] <= 0:
                    errors.append(f"{path}.size_pt must be a positive number")

    # Check defaults
    if 'defaults' in spec_dict and spec_dict['defaults']:
        check_font(spec_dict['defaults'].get('font'), 'defaults.font')

    # Check styles
    if 'styles' in spec_dict and spec_dict['styles']:
        for style_name, style_spec in spec_dict['styles'].items():
            if style_spec:
                check_font(style_spec.get('font'), f'styles.{style_name}.font')

    # Check page orientation
    if 'page' in spec_dict and spec_dict['page']:
        orientation = spec_dict['page'].get('orientation')
        if orientation and orientation not in ['portrait', 'landscape']:
            errors.append(f"Invalid page orientation: {orientation}")

    return errors
