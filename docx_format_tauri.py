#!/usr/bin/env python3
"""
DOCX Format Script for Gutachten Assistant
Called by Tauri to apply formatting changes to DOCX files.

This script:
1. Takes a DOCX file and a formatting request (or spec)
2. If request is natural language, generates FormatSpec using Llama
3. Applies the FormatSpec to the DOCX file
4. Returns JSON with the result

Usage:
    # Apply formatting from natural language request
    python docx_format_tauri.py <input.docx> <output.docx> --request "Kopfzeile 10pt, Titel fett"

    # Apply formatting from JSON spec file
    python docx_format_tauri.py <input.docx> <output.docx> --spec spec.json

    # Apply formatting from JSON spec string
    python docx_format_tauri.py <input.docx> <output.docx> --spec-json '{"header": {...}}'
"""

import sys
import os
import json
import argparse
from datetime import datetime

# Add docx_formatter to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'docx_formatter'))

from format_spec import FormatSpec, validate_spec
from docx_formatter import format_docx
from llm_spec_generator import generate_spec_prompt, parse_llm_response, is_formatting_request


def load_llama_model():
    """Load Llama model for generating FormatSpec from natural language"""
    try:
        from llama_cpp import Llama

        model_path = os.path.join(
            os.path.dirname(__file__),
            "models",
            "llama-3.1-8b-instruct-q4_k_m.gguf"
        )

        if not os.path.exists(model_path):
            print(f"Model not found at {model_path}", file=sys.stderr)
            return None

        llm = Llama(
            model_path=model_path,
            n_ctx=4096,
            n_threads=4,
            n_gpu_layers=33,
            verbose=False
        )

        return llm

    except ImportError:
        print("llama-cpp-python not installed", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Error loading Llama: {e}", file=sys.stderr)
        return None


def generate_format_spec_with_llama(llm, user_request: str) -> dict:
    """
    Use Llama to generate a FormatSpec JSON from a natural language request.
    """
    prompt = generate_spec_prompt(user_request)

    try:
        response = llm.create_chat_completion(
            messages=[
                {"role": "user", "content": prompt}
            ],
            max_tokens=2048,
            temperature=0.1,  # Low temperature for consistent JSON output
            top_p=0.95
        )

        generated_text = response['choices'][0]['message']['content'].strip()

        # Parse the response
        spec, messages = parse_llm_response(generated_text)

        if spec:
            return {
                "success": True,
                "spec": spec.to_dict(),
                "messages": messages,
                "raw_response": generated_text
            }
        else:
            return {
                "success": False,
                "error": "Could not parse FormatSpec from LLM response",
                "messages": messages,
                "raw_response": generated_text
            }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def main():
    parser = argparse.ArgumentParser(
        description='Format DOCX files for Gutachten Assistant'
    )

    parser.add_argument('input_docx', nargs='?', help='Input DOCX file')
    parser.add_argument('output_docx', nargs='?', help='Output DOCX file')
    parser.add_argument('--request', '-r', help='Natural language formatting request')
    parser.add_argument('--spec', '-s', help='Path to FormatSpec JSON file')
    parser.add_argument('--spec-json', help='FormatSpec as JSON string')
    parser.add_argument('--detect-only', action='store_true',
                        help='Only detect if input is a formatting request')

    args = parser.parse_args()

    # Detection mode
    if args.detect_only:
        if not args.request:
            result = {"is_formatting_request": False, "error": "No request provided"}
        else:
            result = {
                "is_formatting_request": is_formatting_request(args.request),
                "request": args.request
            }
        print(json.dumps(result, ensure_ascii=False))
        return 0

    # Validate arguments
    if not args.input_docx or not args.output_docx:
        parser.error('input_docx and output_docx are required')

    if not args.request and not args.spec and not args.spec_json:
        parser.error('One of --request, --spec, or --spec-json is required')

    result = {
        "success": False,
        "input_file": args.input_docx,
        "output_file": args.output_docx,
        "timestamp": datetime.now().isoformat()
    }

    try:
        # Get FormatSpec
        spec = None

        if args.spec_json:
            # Parse from JSON string
            spec_dict = json.loads(args.spec_json)
            errors = validate_spec(spec_dict)
            if errors:
                result["validation_errors"] = errors
            spec = FormatSpec.from_dict(spec_dict)

        elif args.spec:
            # Load from file
            with open(args.spec, 'r', encoding='utf-8') as f:
                spec_dict = json.load(f)
            errors = validate_spec(spec_dict)
            if errors:
                result["validation_errors"] = errors
            spec = FormatSpec.from_dict(spec_dict)

        elif args.request:
            # Generate from natural language using Llama
            print(f"Generating FormatSpec from request: {args.request}", file=sys.stderr)

            llm = load_llama_model()
            if llm is None:
                result["error"] = "Could not load Llama model"
                print(json.dumps(result, ensure_ascii=False, indent=2))
                return 1

            gen_result = generate_format_spec_with_llama(llm, args.request)
            result["llm_result"] = gen_result

            if not gen_result["success"]:
                result["error"] = gen_result.get("error", "Failed to generate spec")
                print(json.dumps(result, ensure_ascii=False, indent=2))
                return 1

            spec = FormatSpec.from_dict(gen_result["spec"])

        if spec is None:
            result["error"] = "No FormatSpec available"
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 1

        # Apply formatting
        print(f"Applying formatting to {args.input_docx}...", file=sys.stderr)
        format_result = format_docx(args.input_docx, args.output_docx, spec)

        result["success"] = format_result.success
        result["applied_changes"] = format_result.applied_changes
        result["warnings"] = format_result.warnings
        result["errors"] = format_result.errors
        result["spec_applied"] = spec.to_dict()

        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if format_result.success else 1

    except json.JSONDecodeError as e:
        result["error"] = f"Invalid JSON: {e}"
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1
    except FileNotFoundError as e:
        result["error"] = f"File not found: {e}"
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1
    except Exception as e:
        result["error"] = str(e)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1


if __name__ == '__main__':
    sys.exit(main())
