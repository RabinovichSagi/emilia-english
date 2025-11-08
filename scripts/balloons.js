const BALLOON_COUNT = 12;
const COLORS = [
  '#f06292',
  '#ffd54f',
  '#4dd0e1',
  '#ba68c8',
  '#81c784',
  '#ff8a65',
];

let overlay;
let container;
let initialized = false;

export async function initBalloonCelebration() {
  if (initialized) return;
  try {
    const response = await fetch('balloons.html');
    if (!response.ok) {
      throw new Error(`Failed to load balloons.html (${response.status})`);
    }
    const markup = await response.text();
    const template = document.createElement('template');
    template.innerHTML = markup.trim();
    document.body.appendChild(template.content);
    overlay = document.getElementById('balloon-overlay');
    container = overlay?.querySelector('.balloon-container');
    initialized = Boolean(overlay && container);
  } catch (error) {
    console.warn('Balloon celebration unavailable:', error);
    initialized = false;
  }
}

export function startBalloonCelebration() {
  if (!initialized || !overlay || !container) return;
  overlay.classList.remove('hidden');
  overlay.classList.add('balloon-overlay--active');
  container.innerHTML = '';
  for (let i = 0; i < BALLOON_COUNT; i += 1) {
    const balloon = createBalloon(i);
    container.appendChild(balloon);
  }
}

export function stopBalloonCelebration() {
  if (!initialized || !overlay || !container) return;
  overlay.classList.add('hidden');
  overlay.classList.remove('balloon-overlay--active');
  container.innerHTML = '';
}

function createBalloon(index) {
  const balloon = document.createElement('button');
  balloon.type = 'button';
  balloon.className = 'balloon';
  const color = COLORS[index % COLORS.length];
  balloon.style.setProperty('--balloon-color', color);
  const left = Math.random() * 80 + 10;
  const delay = Math.random() * 1.5;
  const duration = 6 + Math.random() * 4;
  const size = 0.9 + Math.random() * 0.4;

  balloon.style.setProperty('--balloon-left', `${left}%`);
  balloon.style.setProperty('--balloon-delay', `${delay}s`);
  balloon.style.setProperty('--balloon-duration', `${duration}s`);
  balloon.style.setProperty('--balloon-scale', size.toString());

  balloon.addEventListener('click', () => popBalloon(balloon));
  balloon.addEventListener('pointerdown', () => popBalloon(balloon));
  return balloon;
}

function popBalloon(balloon) {
  if (balloon.classList.contains('balloon--popped')) return;
  balloon.classList.add('balloon--popped');
  setTimeout(() => balloon.remove(), 450);
}
