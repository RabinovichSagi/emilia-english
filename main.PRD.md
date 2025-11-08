# Emilia English Practice – Product Requirements Document

- **Document version:** 1.0  
- **Date:** 2024-XX-XX  
- **Author:** Codex Assistant  
- **Stakeholders:** Parent (product owner), 8-year-old learner, frontend developer, content curator

---

## 1. Background & Vision

The Emilia English Practice web app is a playful, Duolingo-inspired experience designed to help an eight-year-old learner reinforce English vocabulary through short, varied exercises. The product blends visual, auditory, and textual cues to keep practice engaging and to support different learning styles. Consistent use should improve word recognition across modalities (written, spoken, and visual) while keeping sessions light, friendly, and fun.

**North Star:** The learner confidently recognizes new vocabulary across word, sound, and visual forms, while enjoying recurring practice sessions on a tablet or phone.

---

## 2. Goals & Success Metrics

- **Learning retention:** ≥80% accuracy on familiar words across all modalities within four weeks of practice.
- **Engagement:** Average session length of 10–15 minutes with at least three sessions per week.
- **Content agility:** Parent can add or adjust words, images, and audio via JSON and asset folders within five minutes without developer intervention.
- **Usability:** Learner navigates exercises independently after one guided session; responsive layout works seamlessly on tablet (primary) and phone (secondary).

---

## 3. Target Users & Personas

- **Primary user – Emilia (8-year-old):** Curious, responds well to playful visuals, loves purple, comfortable tapping and swiping on tablet, prefers short feedback loops and positive reinforcement.
- **Secondary user – Parent:** Curates word list, assets, and monitors progress metrics. Needs simple, transparent structure to extend content and review performance logs.

---

## 4. Scope

### In Scope
- Responsive vanilla web app optimized for tablets, usable on phones.
- Single learner experience (no login/profiles).
- Multiple exercise types with consistent 4-option multiple choice mechanic.
- Audio playback for sound-based prompts (locally hosted files).
- JSON-based content library stored within the codebase and version-controlled with Git.
- Progress logging per word + question format + answer format combination with timestamps.
- Spaced repetition and adaptive difficulty based on performance history.
- Basic session summary for the parent (e.g., modal or dedicated page/section).

### Out of Scope (Phase 1)
- User accounts, cloud sync, or multi-learner profiles.
- External analytics dashboards beyond built-in progress logs.
- Marketplace, social features, or community sharing.
- Payment flows or monetization.

---

## 5. Core User Stories

1. **As Emilia**, I want to see a friendly card that tells me what to do next so I can start playing right away.
2. **As Emilia**, I want to tap a play button to hear a word and choose the matching picture or written word.
3. **As Emilia**, I want the app to celebrate correct answers and gently explain mistakes so I stay motivated.
4. **As the parent**, I want to add new vocabulary (word, image, sound, distractors) using a JSON file so I can tailor the practice set.
5. **As the parent**, I want to review how well Emilia recognizes each word across written, audio, and visual prompts so I can target weak spots.
6. **As Emilia**, I want short practice streaks that get slightly harder over time so the app stays challenging but not frustrating.

---

## 6. Gameplay Loop

1. **Session start:** Learner sees a welcome screen with either “Start Practice” or “Continue”.
2. **Exercise card:** App selects a word based on spaced repetition and adaptive rules, then chooses a question format (prompt type) and answer format (response modality).
3. **Prompt display:** Card shows instructions (e.g., “Which picture matches this word?”) with the stimulus (word text, Hebrew translation, image, or playable audio).
4. **Transition:** When an exercise ends, fade the interface out, display a blank state for 500 ms, then fade in the next exercise card to provide a calming break.
5. **Options:** Four choices rendered as buttons, images, letter chips, or combined elements depending on the exercise format. One is correct, three are distractors drawn from the word’s `distractorWordIds` list when available or at random otherwise. Letter exercises still use the 4-choice layout with simple letter chips.
6. **Feedback:** Immediate positive reinforcement for correct answers; for incorrect answers, reveal the correct option, optionally replay audio or display image, and encourage another try soon.
7. **Logging:** Record attempt details (timestamp, word id, question format, answer format, result, time-to-answer).
8. **Next steps:** Show next exercise automatically. After a set of N exercises (default 10), surface a progress summary with key highlights.

---

## 7. Exercise Formats

Each exercise combines a **prompt format** (the stimulus presented) and an **answer format** (what the learner chooses). Default mix should rotate modalities to avoid repetition.

| Prompt format (stimulus) | Answer format (options) | Example |
| --- | --- | --- |
| English word text | Hebrew translations | “desk” → “שולחן” |
| English word text | Image thumbnails | “desk” → choose correct picture |
| English word text | Audio clips | “desk” → tap to hear each choice |
| Hebrew translation | English word text | “שולחן” → choose “desk” |
| Image | English word text | Picture of desk → choose “desk” |
| Audio clip (play button) | English word text | Hear /desk/ → choose “desk” |
| Audio clip | Images | Hear /desk/ → choose matching picture |
| Letter chip (e.g., “D”) | Images or audio clips | Pick a word that starts with the shown letter |
| Image/audio | Letter chips | See or hear “dog” → tap the first letter (“D”) |

