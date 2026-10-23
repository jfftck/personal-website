const PALETTES = {
  fireworks: ['#ffe17b', '#ff5f7e', '#72e6ff', '#c39aff', '#a7ff83', '#fff8e7'],
  explosions: ['#ff503b', '#ff9d42', '#ffdc70', '#fff4d5', '#ff6a4d'],
  splash: ['#f2fdff', '#a4edff', '#69cfff', '#42a8de', '#c8f7ff'],
  streaks: ['#f6fdff', '#c5f5ff', '#8fe7ff', '#75beff'],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function randomSource() {
  let seed = (Date.now() ^ Math.floor(performance.now() * 10000)) >>> 0;
  if (!seed) seed = 0x6d2b79f5;
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function makeEvents(type, width, height, random, options) {
  if (Array.isArray(options.events)) return options.events;

  if (type === 'fireworks') {
    const count = options.burstCount || 8;
    return Array.from({ length: count }, (_, index) => ({
      delay: 240 + index * 440 + random() * 260,
      x: width * (0.12 + random() * 0.76),
      y: height * (0.12 + random() * 0.58),
      count: 115 + Math.floor(random() * 65),
      radius: Math.min(width, height) * (0.24 + random() * 0.19),
      life: 1850 + random() * 750,
      palette: PALETTES.fireworks,
    }));
  }

  if (type === 'splash') {
    const count = options.burstCount || 7;
    return Array.from({ length: count }, (_, index) => ({
      delay: 180 + index * 330 + random() * 140,
      x: width * (0.08 + ((index + random() * 0.8) / Math.max(1, count - 1)) * 0.84),
      y: height * (0.77 + random() * 0.13),
      count: 22 + Math.floor(random() * 20),
      radius: Math.min(width, height) * (0.1 + random() * 0.08),
      life: 850 + random() * 650,
      palette: PALETTES.splash,
    }));
  }

  if (type === 'explosions') {
    return (options.events || []).map(event => ({
      ...event,
      count: event.count || 52,
      radius: event.radius || Math.min(width, height) * 0.13,
      life: event.life || 850 + random() * 550,
      palette: event.palette || PALETTES.explosions,
    }));
  }

  return [];
}

function makeBurst(event, now, type, random, particles, rings) {
  const splash = type === 'splash';
  const palette = event.palette || PALETTES[type] || PALETTES.fireworks;
  if (!splash) {
    rings.push({
      x: event.x,
      y: event.y,
      radius: event.radius * (0.3 + random() * 0.18),
      life: 420 + random() * 240,
      age: 0,
      color: palette[Math.floor(random() * palette.length)],
    });
  }

  for (let index = 0; index < event.count; index++) {
    const angle = splash
      ? Math.PI * (1.08 + random() * 0.84)
      : (index / event.count) * Math.PI * 2 + (random() - 0.5) * 0.16;
    const speed = splash
      ? 55 + random() * event.radius * 2.2
      : event.radius * (0.55 + random() * 0.55) / (event.life / 1000);
    particles.push({
      x: event.x,
      y: event.y,
      px: event.x,
      py: event.y,
      vx: Math.cos(angle) * speed * (splash ? 1 : 1),
      vy: Math.sin(angle) * speed,
      gravity: splash ? 210 + random() * 180 : 55 + random() * 110,
      drag: splash ? 0.982 : 0.989,
      life: (splash ? 600 : 1250) + random() * (event.life - (splash ? 600 : 1250)),
      age: 0,
      size: splash ? 1.5 + random() * 3.4 : 1.8 + random() * 4.2,
      color: palette[Math.floor(random() * palette.length)],
      shape: random() < (splash ? 0.5 : 0.76) ? 'streak' : 'dot',
      started: now,
    });
  }
}

function addTornadoStreaks(elapsed, width, height, random, particles) {
  const progress = clamp(elapsed / 3000, 0, 1);
  const entryX = width * 0.12;
  const centerX = entryX + (width * 0.5 - entryX) * progress;
  const centerY = -45 + progress * (height + 100);
  const radius = width * (0.19 * (1 - progress) + 0.025);
  const angle = progress * Math.PI * 5;

  for (let index = 0; index < 7; index++) {
    const orbit = angle + index / 7 * Math.PI * 2;
    const speed = 100 + random() * 155;
    const tangent = orbit + Math.PI / 2;
    const x = centerX + Math.cos(orbit) * radius;
    const y = centerY + Math.sin(orbit) * radius * 0.36;
    particles.push({
      x, y, px: x, py: y,
      vx: Math.cos(tangent) * speed * 0.8 + (random() - 0.5) * 35,
      vy: 125 + Math.sin(tangent) * speed * 0.35,
      gravity: 16,
      drag: 0.985,
      life: 550 + random() * 650,
      age: 0,
      size: 1.2 + random() * 2.2,
      color: PALETTES.streaks[Math.floor(random() * PALETTES.streaks.length)],
      shape: 'streak',
      started: elapsed,
    });
  }
}

export function createParticleAnimation(layer, type, bounds, options = {}) {
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.className = 'celebration-particle-canvas';
  canvas.dataset.particleEffect = type;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = Math.ceil(width * pixelRatio);
  canvas.height = Math.ceil(height * pixelRatio);
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: `${width}px`,
    height: `${height}px`,
    zIndex: '20',
    pointerEvents: 'none',
  });
  const random = randomSource();
  const events = makeEvents(type, width, height, random, options);
  const particles = [];
  const rings = [];
  const spawnDuration = type === 'streaks' ? 3000 : 0;
  const maximumLife = type === 'streaks' ? 1200 : Math.max(0, ...events.map(event => event.life));
  const duration = type === 'streaks'
    ? spawnDuration + maximumLife
    : Math.max(0, ...events.map(event => event.delay + event.life + 650));
  canvas.dataset.particleBursts = String(events.length);
  canvas.dataset.particleDuration = String(Math.ceil(duration));
  layer.append(canvas);

  const context = canvas.getContext('2d');
  if (!context) {
    canvas.remove();
    throw new Error('Canvas particle effects are unavailable in this browser.');
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const startTime = performance.now();
  let eventIndex = 0;
  let nextStreak = 0;
  let frameId = 0;
  let cleaned = false;
  let previousTime = startTime;

  const render = now => {
    if (cleaned) return;
    const elapsed = now - startTime;
    const delta = Math.min(0.04, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;

    while (eventIndex < events.length && elapsed >= events[eventIndex].delay) {
      const event = events[eventIndex++];
      makeBurst(event, now, type, random, particles, rings);
    }
    if (type === 'streaks' && elapsed >= nextStreak && elapsed < spawnDuration) {
      addTornadoStreaks(elapsed, width, height, random, particles);
      nextStreak += 68;
    }

    context.clearRect(0, 0, width, height);
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const ring of rings) {
      ring.age += delta * 1000;
      const progress = clamp(ring.age / ring.life, 0, 1);
      context.globalAlpha = (1 - progress) * 0.72;
      context.strokeStyle = ring.color;
      context.lineWidth = 1.5 + (1 - progress) * 2;
      context.shadowColor = ring.color;
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(ring.x, ring.y, ring.radius * (0.35 + progress * 1.3), 0, Math.PI * 2);
      context.stroke();
    }
    for (const particle of particles) {
      particle.age += delta * 1000;
      const progress = clamp(particle.age / particle.life, 0, 1);
      particle.px = particle.x;
      particle.py = particle.y;
      particle.vx *= particle.drag;
      particle.vy = particle.vy * particle.drag + particle.gravity * delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      const fade = progress < 0.72 ? 1 : 1 - (progress - 0.72) / 0.28;
      context.globalAlpha = Math.max(0, fade);
      context.strokeStyle = particle.color;
      context.fillStyle = particle.color;
      context.lineWidth = particle.size;
      context.shadowColor = particle.color;
      context.shadowBlur = particle.size * 3.5;
      if (particle.shape === 'streak') {
        context.beginPath();
        context.moveTo(particle.px, particle.py);
        context.lineTo(particle.x, particle.y);
        context.stroke();
      } else {
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size * 0.8, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();

    for (let index = rings.length - 1; index >= 0; index--) {
      if (rings[index].age >= rings[index].life) rings.splice(index, 1);
    }
    for (let index = particles.length - 1; index >= 0; index--) {
      if (particles[index].age >= particles[index].life) particles.splice(index, 1);
    }

    if (elapsed < duration || particles.length || rings.length) {
      frameId = requestAnimationFrame(render);
    } else {
      context.clearRect(0, 0, width, height);
    }
  };
  frameId = requestAnimationFrame(render);

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    cancelAnimationFrame(frameId);
    canvas.remove();
  };
  return { canvas, duration, cleanup };
}
