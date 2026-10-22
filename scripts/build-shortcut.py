#!/usr/bin/env python3
"""Build the one-action Open Gatey shortcut; Apple signing requires macOS."""
import argparse
import pathlib
import plistlib
import subprocess
import tempfile
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parent.parent


def build(base_url):
    url = urlsplit(base_url)
    if url.scheme != "https" or not url.netloc or url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
        raise ValueError("Use the public HTTPS origin, such as https://gate.example.com")

    def text(value):
        return {"Value": {"string": value}, "WFSerializationType": "WFTextTokenString"}

    return {
        "WFWorkflowName": "Open Gatey",
        "WFWorkflowActions": [{
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {
                "UUID": "54F33CEE-02D6-4E76-9EA4-99CB49880A23",
                "WFURL": text(f"https://{url.netloc}/api/shortcuts/open"),
                "WFHTTPMethod": "POST",
                "WFHTTPBodyType": "JSON",
                "WFJSONValues": {"Value": {"WFDictionaryFieldValueItems": []}, "WFSerializationType": "WFDictionaryFieldValue"},
                "WFHTTPHeaders": {
                    "Value": {"WFDictionaryFieldValueItems": [{
                        "WFItemType": 0,
                        "WFKey": text("Authorization"),
                        "WFValue": text("Bearer PASTE_YOUR_ACCESS_KEY_HERE"),
                    }]},
                    "WFSerializationType": "WFDictionaryFieldValue",
                },
            },
        }],
        "WFWorkflowClientVersion": "2600.0.0",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconGlyphNumber": 61444, "WFWorkflowIconStartColor": 4292093695},
        "WFWorkflowInputContentItemClasses": [],
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowInputPassthrough": False,
        "WFWorkflowNoInputBehavior": {"Name": "Continue", "Parameters": {}},
        "WFWorkflowIsDisabledOnLockScreen": False,
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowImportQuestions": [],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="public HTTPS origin, such as https://gate.example.com")
    parser.add_argument("--unsigned-only", action="store_true")
    parser.add_argument("--output-dir", type=pathlib.Path, default=ROOT / "public" / "shortcuts")
    args = parser.parse_args()
    workflow = build(args.base_url)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "Open Gatey.plist").write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_XML, sort_keys=False))
    if not args.unsigned_only:
        with tempfile.TemporaryDirectory(prefix="gatey-shortcut-") as directory:
            unsigned = pathlib.Path(directory) / "Open Gatey.shortcut"
            unsigned.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY, sort_keys=False))
            subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", str(unsigned), "--output", str(args.output_dir / "Open Gatey.shortcut")], check=True)
        (args.output_dir / "Open Gatey.shortcut").chmod(0o644)
    print("Generated one-action shortcut in", args.output_dir)
