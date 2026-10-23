import { chooseUnseenWinCelebration, isRed, SUITS } from './cards.js';
import { paintCardFace } from './card-artwork.js';
import { createParticleAnimation } from './particle-effects.js';

const CELEBRATION_HISTORY_KEY = 'game-center-solitaire-celebrations-v1';
let trackedCelebrations = null;

function readCelebrationHistory() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(CELEBRATION_HISTORY_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function chooseNextWinCelebration(random = Math.random) {
  if (trackedCelebrations === null) trackedCelebrations = readCelebrationHistory();
  const choice = chooseUnseenWinCelebration(trackedCelebrations, random);
  trackedCelebrations = choice.seen;
  try {
    globalThis.localStorage?.setItem(CELEBRATION_HISTORY_KEY, JSON.stringify(trackedCelebrations));
  } catch {}
  return choice.celebration;
}

const unit = (index, salt = 0) => {
  const value = Math.sin((index + 1) * 127.1 + (salt + 1) * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

const transform = (x, y, scale = 1, rotate = 0) =>
  `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg) scale(${scale})`;

function createSprite(card, rect, tableRect) {
  const element = document.createElement('div');
  element.className = `playing-card game-layer-card${isRed(card) ? ' red' : ''}`;
  paintCardFace(element, card);
  const x = rect.left - tableRect.left;
  const y = rect.top - tableRect.top;
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
  return { element, card, x, y, width: rect.width, height: rect.height };
}

function getWinningCards(kind, state, table) {
  if (kind === 'spider') {
    const homes = [...table.querySelectorAll('.spider-home-space.completed')];
    return Array.from({ length: Math.min(104, state.completed * 13) }, (_, index) => ({
      card: {
        rank: index % 13 + 1,
        suit: Math.floor(index / 13) % state.suits,
      },
      anchor: homes[Math.floor(index / 13) % homes.length],
      stackOffset: index % 13,
    })).filter(item => item.anchor);
  }

  if (kind === 'pyramid') {
    return state.columns.flatMap(row => row.map(card => ({
      card,
      anchor: table.querySelector(`[data-game-card-id="${CSS.escape(String(card.id))}"]`),
      stackOffset: card.id % 7,
    }))).filter(item => item.anchor);
  }

  if (kind === 'tripeaks' || kind === 'golf') {
    const anchor = table.querySelector('.card-pile[data-zone="waste"]');
    return state.waste.map((card, stackOffset) => ({ card, anchor, stackOffset })).filter(item => item.anchor);
  }

  return state.foundations.flatMap((pile, suit) => {
    const anchor = table.querySelector(
      `.card-pile[data-zone="foundations"][data-pile-index="${suit}"]`,
    );
    return pile.map((card, stackOffset) => ({ card, anchor, stackOffset }));
  }).filter(item => item.anchor);
}

function collectSprites(kind, state, table, tableRect, layer) {
  const sample = table.querySelector('.playing-card');
  const sampleRect = sample?.getBoundingClientRect();
  const width = sampleRect?.width || Math.max(42, Math.min(76, tableRect.width * 0.055));
  const height = sampleRect?.height || width / 0.7;
  const entries = getWinningCards(kind, state, table);
  const sources = [...table.querySelectorAll('.playing-card')];
  const sprites = entries.map(({ card, anchor, stackOffset }) => {
    const anchorRect = anchor.getBoundingClientRect();
    const left = anchorRect.left + (anchorRect.width - width) / 2 + (stackOffset % 5) * 1.1;
    const top = anchorRect.top + (stackOffset % 7) * 1.2;
    const sprite = createSprite(card, { left, top, width, height }, tableRect);
    layer.append(sprite.element);
    return sprite;
  });
  sources.forEach(source => source.classList.add('celebration-source-hidden'));
  return { sprites, sources };
}

function animateBounce(sprites, bounds) {
  sprites.forEach((sprite, index) => {
    const gatherX = bounds.width / 2 - (sprite.x + sprite.width / 2);
    const gatherY = bounds.height * 0.16 - (sprite.y + sprite.height / 2);
    const pileX = (index % 7 - 3) * 1.6;
    const pileY = (index % 11) * 0.8;
    const bounciness = 0.72 + unit(index, 1) * 0.72;
    const bounceX = (unit(index, 2) - 0.5) * bounds.width * 0.3;
    const cycles = 2 + Math.floor(unit(index, 3) * 3);
    const frames = [
      { transform: transform(0, 0, 1), offset: 0 },
      { transform: transform(gatherX + pileX, gatherY + pileY, 0.9), offset: 0.34 },
    ];

    for (let cycle = 0; cycle < cycles; cycle++) {
      const decay = Math.pow(0.64, cycle);
      const direction = cycle % 2 ? -1 : 1;
      const peak = 0.34 + 0.61 * (cycle + 0.34) / cycles;
      const landing = 0.34 + 0.61 * (cycle + 0.72) / cycles;
      const height = (16 + unit(index, cycle + 4) * 30) * bounciness * decay;
      const drift = bounceX * decay * direction;
      frames.push(
        {
          transform: transform(gatherX + pileX + drift, gatherY + pileY - height, 1.02, direction * 7),
          offset: peak,
        },
        {
          transform: transform(gatherX + pileX - drift * 0.38, gatherY + pileY + height * 0.12, 0.95, -direction * 4),
          offset: landing,
        },
      );
    }
    frames.push({ transform: transform(gatherX + pileX, gatherY + pileY, 0.94), offset: 1 });
    sprite.element.classList.add('win-bounce');
    sprite.element.animate(frames, {
      duration: 2100,
      delay: index * 7,
      easing: 'cubic-bezier(.18,.72,.28,1)',
      fill: 'both',
    });
  });
}

function animateSpiral(sprites, bounds) {
  const centerX = bounds.width / 2;
  const centerY = bounds.height / 2;
  const firstDirection = 1;
  sprites.forEach((sprite, index) => {
    const startX = sprite.x + sprite.width / 2;
    const startY = sprite.y + sprite.height / 2;
    const startAngle = index / Math.max(1, sprites.length) * Math.PI * 2;
    const startRadius = 6 + index % 7;
    const exitRadius = Math.hypot(bounds.width / 2, bounds.height / 2)
      + Math.hypot(sprite.width, sprite.height) / 2 + 24;
    const frames = [{ transform: transform(0, 0), opacity: 1, offset: 0 }];
    for (let step = 0; step <= 64; step++) {
      const progress = step / 64;
      const turnProgress = progress <= 0.5
        ? progress * 2
        : 1 - (progress - 0.5) * 2;
      const angle = startAngle + firstDirection * turnProgress * Math.PI * 2;
      const radius = startRadius + (exitRadius - startRadius) * progress ** 1.5;
      const x = centerX + Math.cos(angle) * radius - startX;
      const y = centerY + Math.sin(angle) * radius - startY;
      const rotation = firstDirection * turnProgress * 360;
      frames.push({
        transform: transform(x, y, 0.9 - progress * 0.15, rotation),
        opacity: Math.max(0, 1 - Math.max(0, progress - 0.78) / 0.22),
        offset: 0.16 + progress * 0.84,
      });
    }
    sprite.element.classList.add('win-spiral');
    sprite.element.dataset.spiralFirstTurn = firstDirection > 0 ? 'clockwise' : 'counterclockwise';
    sprite.element.animate(frames, {
      duration: 3400,
      delay: index * 6,
      easing: 'linear',
      fill: 'both',
    });
  });
}

function animateFireworks(sprites, bounds, layer) {
  sprites.forEach((sprite, index) => {
    const startX = sprite.x + sprite.width / 2;
    const startY = sprite.y + sprite.height / 2;
    const gatherX = bounds.width / 2 - startX;
    const gatherY = bounds.height * 0.88 - startY;
    const angle = -Math.PI * 0.92 + (index / Math.max(1, sprites.length - 1)) * Math.PI * 0.84;
    const distance = Math.max(bounds.width, bounds.height) * (0.72 + unit(index, 5) * 0.4);
    const launchX = gatherX + Math.cos(angle) * distance;
    const launchY = gatherY + Math.sin(angle) * distance;
    sprite.element.classList.add('card-firework');
    sprite.element.animate([
      { transform: transform(0, 0, 0.72), opacity: 1, offset: 0 },
      { transform: transform(gatherX, gatherY, 0.84), opacity: 1, offset: 0.25 },
      { transform: transform(gatherX + (launchX - gatherX) * 0.58, gatherY + (launchY - gatherY) * 0.58, 1.38, (index % 2 ? 1 : -1) * 110), opacity: 1, offset: 0.52 },
      { transform: transform(launchX, launchY, 2.05, (index % 2 ? 1 : -1) * 220), opacity: 0.96, offset: 0.7 },
      { transform: transform(launchX, launchY, 3.1, (index % 2 ? 1 : -1) * 270), opacity: 0.7, offset: 0.82 },
      { transform: transform(launchX, launchY, 4.6, (index % 2 ? 1 : -1) * 360), opacity: 0, offset: 1 },
    ], {
      duration: 3500,
      delay: index * 4,
      easing: 'ease-out',
      fill: 'both',
    });
  });

  return createParticleAnimation(layer, 'fireworks', bounds, { burstCount: 8 });
}

function animateRain(sprites, bounds) {
  const cardWidth = sprites[0]?.width || 60;
  const lanes = Math.max(4, Math.min(12, Math.floor(bounds.width / (cardWidth * 0.9))));
  const cards = [];
  let animationEnd = 0;
  sprites.forEach((sprite, index) => {
    const lane = index % lanes;
    const depth = Math.floor(index / lanes);
    const x = (lane + 0.5) * bounds.width / lanes - sprite.width / 2;
    const y = -(depth + 1 + unit(index, 6) * 2) * sprite.height;
    const delay = lane * 55 + depth * 55;
    const duration = 3000 + unit(index, 11) * 500;
    animationEnd = Math.max(animationEnd, delay + duration);
    sprite.element.classList.add('card-rain');
    sprite.element.style.left = `${x}px`;
    sprite.element.style.top = `${y}px`;
    sprite.element.animate([
      { transform: transform(0, 0, 0.58 + unit(index, 7) * 0.32), opacity: 0.92 },
      {
        transform: transform((unit(index, 8) - 0.5) * 14, bounds.height + sprite.height * 2 - y,
          0.75 + unit(index, 9) * 0.5, (unit(index, 10) - 0.5) * 24),
        opacity: 0.92,
      },
    ], {
      duration,
      delay,
      easing: 'linear',
      fill: 'both',
    });
    cards.push(sprite.element);
  });

  let phase = 0;
  const interval = setInterval(() => {
    phase++;
    cards.forEach((card, index) => {
      const rank = ((index * 7 + phase * 3) % 13) + 1;
      const suit = (index + phase) % SUITS.length;
      paintCardFace(card, { rank, suit });
      card.classList.toggle('red', isRed({ suit }));
    });
  }, 80);
  return { interval, duration: animationEnd };
}

function animateWave(sprites, bounds, layer) {
  const across = Math.ceil(sprites.length / 2);
  sprites.forEach((sprite, index) => {
    const row = Math.floor(index / across);
    const column = index % across;
    const baseX = (column + 0.5) * bounds.width / across - sprite.width / 2;
    const baseY = bounds.height * (row ? 0.83 : 0.72) - sprite.height / 2;
    const amplitude = 12 + unit(index, 12) * 22;
    const phase = unit(index, 13) * Math.PI * 2;
    const frames = [{
      transform: transform(0, 0, 0.82),
      opacity: 1,
      offset: 0,
    }];
    for (let step = 0; step <= 28; step++) {
      const progress = step / 28;
      const angle = progress * Math.PI * 4 + phase;
      const swell = Math.sin(angle) + 0.34 * Math.sin(angle * 2.15 + 0.8)
        + 0.16 * Math.cos(angle * 3.1 - 0.55);
      const x = baseX + Math.sin(angle * 0.52) * 10 - sprite.x;
      const y = baseY + swell * amplitude - sprite.y;
      const depth = 0.54 + row * 0.24 + 0.1 * Math.sin(angle * 0.7);
      frames.push({
        transform: transform(x, y, depth, Math.sin(angle) * 5),
        opacity: 0.78 + 0.22 * Math.cos(angle * 0.8),
        offset: 0.12 + progress * 0.88,
      });
    }
    sprite.element.classList.add('card-wave');
    sprite.element.animate(frames, {
      duration: 2700,
      delay: index * 3,
      easing: 'linear',
      fill: 'both',
    });
  });
  return createParticleAnimation(layer, 'splash', bounds, { burstCount: 7 });
}

function animateTornado(sprites, bounds, layer) {
  sprites.forEach((sprite, index) => {
    const leftSide = index % 2 === 0;
    const direction = index % 3 === 0 ? -1 : 1;
    const phase = unit(index, 14) * Math.PI * 2;
    const entryX = bounds.width * (leftSide ? 0.12 : 0.88);
    const entryY = -sprite.height;
    const startX = sprite.x + sprite.width / 2;
    const startY = sprite.y + sprite.height / 2;
    const frames = [
      { transform: transform(0, 0, 1), opacity: 1, offset: 0 },
      { transform: transform(entryX - startX, entryY - startY, 0.38), opacity: 0.72, offset: 0.12 },
    ];
    for (let step = 0; step <= 24; step++) {
      const progress = step / 24;
      const centerPath = entryX + (bounds.width * 0.5 - entryX) * progress;
      const radius = bounds.width * (0.19 * (1 - progress) + 0.025);
      const angle = phase + direction * progress * Math.PI * 5;
      const x = centerPath + Math.cos(angle) * radius;
      const y = -sprite.height / 2 + progress * (bounds.height + sprite.height);
      const scale = 0.36 + progress * 0.98 + Math.sin(angle) * 0.08;
      frames.push({
        transform: transform(x - startX, y - startY, scale, direction * progress * 900),
        opacity: 1 - progress * 0.25,
        offset: 0.12 + progress * 0.88,
      });
    }
    sprite.element.classList.add('card-tornado');
    sprite.element.animate(frames, {
      duration: 2450,
      delay: index * 4,
      easing: 'linear',
      fill: 'both',
    });
  });
  return createParticleAnimation(layer, 'streaks', bounds);
}

export function createWinCelebration(effect, kind, state, table, gameElement, onComplete = () => {}) {
  const bounds = table.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = `solitaire-celebration-layer celebration-${effect}`;
  layer.dataset.cardTheme = gameElement.dataset.cardTheme || 'classic';
  layer.dataset.cardFaceStyle = gameElement.dataset.cardFaceStyle || 'classic';
  layer.dataset.cardBackStyle = gameElement.dataset.cardBackStyle || 'lattice';
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  });
  const gameStyles = getComputedStyle(gameElement);
  for (const property of [
    '--card-face', '--card-ink', '--card-red',
    '--card-back-start', '--card-back-end', '--card-back-pattern', '--card-back-border',
  ]) {
    layer.style.setProperty(property, gameStyles.getPropertyValue(property));
  }

  const { sprites, sources } = collectSprites(kind, state, table, bounds, layer);
  document.body.append(layer);

  let interval = null;
  let rainDuration = 0;
  let particleAnimation = null;
  switch (effect) {
    case 'bounce': animateBounce(sprites, bounds); break;
    case 'spiral': animateSpiral(sprites, bounds); break;
    case 'fireworks': particleAnimation = animateFireworks(sprites, bounds, layer); break;
    case 'rain': {
      const rain = animateRain(sprites, bounds);
      interval = rain.interval;
      rainDuration = rain.duration;
      break;
    }
    case 'wave': particleAnimation = animateWave(sprites, bounds, layer); break;
    case 'tornado': particleAnimation = animateTornado(sprites, bounds, layer); break;
  }

  const stagger = {
    bounce: sprites.length * 7,
    spiral: sprites.length * 6,
    fireworks: sprites.length * 4,
    rain: 1350,
    wave: sprites.length * 3,
    tornado: sprites.length * 4,
  }[effect] || 0;
  const duration = {
    bounce: 2100,
    spiral: 3400,
    fireworks: 3500,
    rain: 2400,
    wave: 2700,
    tornado: 2450,
  }[effect] || 2500;
  const animationEnd = Math.max(
    effect === 'rain' ? rainDuration : duration + stagger,
    particleAnimation?.duration || 0,
  );

  let cleaned = false;
  let timer = null;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(timer);
    clearInterval(interval);
    particleAnimation?.cleanup();
    layer.remove();
    sources.forEach(source => source.classList.remove('celebration-source-hidden'));
  };
  timer = setTimeout(() => {
    cleanup();
    onComplete();
  }, animationEnd + 350);
  return cleanup;
}
