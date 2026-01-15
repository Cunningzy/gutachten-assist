#!/usr/bin/env python3
"""
CLI tool for formatting DOCX documents using FormatSpec.

Usage:
    python format_docx.py --in input.docx --out output.docx --spec spec.json
    python format_docx.py --in input.docx --out output.docx --spec-json '{"defaults": {"font": {"name": "Arial"}}}'
"""

import argparse
import json
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from format_spec import FormatSpec, validate_spec
from docx_formatter import format_docx, FormattingResult


def main():
    parser = argparse.ArgumentParser(
        description='Format DOCX documents using a FormatSpec',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  # Using a spec file
  python format_docx.py --in report.docx --out formatted.docx --spec my_spec.json

  # Using inline JSON
  python format_docx.py --in report.docx --out formatted.docx --spec-json '{"defaults": {"font": {"name": "Arial", "size_pt": 12}}}'

  # Show example spec
  python format_docx.py --example-spec
'''
    )

    parser.add_argument('--in', '-i', dest='input_file',
                        help='Input DOCX file path')
    parser.add_argument('--out', '-o', dest='output_file',
                        help='Output DOCX file path')
    parser.add_argument('--spec', '-s', dest='spec_file',
                        help='Path to FormatSpec JSON file')
    parser.add_argument('--spec-json', dest='spec_json',
                        help='FormatSpec as inline JSON string')
    parser.add_argument('--example-spec', action='store_true',
                        help='Print an example FormatSpec and exit')
    parser.add_argument('--validate-only', action='store_true',
                        help='Only validate the spec, do not format')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Verbose output')

    args = parser.parse_args()

    # Show example spec
    if args.example_spec:
        print_example_spec()
        return 0

    # Validate arguments
    if not args.input_file or not args.output_file:
        if not args.validate_only or (not args.spec_file and not args.spec_json):
            parser.error('--in and --out are required (unless using --example-spec)')

    if not args.spec_file and not args.spec_json:
        parser.error('Either --spec or --spec-json is required')

    # Load spec
    try:
        if args.spec_file:
            with open(args.spec_file, 'r', encoding='utf-8') as f:
                spec_dict = json.load(f)
        else:
            spec_dict = json.loads(args.spec_json)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON: {e}", file=sys.stderr)
        return 1
    except FileNotFoundError:
        print(f"ERROR: Spec file not found: {args.spec_file}", file=sys.stderr)
        return 1

    # Validate spec
    errors = validate_spec(spec_dict)
    if errors:
        print("ERROR: Invalid FormatSpec:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    if args.validate_only:
        print("Spec is valid.")
        if args.verbose:
            print("\nParsed spec:")
            spec = FormatSpec.from_dict(spec_dict)
            print(spec.to_json(indent=2))
        return 0

    # Parse spec
    try:
        spec = FormatSpec.from_dict(spec_dict)
    except Exception as e:
        print(f"ERROR: Could not parse spec: {e}", file=sys.stderr)
        return 1

    if args.verbose:
        print(f"Input:  {args.input_file}")
        print(f"Output: {args.output_file}")
        print(f"Scope:  {spec.scope}")
        print()

    # Format document
    result = format_docx(args.input_file, args.output_file, spec)

    # Print result
    if result.success:
        print(f"SUCCESS: Formatted document saved to {args.output_file}")
        print("\nApplied changes:")
        for key, value in result.applied_changes.items():
            if value > 0:
                print(f"  - {key}: {value}")

        if result.warnings:
            print("\nWarnings:")
            for warning in result.warnings:
                print(f"  - {warning}")
    else:
        print("FAILED: Could not format document", file=sys.stderr)
        for error in result.errors:
            print(f"  ERROR: {error}", file=sys.stderr)
        return 1

    return 0


def print_example_spec():
    """Print an example FormatSpec"""
    example = {
        "spec_version": "1.0",
        "created_by": "gutachten-assistant",
        "scope": "whole_document",
        "defaults": {
            "font": {
                "name": "Times New Roman",
                "size_pt": 12
            },
            "paragraph": {
                "line_spacing": 1.5,
                "space_after_pt": 6
            }
        },
        "styles": {
            "Heading1": {
                "font": {
                    "name": "Arial",
                    "size_pt": 16,
                    "bold": True
                },
                "paragraph": {
                    "space_before_pt": 12,
                    "space_after_pt": 6
                }
            },
            "Heading2": {
                "font": {
                    "name": "Arial",
                    "size_pt": 14,
                    "bold": True
                }
            }
        },
        "page": {
            "margins": {
                "top_mm": 25,
                "bottom_mm": 25,
                "left_mm": 25,
                "right_mm": 25
            },
            "size": "A4"
        },
        "header": {
            "enabled": True,
            "content": {
                "center_text": "Gutachten",
                "font": {
                    "name": "Arial",
                    "size_pt": 10
                }
            }
        },
        "footer": {
            "enabled": True,
            "page_number": {
                "enabled": True,
                "format": "Seite 1 von 3",
                "position": "center"
            }
        },
        "tables": {
            "default_font_name": "Arial",
            "default_font_size_pt": 10,
            "header_row_bold": True
        },
        "title_page": {
            "enabled": False,
            "title_text": "Gutachten",
            "subtitle_text": "Patient: Max Mustermann",
            "title_font": {
                "name": "Arial",
                "size_pt": 24,
                "bold": True
            },
            "add_page_break_after": True
        }
    }

    print("Example FormatSpec:")
    print("=" * 60)
    print(json.dumps(example, indent=2, ensure_ascii=False))
    print("=" * 60)
    print("\nSave this to a file (e.g., spec.json) and use with:")
    print("  python format_docx.py --in input.docx --out output.docx --spec spec.json")


if __name__ == '__main__':
    sys.exit(main())