**Default behavior:** Use at least three distinct format pairings per session. Allow configuration of which pairings are active via JSON or constants.
Letter drills share the same single-card UX and four-choice mechanic as other exercises; they appear only for words with a defined starting letter and when enough distractor letters are available.

---

## 8. Content Model & JSON Structure

### File organization
- `data/words.json`: canonical list of words at project root.
- `assets/audio/<word-id>.mp3`: word audio files reachable via relative paths.
- `assets/images/<word-id>.png`: word imagery reachable via relative paths.

### Word schema
```jsonc
{
  "id": "desk",                    // unique identifier (slug)
  "english": "desk",               // display word
  "hebrew": "שולחן",               // translation
  "audio": "assets/audio/desk.mp3",// relative path to audio
  "image": "assets/images/desk.png",// relative path to image
  "initialLetter": "d",            // optional lowercase English starting letter; omit or null if not tied to current alphabet work
  "distractorWordIds": ["chair", "table", "lamp"], // optional; fall back to random
  "tags": ["furniture", "school"], // optional for future groupings
  "difficulty": 2                  // 1–5 scale for initial sequencing
}
```

### Maintenance requirements
- JSON must be valid and human-readable (2-space indentation).
- Keep assets named with the word `id` for consistency.
- If a word should be excluded from letter drills (e.g., name, blended sound), omit `initialLetter` or set it to `null`.
- Ensure asset files live in the `assets/` folder so GitHub Pages serves them without extra configuration; double-check by opening the HTML preview.
- Provide a README snippet illustrating how to add new entries and where to store media.
- Mandate Git version control for JSON and asset updates.

---

## 9. Adaptive Learning & Spaced Repetition

- **Initial ordering:** Shuffle within difficulty tiers, mixing easy and medium words for warm-up.
- **Leitner-style buckets:** Track each word + prompt-format + answer-format tuple in three mastery buckets: `new`, `learning`, `mastered`. Promotions/demotions occur based on streak thresholds (e.g., 2 consecutive correct answers promote, 1 incorrect demotes).
- **Scheduling:** Prioritize words with lowest mastery bucket and oldest timestamp. Ensure each session reviews at least two previously missed tuples.
- **Adaptive difficulty:** Increase frequency of challenging modalities (e.g., audio) for words where accuracy <70% for that modality. If accuracy rises above 85% over the last five attempts, reduce frequency.
- **Session size:** Default 10 exercises, configurable. Guarantee variety by not repeating the same tuple within three exercises unless the learner answered incorrectly and immediate reinforcement is enabled.
- **Letter drill availability:** When the scheduler selects a word that has an `initialLetter`, it may substitute one of the new letter formats while keeping the same spaced-repetition priority; words without `initialLetter` simply skip those formats.

---

## 10. Progress Tracking & Reporting

- **Data captured per attempt:**
  - `timestamp`
  - `wordId`
  - `questionFormat` (e.g., `text-prompt`)
  - `answerFormat` (e.g., `image-options`)
  - `result` (`correct`/`incorrect`)
  - `attemptDurationMs`
  - `selectedOptionId`
  - `wasHintUsed` (future-friendly; default false)
- **Storage:** Local JSON log or browser storage (IndexedDB or localStorage). Provide export button to download as JSON for parent review.
- **Summary view:**
  - Overall accuracy this session.
  - Accuracy by modality combination (word ↔ translation, word ↔ sound, word ↔ image).
  - Highlight 3 weakest tuples with suggestion to revisit.
- **Privacy:** Entirely client-side; no network calls without future explicit opt-in.

---

## 11. User Experience & UI Guidelines

