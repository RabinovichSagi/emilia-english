#!/usr/bin/env python3
"""
Streamlit helper to import new vocabulary words into data/words.json.

Features:
* Searches Pixabay's free vector API for candidate illustrations.
* Lets you preview and choose an image, then saves it under assets/images.
* Generates audio pronunciations with gTTS and stores them under assets/audio.
* Captures metadata (hebrew, tags, difficulty, distractors, optional first-letter flag).

Run with: streamlit run scripts/word_importer.py
"""
from __future__ import annotations

import csv
import json
import os
import re
from io import BytesIO
from json import JSONDecodeError
from pathlib import Path
from typing import Dict, List, Optional

import requests
import streamlit as st
from PIL import Image, UnidentifiedImageError
from streamlit_image_select import image_select

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

try:
    from gtts import gTTS

    GTTS_AVAILABLE = True
except ImportError:  # pragma: no cover - surfaced in UI
    GTTS_AVAILABLE = False


PROJECT_ROOT = Path(__file__).resolve().parent.parent
if load_dotenv:
    env_file = PROJECT_ROOT / ".env"
    if env_file.exists():
        load_dotenv(env_file)
WORDS_PATH = PROJECT_ROOT / "data" / "words.json"
IMAGES_DIR = PROJECT_ROOT / "assets" / "images"
AUDIO_DIR = PROJECT_ROOT / "assets" / "audio"
CSV_IMPORT_PATH = PROJECT_ROOT / "scripts" / "english_hebrew_pixabay.csv"
PIXABAY_API_URL = "https://pixabay.com/api/"
PIXABAY_API_KEY = os.getenv("PIXABAY_API_KEY")
DEFAULT_IMAGE_SIZE = (512, 512)
IMAGE_OPTION_BOX_PX = 300
PREVIEW_IMAGE_SIZE = (IMAGE_OPTION_BOX_PX, IMAGE_OPTION_BOX_PX)
PIXABAY_RESULT_COUNT = 9
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")

VOICE_CHOICES: Dict[str, Dict[str, str]] = {
    "US English": {"lang": "en", "tld": "com"},
    "UK English": {"lang": "en", "tld": "co.uk"},
    "Australian English": {"lang": "en", "tld": "com.au"},
    "Canadian English": {"lang": "en", "tld": "ca"},
}
VOICE_LABELS = list(VOICE_CHOICES.keys())

for folder in (IMAGES_DIR, AUDIO_DIR):
    folder.mkdir(parents=True, exist_ok=True)


def slugify(value: str) -> str:
    """Normalize a word so it can serve as a word id / filename stem."""
    if not value:
        return ""
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return slug.strip("-")


def load_words() -> Dict[str, List[Dict]]:
    if not WORDS_PATH.exists():
        return {"words": []}
    with WORDS_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_words(payload: Dict[str, List[Dict]]) -> None:
    with WORDS_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)


