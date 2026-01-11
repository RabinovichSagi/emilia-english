#!/usr/bin/env bash
set -euo pipefail

MODEL_NAME="${OLLAMA_MODEL:-llama3.1}"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
OLLAMA_HOST="${OLLAMA_HOST:-}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "ollama is not installed or not on PATH."
  exit 1
fi

check_ready() {
  curl -fsS "${OLLAMA_URL%/}/api/tags" >/dev/null 2>&1
}

if ! check_ready; then
  echo "Starting Ollama server..."
  if [[ -n "$OLLAMA_HOST" ]]; then
    OLLAMA_HOST="$OLLAMA_HOST" ollama serve >/tmp/ollama.log 2>&1 &
  else
    ollama serve >/tmp/ollama.log 2>&1 &
  fi

  for _ in {1..30}; do
    if check_ready; then
      break
    fi
    sleep 1
  done
fi

if ! check_ready; then
  echo "Ollama server did not start. Check /tmp/ollama.log."
  exit 1
fi

if ! ollama list | awk '{print $1}' | grep -q "^${MODEL_NAME}$"; then
  echo "Pulling model ${MODEL_NAME}..."
  ollama pull "$MODEL_NAME"
fi

echo "Ollama is running at ${OLLAMA_URL} with model ${MODEL_NAME} available."