- **Visual style:** Friendly purple primary palette (#8E44AD baseline), contrasting accent colors, rounded cards, and playful micro-animations. Typography: child-friendly sans serif (e.g., Nunito).
- **Information hierarchy:** Large prompt at top, instructions in simple language, options arranged in 2x2 grid for tablet, responsive stack for phones.
- **Feedback:** Confetti or gentle sparkle animation on correct answer, encouraging tooltip for incorrect (“Almost! Try listening again.”).
- **Audio controls:** Prominent play button with visual feedback (waveform or glow). Disable other options until audio playback starts to encourage active listening when appropriate.
- **Transitions:** Fade the screen out, hold a blank card for 500 ms, then fade the next exercise in to reinforce pacing.
- **Accessibility:** 
  - Minimum 44px touch targets.
  - High contrast text (WCAG AA).
  - Offer toggle to show Hebrew with vowels if needed (future enhancement).
- **Navigation:** Single flow with top-level controls: `Start`, `Pause`, `Session Summary`, `Settings` (for parent toggles like session length).

---

## 12. Technical Requirements

- **Frontend:** Vanilla HTML, CSS, and JavaScript loaded directly in the browser; no build or bundling steps.
- **Hosting:** Must run statically on GitHub Pages with all files referenced via relative paths (`./assets/...`).
- **Module structure:** Use ES modules (`type="module"`) to keep code organized; split logic into clearly named files.
- **State handling:** Implement lightweight in-browser state (e.g., plain objects and helper functions) with comments explaining non-obvious flows.
- **Routing:** Single-page experience managed through DOM updates; no external router dependencies.
- **Styling:** Plain CSS using custom properties to theme purple primary colors; include responsive layout rules for tablets/phones.
- **Audio playback:** Use HTML5 Audio API; preload audio on first user interaction to comply with mobile autoplay policies.
- **Data loading:** Fetch `data/words.json` at startup, validating schema and asset availability; surface console warnings and on-screen notices if assets are missing.
- **Progress storage:** Store attempt history in `localStorage` and provide a JSON export button; structure logs so they remain human-readable.
- **Transitions:** Implement 500 ms fade-out → blank → fade-in sequencing between exercises using CSS transitions or requestAnimationFrame.
- **Letter drills:** Use the same card UI; when a selected word provides `initialLetter`, surface the letter-based prompt/answer pair and generate distractor letters from other known initials (fallback to purely text prompts if no asset is available).
- **Performance:** Ensure initial load stays under 3 seconds on mid-range tablets by deferring non-critical assets until needed.

---

## 13. Content & Asset Workflow

1. Parent prepares word entry with matching image (PNG/JPG, 512x512) and audio clip (MP3 ≤5s).
2. Place assets in `assets/images` and `assets/audio`, matching filenames to the word `id`.
3. Update `data/words.json` with the new entry. Optionally add `distractorWordIds`.
4. Open the app locally (e.g., `python -m http.server`) or via GitHub Pages preview to confirm assets load correctly.
5. Commit changes to Git with an informative message (`feat(content): add furniture vocabulary`).
6. Optional: jot notes on observed learner struggles to influence future spaced repetition tweaks.

Include README instructions and template entries to guide future additions.

---

## 14. Roadmap & Milestones

1. **Week 1 – Foundations**
   - Finalize UI wireframes and component architecture.
   - Implement JSON loading, base exercise loop, and basic styling.
2. **Week 2 – Modalities**
   - Add audio playback, image handling, and multiple prompt/answer formats.
   - Implement distractor logic and logging of attempt data.
3. **Week 3 – Adaptive Layer**
   - Build spaced repetition engine, mastery buckets, and session planning.
   - Create session summary dashboard for parent.
4. **Week 4 – Polish & Launch**
   - Refine animations, accessibility checks, responsive tweaks, and transition timing.
   - Verify GitHub Pages deployment, asset paths, and localStorage persistence.
   - Conduct usability run with learner, adjust pacing/difficulty, and capture final content tweaks.

---

## 15. Risks & Mitigations

- **Content fatigue:** Rotating formats and adaptive repetition reduce monotony. Parent can easily add fresh words.
- **Audio/device quirks:** Preload sounds after user interaction; provide fallback instructions if audio fails.
- **Incorrect asset paths:** Manual preview checklist plus runtime warnings when assets missing help catch issues before sharing.
- **Overwhelming difficulty:** Adaptive system ensures challenging modalities appear gradually; manual difficulty tags enable parent control.
- **Limited analytics:** Since only client-side storage is used, remind parent to export logs regularly to avoid accidental loss (e.g., clearing browser data).

---

## 16. QA & Acceptance Criteria

- Exercises display correctly on iPad Mini and iPhone-sized viewports in responsive emulator.
- Words without `distractorWordIds` still render four options with no duplicates.
- Audio plays only after tap; repeat plays allowed with minimal delay.
- Between exercises, UI fades out, shows blank state for 500 ms, then fades next card in.
- Progress log accurately records success/failure and timestamps for each modality combination and persists in `localStorage`.
- Session summary surfaces weakest modalities and reflects logged data.
- App runs from static files on GitHub Pages using relative asset paths without build tooling.
- Codebase includes concise comments explaining non-obvious logic (e.g., spaced repetition flow and transitions).

---

## 17. Resolved Questions

- **Hints:** After two incorrect attempts, automatically replay the relevant prompt (audio or highlight) once, then reveal the answer and mark it incorrect.
- **Session length:** Default session length remains 10 exercises, adjustable between 5 and 20 via a simple settings slider.
- **Caching:** Rely on standard browser caching; no service worker in Phase 1.
- **Retries:** Requeue incorrect tuples to reappear within the next three exercises until answered correctly, reinforcing spaced repetition.
---

This PRD establishes the foundation for a delightful, purple-themed vanilla web app that keeps vocabulary practice engaging while giving the parent transparent control over content and progress tracking. The JSON-based workflow and adaptive learning loop ensure the experience remains fresh, personalized, and effective for an eager young learner.
