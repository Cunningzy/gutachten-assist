"""
DOCX Formatter Package
======================

This package provides tools for formatting DOCX documents using a specification-based approach.

Components:
- format_spec.py: FormatSpec data model and JSON schema
- docx_formatter.py: Document formatting engine using python-docx
- llm_spec_generator.py: LLM prompt templates for generating specs from natural language
- format_docx.py: CLI entry point

Usage:
    from docx_formatter import FormatSpec, format_docx, generate_spec_prompt

    # Create a spec
    spec = FormatSpec()
    spec.defaults = DefaultsSpec(font=FontSpec(name="Arial", size_pt=12))

    # Format a document
    result = format_docx("input.docx", "output.docx", spec)

    # Or generate a spec from natural language
    prompt = generate_spec_prompt("Alles in Arial 12pt")
    # Send prompt to LLM, get JSON response, parse it
"""

from .format_spec import (
    FormatSpec,
    FontSpec,
    ParagraphSpec,
    StyleSpec,
    DefaultsSpec,
    PageSpec,
    PageMargins,
    HeaderSpec,
    FooterSpec,
    HeaderFooterText,
    PageNumberSpec,
    TableSpec,
    ListSpec,
    TitlePageSpec,
    HeadingNormalization,
    HeadingNormalizationRule,
    validate_spec,
    FORMAT_SPEC_SCHEMA
)

from .docx_formatter import (
    DocxFormatter,
    FormattingResult,
    format_docx,
    format_docx_from_json
)

from .llm_spec_generator import (
    LLM_SPEC_PROMPT_TEMPLATE,
    generate_spec_prompt,
    parse_llm_response,
    extract_json_from_response,
    is_formatting_request
)

__version__ = '1.0.0'
__all__ = [
    # Data models
    'FormatSpec',
    'FontSpec',
    'ParagraphSpec',
    'StyleSpec',
    'DefaultsSpec',
    'PageSpec',
    'PageMargins',
    'HeaderSpec',
    'FooterSpec',
    'HeaderFooterText',
    'PageNumberSpec',
    'TableSpec',
    'ListSpec',
    'TitlePageSpec',
    'HeadingNormalization',
    'HeadingNormalizationRule',

    # Validation
    'validate_spec',
    'FORMAT_SPEC_SCHEMA',

    # Formatter
    'DocxFormatter',
    'FormattingResult',
    'format_docx',
    'format_docx_from_json',

    # LLM integration
    'LLM_SPEC_PROMPT_TEMPLATE',
    'generate_spec_prompt',
    'parse_llm_response',
    'extract_json_from_response',
    'is_formatting_request',
]
