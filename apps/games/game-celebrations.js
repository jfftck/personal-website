const effects = ['pulse', 'fade', 'fireworks', 'knock'];

const unit = (index, salt = 0) => {
  const value = Math.sin((index + 1) * 127.1 + (salt + 1) * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

export function chooseBoardCelebration(random = Math.random) {
  return effects[Math.max(0, Math.min(effects.length - 1, Math.floor(random() * effects.length)))];
}

function createLayer(anchor, className, game, effect) {
  const bounds = anchor.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = `game-celebration-layer ${className}`;
  layer.dataset.game = game;
  layer.dataset.effect = effect;
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  });
  const app = anchor.closest('.game-app');
  if (app) {
    layer.classList.add('game-app');
    for (const attribute of app.attributes) {
      if (attribute.name.startsWith('data-')) layer.setAttribute(attribute.name, attribute.value);
    }
    const appStyle = getComputedStyle(app);
    layer.style.color = appStyle.color;
    for (let index = 0; index < appStyle.length; index++) {
      const property = appStyle[index];
      if (property.startsWith('--')) layer.style.setProperty(property, appStyle.getPropertyValue(property));
    }
  }
  document.body.append(layer);
  return { layer, bounds };
}

function addBurst(layer, x, y, { color = '#ffe68b', delay = 0, duration = 1100, sparks = 12 } = {}) {
  const ring = document.createElement('span');
  ring.className = 'game-celebration-ring';
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.style.borderColor = color;
  layer.append(ring);
  ring.animate([
    { transform: 'translate(-50%, -50%) scale(.12)', opacity: 1 },
    { transform: 'translate(-50%, -50%) scale(3.8)', opacity: 0 },
  ], { duration, delay, easing: 'cubic-bezier(.12,.68,.28,1)', fill: 'both' });

  for (let index = 0; index < sparks; index++) {
    const spark = document.createElement('span');
    spark.className = 'game-celebration-spark';
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    spark.style.background = index % 3 === 0 ? '#fff' : color;
    spark.style.boxShadow = `0 0 .45rem ${color}`;
    layer.append(spark);
    const angle = index / sparks * Math.PI * 2;
    const distance = 24 + unit(index, delay) * 55;
    spark.animate([
      { transform: 'translate3d(0, 0, 0) scale(.25)', opacity: 1 },
      {
        transform: `translate3d(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px, 0) scale(1.1)`,
        opacity: 1,
        offset: 0.55,
      },
      {
        transform: `translate3d(${Math.cos(angle) * distance * 1.28}px, ${Math.sin(angle) * distance * 1.28}px, 0) scale(.15)`,
        opacity: 0,
      },
    ], { duration, delay, easing: 'ease-out', fill: 'both' });
  }
  return delay + duration;
}

function clearLayer(layer, sources = []) {
  layer.querySelectorAll('*').forEach(element => {
    element.getAnimations().forEach(animation => animation.cancel());
  });
  layer.remove();
  sources.forEach(source => source.classList.remove('game-celebration-source-hidden'));
}

