#!/usr/bin/env python3
"""Quick CLI helper to test LibreTranslate responses."""

from __future__ import annotations

import os
import sys

import requests

ENDPOINT = os.getenv("LIBRE_TRANSLATE_URL", "https://libretranslate.de/translate")
HEADERS = {"accept": "application/json"}


def main() -> None:
    if len(sys.argv) > 1:
        phrase = " ".join(sys.argv[1:]).strip()
    else:
        phrase = input("English word/phrase to translate: ").strip()

    if not phrase:
        print("Nothing to translate.")
        return

    payload = {"q": phrase, "source": "en", "target": "he", "format": "text"}

    try:
        response = requests.post(ENDPOINT, json=payload, headers=HEADERS, timeout=15)
        response.raise_for_status()
        print("Status:", response.status_code)
        print("Response:", response.json())
    except Exception as error:  # pragma: no cover - debug helper
        print("Translation failed:", error)
        try:
            print("Raw response body:", response.text[:500])
        except Exception:
            pass


if __name__ == "__main__":
    main()