def load_import_rows() -> List[Dict[str, str]]:
    if not CSV_IMPORT_PATH.exists():
        return []
    rows: List[Dict[str, str]] = []
    with CSV_IMPORT_PATH.open("r", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            english = (raw.get("English") or "").strip()
            hebrew = (raw.get("Hebrew") or "").strip()
            pixabay_query = (raw.get("Pixabay_Search") or "").strip()
            if not english:
                continue
            rows.append(
                {
                    "english": english,
                    "hebrew": hebrew,
                    "pixabay_query": pixabay_query or english,
                    "id": slugify(english),
                }
            )
    return rows


def find_next_missing_index(rows: List[Dict[str, str]], start_idx: int, existing_ids: List[str]) -> Optional[int]:
    if not rows:
        return None
    start_idx = max(start_idx, 0)
    for idx in range(start_idx, len(rows)):
        row = rows[idx]
        if not row.get("id"):
            continue
        if row["id"] not in existing_ids:
            return idx
    return None


def fetch_pixabay_vectors(query: str, per_page: int = PIXABAY_RESULT_COUNT) -> List[Dict[str, str]]:
    if not PIXABAY_API_KEY or not query:
        return []
    params = {
        "key": PIXABAY_API_KEY,
        "q": query,
        "per_page": per_page,
        "image_type": "vector",
        "safesearch": "true",
        "order": "popular",
    }
    response = requests.get(PIXABAY_API_URL, params=params, timeout=15)
    response.raise_for_status()
    data = response.json()
    hits: List[Dict] = data.get("hits", [])
    results: List[Dict[str, str]] = []
    for hit in hits[:per_page]:
        results.append(
            {
                "id": str(hit.get("id")),
                "tags": hit.get("tags", ""),
                "thumbnail": hit.get("previewURL"),
                "image": hit.get("largeImageURL") or hit.get("imageURL"),
                "vector": hit.get("vectorURL"),
            }
        )
    return results


def fit_image_to_square(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Return a new square image with the source centered inside."""
    mode = "RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB"
    background_color = (255, 255, 255, 0) if mode == "RGBA" else (255, 255, 255)
    converted = image.convert(mode)
    converted.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new(mode, size, background_color)
    offset = ((size[0] - converted.width) // 2, (size[1] - converted.height) // 2)
    canvas.paste(converted, offset, converted if mode == "RGBA" else None)
    return canvas


def create_square_image_bytes(url: str, size: tuple[int, int]) -> bytes:
    """Fetch an image URL and return PNG bytes sized to the provided square."""
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    raw = BytesIO(response.content)
    try:
        with Image.open(raw) as image:
            canvas = fit_image_to_square(image, size)
            buffer = BytesIO()
            canvas.save(buffer, format="PNG", optimize=True)
            buffer.seek(0)
            return buffer.read()
    except UnidentifiedImageError as error:
        raise ValueError("The downloaded image could not be decoded.") from error


def save_prepared_image(url: str, destination: Path) -> None:
    """Download, resize, and compress an image to the app's standard PNG format."""
    image_bytes = create_square_image_bytes(url, DEFAULT_IMAGE_SIZE)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(image_bytes)


def perform_image_search(search_phrase: str) -> None:
    try:
        images = fetch_pixabay_vectors(search_phrase, per_page=PIXABAY_RESULT_COUNT)
    except requests.HTTPError as error:
        st.error(f"Pixabay request failed: {error}")
        return
    except requests.RequestException as error:
        st.error(f"Network error: {error}")
        return
    if not images:
        st.warning("No images returned. Try a different word or spelling.")
        st.session_state["image_options"] = []
        return

    processed_options: List[Dict[str, str]] = []
    for idx, option in enumerate(images):
        source = option.get("thumbnail") or option.get("image") or option.get("vector")
        if source:
            try:
                option["preview_bytes"] = create_square_image_bytes(source, PREVIEW_IMAGE_SIZE)
            except (requests.RequestException, ValueError) as error:
                st.warning(f"Preview {idx + 1} could not be prepared: {error}")
                option["preview_bytes"] = None
        processed_options.append(option)
    st.session_state["image_options"] = processed_options
    st.session_state["selected_image_idx"] = 0


def translate_en_to_he(text: str) -> Optional[str]:
    """Translate English text to Hebrew using Ollama."""
    trimmed = text.strip()
    if not trimmed:
        return None
    prompt = (
        "you are expert translator. you will get a word and must respond with its translation. "
        "Respont only with the hebrew tranlastion and only one.\n"
        "# example:\n"
        "input: teacher\n"
        "output: מורה\n\n"
        f"Translate this: {trimmed}"
    )
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}
    try:
        endpoint = f"{OLLAMA_URL.rstrip('/')}/api/generate"
        response = requests.post(endpoint, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as error:
        st.error(f"Translation failed: {error}")
        return None
    except JSONDecodeError:
        snippet = response.text[:200] if "response" in locals() else ""
        st.error(f"Translation failed: unexpected response '{snippet}'")
        return None
    translated = (data.get("response") or "").strip()
    if not translated:
        st.error("Translation failed: missing response from Ollama.")
        return None
    for line in translated.splitlines():
        cleaned = line.strip()
        if cleaned:
            translated = cleaned
            break
    if translated.lower().startswith("output:"):
        translated = translated.split(":", 1)[1].strip()
    translated = translated.strip('"').strip("'")
    if not translated:
        st.error("Translation failed: empty response after cleanup.")
        return None
    return translated


def synthesize_audio_bytes(text: str, lang: str, tld: str) -> bytes:
    """Generate speech audio for the provided text."""
    if not GTTS_AVAILABLE:
        raise RuntimeError("gTTS is not installed.")
    buffer = BytesIO()
    gTTS(text=text, lang=lang, tld=tld).write_to_fp(buffer)
    buffer.seek(0)
    return buffer.read()


def update_audio_from_text(tts_text: str, word_id: str, voice_label: str, announce: bool = True) -> bool:
    if not GTTS_AVAILABLE:
        st.warning("gTTS is not installed.")
        return False
    trimmed = tts_text.strip()
    if not trimmed:
        st.warning("Provide pronunciation text before generating audio.")
        return False
    voice = VOICE_CHOICES.get(voice_label) or VOICE_CHOICES[VOICE_LABELS[0]]
    try:
        audio_bytes = synthesize_audio_bytes(trimmed, voice["lang"], voice["tld"])
    except Exception as error:  # pragma: no cover - surfaced in UI
        st.error(f"Audio generation failed: {error}")
        return False

    rel_path = f"assets/audio/{word_id or slugify(trimmed)}.mp3"
    st.session_state["audio_bytes"] = audio_bytes
    st.session_state["audio_rel_path"] = rel_path
    if announce:
        st.audio(audio_bytes, format="audio/mp3", sample_rate=None)
        st.success(f"Audio ready. It will be saved as {rel_path}.")
    return True


def main() -> None:
    st.set_page_config(page_title="Word Importer", page_icon="🆕", layout="wide")
    st.title("Vocabulary Import Helper")
    st.caption("Search for vector art, generate audio, and append the word to data/words.json.")

    defaults = {
        "image_options": [],
        "selected_image_idx": 0,
        "audio_bytes": None,
        "audio_rel_path": None,
        "tts_text_input": "",
        "last_english_for_tts": "",
        "image_search_text": "",
        "last_english_for_image_search": "",
        "pending_auto_image_search": False,
        "pending_auto_audio": False,
        "import_progress_idx": 0,
        "current_import_idx": None,
        "current_candidate_slug": None,
        "advance_to_next": False,
        "voice_select": VOICE_LABELS[0],
        "image_search_locked": False,
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value

    words_blob = load_words()
    existing_words = words_blob.get("words", [])
    existing_ids = [entry["id"] for entry in existing_words]

    import_rows = load_import_rows()
    next_idx = find_next_missing_index(import_rows, st.session_state["import_progress_idx"], existing_ids)
    if next_idx is None and import_rows:
        st.info("Every word from english_hebrew_pixabay.csv already exists in data/words.json.")
    elif next_idx is None and not import_rows:
        st.warning("Import CSV not found or empty. Manual entry only.")

    should_prefill = False
    if next_idx is not None:
        candidate = import_rows[next_idx]
        candidate_slug = candidate.get("id")
        if (
            st.session_state.get("current_candidate_slug") != candidate_slug
            or st.session_state.get("advance_to_next")
        ):
            should_prefill = True
    else:
        candidate = None
        candidate_slug = None
        st.session_state["image_search_locked"] = False

    if should_prefill and candidate:
        st.session_state["current_candidate_slug"] = candidate_slug
        st.session_state["current_import_idx"] = next_idx
        st.session_state["advance_to_next"] = False
        st.session_state["english_word_input"] = candidate.get("english", "")
        st.session_state["hebrew_word_input"] = candidate.get("hebrew", "")
        st.session_state["image_search_text"] = candidate.get("pixabay_query", candidate.get("english", ""))
        st.session_state["tts_text_input"] = candidate.get("english", "")
        st.session_state["last_english_for_tts"] = candidate.get("english", "")
        st.session_state["last_english_for_image_search"] = candidate.get("pixabay_query", candidate.get("english", ""))
        st.session_state["pending_auto_image_search"] = True
        st.session_state["pending_auto_audio"] = GTTS_AVAILABLE
        st.session_state["image_search_locked"] = True
        st.session_state["image_options"] = []
        st.session_state["selected_image_idx"] = 0
        st.session_state["audio_bytes"] = None
        st.session_state["audio_rel_path"] = None
        st.session_state["difficulty_input"] = 1
        st.session_state["tags_input"] = ""
        st.session_state["distractors_input"] = []
        st.session_state["first_letter_checkbox"] = False

    st.markdown("### Word Details")
    english_col, translate_col = st.columns([3, 1])
    with english_col:
        english_word = st.text_input("English word", max_chars=64, key="english_word_input")
    with translate_col:
        translate_trigger = st.button(
            "Translate → Hebrew",
            disabled=not english_word.strip(),
            help="Uses the local Ollama model to auto-fill the Hebrew field.",
        )
    auto_fill_trigger = st.button(
        "Auto-fill: translate + image + audio",
        disabled=not english_word.strip(),
        help="Runs translation, image search, and audio generation in one step.",
    )

    if translate_trigger and english_word:
        translation = translate_en_to_he(english_word)
        if translation:
            st.session_state["hebrew_word_input"] = translation
    if auto_fill_trigger and english_word:
        translation = translate_en_to_he(english_word)
        if translation:
            st.session_state["hebrew_word_input"] = translation
        st.session_state["image_search_text"] = english_word
        st.session_state["last_english_for_image_search"] = english_word
        st.session_state["pending_auto_image_search"] = True
        st.session_state["tts_text_input"] = english_word
        st.session_state["last_english_for_tts"] = english_word
        st.session_state["pending_auto_audio"] = GTTS_AVAILABLE
        if not PIXABAY_API_KEY:
            st.warning("Set PIXABAY_API_KEY to enable image search.")
        if not GTTS_AVAILABLE:
            st.warning("Install gTTS (`pip install gTTS`) to enable audio generation.")

    detail_cols = st.columns([1.3, 1])
    with detail_cols[0]:
        hebrew_word = st.text_input(
            "Hebrew translation",
            help="Auto-filled via the local Ollama model or provide your own.",
            key="hebrew_word_input",
        )
        tags_raw = st.text_input(
            "Tags (comma separated)",
            placeholder="animals, nature, practice",
            key="tags_input",
        )
        optional_first_letter = st.checkbox(
            "Allow this word in first-letter drills",
            value=False,
            key="first_letter_checkbox",
        )
    with detail_cols[1]:
        difficulty = st.slider(
            "Difficulty (1 – 5)", min_value=1, max_value=5, value=1, key="difficulty_input"
        )
        distractor_ids = st.multiselect(
            "Distractor word ids",
            options=existing_ids,
            help="Pick other words that should appear as distractors.",
            key="distractors_input",
        )

    word_id = slugify(english_word)
    if english_word and not word_id:
        st.error("Word id could not be derived. Please use alphanumeric characters.")

    if word_id and word_id in existing_ids:
        st.warning(f'"{word_id}" already exists in data/words.json – saving will overwrite it.')

    st.divider()
    st.subheader("Step 1 · Images")

    if not PIXABAY_API_KEY:
        st.info(
            "Set the PIXABAY_API_KEY environment variable to enable vector search. "
            "Create a free key at https://pixabay.com/api/docs/ ."
        )

    auto_fill_search = (
        english_word
        and not st.session_state.get("image_search_locked")
        and (
            not st.session_state["image_search_text"]
            or st.session_state["last_english_for_image_search"] != english_word
        )
    )
    if auto_fill_search:
        st.session_state["image_search_text"] = english_word
        st.session_state["last_english_for_image_search"] = english_word

    image_search_phrase = st.text_input(
        "Image search phrase",
        key="image_search_text",
        help="Default matches the English word, but you can refine it (e.g., 'cute dog cartoon').",
    )
    sanitized_image_phrase = image_search_phrase.strip()

    cols = st.columns([1, 1])
    with cols[0]:
        search_trigger = st.button(
            "Search Pixabay vectors",
            disabled=not sanitized_image_phrase or not PIXABAY_API_KEY,
            help="Fetch up to 9 matches for the current phrase.",
        )
    with cols[1]:
        clear_images = st.button("Clear results", type="secondary")

    if clear_images:
        st.session_state["image_options"] = []
        st.session_state["selected_image_idx"] = 0

    auto_image_search = st.session_state.get("pending_auto_image_search", False)
    run_image_search = (search_trigger or auto_image_search) and sanitized_image_phrase
    if run_image_search and PIXABAY_API_KEY:
        perform_image_search(sanitized_image_phrase)
        st.session_state["pending_auto_image_search"] = False
    elif run_image_search and not PIXABAY_API_KEY:
        st.warning("Set PIXABAY_API_KEY to enable image search.")
        st.session_state["pending_auto_image_search"] = False

    image_options: List[Dict[str, str]] = st.session_state.get("image_options", [])
    if image_options:
        display_images: List = []
        for option in image_options:
            if option.get("preview_bytes"):
                buffer = BytesIO(option["preview_bytes"])
                with Image.open(buffer) as img:
                    display_images.append(img.convert("RGB"))
            else:
                display_images.append(option.get("thumbnail") or option.get("image") or option.get("vector"))
        captions = [
            f"Option {idx + 1}: {option.get('tags', 'No tags')}" for idx, option in enumerate(image_options)
        ]
        selected_idx = image_select(
            "Click an image to select it.",
            display_images,
            captions=captions,
            index=st.session_state.get("selected_image_idx", 0),
            use_container_width=False,
            return_value="index",
        )
        st.session_state["selected_image_idx"] = selected_idx
        chosen_image = image_options[selected_idx]
    else:
        chosen_image = None

    st.divider()
    st.subheader("Step 2 · Audio")
    if not GTTS_AVAILABLE:
        st.warning("Install gTTS (`pip install gTTS`) to enable text-to-speech audio generation.")
    else:
        if english_word and (
            not st.session_state["tts_text_input"]
            or st.session_state.get("last_english_for_tts") != english_word
        ):
            st.session_state["tts_text_input"] = english_word
            st.session_state["last_english_for_tts"] = english_word

        voice_label = st.selectbox("Voice accent", options=VOICE_LABELS, key="voice_select")
        tts_text = st.text_input("Pronunciation text", max_chars=80, key="tts_text_input")
        audio_cols = st.columns([1, 1])
        with audio_cols[0]:
            generate_audio = st.button(
                "Generate audio",
                disabled=not tts_text,
                help="Creates an MP3 with Google Text-to-Speech.",
            )
        with audio_cols[1]:
            clear_audio = st.button("Discard audio", type="secondary")

        if clear_audio:
            st.session_state["audio_bytes"] = None
            st.session_state["audio_rel_path"] = None

        if generate_audio and tts_text:
            update_audio_from_text(tts_text, word_id, voice_label, announce=True)

        auto_audio_needed = (
            st.session_state.get("pending_auto_audio")
            and not st.session_state.get("audio_bytes")
            and tts_text
        )
        if auto_audio_needed and word_id:
            success = update_audio_from_text(tts_text, word_id, voice_label, announce=False)
            st.session_state["pending_auto_audio"] = not success

        if st.session_state.get("audio_bytes"):
            st.audio(st.session_state["audio_bytes"], format="audio/mp3", sample_rate=None)

    st.divider()
    st.subheader("Step 3 · Save the word")
    save_button = st.button(
        "Save word to data/words.json",
        type="primary",
        disabled=not (
            english_word
            and chosen_image
            and st.session_state.get("audio_bytes")
            and st.session_state.get("audio_rel_path")
        ),
    )

    if save_button:
        if not word_id:
            st.error("Cannot save without a valid word id.")
            return
        image_url = chosen_image.get("vector") or chosen_image.get("image")
        if not image_url:
            st.error("Selected image does not have a downloadable URL.")
            return

        image_rel_path = f"assets/images/{word_id}.png"
        image_dest = PROJECT_ROOT / image_rel_path
        audio_rel_path: Optional[str] = st.session_state.get("audio_rel_path")
        audio_bytes: Optional[bytes] = st.session_state.get("audio_bytes")

        if not audio_rel_path or not audio_bytes:
            st.error("Audio is missing. Generate audio before saving.")
            return

        audio_dest = PROJECT_ROOT / audio_rel_path
        try:
            save_prepared_image(image_url, image_dest)
            audio_dest.write_bytes(audio_bytes)
        except requests.RequestException as error:
            st.error(f"Failed to download the selected image: {error}")
            return
        except ValueError as error:
            st.error(str(error))
            return
        except OSError as error:
            st.error(f"Failed to write files: {error}")
            return

        tags = [tag.strip() for tag in tags_raw.split(",") if tag.strip()]
        entry = {
            "id": word_id,
            "english": english_word.strip(),
            "hebrew": hebrew_word.strip() if hebrew_word else "",
            "audio": audio_rel_path,
            "image": image_rel_path,
            "distractorWordIds": distractor_ids,
            "tags": tags,
            "difficulty": difficulty,
            "firstLetterOptional": optional_first_letter,
        }

        remaining = [word for word in existing_words if word["id"] != word_id]
        remaining.append(entry)
        save_words({"words": remaining})

        st.success(f'Saved "{english_word}" to data/words.json.')
        st.balloons()

        # Reset session so adding another word starts fresh.
        st.session_state["image_options"] = []
        st.session_state["selected_image_idx"] = 0
        st.session_state["audio_bytes"] = None
        st.session_state["audio_rel_path"] = None
        st.session_state["pending_auto_image_search"] = False
        st.session_state["pending_auto_audio"] = False
        current_idx = st.session_state.get("current_import_idx")
        if current_idx is not None:
            st.session_state["import_progress_idx"] = current_idx + 1
        st.session_state["advance_to_next"] = True


if __name__ == "__main__":
    main()
