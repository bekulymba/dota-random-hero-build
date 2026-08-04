'use strict';

/* =========================================================
   STATE
   ========================================================= */
const state = {
  hero: null,
  build: [],
  weirdness: false,
  difficulty: false,
};

/* =========================================================
   GENERATION — порядок выпадения = порядок покупки
   ========================================================= */

function pickHero() {
  return HEROES[Math.floor(Math.random() * HEROES.length)];
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Предметы, вручную исключённые из ротации (например, удалённые из игры
// патчем, который ещё не попал в дата-файл). Добавляй id сюда при необходимости —
// см. также кнопку "реролл" на каждом слоте, которая решает проблему point-in-time.
const BANNED_IDS = new Set([
  // 'aeon_disk',
]);

// Минимальная цена предмета для генерации. Дешёвые "почти стартовые" вещи
// вроде Bracer/Null Talisman технически являются полноценными предметами,
// но не создают ощущения "весёлого челленджа" — отсекаем их.
const MIN_ITEM_COST = 900;

// Некоторые предметы существуют в несколько уровней (Dagon 1-5, Necronomicon 1-3,
// Diffusal Blade 1-2) и в датасете лежат под одинаковым именем ("Dagon", "Necronomicon"...).
// Если выпадет младший уровень, визуально это неотличимо от "недостроенного" предмета —
// поэтому из каждой такой группы оставляем только самый дорогой (финальный) вариант.
function keepFinalTierOnly(items) {
  const bestByName = new Map();
  for (const item of items) {
    const existing = bestByName.get(item.name);
    if (!existing || item.cost > existing.cost) {
      bestByName.set(item.name, item);
    }
  }
  return Array.from(bestByName.values());
}

const POOL = keepFinalTierOnly(ITEMS);

function isAvailable(item) {
  return !BANNED_IDS.has(item.id) && item.cost >= MIN_ITEM_COST;
}

function pickBuild(weirdness) {
  const build = [];

  const available = POOL.filter(isAvailable);

  if (weirdness) {
    // Никаких ограничений на уникальность вообще — просто 6 бросков кубика.
    for (let i = 0; i < 6; i++) {
      build.push(available[Math.floor(Math.random() * available.length)]);
    }
    return build;
  }

  // Normal: без повторов, максимум 1 blink, максимум 1 пара ботинок.
  const pool = shuffled(available);
  let usedBlink = false;
  let usedBoots = false;

  for (const item of pool) {
    if (build.length === 6) break;
    if (item.isBlink && usedBlink) continue;
    if (item.isBoots && usedBoots) continue;
    build.push(item);
    if (item.isBlink) usedBlink = true;
    if (item.isBoots) usedBoots = true;
  }

  return build;
}

// Реролл одного слота — не трогая остальные 5.
// В Normal-режиме учитывает уже занятый билд (без дублей, лимит blink/boots).
function rerollSlot(index) {
  const build = state.build;
  const current = build[index];
  const available = POOL.filter(isAvailable);

  if (state.weirdness) {
    let next;
    do {
      next = available[Math.floor(Math.random() * available.length)];
    } while (next.id === current.id && available.length > 1);
    build[index] = next;
    return next;
  }

  const usedIds = new Set(build.map((it, i) => (i === index ? null : it.id)).filter(Boolean));
  const usedBlink = build.some((it, i) => i !== index && it.isBlink);
  const usedBoots = build.some((it, i) => i !== index && it.isBoots);

  const candidates = shuffled(available).filter(item => {
    if (usedIds.has(item.id)) return false;
    if (item.isBlink && usedBlink) return false;
    if (item.isBoots && usedBoots) return false;
    return true;
  });

  const next = candidates.find(c => c.id !== current.id) || candidates[0] || current;
  build[index] = next;
  return next;
}

/* =========================================================
   CHALLENGE SCORE (опционально, выключено по умолчанию)
   ========================================================= */

function challengeScore(build) {
  const totalCost = build.reduce((sum, i) => sum + i.cost, 0);
  const blinkCount = build.filter(i => i.isBlink).length;
  const bootsCount = build.filter(i => i.isBoots).length;
  const uniqueRatio = new Set(build.map(i => i.id)).size / build.length;

  let score = 1;
  if (totalCost > 24000) score++;
  if (totalCost > 32000) score++;
  if (blinkCount > 1) score++;
  if (bootsCount > 1) score++;
  if (uniqueRatio < 0.7) score++;

  return Math.max(1, Math.min(5, score));
}

/* =========================================================
   RENDER
   ========================================================= */

const els = {
  heroCard: document.getElementById('heroCard'),
  buildSlots: document.getElementById('buildSlots'),
  totalCost: document.getElementById('totalCost'),
  scoreRow: document.getElementById('scoreRow'),
  scoreStars: document.getElementById('scoreStars'),
};

function renderHero(hero, animate) {
  const attrClass = 'attr-' + hero.attr;
  els.heroCard.innerHTML = `
    <div class="hero-inner ${attrClass}">
      <div class="hero-portrait">
        <img class="hero-icon" src="${hero.icon}" alt="${hero.name}" onerror="this.style.opacity=0">
      </div>
      <div class="hero-name">${hero.name}</div>
      <div class="hero-attr">${attrLabel(hero.attr)}</div>
    </div>
  `;
  if (animate && window.anime) {
    anime({
      targets: els.heroCard.querySelector('.hero-inner'),
      opacity: [0, 1],
      translateY: [-14, 0],
      scale: [0.94, 1],
      duration: 480,
      easing: 'easeOutQuint',
    });
  }
}

function attrLabel(attr) {
  return { str: 'Сила', agi: 'Ловкость', int: 'Интеллект', all: 'Универсал' }[attr] || attr;
}

function renderBuildSkeleton() {
  els.buildSlots.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot slot-empty';
    slot.dataset.index = i;
    slot.innerHTML = `<span class="slot-num">${i + 1}</span>`;
    els.buildSlots.appendChild(slot);
  }
}

function fillSlot(index, item, animateIn) {
  const slot = els.buildSlots.children[index];
  slot.classList.remove('slot-empty');
  slot.classList.add('slot-filled');
  slot.innerHTML = `
    <span class="slot-num">${index + 1}</span>
    <img class="slot-icon" src="${item.icon}" alt="${item.name}" onerror="this.style.opacity=0">
    <div class="slot-info">
      <div class="slot-name">${item.name}</div>
      <div class="slot-cost">${item.cost.toLocaleString('ru-RU')} з.</div>
    </div>
    <button class="slot-reroll" data-reroll="${index}" title="Этот предмет удалили из игры или не нравится? Реролл только этого слота">⟳</button>
  `;
  if (window.anime && animateIn !== false) {
    anime({
      targets: slot,
      opacity: [0, 1],
      scale: [0.85, 1],
      duration: 320,
      easing: 'easeOutBack',
    });
  }
}

function onRerollClick(index) {
  const item = rerollSlot(index);
  fillSlot(index, item, false);
  const slot = els.buildSlots.children[index];
  if (window.anime) {
    anime({
      targets: slot.querySelector('.slot-icon'),
      rotate: [0, 360],
      duration: 420,
      easing: 'easeInOutQuad',
    });
    anime({
      targets: slot,
      backgroundColor: ['rgba(201,162,39,0.18)', 'rgba(13,14,19,1)'],
      duration: 600,
      easing: 'easeOutQuad',
    });
  }
  const total = state.build.reduce((s, i) => s + i.cost, 0);
  animateCounter(els.totalCost, total);
  if (state.difficulty) renderScore(state.build);
}

async function renderBuild(build) {
  renderBuildSkeleton();
  const total = build.reduce((s, i) => s + i.cost, 0);
  els.totalCost.textContent = '0';

  for (let i = 0; i < build.length; i++) {
    await wait(i === 0 ? 120 : 150);
    fillSlot(i, build[i]);
    animateCounter(els.totalCost, build.slice(0, i + 1).reduce((s, it) => s + it.cost, 0));
  }

  if (state.difficulty) {
    await wait(200);
    renderScore(build);
  } else {
    els.scoreRow.classList.add('hidden');
  }
}

function animateCounter(el, target) {
  const start = parseInt(el.textContent.replace(/\s/g, ''), 10) || 0;
  if (window.anime) {
    anime({
      targets: { v: start },
      v: target,
      duration: 260,
      round: 1,
      easing: 'easeOutQuad',
      update: (anim) => {
        el.textContent = Math.round(anim.animations[0].currentValue).toLocaleString('ru-RU');
      },
    });
  } else {
    el.textContent = target.toLocaleString('ru-RU');
  }
}

function renderScore(build) {
  const score = challengeScore(build);
  els.scoreRow.classList.remove('hidden');
  els.scoreStars.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const star = document.createElement('span');
    star.className = 'star';
    star.textContent = '☆';
    els.scoreStars.appendChild(star);
  }
  const stars = els.scoreStars.children;
  let i = 0;
  const interval = setInterval(() => {
    if (i >= score) { clearInterval(interval); return; }
    stars[i].textContent = '★';
    stars[i].classList.add('star-lit');
    if (window.anime) {
      anime({ targets: stars[i], scale: [1.6, 1], duration: 260, easing: 'easeOutBack' });
    }
    i++;
  }, 140);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* =========================================================
   ACTIONS
   ========================================================= */

async function newHero() {
  state.hero = pickHero();
  renderHero(state.hero, true);
}

async function newBuild() {
  state.build = pickBuild(state.weirdness);
  await renderBuild(state.build);
}

async function newEverything() {
  state.hero = pickHero();
  renderHero(state.hero, true);
  await wait(180);
  state.build = pickBuild(state.weirdness);
  await renderBuild(state.build);
}

/* =========================================================
   INIT
   ========================================================= */

function bounceButton(btn) {
  if (!window.anime) return;
  anime({ targets: btn, scale: [0.94, 1], duration: 260, easing: 'easeOutElastic(1, .6)' });
}

function init() {
  renderBuildSkeleton();
  state.hero = pickHero();
  renderHero(state.hero, false);

  document.getElementById('btnHero').addEventListener('click', (e) => {
    bounceButton(e.currentTarget);
    newHero();
  });
  document.getElementById('btnBuild').addEventListener('click', (e) => {
    bounceButton(e.currentTarget);
    newBuild();
  });
  document.getElementById('btnAll').addEventListener('click', (e) => {
    bounceButton(e.currentTarget);
    newEverything();
  });

  const weirdToggle = document.getElementById('toggleWeirdness');
  weirdToggle.addEventListener('change', (e) => {
    state.weirdness = e.target.checked;
    document.body.classList.toggle('weird-mode', state.weirdness);
  });

  els.buildSlots.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-reroll]');
    if (!btn) return;
    onRerollClick(parseInt(btn.dataset.reroll, 10));
  });

  const diffToggle = document.getElementById('toggleDifficulty');
  diffToggle.addEventListener('change', (e) => {
    state.difficulty = e.target.checked;
    if (!state.difficulty) els.scoreRow.classList.add('hidden');
  });
}

document.addEventListener('DOMContentLoaded', init);
