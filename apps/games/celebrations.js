import { isRed, rankLabel, SUITS } from './cards.js';

const unit = (index, salt = 0) => {
  const value = Math.sin((index + 1) * 127.1 + (salt + 1) * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

const transform = (x, y, scale = 1, rotate = 0) =>
  `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg) scale(${scale})`;

function createSprite(card, rect, tableRect) {
  const element = document.createElement('div');
  element.className = `playing-card game-layer-card${isRed(card) ? ' red' : ''}`;
  element.textContent = `${rankLabel(card.rank)}${SUITS[card.suit]}`;
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
  sprites.forEach((sprite, index) => {
    const startX = sprite.x + sprite.width / 2;
    const startY = sprite.y + sprite.height / 2;
    const startAngle = Math.atan2(startY - centerY, startX - centerX);
    const startRadius = Math.hypot(startX - centerX, startY - centerY);
    const directions = [1, -1, 1];
    const frames = [];
    for (let step = 0; step <= 36; step++) {
      const progress = step / 36;
      const turn = Math.min(2, Math.floor(progress * 3));
      const fraction = step === 36 ? 1 : progress * 3 - turn;
      const direction = directions[turn];
      const previousTurns = directions.slice(0, turn).reduce((sum, sign) => sum + sign, 0);
      const angle = startAngle + (previousTurns + direction * fraction) * Math.PI * 2;
      const radius = startRadius * (1 - progress);
      const x = centerX + Math.cos(angle) * radius - startX;
      const y = centerY + Math.sin(angle) * radius - startY;
      const rotation = (previousTurns + direction * fraction) * 360;
      frames.push({
        transform: transform(x, y, 1 - progress * 0.55, rotation),
        opacity: 1 - progress * 0.18,
        offset: progress,
      });
    }
    sprite.element.classList.add('win-spiral');
    sprite.element.animate(frames, {
      duration: 2800,
      delay: index * 4,
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
    const distance = Math.max(bounds.width, bounds.height) * (0.58 + unit(index, 5) * 0.32);
    const launchX = gatherX + Math.cos(angle) * distance;
    const launchY = gatherY + Math.sin(angle) * distance;
    sprite.element.classList.add('card-firework');
    sprite.element.animate([
      { transform: transform(0, 0, 0.78), opacity: 1, offset: 0 },
      { transform: transform(gatherX, gatherY, 0.82), opacity: 1, offset: 0.25 },
      { transform: transform(gatherX + (launchX - gatherX) * 0.58, gatherY + (launchY - gatherY) * 0.58, 1.28, (index % 2 ? 1 : -1) * 110), opacity: 1, offset: 0.52 },
      { transform: transform(launchX, launchY, 1.9, (index % 2 ? 1 : -1) * 220), opacity: 0.96, offset: 0.7 },
      { transform: transform(launchX, launchY, 2.8, (index % 2 ? 1 : -1) * 270), opacity: 0.7, offset: 0.82 },
      { transform: transform(launchX, launchY, 4.2, (index % 2 ? 1 : -1) * 360), opacity: 0, offset: 1 },
    ], {
      duration: 2050,
      delay: index * 4,
      easing: 'ease-out',
      fill: 'both',
    });
  });

  const sparks = document.createElement('div');
  sparks.className = 'solitaire-fireworks at-bottom';
  for (let index = 0; index < 24; index++) {
    const spark = document.createElement('span');
    spark.style.setProperty('--spark-angle', `${index * 15}deg`);
    spark.style.setProperty('--spark-delay', `${1450 + index * 12}ms`);
    spark.style.setProperty('--spark-length', `${Math.max(bounds.width, bounds.height) * 0.42}px`);
    sparks.append(spark);
  }
  layer.append(sparks);
}

function animateRain(sprites, bounds) {
  const cardWidth = sprites[0]?.width || 60;
  const lanes = Math.max(4, Math.min(12, Math.floor(bounds.width / (cardWidth * 0.9))));
  const cards = [];
  sprites.forEach((sprite, index) => {
    const lane = index % lanes;
    const depth = Math.floor(index / lanes);
    const x = (lane + 0.5) * bounds.width / lanes - sprite.width / 2;
    const y = -(depth + 1 + unit(index, 6) * 2) * sprite.height;
    sprite.element.classList.add('card-rain');
    sprite.element.style.left = `${x}px`;
    sprite.element.style.top = `${y}px`;
    sprite.element.animate([
      { transform: transform(0, 0, 0.58 + unit(index, 7) * 0.32), opacity: 0.92 },
      { transform: transform((unit(index, 8) - 0.5) * 14, bounds.height + sprite.height * 2, 0.75 + unit(index, 9) * 0.5, (unit(index, 10) - 0.5) * 24), opacity: 0.08 },
    ], {
      duration: 1750 + unit(index, 11) * 650,
      delay: lane * 70 + depth * 85,
      easing: 'linear',
      fill: 'both',
    });
    cards.push(sprite.element);
  });

  let phase = 0;
  return setInterval(() => {
    phase++;
    cards.forEach((card, index) => {
      const rank = ((index * 7 + phase * 3) % 13) + 1;
      const suit = (index + phase) % SUITS.length;
      card.textContent = `${rankLabel(rank)}${SUITS[suit]}`;
    });
  }, 80);
}

function animateWave(sprites, bounds) {
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
}

function animateTornado(sprites, bounds) {
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
}

export function createWinCelebration(effect, kind, state, table, gameElement, onComplete = () => {}) {
  const bounds = table.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = `solitaire-celebration-layer celebration-${effect}`;
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  });
  const gameStyles = getComputedStyle(gameElement);
  for (const property of ['--card-face', '--card-ink', '--card-red']) {
    layer.style.setProperty(property, gameStyles.getPropertyValue(property));
  }

  const { sprites, sources } = collectSprites(kind, state, table, bounds, layer);
  document.body.append(layer);

  let interval = null;
  switch (effect) {
    case 'bounce': animateBounce(sprites, bounds); break;
    case 'spiral': animateSpiral(sprites, bounds); break;
    case 'fireworks': animateFireworks(sprites, bounds, layer); break;
    case 'rain': interval = animateRain(sprites, bounds); break;
    case 'wave': animateWave(sprites, bounds); break;
    case 'tornado': animateTornado(sprites, bounds); break;
  }

  const stagger = {
    bounce: sprites.length * 7,
    spiral: sprites.length * 4,
    fireworks: sprites.length * 4 + 24 * 12,
    rain: 1350,
    wave: sprites.length * 3,
    tornado: sprites.length * 4,
  }[effect] || 0;
  const duration = {
    bounce: 2100,
    spiral: 2800,
    fireworks: 2050,
    rain: 2400,
    wave: 2700,
    tornado: 2450,
  }[effect] || 2500;

  let cleaned = false;
  let timer = null;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(timer);
    clearInterval(interval);
    layer.remove();
    sources.forEach(source => source.classList.remove('celebration-source-hidden'));
  };
  timer = setTimeout(() => {
    cleanup();
    onComplete();
  }, duration + stagger + 350);
  return cleanup;
}
