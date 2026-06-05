"""Build crm-recovered-data.json from agent transcript export."""
import json
from pathlib import Path

TRANSCRIPT = Path(
    r"C:\Users\dell\.cursor\projects\c-Users-dell-crm-sync-crm-sync\agent-transcripts"
    r"\79748db0-09c1-46d5-b71b-ef9bd7c9c8e9\79748db0-09c1-46d5-b71b-ef9bd7c9c8e9.jsonl"
)
OUT = Path(__file__).resolve().parents[1] / "backend" / "static" / "crm-recovered-data.json"


def main():
    text = TRANSCRIPT.read_text(encoding="utf-8")
    for line in text.splitlines():
        if '"version": 1' not in line or "AKCOAT" not in line:
            continue
        obj = json.loads(line)
        msg = obj["message"]["content"][0]["text"]
        start = msg.find("{")
        end = msg.rfind("}")
        data = json.loads(msg[start : end + 1])
        OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"rows={len(data.get('rows', []))} wrote={OUT}")
        return
    raise SystemExit("backup JSON not found in transcript")


if __name__ == "__main__":
    main()