function animatePieces(kind, board, winner, effect, onComplete) {
  const { layer, bounds } = createLayer(board, `piece-celebration piece-celebration--${effect}`, kind, effect);
  layer.dataset.winner = winner || 'draw';
  const sources = [...board.querySelectorAll(kind === 'chess' ? '.chess-piece' : '.disc')];
  const pieces = sources.map((source, index) => {
    const rect = source.getBoundingClientRect();
    const style = getComputedStyle(source);
    const clone = source.cloneNode(true);
    clone.classList.remove('disc-flipping', 'disc-placed', 'flip-from-black', 'flip-from-white', 'flip-to-black', 'flip-to-white');
    clone.classList.add('game-celebration-piece');
    clone.style.position = 'absolute';
    clone.style.left = `${rect.left - bounds.left}px`;
    clone.style.top = `${rect.top - bounds.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.margin = '0';
    clone.style.color = style.color;
    for (let propertyIndex = 0; propertyIndex < style.length; propertyIndex++) {
      const property = style[propertyIndex];
      if (property.startsWith('--')) {
        clone.style.setProperty(property, style.getPropertyValue(property));
      }
    }
    layer.append(clone);
    source.classList.add('game-celebration-source-hidden');
    const side = kind === 'chess'
      ? source.classList.contains('piece-white') ? 'white' : 'black'
      : source.classList.contains('white') ? 'white' : 'black';
    return { clone, side, index, x: rect.left - bounds.left + rect.width / 2, y: rect.top - bounds.top + rect.height / 2 };
  });

  let endTime = 0;
  if (effect === 'knock' && winner) {
    const centerX = bounds.width / 2;
    const centerY = bounds.height / 2;
    for (const piece of pieces) {
      const delay = piece.index * 5;
      const duration = 1500 + unit(piece.index, 3) * 180;
      if (piece.side === winner) {
        piece.clone.animate([
          { transform: 'scale(1)', offset: 0 },
          { transform: 'scale(1.22)', offset: 0.52 },
          { transform: 'scale(1)', offset: 1 },
        ], { duration, delay, easing: 'ease-in-out', fill: 'both' });
      } else {
        const angle = Math.atan2(piece.y - centerY, piece.x - centerX);
        const distance = Math.max(bounds.width, bounds.height) * 1.45;
        piece.clone.animate([
          { transform: 'translate3d(0,0,0) rotate(0) scale(1)', opacity: 1 },
          {
            transform: `translate3d(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px, 0) rotate(${unit(piece.index, 5) * 540 - 270}deg) scale(.48)`,
            opacity: 0,
          },
        ], { duration, delay, easing: 'cubic-bezier(.42,0,.9,.52)', fill: 'both' });
      }
      endTime = Math.max(endTime, delay + duration);
    }
  } else if (effect === 'fireworks') {
    for (const piece of pieces) {
      const delay = piece.index * 5;
      const duration = 1100 + unit(piece.index, 6) * 250;
      piece.clone.animate([
        { transform: 'scale(.72)', opacity: 1 },
        { transform: 'scale(1.5)', opacity: 1, offset: 0.35 },
        { transform: 'scale(2.8) rotate(24deg)', opacity: 0 },
      ], { duration, delay, easing: 'ease-out', fill: 'both' });
      endTime = Math.max(endTime, addBurst(layer, piece.x, piece.y, {
        color: piece.side === 'white' ? '#fff2ad' : '#8be7ff',
        delay: delay + 180,
        duration: 1000,
        sparks: 6,
      }));
    }
  } else {
    const fade = effect === 'fade';
    for (const piece of pieces) {
      const delay = piece.index * 5;
      const duration = fade ? 1350 : 1550;
      piece.clone.animate(fade ? [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(1.35)', opacity: 0.9, offset: 0.42 },
        { transform: 'scale(.18)', opacity: 0 },
      ] : [
        { transform: 'scale(.24)', opacity: 0.25 },
        { transform: 'scale(1.2)', opacity: 1, offset: 0.4 },
        { transform: 'scale(.88)', opacity: 1, offset: 0.72 },
        { transform: 'scale(1)', opacity: 1 },
      ], { duration, delay, easing: 'cubic-bezier(.2,.72,.28,1)', fill: 'both' });
      endTime = Math.max(endTime, delay + duration);
    }
  }

  let cleaned = false;
  let timer;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(timer);
    clearLayer(layer, sources);
  };
  timer = setTimeout(() => {
    cleanup();
    onComplete();
  }, endTime + 220);
  return cleanup;
}

export function createBoardCelebration(kind, board, winner, effect, onComplete = () => {}) {
  if (effect === 'knock' && !winner) effect = 'fireworks';
  return animatePieces(kind, board, winner, effect, onComplete);
}

export function createMinesweeperCelebration(board, state, onComplete = () => {}) {
  const { layer, bounds } = createLayer(
    board,
    `mine-celebration mine-celebration--${state.status}`,
    'minesweeper',
    state.status === 'won' ? 'fireworks' : 'explosions',
  );
  const cells = [...board.querySelectorAll('.mine-cell')];
  const targets = [];
  if (state.status === 'won') {
    const safe = state.cells.map((cell, index) => cell.open && !cell.mine ? index : -1).filter(index => index >= 0);
    for (let index = 0; index < 3 && safe.length; index++) {
      targets.push({ index: safe[Math.floor((index + 0.5) * safe.length / 3)] ?? safe.at(-1), delay: index * 260 });
    }
  } else {
    const mines = state.cells.map((cell, index) => cell.mine ? index : -1).filter(index => index >= 0);
    const maximum = Math.min(14, mines.length);
    for (let index = 0; index < maximum; index++) {
      const mineIndex = index === 0 && Number.isInteger(state.exploded)
        ? state.exploded
        : mines[Math.floor(index * mines.length / maximum)];
      if (!targets.some(target => target.index === mineIndex)) {
        targets.push({ index: mineIndex, delay: targets.length * 95 });
      }
    }
  }

  let endTime = 0;
  for (const target of targets) {
    const cell = cells[target.index];
    if (!cell) continue;
    const rect = cell.getBoundingClientRect();
    const isMine = state.status === 'lost';
    endTime = Math.max(endTime, addBurst(layer,
      rect.left + rect.width / 2 - bounds.left,
      rect.top + rect.height / 2 - bounds.top,
      {
        color: isMine ? '#ff624f' : '#ffd66f',
        delay: target.delay,
        duration: isMine ? 820 + unit(target.index, 2) * 220 : 1400,
        sparks: isMine ? 8 : 12,
      },
    ));
  }

  let cleaned = false;
  let timer;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(timer);
    clearLayer(layer);
  };
  timer = setTimeout(() => {
    cleanup();
    onComplete();
  }, endTime + 260);
  return cleanup;
}
