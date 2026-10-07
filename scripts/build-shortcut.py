#!/usr/bin/env python3
"""Build Gatey's credential-free Apple Shortcut; signing requires macOS.

Usage: python3 scripts/build-shortcut.py [--unsigned-only] [--output-dir DIR]
The XML is the reviewable source artifact; the signed file is served by Next.js.
Only built-in Shortcuts actions are used. No account or location is embedded.
"""
import argparse
import pathlib
import plistlib
import subprocess
import tempfile
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent


def build():
    actions = []

    def uid(label):
        return str(uuid.uuid5(uuid.NAMESPACE_URL, "gatey-shortcut-v1/" + label)).upper()

    def attachment(value):
        return {"Value": value, "WFSerializationType": "WFTextTokenAttachment"}

    def text(value, prefix=""):
        if isinstance(value, str):
            return {"Value": {"string": prefix + value}, "WFSerializationType": "WFTextTokenString"}
        return {"Value": {"string": prefix + "\ufffc", "attachmentsByRange": {"{%d, 1}" % len(prefix): value}}, "WFSerializationType": "WFTextTokenString"}

    def fields(values):
        return {"Value": {"WFDictionaryFieldValueItems": [
            {"WFItemType": 0, "WFKey": text(key), "WFValue": value if isinstance(value, dict) and "WFSerializationType" in value else text(value)}
            for key, value in values.items()
        ]}, "WFSerializationType": "WFDictionaryFieldValue"}

    def action(label, identifier, **params):
        actions.append({"WFWorkflowActionIdentifier": "is.workflow.actions." + identifier,
                        "WFWorkflowActionParameters": {"UUID": uid(label), **params}})
        return {"Type": "ActionOutput", "OutputUUID": uid(label), "OutputName": label}

    def get(label, source, key):
        return action(label, "getvalueforkey", WFInput=attachment(source), WFDictionaryKey=key)

    def start_if(label, source, condition=100):
        action(label, "conditional", GroupingIdentifier=uid(label + "-group"), WFControlFlowMode=0,
               WFCondition=condition, WFInput={"Type": "Variable", "Variable": attachment(source)})

    def branch(label, mode):
        action(label + str(mode), "conditional", GroupingIdentifier=uid(label + "-group"), WFControlFlowMode=mode)

    def notify(label, message):
        action(label, "notification", WFNotificationActionTitle="Gatey", WFNotificationActionBody=text(message))

    action("About", "comment", WFCommentActionText="Gatey arrival pilot. Install this shortcut, keep the name Open Gatey, then use Connect this iPhone in Gatey. Pairing saves your private opening key to iCloud Drive/Shortcuts/Gatey-connection.json and does not open the gate. Running with no input opens the gate. An Arrive automation should run this shortcut with no input. No location is collected or sent. Disconnect the key in Gatey to revoke access.")
    shortcut_input = {"Type": "ExtensionInput"}
    start_if("Has pairing input", shortcut_input)
    pairing = action("Pairing details", "detect.dictionary", WFInput=attachment(shortcut_input))
    pair_url = get("Pairing URL", pairing, "url")
    code = get("Pairing code", pairing, "code")
    response = action("Connect", "downloadurl", WFURL=text(pair_url), WFHTTPMethod="POST", WFHTTPBodyType="JSON", WFJSONValues=fields({"code": code}))
    token = get("New key", response, "token")
    start_if("Pairing succeeded", token)
    connection_text = action("Connection JSON", "gettext", WFTextActionText=text(response))
    named_file = action("Connection filename", "setitemname", WFInput=attachment(connection_text), WFName="Gatey-connection.json")
    action("Save connection", "documentpicker.save", WFInput=attachment(named_file), WFFileStorageService="iCloud Drive", WFAskWhereToSave=False, WFFileDestinationPath="", WFSaveFileOverwrite=True)
    notify("Connected", "Connected to Gatey. The gate was not opened. Return to Gatey for the test and arrival setup.")
    branch("Pairing succeeded", 1)
    error = get("Connection error", response, "message")
    notify("Connection failed", error)
    branch("Pairing succeeded", 2)
    # Never fall through from pairing into the physical gate action.
    action("Finish pairing", "exit")
    branch("Has pairing input", 2)

    file = action("Load connection", "documentpicker.open", WFFileStorageService="iCloud Drive", WFShowFilePicker=False, WFGetFilePath="Gatey-connection.json", WFFileErrorIfNotFound=False)
    start_if("Not connected", file, 101)
    notify("Setup needed", "Connect this iPhone from Gatey → More → Open on arrival first.")
    action("Stop without connection", "exit")
    branch("Not connected", 2)
    connection = action("Saved connection", "detect.dictionary", WFInput=attachment(file))
    open_url = get("Gate endpoint", connection, "openUrl")
    key = get("Opening key", connection, "token")
    opened = action("Request opening", "downloadurl", WFURL=text(open_url), WFHTTPMethod="POST", WFHTTPBodyType="JSON", WFJSONValues=fields({}), WFHTTPHeaders=fields({"Authorization": text(key, "Bearer ")}))
    message = get("Opening result", opened, "message")
    notify("Gate result", message)
    action("Finish", "exit")
    return {
        "WFWorkflowName": "Open Gatey", "WFWorkflowActions": actions,
        "WFWorkflowClientVersion": "2600.0.0", "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconGlyphNumber": 61444, "WFWorkflowIconStartColor": 4292093695},
        "WFWorkflowInputContentItemClasses": ["WFStringContentItem"],
        "WFWorkflowHasShortcutInputVariables": True,
        "WFWorkflowInputPassthrough": False,
        "WFWorkflowNoInputBehavior": {"Name": "Continue", "Parameters": {}},
        "WFWorkflowIsDisabledOnLockScreen": False,
        "WFWorkflowHasOutputFallback": False, "WFWorkflowImportQuestions": [],
        "WFWorkflowOutputContentItemClasses": [], "WFWorkflowTypes": [],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--unsigned-only", action="store_true")
    parser.add_argument("--output-dir", type=pathlib.Path, default=ROOT / "public" / "shortcuts")
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    source = plistlib.dumps(build(), fmt=plistlib.FMT_XML, sort_keys=False)
    (args.output_dir / "Open Gatey.plist").write_bytes(source)
    if not args.unsigned_only:
        with tempfile.TemporaryDirectory(prefix="gatey-shortcut-") as directory:
            unsigned = pathlib.Path(directory) / "Open Gatey.shortcut"
            unsigned.write_bytes(plistlib.dumps(build(), fmt=plistlib.FMT_BINARY, sort_keys=False))
            subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", str(unsigned), "--output", str(args.output_dir / "Open Gatey.shortcut")], check=True)
        (args.output_dir / "Open Gatey.shortcut").chmod(0o644)
    print("Generated shortcut in", args.output_dir)
