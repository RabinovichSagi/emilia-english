import { dom, state } from './state.js';
import {
  buildWordProgressMap,
  getOptionCountForTuple,
  isTupleMastered,
  wordSupportsFormat,
  markWordAsMastered,
  resetWordProgress,
} from './progress.js';
import { FORMAT_LABELS } from './config.js';

export function openControlPanel() {
  renderControlPanel();
  dom.controlPanel?.classList.remove('hidden');
}

export function hideControlPanel() {
  dom.controlPanel?.classList.add('hidden');
}

function renderControlPanel() {
  if (!dom.controlPanelBody) return;
  const data = buildControlPanelData();
  if (data.length === 0) {
    dom.controlPanelBody.innerHTML =
      '<p class="control-word-summary">Add words with assets to view progress.</p>';
    return;
  }
  dom.controlPanelBody.innerHTML = '';
  data.forEach((wordEntry) => {
    const section = document.createElement('section');
    section.className = 'control-word-section';

    const heading = document.createElement('h3');
    heading.textContent = `${wordEntry.word.english} (${wordEntry.word.id})`;
    section.appendChild(heading);

    const summary = document.createElement('p');
    summary.className = 'control-word-summary';
    summary.textContent = `Mastered formats: ${wordEntry.masteredFormats}/${wordEntry.totalFormats} • Pending: ${wordEntry.pendingFormats} • New: ${wordEntry.freshFormats}`;
    section.appendChild(summary);

    const actions = document.createElement('div');
    actions.className = 'control-word-actions';
    const skipButton = document.createElement('button');
    skipButton.type = 'button';
    skipButton.className = 'ghost-button';
    skipButton.textContent = 'Mark as Learned';
    skipButton.addEventListener('click', () => {
      markWordAsMastered(wordEntry.word.id);
      renderControlPanel();
    });

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'ghost-button';
    resetButton.textContent = 'Reset Progress';
    resetButton.addEventListener('click', () => {
      resetWordProgress(wordEntry.word.id);
      renderControlPanel();
    });

    actions.appendChild(skipButton);
    actions.appendChild(resetButton);
    section.appendChild(actions);

    const table = document.createElement('table');
    table.className = 'control-word-table';
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
      <th>Format</th>
      <th>Status</th>
      <th>Attempts</th>
      <th>Accuracy</th>
      <th>Option Level</th>
      <th>Recent</th>
    `;
    table.appendChild(headerRow);

    wordEntry.formats.forEach((formatEntry) => {
      const row = document.createElement('tr');
      const statusClass =
        formatEntry.status === 'Mastered'
          ? 'status-mastered'
          : formatEntry.status === 'Learning'
          ? 'status-learning'
          : 'status-new';
      row.innerHTML = `
        <td>${formatEntry.label}</td>
        <td><span class="control-status-pill ${statusClass}">${formatEntry.status}</span></td>
        <td>${formatEntry.attempts}</td>
        <td>${formatEntry.accuracy}%</td>
        <td>${formatEntry.optionLevel}</td>
        <td>${formatEntry.recent}</td>
      `;
      table.appendChild(row);
    });

    section.appendChild(table);
    dom.controlPanelBody.appendChild(section);
  });
}

function buildControlPanelData() {
  const progressMap = buildWordProgressMap();
  const entries = [];
  state.words.forEach((word) => {
    const formats = [];
    state.formats.forEach((format) => {
      if (!wordSupportsFormat(word, format)) return;
      const key = `${word.id}::${format.id}`;
      const stats = state.performanceMap.get(key);
      const status = !stats || !stats.attempts
        ? 'New'
        : isTupleMastered(stats)
        ? 'Mastered'
        : 'Learning';
      const accuracy =
        stats && stats.attempts
          ? Math.round((stats.correct / stats.attempts) * 100)
          : 0;
      const optionLevel = getOptionCountForTuple(word.id, format.id);
      const recent = getRecentAttemptSummary(word.id, format.id);
      formats.push({
        label: `${FORMAT_LABELS[format.promptType]} → ${FORMAT_LABELS[format.answerType]}`,
        status,
        attempts: stats?.attempts ?? 0,
        accuracy,
        optionLevel,
        recent,
      });
    });
    if (formats.length === 0) return;
    const progress = progressMap.get(word.id) ?? {
      totalFormats: formats.length,
      masteredFormats: 0,
      pendingFormats: 0,
      freshFormats: formats.length,
    };
    entries.push({
      word,
      totalFormats: progress.totalFormats,
      masteredFormats: progress.masteredFormats,
      pendingFormats: progress.pendingFormats,
      freshFormats: progress.freshFormats,
      formats,
    });
  });
  return entries;
}

function getRecentAttemptSummary(wordId, formatId, limit = 5) {
  const recent = [];
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    const entry = state.history[i];
    if (entry.wordId === wordId && entry.formatId === formatId) {
      recent.push(entry.result === 'correct' ? '✔︎' : '✗');
    }
    if (recent.length >= limit) break;
  }
  if (recent.length === 0) {
    return '—';
  }
  return recent.reverse().join(' ');
}
