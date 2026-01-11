# Emilia English

Static, browser-based English learning game plus a Streamlit word importer.

## Serve the game

Option 1 (Python):

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

Option 2 (Node):

```bash
npx serve .
```

Then open the URL it prints.

## Data files

- Word list: `data/words.json`
- Known letters: `data/known_letters.json` (controls which words are included)

## Word importer (optional)

```bash
scripts/start_ollama.sh
streamlit run scripts/word_importer.py
```

Set `PIXABAY_API_KEY` if you want image search, and install `gTTS` for audio.
