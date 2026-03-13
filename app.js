/*
  OX 문법 - offline PWA
  Data is stored in localStorage.
*/

const STORAGE_KEY = 'oxGrammarData.v2';
const APP_DATA_VERSION = 3;
const STUDY_STATE_KEY = 'oxGrammarStudyState.v1';
const DEFAULT_DAILY_NEW_COUNT = 100;
const DEFAULT_REVIEW_INTERVALS = [1, 3, 7, 14, 30];
const THEME_KEY = 'oxGrammarTheme.v1';

// -------------------------
// Utils
// -------------------------

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function now() {
  return Date.now();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeAnswer(v) {
  const s = String(v ?? '').trim().toUpperCase();
  if (!s) return null;
  if (['O', '○', 'T', 'TRUE', '1', 'YES', 'Y', '맞', '맞음', '정답'].includes(s)) return 'O';
  if (['X', '×', 'F', 'FALSE', '0', 'NO', 'N', '틀', '틀림', '오답'].includes(s)) return 'X';
  if (s.startsWith('O')) return 'O';
  if (s.startsWith('X')) return 'X';
  return null;
}

function normalizePromptKey(s) {
  // Used for de-duplication (vocab import). Case-insensitive + collapse spaces.
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
  }
  const s = String(value ?? '').trim();
  if (!s) return [];
  return s
    .split(/[\n,，;；|｜]+/)
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
}

function derivePolysemyFromMeaning(meaning) {
  const raw = String(meaning ?? '').trim();
  if (!raw) return [];
  let out = [];
  if (/[①②③④⑤⑥⑦⑧⑨⑩]/.test(raw)) {
    out = raw
      .split(/(?=[①②③④⑤⑥⑦⑧⑨⑩])/)
      .map((v) => v.trim())
      .filter(Boolean);
  } else if (/[;；]/.test(raw)) {
    out = raw
      .split(/[;；]/)
      .map((v) => v.trim())
      .filter(Boolean);
  } else if (/\s*\/\s*/.test(raw)) {
    out = raw
      .split(/\s*\/\s*/)
      .map((v) => v.trim())
      .filter(Boolean);
  } else {
    out = [raw];
  }
  return Array.from(new Set(out.map((v) => String(v).trim()).filter(Boolean)));
}

function formatPronunciationText(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (s.startsWith('/') || s.startsWith('[')) return s;
  return `/${s}/`;
}


function escapeText(s) {
  // For safety when interpolating into HTML.
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderMultiline(s) {
  return escapeText(String(s ?? '')).replace(/\n/g, '<br>');
}

function isEnglishVocabDeck(deck) {
  const name = String(deck?.name || '');
  return String(deck?.type || '').toLowerCase() === 'vocab' && /(영단어|english|eng|vocab)/i.test(name);
}

// -------------------------
// Storage
// -------------------------

function defaultData() {
  const deckId = uuid();

  // 초기 샘플(원하면 삭제/수정 가능)
  const baseCards = [
    {
      prompt: 'think it better to tell the truth',
      answer: 'O',
      explanation: 'think + it(가목적어) + 형용사 + to V 구조',
      tags: ['5형식', '가목적어'],
    },

    // who / whom
    {
      prompt: 'The man whom I think is honest is my teacher.',
      answer: 'X',
      explanation: 'I think (that) he is honest 구조 → he가 주어 → who가 맞음.',
      tags: ['관계사', 'who/whom'],
    },
    {
      prompt: 'The man whom I met yesterday is my teacher.',
      answer: 'O',
      explanation: 'I met him 구조 → him은 목적어 → whom 가능.',
      tags: ['관계사', 'who/whom'],
    },

    // 가정법 현재
    {
      prompt: 'If I were you, I would accept the offer.',
      answer: 'O',
      explanation: '현재 사실 반대 → If + 과거형, would + 동사원형.',
      tags: ['가정법', '현재'],
    },
    {
      prompt: 'If I was you, I would accept the offer.',
      answer: 'X',
      explanation: '가정법에서는 were 사용.',
      tags: ['가정법', '현재'],
    },

    // 가정법 과거
    {
      prompt: 'If she had studied harder, she would have passed the exam.',
      answer: 'O',
      explanation: '과거 사실 반대 → If + had p.p., would have p.p.',
      tags: ['가정법', '과거'],
    },
    {
      prompt: 'If she would have studied harder, she would have passed the exam.',
      answer: 'X',
      explanation: 'if절에 would 사용 불가.',
      tags: ['가정법', '과거'],
    },

    // 혼합가정
    {
      prompt: 'If I had known the truth, I would tell you now.',
      answer: 'O',
      explanation: '과거 조건 → 현재 결과.',
      tags: ['가정법', '혼합'],
    },
    {
      prompt: 'If I had known the truth, I would have told you now.',
      answer: 'X',
      explanation: 'now는 현재 의미 → would + 동사원형이 맞음.',
      tags: ['가정법', '혼합'],
    },

    // Only 도치
    {
      prompt: 'Only after he left she realized the truth.',
      answer: 'X',
      explanation: 'Only + 부사구 문두 → 도치 필요 → did she realize.',
      tags: ['도치', 'only'],
    },
    {
      prompt: 'Only after he left did she realize the truth.',
      answer: 'O',
      explanation: '조동사 did가 주어 앞으로 이동.',
      tags: ['도치', 'only'],
    },

    // 분사 ing / p.p.
    {
      prompt: 'The law required owners to pay heavy taxes will increase sales.',
      answer: 'X',
      explanation: 'required가 동사처럼 작동하여 동사 2개 발생 → requiring이 맞음.',
      tags: ['분사', 'ing'],
    },
    {
      prompt: 'The law requiring owners to pay heavy taxes will increase sales.',
      answer: 'O',
      explanation: 'requiring은 분사수식 → will increase가 주절 동사.',
      tags: ['분사', 'ing'],
    },
    {
      prompt: 'The law required by citizens was passed.',
      answer: 'O',
      explanation: 'required by ~ = 수동 의미 (요구된 법).',
      tags: ['분사', 'p.p.'],
    },
  ];

  const t = now();

  const cards = baseCards.map((c, idx) => {
    const id = uuid();
    return {
      id,
      deckId,
      prompt: c.prompt,
      answer: c.answer,
      explanation: c.explanation,
      tags: c.tags || [],
      createdAt: t + idx,
      updatedAt: t + idx,
    };
  });

  const stats = {};
  cards.forEach((c) => {
    stats[c.id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
  });

  return {
    version: APP_DATA_VERSION,
    decks: [
      {
        id: deckId,
        name: '리그래머 1-20',
        description: 'who/whom · 가정법 · 도치 · 분사',
        createdAt: t,
        order: 1,
        type: 'grammar',
      },
    ],
    cards,
    stats,
  };
}


function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const data = JSON.parse(raw);
    return normalizeData(data);
  } catch (e) {
    console.warn('Failed to load data:', e);
    return defaultData();
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function normalizeData(data) {
  const d = data && typeof data === 'object' ? data : {};
  if (!Array.isArray(d.decks)) d.decks = [];
  if (!Array.isArray(d.cards)) d.cards = [];
  if (!d.stats || typeof d.stats !== 'object') d.stats = {};
  if (!d.version) d.version = APP_DATA_VERSION;

  // Ensure deck shape (including type)
  d.decks.forEach((deck, idx) => {
    if (!deck.id) deck.id = uuid();
    if (!deck.name) deck.name = `카테고리 ${idx + 1}`;
    if (deck.order == null) deck.order = idx + 1;
    if (!deck.createdAt) deck.createdAt = now();

    // deck.type: 'grammar' | 'vocab'
    const dt = String(deck.type || '').toLowerCase();
    deck.type = dt === 'vocab' ? 'vocab' : 'grammar';

    if (deck.description == null) deck.description = '';
    if (!Number.isFinite(Number(deck.dailyCount)) || Number(deck.dailyCount) <= 0) deck.dailyCount = DEFAULT_DAILY_NEW_COUNT;
    if (isEnglishVocabDeck(deck)) deck.dailyCount = 100;
    if (!Array.isArray(deck.planReviewIntervals) || deck.planReviewIntervals.length === 0) deck.planReviewIntervals = DEFAULT_REVIEW_INTERVALS.slice();
    if (deck.planStartDate == null) deck.planStartDate = '';
  });

  // Ensure card shape & stats
  d.cards.forEach((c) => {
    if (!c.id) c.id = uuid();

    // Attach to a deck if missing
    if (!c.deckId) {
      if (!d.decks[0]) {
        d.decks.push({ id: uuid(), name: '기본', description: '', createdAt: now(), order: 1, type: 'grammar' });
      }
      c.deckId = d.decks[0].id;
    }

    if (!c.prompt) c.prompt = '';

    const deck = d.decks.find((x) => x.id === c.deckId) || null;
    const isVocabDeck = !!deck && deck.type === 'vocab';

    // Normalize answer
    c.answer = normalizeAnswer(c.answer) || 'O';
    if (isVocabDeck) c.answer = 'O'; // vocab deck: answer has no meaning (self-check)

    // vocab fields (optional)
    if (typeof c.meaning !== 'string') c.meaning = '';
    if (typeof c.mnemonic !== 'string') c.mnemonic = '';
    if (typeof c.example !== 'string') c.example = '';
    if (typeof c.exampleMeaning !== 'string') c.exampleMeaning = '';
    if (typeof c.pronunciation !== 'string') c.pronunciation = '';
    c.synonyms = normalizeStringArray(c.synonyms ?? c.synonym ?? c.syns ?? '');
    c.polysemy = normalizeStringArray(c.polysemy ?? c.senses ?? '');

    // Backward compatibility:
    // - Some vocab cards may have meaning stored in explanation
    if (isVocabDeck) {
      if (!c.meaning && c.explanation) c.meaning = String(c.explanation || '').trim();
      if (c.meaning && !c.explanation) c.explanation = String(c.meaning || '').trim();
    }

    if (!Array.isArray(c.tags)) c.tags = [];
    if (!c.createdAt) c.createdAt = now();
    if (!c.updatedAt) c.updatedAt = now();

    if (!d.stats[c.id]) d.stats[c.id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
    if (typeof d.stats[c.id].bookmark !== 'boolean') d.stats[c.id].bookmark = false;

    // Bookmark compatibility:
    // - v3: stats[cardId].bookmark
    // - v4+: card.bookmarked
    if (typeof c.bookmarked === 'boolean') {
      d.stats[c.id].bookmark = c.bookmarked;
    } else {
      c.bookmarked = !!d.stats[c.id].bookmark;
    }
  });

  // Remove stats for deleted cards
  const cardIds = new Set(d.cards.map((c) => c.id));
  Object.keys(d.stats).forEach((id) => {
    if (!cardIds.has(id)) delete d.stats[id];
  });

  return d;
}


let DATA = loadData();
let STUDY = null;

function commit() {
  DATA = normalizeData(DATA);
  saveData(DATA);
}

// -------------------------
// UI helpers: toast, modal, drawer
// -------------------------

const appEl = $('#app');
const subtitleEl = $('#header-subtitle');
const toastEl = $('#toast');
const modalBackdropEl = $('#modal-backdrop');
const modalEl = $('#modal');
const drawerEl = $('#drawer');

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2200);
}

function getSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'dark' || saved === 'light' ? saved : null;
  } catch (e) {
    return null;
  }
}

function applyTheme(theme, opts = {}) {
  const persist = opts.persist ?? true;
  const quiet = opts.quiet ?? false;
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  document.body.dataset.theme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'dark' ? '#0f1115' : '#ffffff');
  if (persist) {
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  }
  const btn = $('#btn-theme');
  if (btn) btn.textContent = next === 'dark' ? '☀ 라이트 모드' : '🌙 다크 모드';
  if (!quiet) toast(next === 'dark' ? '다크모드 ON' : '라이트 모드 ON');
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
  closeDrawer();
}

function syncThemeWithSystemIfNeeded() {
  if (getSavedTheme()) return;
  applyTheme(getSystemTheme(), { persist: false, quiet: true });
}

function openModal({ title, bodyHTML, onMount }) {
  modalEl.innerHTML = `
    <h2>${escapeText(title)}</h2>
    <div>${bodyHTML}</div>
  `;
  modalBackdropEl.classList.remove('hidden');
  // Close on backdrop click
  modalBackdropEl.onclick = (e) => {
    if (e.target === modalBackdropEl) closeModal();
  };
  document.body.style.overflow = 'hidden';
  if (onMount) onMount(modalEl);
}

function closeModal() {
  modalBackdropEl.classList.add('hidden');
  modalEl.innerHTML = '';
  modalBackdropEl.onclick = null;
  document.body.style.overflow = '';
}

function openDrawer() {
  drawerEl.classList.remove('hidden');
  drawerEl.onclick = (e) => {
    if (e.target === drawerEl) closeDrawer();
  };
}

function closeDrawer() {
  drawerEl.classList.add('hidden');
  drawerEl.onclick = null;
}

$('#nav-menu').addEventListener('click', () => {
  if (drawerEl.classList.contains('hidden')) openDrawer();
  else closeDrawer();
});

$('#nav-back').addEventListener('click', () => {
  // Prefer history back, but ensure we don't exit the app on mobile
  if (location.hash && location.hash !== '#/' && location.hash !== '#') {
    history.back();
  } else {
    location.hash = '#/';
  }
});

$$('[data-nav]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-nav');
    closeDrawer();
    location.hash = target;
  });
});

$('#btn-reset').addEventListener('click', () => {
  closeDrawer();
  const ok = confirm('저장된 카테고리/문제/기록을 전부 삭제할까요? (되돌릴 수 없음)');
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  clearStudyState();
  STUDY = null;
  DATA = loadData();
  toast('초기화 완료');
  location.hash = '#/';
  renderRoute();
});

$('#btn-theme')?.addEventListener('click', toggleTheme);
applyTheme(getSavedTheme() || getSystemTheme(), { persist: false, quiet: true });
if (window.matchMedia) {
  const __themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
  if (__themeMedia.addEventListener) __themeMedia.addEventListener('change', syncThemeWithSystemIfNeeded);
  else if (__themeMedia.addListener) __themeMedia.addListener(syncThemeWithSystemIfNeeded);
}

// -------------------------
// Routing
// -------------------------

function parseRoute() {
  const hash = (location.hash || '#/').replace(/^#/, '');
  const [path, queryStr] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryStr || '').entries());
  return { parts, query };
}

window.addEventListener('hashchange', safeRenderRoute);
window.addEventListener('pageshow', safeRenderRoute);

// -------------------------
// Views
// -------------------------

function setSubtitle(text) {
  subtitleEl.textContent = text || '';
}

function getDeck(deckId) {
  return DATA.decks.find((d) => d.id === deckId) || null;
}

function getCards(deckId) {
  return DATA.cards.filter((c) => c.deckId === deckId);
}

function deckStats(deckId) {
  const cards = getCards(deckId);
  let correct = 0;
  let wrong = 0;
  cards.forEach((c) => {
    const s = DATA.stats[c.id];
    if (!s) return;
    correct += s.correct || 0;
    wrong += s.wrong || 0;
  });
  const total = correct + wrong;
  const acc = total === 0 ? null : Math.round((correct / total) * 100);
  return { cardsCount: cards.length, correct, wrong, total, acc };
}



function isBookmarked(cardId) {
  const card = DATA.cards?.find((c) => c.id === cardId);
  if (card && typeof card.bookmarked === 'boolean') return card.bookmarked;
  return !!(DATA.stats?.[cardId]?.bookmark);
}

function toggleBookmark(cardId, force = null) {
  if (!DATA.stats[cardId]) DATA.stats[cardId] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
  const card = DATA.cards?.find((c) => c.id === cardId) || null;
  const cur = isBookmarked(cardId);
  const next = force == null ? !cur : !!force;
  DATA.stats[cardId].bookmark = next;
  if (card) {
    card.bookmarked = next;
    card.updatedAt = now();
  }
  commit();
  return next;
}

function deckBookmarkCount(deckId) {
  return getCards(deckId).filter((c) => isBookmarked(c.id)).length;
}

function isWrongCard(cardId) {
  return (DATA.stats?.[cardId]?.wrong || 0) > 0;
}

function deckWrongCount(deckId) {
  return getCards(deckId).filter((c) => isWrongCard(c.id)).length;
}

// -------------------------
// Tags: collect / filter / tag-based study
// -------------------------

function normalizeTag(t) {
  const s = String(t ?? '').trim();
  return s;
}

function parseTagsParam(tagsStr) {
  if (!tagsStr) return [];
  return String(tagsStr)
    .split(',')
    .map((t) => normalizeTag(t))
    .filter(Boolean);
}

function uniqueSorted(arr) {
  const set = new Set((arr || []).map((x) => String(x).trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
}

function getDeckTags(deckId, baseMode = 'all') {
  // baseMode: all/bookmarks/wrongs
  const ids = getCardIdsForMode(deckId, baseMode);
  const tags = [];
  ids.forEach((cid) => {
    const c = DATA.cards.find((x) => x.id === cid);
    if (!c) return;
    (c.tags || []).forEach((t) => tags.push(normalizeTag(t)));
  });
  return uniqueSorted(tags);
}

function cardHasTags(card, selectedTags, match = 'any') {
  const tags = Array.isArray(card?.tags) ? card.tags.map(normalizeTag).filter(Boolean) : [];
  if (!selectedTags || selectedTags.length === 0) return true;
  const set = new Set(tags);
  if (match === 'all') {
    return selectedTags.every((t) => set.has(t));
  }
  // any
  return selectedTags.some((t) => set.has(t));
}

function filterCardIdsByTags(cardIds, selectedTags, match = 'any') {
  if (!selectedTags || selectedTags.length === 0) return cardIds;
  return (cardIds || []).filter((cid) => {
    const c = DATA.cards.find((x) => x.id === cid);
    if (!c) return false;
    return cardHasTags(c, selectedTags, match);
  });
}

function buildStudyHash(deckId, mode, selectedTags = [], tagMatch = 'any') {
  const m = normalizeStudyMode(mode);
  const params = new URLSearchParams();
  if (m && m !== 'all') params.set('mode', m);
  if (selectedTags && selectedTags.length) {
    params.set('tags', selectedTags.join(','));
    params.set('tagMatch', tagMatch === 'all' ? 'all' : 'any');
  }
  const qs = params.toString();
  return `#/study/${deckId}${qs ? `?${qs}` : ''}`;
}

function openTagStudyModal(deckId, opts = {}) {
  const deck = getDeck(deckId);
  if (!deck) return;

  const isVocab = String(deck.type || '').toLowerCase() === 'vocab';
  const labelWrongOnly = isVocab ? '모름' : '오답';

  const initialMode = normalizeStudyMode(opts.mode || 'all');
  const initialMatch = String(opts.tagMatch || 'any').toLowerCase() === 'all' ? 'all' : 'any';
  const initialTags = uniqueSorted(Array.isArray(opts.tags) ? opts.tags : parseTagsParam(opts.tags));

  openModal({
    title: '태그로 골라서 학습',
    bodyHTML: `
      <div class="card" style="margin-bottom: 12px;">
        <div style="font-size: 13px; color: var(--muted); line-height: 1.55;">
          태그를 선택하면 <b>해당 태그 카드만</b> 모아서 학습합니다.<br>
          (예: <span class="kbd">가정법</span>, <span class="kbd">who/whom</span>, <span class="kbd">기출</span> 등)
        </div>
      </div>

      <div class="field">
        <label>기준</label>
        <select id="tag-base">
          <option value="all">전체</option>
          <option value="bookmarks">북마크</option>
          <option value="wrongs">${escapeText(labelWrongOnly)}(만)</option>
        </select>
      </div>

      <div class="field">
        <label>매칭 방식</label>
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <button class="btn small" id="tag-match-any">OR (하나라도 포함)</button>
          <button class="btn small" id="tag-match-all">AND (모두 포함)</button>
        </div>
        <div class="small" style="margin-top:6px;">예) 태그 2개 선택 시 OR=둘 중 하나라도 포함 / AND=둘 다 포함</div>
      </div>

      <div class="field">
        <label>태그 검색</label>
        <input type="text" id="tag-search" placeholder="예) 가정법 / 도치 / 행정학" />
      </div>

      <div class="field">
        <label>태그 선택</label>
        <div id="tag-chips" class="tag-chips"></div>
        <div id="tag-empty" class="small" style="margin-top:8px; display:none;">표시할 태그가 없습니다.</div>
      </div>

      <div class="row" style="justify-content: space-between; flex-wrap:wrap; gap:10px;">
        <div class="small" id="tag-selected">선택: 0개</div>
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <button class="btn" id="tag-clear">전체 해제</button>
          <button class="btn primary" id="tag-start">학습 시작</button>
        </div>
      </div>
    `,
    onMount: (root) => {
      const baseEl = $('#tag-base', root);
      const searchEl = $('#tag-search', root);
      const chipsEl = $('#tag-chips', root);
      const emptyEl = $('#tag-empty', root);
      const selectedEl = $('#tag-selected', root);
      const btnAny = $('#tag-match-any', root);
      const btnAll = $('#tag-match-all', root);

      let baseMode = initialMode;
      let match = initialMatch;
      let selected = new Set(initialTags);

      function applyMatchButtons() {
        const anyOn = match !== 'all';
        btnAny.classList.toggle('primary', anyOn);
        btnAll.classList.toggle('primary', !anyOn);
      }

      function setSelectedText() {
        const arr = Array.from(selected);
        if (arr.length === 0) {
          selectedEl.textContent = '선택: 0개';
          return;
        }
        const preview = arr.slice(0, 3).join(', ') + (arr.length > 3 ? ` +${arr.length - 3}` : '');
        selectedEl.textContent = `선택: ${arr.length}개 (${preview})`;
      }

      function renderChips() {
        const q = (searchEl.value || '').trim().toLowerCase();
        const tags = getDeckTags(deckId, baseMode);

        // Drop selections that no longer exist in this base set
        const avail = new Set(tags);
        selected = new Set(Array.from(selected).filter((t) => avail.has(t)));

        const filtered = !q
          ? tags
          : tags.filter((t) => t.toLowerCase().includes(q));

        chipsEl.innerHTML = '';
        emptyEl.style.display = filtered.length ? 'none' : 'block';

        filtered.forEach((t) => {
          const chip = document.createElement('div');
          chip.className = 'tag-chip' + (selected.has(t) ? ' selected' : '');
          chip.textContent = t;
          chip.addEventListener('click', () => {
            if (selected.has(t)) selected.delete(t);
            else selected.add(t);
            setSelectedText();
            chip.classList.toggle('selected');
          });
          chipsEl.appendChild(chip);
        });

        setSelectedText();
      }

      baseEl.value = baseMode;
      applyMatchButtons();
      renderChips();

      baseEl.addEventListener('change', () => {
        baseMode = normalizeStudyMode(baseEl.value);
        renderChips();
      });

      btnAny.addEventListener('click', () => {
        match = 'any';
        applyMatchButtons();
      });
      btnAll.addEventListener('click', () => {
        match = 'all';
        applyMatchButtons();
      });

      searchEl.addEventListener('input', renderChips);

      $('#tag-clear', root).addEventListener('click', () => {
        selected = new Set();
        renderChips();
      });

      $('#tag-start', root).addEventListener('click', () => {
        const tagsArr = uniqueSorted(Array.from(selected));
        // If no tags selected -> just normal study
        const nextHash = buildStudyHash(deckId, baseMode, tagsArr, match);
        closeModal();
        location.hash = nextHash;
      });
    },
  });
}

function __old_renderHome() {
  setSubtitle('카테고리 목록');

  const decks = DATA.decks.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  appEl.innerHTML = `
    <div class="row" style="justify-content: space-between; gap: 10px;">
      <button class="btn primary" id="btn-new-deck">+ 카테고리</button>
      <button class="btn" id="btn-go-import">가져오기</button>
    </div>

    <div class="section-title">카테고리</div>
    <div class="deck-grid" id="deck-grid"></div>

    <div class="hr"></div>
    <div class="card">
      <div style="font-weight: 750; margin-bottom: 8px;">빠른 시작</div>
      <div style="font-size: 13px; color: var(--muted); line-height: 1.5;">
        · <b>문법 OX</b>: 문장을 보고 <span class="kbd">O</span>/<span class="kbd">X</span> 선택 → 정답/해설 확인 → <span class="kbd">다음</span>.<br>
        · <b>단어장</b>: 단어를 보고 <span class="kbd">O</span>(앎)/<span class="kbd">X</span>(모름) 선택 → 뜻/연상/예문 확인 → <span class="kbd">다음</span>.<br>
        · 끝나면 <b>틀린/모르는 것만 다시</b> 모아서 반복할 수 있어요.
        <br>· <b>북마크</b> / <b>오답(모름)</b> 버튼으로 모아 학습도 가능해요.
      </div>
    </div>
  `;

  $('#btn-new-deck').addEventListener('click', () => openDeckModal());
  $('#btn-go-import').addEventListener('click', () => (location.hash = '#/import'));

  const grid = $('#deck-grid');

  if (decks.length === 0) {
    grid.innerHTML = `<div class="card">아직 카테고리가 없습니다. <b>+ 카테고리</b>로 시작하세요.</div>`;
    return;
  }

  decks.forEach((deck) => {
    const isVocab = String(deck.type || '').toLowerCase() === 'vocab';

    const s = deckStats(deck.id);
    const bmCount = deckBookmarkCount(deck.id);
    const wrongCount = deckWrongCount(deck.id);
    const tagCount = getDeckTags(deck.id, 'all').length;

    const labelCards = isVocab ? '단어' : '문제';
    const labelWrong = isVocab ? '모름' : '오답';
    const labelAcc = isVocab ? '알았음률' : '정답률';

    const meta = [
      `${labelCards} ${s.cardsCount}개`,
      bmCount ? `북마크 ${bmCount}개` : null,
      wrongCount ? `${labelWrong} ${wrongCount}개` : null,
      s.acc == null ? '기록 없음' : `${labelAcc} ${s.acc}% (기록 ${s.total}회)`
    ].filter(Boolean).join(' · ');

    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <div class="deck-title">${escapeText(deck.name)}</div>
      <div class="deck-meta">${escapeText(meta)}</div>
      <div class="deck-actions">
        <button class="btn primary small" data-action="study">학습</button>
        <button class="btn small" data-action="bm" ${bmCount ? '' : 'disabled'}>북마크</button>
        <button class="btn small" data-action="wrong" ${wrongCount ? '' : 'disabled'}>${escapeText(labelWrong)}</button>
        <button class="btn small" data-action="tags" ${tagCount ? '' : 'disabled'}>태그</button>
        <button class="btn small" data-action="manage">관리</button>
      </div>
    `;

    el.querySelector('[data-action="study"]').addEventListener('click', () => {
      location.hash = `#/study/${deck.id}`;
    });
    el.querySelector('[data-action="bm"]').addEventListener('click', () => {
      if (!bmCount) return;
      location.hash = `#/study/${deck.id}?mode=bookmarks`;
    });

    el.querySelector('[data-action="wrong"]').addEventListener('click', () => {
      if (!wrongCount) return;
      location.hash = `#/study/${deck.id}?mode=wrongs`;
    });
    el.querySelector('[data-action="manage"]').addEventListener('click', () => {
      location.hash = `#/deck/${deck.id}`;
    });

    el.querySelector('[data-action="tags"]').addEventListener('click', () => {
      if (!tagCount) {
        toast('태그가 없습니다');
        return;
      }
      openTagStudyModal(deck.id, { mode: 'all', tags: [], tagMatch: 'any' });
    });

    grid.appendChild(el);
  });
}


function __old_openDeckModal(existingDeck = null) {
  const isEdit = !!existingDeck;
  const deck = existingDeck || { name: '', description: '', type: 'grammar' };
  const curType = String(deck.type || '').toLowerCase() === 'vocab' ? 'vocab' : 'grammar';

  openModal({
    title: isEdit ? '카테고리 수정' : '새 카테고리',
    bodyHTML: `
      <div class="field">
        <label>이름</label>
        <input type="text" id="deck-name" placeholder="예) 리그래머 1-20 / 경선식 단어장" value="${escapeText(deck.name)}" />
      </div>

      <div class="field">
        <label>유형</label>
        <select id="deck-type">
          <option value="grammar" ${curType === 'grammar' ? 'selected' : ''}>문법 OX (정답 있음)</option>
          <option value="vocab" ${curType === 'vocab' ? 'selected' : ''}>단어장 (O=앎 / X=모름)</option>
        </select>
      </div>

      <div class="field">
        <label>설명 (선택)</label>
        <textarea id="deck-desc" placeholder="예) who/whom · 가정법 / 또는 경선식 연상">${escapeText(deck.description || '')}</textarea>
      </div>

      <div class="modal-actions">
        <button class="btn" id="deck-cancel">취소</button>
        <button class="btn primary" id="deck-save">저장</button>
      </div>
    `,
    onMount: (root) => {
      $('#deck-cancel', root).addEventListener('click', closeModal);
      $('#deck-save', root).addEventListener('click', () => {
        const name = $('#deck-name', root).value.trim();
        const description = $('#deck-desc', root).value.trim();
        const typeRaw = $('#deck-type', root).value;
        const type = String(typeRaw).toLowerCase() === 'vocab' ? 'vocab' : 'grammar';

        if (!name) {
          alert('카테고리 이름을 입력해 주세요.');
          return;
        }

        if (isEdit) {
          const d = getDeck(existingDeck.id);
          if (!d) return;
          d.name = name;
          d.description = description;
          d.type = type;
        } else {
          const nextOrder = (Math.max(0, ...DATA.decks.map((d) => d.order || 0)) + 1) || 1;
          DATA.decks.push({ id: uuid(), name, description, type, createdAt: now(), order: nextOrder });
        }

        commit();
        closeModal();
        toast('저장됨');
        renderRoute();
      });

      setTimeout(() => $('#deck-name', root).focus(), 0);
    },
  });
}


function __old_renderDeck(deckId) {
  const deck = getDeck(deckId);
  if (!deck) {
    appEl.innerHTML = `<div class="card">존재하지 않는 카테고리입니다.</div>`;
    setSubtitle('');
    return;
  }

  const isVocab = String(deck.type || '').toLowerCase() === 'vocab';

  const labelCards = isVocab ? '단어' : '문제';
  const labelCorrect = isVocab ? '알았음' : '맞춤';
  const labelWrong = isVocab ? '모름' : '틀림';
  const labelWrongOnly = isVocab ? '모름' : '오답';

  const cards = getCards(deckId);
  const s = deckStats(deckId);
  const bmCount = deckBookmarkCount(deckId);
  const wrongCount = deckWrongCount(deckId);
  const tagCount = getDeckTags(deckId, 'all').length;

  setSubtitle(`${deck.name} · ${labelCards} ${s.cardsCount}개`);

  appEl.innerHTML = `
    <div class="card" style="margin-bottom: 12px;">
      <div style="display:flex; justify-content: space-between; gap: 10px;">
        <div>
          <div style="font-weight: 800; font-size: 16px;">${escapeText(deck.name)}</div>
          <div style="color: var(--muted); font-size: 13px; margin-top: 6px; line-height: 1.4;">${escapeText(deck.description || '')}</div>
          <div style="margin-top: 10px; font-size: 12px; color: var(--muted);">
            기록: ${labelCorrect} ${s.correct} · ${labelWrong} ${s.wrong} · ${labelWrongOnly} ${wrongCount} · 북마크 ${bmCount}
          </div>
        </div>
        <div style="display:flex; flex-direction: column; gap: 8px; min-width: 140px;">
          <button class="btn primary small" id="btn-study">전체 학습</button>
          <button class="btn small" id="btn-study-bookmarks" ${bmCount ? '' : 'disabled'}>북마크 학습 (${bmCount})</button>
          <button class="btn small" id="btn-study-wrongs" ${wrongCount ? '' : 'disabled'}>${labelWrongOnly} 학습 (${wrongCount})</button>
          <button class="btn small" id="btn-study-tags" ${tagCount ? '' : 'disabled'}>태그 학습 (${tagCount})</button>
          <button class="btn small" id="btn-edit-deck">카테고리 수정</button>
          <button class="btn danger small" id="btn-delete-deck">카테고리 삭제</button>
        </div>
      </div>
    </div>

    <div class="row" style="justify-content: space-between; gap: 10px;">
      <button class="btn primary" id="btn-add-card">+ ${labelCards} 추가</button>
      <button class="btn" id="btn-bulk-add">여러 개 붙여넣기</button>
    </div>

    <div class="field" style="margin-top: 12px;">
      <label>검색</label>
      <input type="text" id="search" placeholder="${isVocab ? '단어/뜻/연상/예문/태그 검색' : '문장/설명/태그 검색'}" />
    </div>

    <div class="section-title">${labelCards} 목록</div>
    <div class="list" id="card-list"></div>
  `;

  $('#btn-study').addEventListener('click', () => (location.hash = `#/study/${deckId}`));
  $('#btn-study-bookmarks').addEventListener('click', () => {
    if (!bmCount) {
      toast('북마크된 카드가 없습니다');
      return;
    }
    location.hash = `#/study/${deckId}?mode=bookmarks`;
  });

  const wrongBtn = $('#btn-study-wrongs');
  if (wrongBtn) {
    wrongBtn.addEventListener('click', () => {
      if (!wrongCount) {
        toast(isVocab ? '모르는 카드가 없습니다' : '틀린 문제가 없습니다');
        return;
      }
      location.hash = `#/study/${deckId}?mode=wrongs`;
    });
  }

  const tagBtn = $('#btn-study-tags');
  if (tagBtn) {
    tagBtn.addEventListener('click', () => {
      if (!tagCount) {
        toast('태그가 없습니다');
        return;
      }
      openTagStudyModal(deckId, { mode: 'all', tags: [], tagMatch: 'any' });
    });
  }

  $('#btn-edit-deck').addEventListener('click', () => openDeckModal(deck));

  $('#btn-delete-deck').addEventListener('click', () => {
    if (cards.length > 0) {
      const ok = confirm('이 카테고리의 카드도 함께 삭제됩니다. 계속할까요?');
      if (!ok) return;
    } else {
      const ok = confirm('카테고리를 삭제할까요?');
      if (!ok) return;
    }
    DATA.decks = DATA.decks.filter((d) => d.id !== deckId);
    DATA.cards = DATA.cards.filter((c) => c.deckId !== deckId);
    commit();
    toast('삭제됨');
    location.hash = '#/';
  });

  $('#btn-add-card').addEventListener('click', () => openCardModal({ deckId }));
  $('#btn-bulk-add').addEventListener('click', () => openBulkAddModal(deckId));

  const listEl = $('#card-list');
  const searchEl = $('#search');

  function renderList() {
    const q = searchEl.value.trim().toLowerCase();
    const filtered = !q
      ? cards
      : cards.filter((c) => {
          const meaning = String(c.meaning || c.explanation || '').trim();
          const mnemonic = String(c.mnemonic || '').trim();
          const example = String(c.example || '').trim();
          const exampleMeaning = String(c.exampleMeaning || '').trim();

          const hay = isVocab
            ? `${c.prompt}
${meaning}
${mnemonic}
${example}
${exampleMeaning}
${(c.tags || []).join(',')}`.toLowerCase()
            : `${c.prompt}\n${c.explanation || ''}\n${(c.tags || []).join(',')}`.toLowerCase();

          return hay.includes(q);
        });

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="card">표시할 카드가 없습니다.</div>`;
      return;
    }

    listEl.innerHTML = '';
    filtered
      .slice()
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .forEach((c) => {
        const st = DATA.stats[c.id] || { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
        const bm = isBookmarked(c.id);
        const total = (st.correct || 0) + (st.wrong || 0);
        const acc = total === 0 ? '' : ` · ${isVocab ? '알았음률' : '정답률'} ${Math.round(((st.correct || 0) / total) * 100)}%`;
        const tags = (c.tags || []).slice(0, 3).join(', ');

        const meaning = String(c.meaning || c.explanation || '').trim();
        const meaningPreview = isVocab && meaning
          ? ` · 뜻 ${escapeText(meaning.length > 44 ? meaning.slice(0, 44) + '…' : meaning)}`
          : '';

        const sub = isVocab
          ? `기록 ${total}회 · 알았음 ${(st.correct || 0)} · 모름 ${(st.wrong || 0)}${acc}${tags ? ` · 태그 ${escapeText(tags)}` : ''}${meaningPreview}`
          : `정답 ${escapeText(c.answer)} · 기록 ${total}회${escapeText(acc)}${tags ? ` · 태그 ${escapeText(tags)}` : ''}`;

        const row = document.createElement('div');
        row.className = 'item';
        row.innerHTML = `
          <div>
            <div class="item-title">${escapeText(c.prompt)}</div>
            <div class="item-sub">${sub}</div>
          </div>
          <div class="item-actions">
            <button class="btn small" data-bm title="북마크">${bm ? '★' : '☆'}</button>
            ${isVocab ? '' : `<span class="pill">${escapeText(c.answer)}</span>`}
            <button class="btn small" data-edit>수정</button>
            <button class="btn small danger" data-del>삭제</button>
          </div>
        `;

        $('[data-bm]', row).addEventListener('click', () => {
          const next = toggleBookmark(c.id);
          toast(next ? '북마크됨' : '북마크 해제');
          renderList();
        });
        $('[data-edit]', row).addEventListener('click', () => openCardModal({ deckId, card: c }));
        $('[data-del]', row).addEventListener('click', () => {
          const ok = confirm('이 카드를 삭제할까요?');
          if (!ok) return;
          DATA.cards = DATA.cards.filter((x) => x.id !== c.id);
          delete DATA.stats[c.id];
          commit();
          toast('삭제됨');
          const idx = cards.findIndex((x) => x.id === c.id);
          if (idx >= 0) cards.splice(idx, 1);
          renderList();
        });

        listEl.appendChild(row);
      });
  }

  searchEl.addEventListener('input', renderList);
  renderList();
}


function normalizeStudyMode(mode) {
  const m = String(mode || '').toLowerCase().trim();
  if (['bookmark', 'bookmarks', 'bm', 'star', 'stars', '즐겨찾기', '북마크'].includes(m)) return 'bookmarks';
  if (['wrong', 'wrongs', 'wrongonly', 'wrong-only', 'incorrect', 'mistake', 'mistakes', '오답', '오답노트', '틀림', '틀린', '틀린문제'].includes(m)) return 'wrongs';
  return 'all';
}

function getCardIdsForMode(deckId, mode) {
  const all = getCards(deckId).map((c) => c.id);
  const m = normalizeStudyMode(mode);
  if (m === 'bookmarks') return all.filter((id) => isBookmarked(id));
  if (m === 'wrongs') return all.filter((id) => isWrongCard(id));
  return all;
}

function newStudySession(deckId, mode = 'all', cardIds = null, tagFilter = null) {
  const m = normalizeStudyMode(mode);
  const ids = Array.isArray(cardIds) ? cardIds.slice() : getCardIdsForMode(deckId, m);

  const tf = tagFilter && Array.isArray(tagFilter.tags) && tagFilter.tags.length
    ? {
        tags: uniqueSorted(tagFilter.tags),
        match: String(tagFilter.match || '').toLowerCase() === 'all' ? 'all' : 'any',
      }
    : null;

  STUDY = {
    deckId,
    phase: 'study',
    queue: shuffle(ids),
    index: 0,

    // per-card
    answered: false,
    choice: null, // 'O' | 'X'
    lastIsCorrect: null,

    // session
    wrongIds: [],
    correctCount: 0,
    wrongCount: 0,
    mode: m,

    // optional tag filter
    tagFilter: tf,
  };
}


function resetPerCardState() {
  if (!STUDY) return;
  STUDY.answered = false;
  STUDY.choice = null;
  STUDY.lastIsCorrect = null;
}

function renderStudy(deckId, opts = {}) {
  const deck = getDeck(deckId);
  if (!deck) {
    appEl.innerHTML = `<div class="card">존재하지 않는 카테고리입니다.</div>`;
    setSubtitle('');
    return;
  }

  const isVocab = String(deck.type || '').toLowerCase() === 'vocab';
  const labelWrong = isVocab ? '모름' : '틀림';
  const labelWrongOnly = isVocab ? '모름' : '오답';
  const labelCorrect = isVocab ? '알았음' : '맞춤';

  const cards = getCards(deckId);
  if (cards.length === 0) {
    setSubtitle(deck.name);
    appEl.innerHTML = `
      <div class="card">
        <div style="font-weight: 750; margin-bottom: 6px;">카드가 없습니다</div>
        <div style="color: var(--muted); margin-bottom: 12px;">먼저 카드를 추가해 주세요.</div>
        <button class="btn primary" id="go-add">+ ${isVocab ? '단어' : '문제'} 추가</button>
      </div>
    `;
    $('#go-add').addEventListener('click', () => {
      location.hash = `#/deck/${deckId}`;
    });
    return;
  }

  // Determine mode (all / bookmarks / wrongs)
  const hasMode = Object.prototype.hasOwnProperty.call(opts || {}, 'mode');
  const requestedMode = hasMode ? normalizeStudyMode(opts.mode) : null;
  const desiredMode = requestedMode || (STUDY && STUDY.deckId === deckId ? STUDY.mode : 'all');

  // Determine tag filter (tags + match)
  const hasTags = Object.prototype.hasOwnProperty.call(opts || {}, 'tags');
  const requestedTags = hasTags ? uniqueSorted(parseTagsParam(opts.tags)) : null;
  const desiredTags = requestedTags ?? (STUDY && STUDY.deckId === deckId ? (STUDY.tagFilter?.tags || []) : []);

  const hasTagMatch = Object.prototype.hasOwnProperty.call(opts || {}, 'tagMatch');
  const requestedTagMatch = hasTagMatch ? (String(opts.tagMatch || '').toLowerCase() === 'all' ? 'all' : 'any') : null;
  const desiredTagMatch = requestedTagMatch ?? (STUDY && STUDY.deckId === deckId ? (STUDY.tagFilter?.match || 'any') : 'any');

  // Base ids (before tag filtering)
  const baseIds = getCardIdsForMode(deckId, desiredMode);

  // 북마크 모드인데 북마크가 없으면 안내
  if (desiredMode === 'bookmarks' && baseIds.length === 0) {
    setSubtitle(`${deck.name} · 북마크 학습`);
    appEl.innerHTML = `
      <div class="card">
        <div style="font-weight: 850; font-size: 16px; margin-bottom: 8px;">북마크된 카드가 없습니다</div>
        <div style="color: var(--muted); font-size: 13px; line-height: 1.6; margin-bottom: 12px;">
          학습 화면(★ 버튼)이나 카드 목록에서 북마크를 찍어두면,<br>
          여기서 북마크만 모아서 회독할 수 있어요.
        </div>
        <div class="row" style="gap: 10px; flex-wrap: wrap;">
          <button class="btn primary" id="go-all">전체 학습하기</button>
          <button class="btn" id="go-manage">카드 관리</button>
        </div>
      </div>
    `;
    $('#go-all').addEventListener('click', () => (location.hash = `#/study/${deckId}`));
    $('#go-manage').addEventListener('click', () => (location.hash = `#/deck/${deckId}`));
    return;
  }

  // 오답/모름 모드인데 대상이 없으면 안내
  if (desiredMode === 'wrongs' && baseIds.length === 0) {
    setSubtitle(`${deck.name} · ${labelWrongOnly} 학습`);
    appEl.innerHTML = `
      <div class="card">
        <div style="font-weight: 850; font-size: 16px; margin-bottom: 8px;">${isVocab ? '모르는 카드가 없습니다' : '틀린 문제가 없습니다'}</div>
        <div style="color: var(--muted); font-size: 13px; line-height: 1.6; margin-bottom: 12px;">
          먼저 <b>전체 학습</b>을 하면서 ${isVocab ? '모르는 카드' : '오답'}이 쌓이면,<br>
          여기서 <b>${labelWrongOnly}만</b> 모아서 회독할 수 있어요.
        </div>
        <div class="row" style="gap: 10px; flex-wrap: wrap;">
          <button class="btn primary" id="go-all">전체 학습하기</button>
          <button class="btn" id="go-manage">카드 관리</button>
        </div>
      </div>
    `;
    $('#go-all').addEventListener('click', () => (location.hash = `#/study/${deckId}`));
    $('#go-manage').addEventListener('click', () => (location.hash = `#/deck/${deckId}`));
    return;
  }

  // Apply tag filter
  const desiredIds = filterCardIdsByTags(baseIds, desiredTags, desiredTagMatch);

  // Tag filter produces empty set
  if (desiredTags.length > 0 && desiredIds.length === 0) {
    const baseTitle = desiredMode === 'bookmarks' ? '북마크 학습' : (desiredMode === 'wrongs' ? `${labelWrongOnly} 학습` : '학습');
    setSubtitle(`${deck.name} · ${baseTitle} · 태그 0개`);
    const preview = desiredTags.slice(0, 4).join(', ') + (desiredTags.length > 4 ? ` +${desiredTags.length - 4}` : '');
    appEl.innerHTML = `
      <div class="card">
        <div style="font-weight: 850; font-size: 16px; margin-bottom: 8px;">선택한 태그에 해당하는 카드가 없습니다</div>
        <div style="color: var(--muted); font-size: 13px; line-height: 1.6; margin-bottom: 12px;">
          현재 필터: <b>${escapeText(baseTitle)}</b> · 태그 <b>${escapeText(preview)}</b> · ${desiredTagMatch === 'all' ? 'AND(모두 포함)' : 'OR(하나라도 포함)'}<br>
          태그를 다시 선택하거나, 필터를 해제해 주세요.
        </div>
        <div class="row" style="gap: 10px; flex-wrap: wrap;">
          <button class="btn primary" id="go-tags">태그 다시 선택</button>
          <button class="btn" id="go-clear">필터 해제</button>
          <button class="btn" id="go-manage">카드 관리</button>
        </div>
      </div>
    `;
    $('#go-tags').addEventListener('click', () => openTagStudyModal(deckId, { mode: desiredMode, tags: desiredTags, tagMatch: desiredTagMatch }));
    $('#go-clear').addEventListener('click', () => {
      location.hash = buildStudyHash(deckId, desiredMode, [], 'any');
    });
    $('#go-manage').addEventListener('click', () => (location.hash = `#/deck/${deckId}`));
    return;
  }

  const desiredTagFilter = desiredTags.length ? { tags: desiredTags, match: desiredTagMatch } : null;
  const desiredTagKey = desiredTagFilter ? `${desiredTagFilter.match}|${desiredTagFilter.tags.join(',')}` : '';
  const studyTagKey = STUDY?.tagFilter ? `${STUDY.tagFilter.match}|${(STUDY.tagFilter.tags || []).join(',')}` : '';
  const tagChanged = desiredTagKey !== studyTagKey;

  // init session if needed (or mode changed)
  if (!STUDY || STUDY.deckId !== deckId || (requestedMode && requestedMode !== STUDY.mode) || tagChanged || (STUDY && STUDY.queue && STUDY.queue.length === 0)) {
    newStudySession(deckId, desiredMode, desiredIds, desiredTagFilter);
    saveStudyState();
  }

  const modeTitle = STUDY.mode === 'bookmarks' ? '북마크 학습' : (STUDY.mode === 'wrongs' ? `${labelWrongOnly} 학습` : '학습');
  const tfInfo = (STUDY.tagFilter && STUDY.tagFilter.tags && STUDY.tagFilter.tags.length)
    ? ` · 태그 ${STUDY.tagFilter.tags.length}개`
    : '';
  setSubtitle(`${deck.name} · ${modeTitle}${tfInfo}`);

  // Summary
  if (STUDY.phase === 'summary') {
    const total = STUDY.correctCount + STUDY.wrongCount;
    const acc = total === 0 ? 0 : Math.round((STUDY.correctCount / total) * 100);

    appEl.innerHTML = `
      <div class="card">
        <div style="font-weight: 850; font-size: 18px;">학습 완료</div>
        <div style="margin-top: 10px; color: var(--muted); line-height: 1.6;">
          모드: <b>${STUDY.mode === 'bookmarks' ? '북마크' : (STUDY.mode === 'wrongs' ? labelWrongOnly : '전체')}</b><br>
          ${STUDY.tagFilter && STUDY.tagFilter.tags && STUDY.tagFilter.tags.length
            ? `태그: <b>${escapeText(STUDY.tagFilter.tags.slice(0,4).join(', ') + (STUDY.tagFilter.tags.length>4 ? ` +${STUDY.tagFilter.tags.length-4}` : ''))}</b> · ${STUDY.tagFilter.match === 'all' ? 'AND' : 'OR'}<br>`
            : ''
          }
          총 ${total}개 중 <b>${labelCorrect} ${STUDY.correctCount}</b>, <b>${labelWrong} ${STUDY.wrongCount}</b> · ${isVocab ? '알았음률' : '정답률'} <b>${acc}%</b>
        </div>
        <div class="hr"></div>
        <div class="row" style="gap: 10px; flex-wrap: wrap;">
          <button class="btn primary" id="btn-review-wrong" ${STUDY.wrongIds.length ? '' : 'disabled'}>${isVocab ? '모르는 것만 다시' : '틀린 것만 다시'}</button>
          <button class="btn" id="btn-restart">처음부터 다시</button>
          <button class="btn" id="btn-manage">카드 관리</button>
        </div>
      </div>
    `;

    $('#btn-review-wrong').addEventListener('click', () => {
      if (STUDY.wrongIds.length === 0) return;
      STUDY.phase = 'study';
      STUDY.queue = shuffle(STUDY.wrongIds);
      STUDY.index = 0;
      resetPerCardState();

      // 새 세션처럼 카운트 리셋
      STUDY.wrongIds = [];
      STUDY.correctCount = 0;
      STUDY.wrongCount = 0;

      saveStudyState();
      renderStudy(deckId);
    });

    $('#btn-restart').addEventListener('click', () => {
      newStudySession(deckId, STUDY.mode, null, STUDY.tagFilter);
      saveStudyState();
      renderStudy(deckId);
    });

    $('#btn-manage').addEventListener('click', () => {
      saveStudyState();
      location.hash = `#/deck/${deckId}`;
    });

    return;
  }

  // Current card
  const cardId = STUDY.queue[STUDY.index];
  const card = DATA.cards.find((c) => c.id === cardId);

  if (!card) {
    // Card deleted while studying; skip
    STUDY.queue.splice(STUDY.index, 1);
    if (STUDY.index >= STUDY.queue.length) {
      STUDY.phase = 'summary';
    }
    resetPerCardState();
    saveStudyState();
    renderStudy(deckId);
    return;
  }

  const pos = STUDY.index + 1;
  const total = STUDY.queue.length;

  const answered = !!STUDY.answered;
  const bookmarked = isBookmarked(card.id);
  const isEnglishVocab = isEnglishVocabDeck(deck);

  // vocab fields
  const meaning = String(card.meaning || card.explanation || '').trim();
  const mnemonic = String(card.mnemonic || '').trim();
  const example = String(card.example || '').trim();
  const exampleMeaning = String(card.exampleMeaning || '').trim();
  const pronunciation = String(card.pronunciation || card.ipa || '').trim();
  const synonyms = normalizeStringArray(card.synonyms ?? card.synonym ?? '');
  const rawPolysemy = normalizeStringArray(card.polysemy ?? card.senses ?? '');
  const derivedPolysemy = rawPolysemy.length ? rawPolysemy : derivePolysemyFromMeaning(meaning);
  const polysemy = derivedPolysemy.filter((item, idx) => {
    const normItem = normalizePromptKey(item);
    const normMeaning = normalizePromptKey(meaning);
    return item && (normItem !== normMeaning || idx !== 0);
  });

  const expl = card.explanation?.trim() ? card.explanation.trim() : '(설명 없음)';

  const showMeaning = meaning ? renderMultiline(meaning) : '(뜻 없음)';
  const showMnemonic = mnemonic ? renderMultiline(mnemonic) : null;
  const showExample = example ? renderMultiline(example) : null;
  const showExampleMeaning = exampleMeaning ? renderMultiline(exampleMeaning) : null;
  const showPronunciation = pronunciation ? escapeText(formatPronunciationText(pronunciation)) : null;
  const showSynonyms = synonyms.length ? synonyms.map((x) => escapeText(x)).join(', ') : null;
  const showPolysemy = polysemy.length ? `<ol>${polysemy.map((x) => `<li>${renderMultiline(x)}</li>`).join('')}</ol>` : null;

  // Tag filter info (if any)
  const tf = STUDY.tagFilter;
  const tagLabel = (tf && tf.tags && tf.tags.length)
    ? (() => {
        const preview = tf.tags.slice(0, 2).join(', ') + (tf.tags.length > 2 ? ` +${tf.tags.length - 2}` : '');
        return `태그 ${preview}`;
      })()
    : '태그';
  const tagMatchPill = (tf && tf.tags && tf.tags.length)
    ? `<span class="pill">${tf.match === 'all' ? 'AND' : 'OR'}</span>`
    : '';

  appEl.innerHTML = `
    <div class="study-card">
      <div class="row" style="justify-content: space-between; margin-bottom: 8px;">
        <div class="row" style="gap: 8px; flex-wrap: wrap;">
          <span class="pill">${pos} / ${total}</span>
          <button class="btn small" id="btn-tagfilter">${escapeText(tagLabel)}</button>
          ${tagMatchPill}
        </div>
        <div style="display:flex; gap: 8px; align-items:center;">
          <button class="btn small" id="btn-bookmark">${bookmarked ? '★ 북마크' : '☆ 북마크'}</button>
          <span class="pill">${labelWrong} ${STUDY.wrongCount}</span>
        </div>
      </div>

      ${isVocab ? `
        <div class="study-prompt">${renderMultiline(card.prompt)}</div>
        ${showPronunciation ? `<div class="vocab-front-pron">${showPronunciation}</div>` : ''}
        ${showExample ? `<div style="margin-top:10px; font-size:18px; line-height:1.6; color: var(--muted); font-weight:600;">${showExample}</div>` : ''}
      ` : `
        <div class="study-prompt">${escapeText(card.prompt)}</div>
      `}

      ${answered ? `
        <div class="card" style="margin: 10px 0 12px; background: var(--card);">
          <div style="font-weight: 900; margin-bottom: 8px;">
            ${STUDY.lastIsCorrect ? (isVocab ? '✅ 알았음' : '✅ 정답') : (isVocab ? '❌ 모름' : '❌ 오답')}
          </div>

          ${isVocab ? `
            <div class="study-answer" style="margin-bottom: 10px;">
              <div class="answer-badge">${escapeText(STUDY.choice)}</div>
              <div>내 선택: <b>${escapeText(STUDY.choice)}</b> (${STUDY.choice === 'O' ? '앎' : '모름'})</div>
            </div>

            <div class="study-expl vocab-back" style="line-height: 1.7;">
              <div class="vocab-back-word">${renderMultiline(card.prompt)}</div>
              ${showPronunciation ? `<div class="vocab-back-pron">${showPronunciation}</div>` : ''}
              ${meaning ? `<div class="vocab-back-meaning">${showMeaning}</div>` : ''}
              ${showPolysemy ? `<div class="vocab-back-polysemy"><div class="vocab-meta-label">다의어</div>${showPolysemy}</div>` : ''}
              ${showSynonyms ? `<div class="vocab-back-synonyms"><div class="vocab-meta-label">동의어</div><div>${showSynonyms}</div></div>` : ''}
              ${showExample ? `<div class="vocab-back-example">${showExample}</div>` : ''}
              ${showExampleMeaning ? `<div class="vocab-back-example-meaning">${showExampleMeaning}</div>` : ''}
              ${showMnemonic ? `<div class="vocab-back-mnemonic">연상: ${showMnemonic}</div>` : ''}
            </div>
          ` : `
            <div class="study-answer" style="margin-bottom: 8px;">
              <div class="answer-badge">${escapeText(card.answer)}</div>
              <div>내 선택: <b>${escapeText(STUDY.choice)}</b> · 정답: <b>${escapeText(card.answer)}</b></div>
            </div>
            <div class="study-expl">${escapeText(expl)}</div>
          `}
        </div>

        <div class="row" style="gap: 8px; flex-wrap: wrap; margin-bottom: 10px; align-items:center;">
          <span class="pill">답 수정</span>
          <button class="btn small ${STUDY.choice === 'O' ? 'primary' : ''}" id="btn-fix-o">O</button>
          <button class="btn small ${STUDY.choice === 'X' ? 'danger' : ''}" id="btn-fix-x">X</button>
          <span style="font-size:12px; color: var(--muted);">실수로 잘못 눌렀으면 다음 전에 바꿀 수 있어요.</span>
        </div>

        <button class="btn primary block" id="btn-next">다음</button>

        <div style="margin-top: 10px; display:flex; gap: 8px; justify-content: space-between; flex-wrap: wrap;">
          <button class="btn small" id="btn-edit">이 카드 수정</button>
          <button class="btn small" id="btn-skip">건너뛰기</button>
        </div>
      ` : `
        <div class="big-actions">
          <button class="btn primary big-btn" id="btn-choose-o">O</button>
          <button class="btn danger big-btn" id="btn-choose-x">X</button>
        </div>

        <div style="margin-top: 10px; display:flex; gap: 8px; justify-content: space-between; flex-wrap: wrap;">
          <button class="btn small" id="btn-edit">이 카드 수정</button>
          <button class="btn small" id="btn-skip">건너뛰기</button>
        </div>

        <div style="margin-top: 10px; font-size: 12px; color: var(--muted); line-height: 1.4;">
          ${isVocab ? 'O(앎) / X(모름)을 선택하면 뜻/연상/예문이 표시됩니다.' : 'O/X를 선택하면 정답과 해설이 표시됩니다.'}
        </div>
      `}
    </div>
  `;

  function cardChoiceIsCorrect(choice) {
    const normalized = normalizeAnswer(choice);
    if (!normalized) return false;
    return isVocab ? (normalized === 'O') : (normalized === card.answer);
  }

  function removeRecordedChoice(choice) {
    const normalized = normalizeAnswer(choice);
    if (!normalized) return;
    const st = DATA.stats[card.id] || (DATA.stats[card.id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false });
    const wasCorrect = cardChoiceIsCorrect(normalized);
    if (wasCorrect) {
      st.correct = Math.max(0, (st.correct || 0) - 1);
      STUDY.correctCount = Math.max(0, (STUDY.correctCount || 0) - 1);
    } else {
      st.wrong = Math.max(0, (st.wrong || 0) - 1);
      STUDY.wrongCount = Math.max(0, (STUDY.wrongCount || 0) - 1);
      const idx = STUDY.wrongIds ? STUDY.wrongIds.lastIndexOf(card.id) : -1;
      if (idx >= 0) STUDY.wrongIds.splice(idx, 1);
    }
  }

  function recordChoice(choice) {
    const normalized = normalizeAnswer(choice);
    if (!normalized) return false;
    const st = DATA.stats[card.id] || (DATA.stats[card.id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false });
    const isCorrect = cardChoiceIsCorrect(normalized);
    if (isCorrect) {
      st.correct = (st.correct || 0) + 1;
      STUDY.correctCount += 1;
    } else {
      st.wrong = (st.wrong || 0) + 1;
      STUDY.wrongCount += 1;
      STUDY.wrongIds.push(card.id);
      if (isVocab && (st.wrong || 0) >= 5) {
        st.bookmark = true;
        card.bookmarked = true;
      }
    }
    return isCorrect;
  }

  function grade(choice) {
    const normalized = normalizeAnswer(choice);
    if (!normalized) return;

    if (STUDY.answered && STUDY.choice === normalized) return;

    if (STUDY.answered && STUDY.choice) {
      removeRecordedChoice(STUDY.choice);
    }

    STUDY.choice = normalized; // 'O' | 'X'
    STUDY.answered = true;
    STUDY.lastIsCorrect = recordChoice(normalized);

    const st = DATA.stats[card.id] || (DATA.stats[card.id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false });
    st.lastReviewed = now();
    commit();
    saveStudyState();

    renderStudy(deckId);
  }

  function goNext() {
    STUDY.index += 1;
    resetPerCardState();

    if (STUDY.index >= STUDY.queue.length) {
      STUDY.phase = 'summary';
    }
    saveStudyState();

    renderStudy(deckId);
  }

  // Events
  const bmBtn = $('#btn-bookmark');
  if (bmBtn) {
    bmBtn.addEventListener('click', () => {
      const next = toggleBookmark(card.id);
      toast(next ? '북마크됨' : '북마크 해제');
      renderStudy(deckId);
    });
  }

  const tagBtn = $('#btn-tagfilter');
  if (tagBtn) {
    tagBtn.addEventListener('click', () => {
      openTagStudyModal(deckId, {
        mode: STUDY.mode,
        tags: STUDY.tagFilter?.tags || [],
        tagMatch: STUDY.tagFilter?.match || 'any',
      });
    });
  }

  const editBtn = $('#btn-edit');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      location.hash = `#/deck/${deckId}?edit=${card.id}`;
    });
  }

  const skipBtn = $('#btn-skip');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      // 답을 이미 봤/선택했으면 다음으로
      if (STUDY.answered) {
        goNext();
        return;
      }

      // 답하기 전 스킵: 이 카드를 뒤로 미룸(점수 반영 X)
      STUDY.queue.push(STUDY.queue.splice(STUDY.index, 1)[0]);
      resetPerCardState();
      saveStudyState();
      renderStudy(deckId);
    });
  }

  const chooseO = $('#btn-choose-o');
  if (chooseO) chooseO.addEventListener('click', () => grade('O'));

  const chooseX = $('#btn-choose-x');
  if (chooseX) chooseX.addEventListener('click', () => grade('X'));

  const nextBtn = $('#btn-next');
  if (nextBtn) nextBtn.addEventListener('click', goNext);

  const fixO = $('#btn-fix-o');
  if (fixO) fixO.addEventListener('click', () => grade('O'));

  const fixX = $('#btn-fix-x');
  if (fixX) fixX.addEventListener('click', () => grade('X'));
}



// -------------------------
// Import / Export
// -------------------------

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderImportExport() {
  setSubtitle('가져오기 / 내보내기');

  const deckOptions = DATA.decks
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((d) => `<option value="${escapeText(d.id)}">${escapeText(d.name)}</option>`)
    .join('');

  appEl.innerHTML = `
    <div class="card" style="margin-bottom: 12px;">
      <div style="font-weight: 800; margin-bottom: 8px;">내보내기 (백업)</div>
      <div style="color: var(--muted); font-size: 13px; line-height: 1.5; margin-bottom: 12px;">
        앱 데이터(카테고리/문제/기록)를 JSON으로 저장합니다.
      </div>
      <div class="row" style="gap: 10px; flex-wrap: wrap;">
        <button class="btn primary" id="btn-export-all">전체 백업 내보내기</button>
        <select id="deck-select" style="flex: 1; min-width: 180px;">
          ${deckOptions}
        </select>
        <button class="btn" id="btn-export-deck">선택 카테고리만 내보내기</button>
      </div>
    </div>

    <div class="card" style="margin-bottom: 12px;">
      <div style="font-weight: 800; margin-bottom: 8px;">가져오기</div>
      <div style="color: var(--muted); font-size: 13px; line-height: 1.5; margin-bottom: 12px;">
        JSON 파일(전체 백업) 또는 카드 배열(JSON)을 가져올 수 있어요.
      </div>

      <div class="row" style="gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px;">
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; color: var(--muted);">
          <input type="checkbox" id="opt-vocab-dedupe" checked />
          <span>단어장: 같은 단어(prompt)는 <b>중복 추가하지 않고 덮어쓰기</b> (자동 중복 제거)</span>
        </label>
      </div>

      <div class="field">
        <label>JSON 파일 선택 (전체 백업 권장)</label>
        <input type="file" id="file" accept="application/json" />
      </div>
      <div class="row" style="gap: 10px; flex-wrap: wrap;">
        <select id="file-target" style="flex: 1; min-width: 180px;">
          ${deckOptions}
        </select>
        <button class="btn primary" id="btn-import-file">파일 가져오기</button>
        <button class="btn" id="btn-clear-file">선택 해제</button>
      </div>

      <div class="hr"></div>

      <div class="field">
        <label>붙여넣기 (ChatGPT가 준 JSON)</label>
        <textarea id="paste" placeholder='예) 문법: [{"prompt":"...","answer":"O","explanation":"..."}, ...] / 단어: [{"prompt":"avalanche","meaning":"n. 눈사태","pronunciation":"ˈævəlæntʃ","synonyms":["snowslide"],"polysemy":["n. 눈사태","(비유) 쇄도"],"mnemonic":"...","example":"An avalanche of complaints followed.","exampleMeaning":"항의가 눈사태처럼 쏟아졌다."}, ...]'></textarea>
      </div>
      <div class="row" style="gap: 10px; flex-wrap: wrap;">
        <select id="paste-target" style="flex: 1; min-width: 180px;">
          ${deckOptions}
        </select>
        <button class="btn primary" id="btn-import-paste">붙여넣기 가져오기</button>
      </div>

      <div class="hr"></div>

      <div class="field">
        <label>스프레드시트 표 붙여넣기 (TSV/CSV)</label>
        <textarea id="table" placeholder="예) (단어장) 키워드\t뜻\n키워드2\t뜻2\n\n또는 (문법) 문장\tO/X\t해설"></textarea>
        <div class="small" style="margin-top:8px; line-height:1.5;">
          • Google Sheets에서 2열(키워드/뜻)을 복사하면 보통 <b>탭(\t)</b>으로 붙습니다.<br>
          • 첫 줄이 <b>헤더</b>(키워드/뜻/해설 등)면 자동으로 인식합니다.<br>
          • 문법 OX: <span class="kbd">문장\tO/X\t해설</span> / 단어장: <span class="kbd">키워드\t뜻\t연상\t예문</span>
        </div>
      </div>
      <div class="row" style="gap: 10px; flex-wrap: wrap;">
        <select id="table-target" style="flex: 1; min-width: 180px;">
          ${deckOptions}
        </select>
        <button class="btn primary" id="btn-import-table">표 가져오기</button>
      </div>

      <div style="height:10px"></div>

      <div class="field">
        <label>CSV 파일 선택 (선택)</label>
        <input type="file" id="csv" accept="text/csv,.csv,text/tab-separated-values,.tsv" />
      </div>
      <div class="row" style="gap: 10px; flex-wrap: wrap;">
        <select id="csv-target" style="flex: 1; min-width: 180px;">
          ${deckOptions}
        </select>
        <button class="btn" id="btn-import-csv">CSV 가져오기</button>
        <button class="btn" id="btn-clear-csv">선택 해제</button>
      </div>
    </div>

    <div class="card">
      <div style="font-weight: 800; margin-bottom: 8px;">데이터 형식</div>
      <div style="font-size: 13px; color: var(--muted); line-height: 1.6;">
        1) <b>전체 백업</b>: <span class="kbd">{ decks: [...], cards: [...], stats: {...} }</span><br>
        2) <b>카드 배열</b>: <span class="kbd">[{ prompt, ... }, ...]</span> (선택한 카테고리에 추가)<br>
        · 문법 OX: <span class="kbd">{ prompt, answer, explanation?, tags? }</span><br>
        · 단어장: <span class="kbd">{ prompt, meaning, pronunciation?, synonyms?, polysemy?, mnemonic?, example?, exampleMeaning?, tags? }</span>
      </div>
    </div>
  `;

  $('#btn-export-all').addEventListener('click', () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`ox-grammar-backup-${stamp}.json`, DATA);
  });

  $('#btn-export-deck').addEventListener('click', () => {
    const deckId = $('#deck-select').value;
    const deck = getDeck(deckId);
    if (!deck) return;
    const exportObj = {
      version: APP_DATA_VERSION,
      decks: [deck],
      cards: DATA.cards.filter((c) => c.deckId === deckId),
      stats: {},
    };
    exportObj.cards.forEach((c) => {
      exportObj.stats[c.id] = DATA.stats[c.id] || { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
    });
    const safeName = deck.name.replace(/[^a-zA-Z0-9가-힣_-]+/g, '_');
    downloadJson(`ox-grammar-${safeName}.json`, exportObj);
  });

  $('#btn-clear-file').addEventListener('click', () => {
    $('#file').value = '';
    toast('선택 해제');
  });

  $('#btn-import-file').addEventListener('click', async () => {
    const file = $('#file').files?.[0];
    if (!file) {
      alert('JSON 파일을 선택해 주세요.');
      return;
    }
    const text = await file.text();
    try {
      const obj = JSON.parse(text);
      const targetDeckId = $('#file-target')?.value;
      const vocabDedupe = $('#opt-vocab-dedupe')?.checked ?? true;
      importObject(obj, { targetDeckId, vocabDedupe });
    } catch (e) {
      alert('JSON 파싱에 실패했습니다.');
    }
  });

  $('#btn-import-paste').addEventListener('click', () => {
    const text = $('#paste').value.trim();
    if (!text) {
      alert('붙여넣기 내용이 없습니다.');
      return;
    }
    const targetDeckId = $('#paste-target').value;
    try {
      const obj = JSON.parse(text);
      const vocabDedupe = $('#opt-vocab-dedupe')?.checked ?? true;
      importObject(obj, { targetDeckId, vocabDedupe });
    } catch (e) {
      alert('JSON 파싱에 실패했습니다.');
    }
  });

  $('#btn-import-table').addEventListener('click', () => {
    const text = $('#table').value.trim();
    if (!text) {
      alert('붙여넣기(표) 내용이 없습니다.');
      return;
    }
    const targetDeckId = $('#table-target').value;
    try {
      const arr = parseSpreadsheetTable(text, targetDeckId);
      const vocabDedupe = $('#opt-vocab-dedupe')?.checked ?? true;
      importObject(arr, { targetDeckId, vocabDedupe });
    } catch (e) {
      alert(e?.message || '표 파싱에 실패했습니다.');
    }
  });

  $('#btn-clear-csv').addEventListener('click', () => {
    $('#csv').value = '';
    toast('선택 해제');
  });

  $('#btn-import-csv').addEventListener('click', async () => {
    const file = $('#csv').files?.[0];
    if (!file) {
      alert('CSV/TSV 파일을 선택해 주세요.');
      return;
    }
    const text = await file.text();
    const targetDeckId = $('#csv-target').value;
    try {
      const arr = parseSpreadsheetTable(text, targetDeckId);
      const vocabDedupe = $('#opt-vocab-dedupe')?.checked ?? true;
      importObject(arr, { targetDeckId, vocabDedupe });
    } catch (e) {
      alert(e?.message || 'CSV 파싱에 실패했습니다.');
    }
  });
}

function parseSpreadsheetTable(text, targetDeckId) {
  // Returns array of card-like objects (for importObject Case B)
  const deck = getDeck(targetDeckId);
  if (!deck) throw new Error('대상 카테고리를 찾을 수 없습니다.');
  const isVocab = String(deck.type || '').toLowerCase() === 'vocab';

  const rows = parseDelimited(text);
  if (!rows.length) throw new Error('표에 행이 없습니다.');

  // Header detection
  const header = rows[0].map((x) => String(x || '').trim());
  const hasHeader = header.some((h) => /키워드|용어|term|word|뜻|의미|meaning|발음|pronunciation|ipa|동의어|synonym|다의어|polysemy|예문해석|해석|exampleMeaning|example_ko|exampleKo|해설|설명|explanation|answer|정답/i.test(h));

  const dataRows = hasHeader ? rows.slice(1) : rows;

  const colIndex = (patterns, fallback) => {
    if (!hasHeader) return fallback;
    const idx = header.findIndex((h) => patterns.some((p) => p.test(h)));
    return idx >= 0 ? idx : fallback;
  };

  if (isVocab) {
    const maxCols = Math.max(0, ...dataRows.map((r) => r.length));
    const legacyCompact = !hasHeader && maxCols <= 5;

    const idxPrompt = colIndex([/키워드/i, /용어/i, /^term$/i, /^word$/i], 0);
    const idxMeaning = colIndex([/뜻/i, /의미/i, /^meaning$/i, /정의/i, /설명/i], 1);
    const idxPronunciation = colIndex([/발음/i, /^pronunciation$/i, /^ipa$/i, /phonetic/i], legacyCompact ? -1 : 2);
    const idxSynonyms = colIndex([/동의어/i, /^synonyms?$/i], legacyCompact ? -1 : 3);
    const idxPolysemy = colIndex([/다의어/i, /^polysemy$/i, /^senses?$/i], legacyCompact ? -1 : 4);
    const idxMnemonic = colIndex([/연상/i, /암기/i, /^mnemonic$/i, /assoc/i], legacyCompact ? 2 : 5);
    const idxExample = colIndex([/예문/i, /^example$/i, /sentence/i], legacyCompact ? 3 : 6);
    const idxExampleMeaning = colIndex([/예문해석/i, /해석/i, /^exampleMeaning$/i, /example_ko/i, /exampleKo/i], legacyCompact ? 4 : 7);
    const idxTags = colIndex([/^tags?$/i, /태그/i], legacyCompact ? 5 : 8);

    const out = [];
    for (const r of dataRows) {
      const prompt = String(r[idxPrompt] ?? '').trim();
      const meaning = String(r[idxMeaning] ?? '').trim();
      if (!prompt) continue;
      const pronunciation = idxPronunciation >= 0 ? String(r[idxPronunciation] ?? '').trim() : '';
      const synonyms = idxSynonyms >= 0 ? normalizeStringArray(r[idxSynonyms] ?? '') : [];
      const polysemy = idxPolysemy >= 0 ? normalizeStringArray(r[idxPolysemy] ?? '') : [];
      const mnemonic = String(r[idxMnemonic] ?? '').trim();
      const example = String(r[idxExample] ?? '').trim();
      const exampleMeaning = String(r[idxExampleMeaning] ?? '').trim();
      const tagsCell = String(r[idxTags] ?? '').trim();
      const tags = tagsCell
        ? tagsCell
            .split(/[,，;；\n]+/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      out.push({ prompt, meaning, pronunciation, synonyms, polysemy, mnemonic, example, exampleMeaning, tags });
    }
    if (!out.length) throw new Error('추출된 키워드가 없습니다. (키워드/뜻 2열인지 확인)');
    return out;
  }

  // Grammar OX
  const idxPrompt = colIndex([/문장/i, /문제/i, /^prompt$/i, /^q$/i], 0);
  const idxAnswer = colIndex([/^answer$/i, /정답/i, /^ox$/i], 1);
  const idxExp = colIndex([/해설/i, /설명/i, /^explanation$/i], 2);
  const idxTags = colIndex([/^tags?$/i, /태그/i], 3);

  const out = [];
  for (const r of dataRows) {
    const prompt = String(r[idxPrompt] ?? '').trim();
    const answer = String(r[idxAnswer] ?? '').trim();
    if (!prompt || !answer) continue;
    const explanation = String(r[idxExp] ?? '').trim();
    const tagsCell = String(r[idxTags] ?? '').trim();
    const tags = tagsCell
      ? tagsCell
          .split(/[,，;；\n]+/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    out.push({ prompt, answer, explanation, tags });
  }
  if (!out.length) throw new Error('추출된 문법 문제가 없습니다. (문장/OX/해설 열인지 확인)');
  return out;
}

function parseDelimited(text) {
  const raw = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!raw) return [];

  // If there are tabs, treat as TSV. Otherwise try CSV, else fallback to " - "
  const hasTab = raw.includes('\t');
  const lines = raw.split('\n').filter((l) => l.trim().length);
  if (!lines.length) return [];

  if (hasTab) {
    return lines.map((l) => l.split('\t'));
  }

  // Simple CSV parser with quotes
  const hasComma = lines.some((l) => l.includes(','));
  if (hasComma) {
    return lines.map(parseCsvLine);
  }

  // Fallback: "term - meaning" one per line
  return lines.map((l) => {
    const m = l.split(/\s+-\s+|\s+—\s+|\s+–\s+/);
    return m.length >= 2 ? [m[0], m.slice(1).join(' - ')] : [l];
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
      continue;
    }
    if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function mergeVocabDuplicatesInDeck(deckId) {
  // Merge duplicates inside a vocab deck by normalized prompt.
  // - Keep the most recently updated card
  // - Combine stats (correct/wrong), keep bookmark if any
  // - Fill empty fields (meaning/pronunciation/synonyms/polysemy/mnemonic/example/exampleMeaning) from duplicates
  const cards = DATA.cards.filter((c) => c.deckId === deckId);
  const byKey = new Map(); // key -> keepId
  const removeIds = new Set();
  let mergedExisting = 0;

  const ensureStat = (id) => {
    if (!DATA.stats[id]) DATA.stats[id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
    return DATA.stats[id];
  };

  const mergeInto = (keep, drop) => {
    if (!keep || !drop) return;

    // Prefer keep's prompt casing, but ensure not empty
    if (!keep.prompt) keep.prompt = drop.prompt;

    // Fill fields if missing
    keep.meaning = String(keep.meaning || '').trim();
    drop.meaning = String(drop.meaning || '').trim();
    keep.pronunciation = String(keep.pronunciation || '').trim();
    drop.pronunciation = String(drop.pronunciation || '').trim();
    keep.synonyms = normalizeStringArray(keep.synonyms || '');
    drop.synonyms = normalizeStringArray(drop.synonyms || '');
    keep.polysemy = normalizeStringArray(keep.polysemy || '');
    drop.polysemy = normalizeStringArray(drop.polysemy || '');
    keep.mnemonic = String(keep.mnemonic || '').trim();
    drop.mnemonic = String(drop.mnemonic || '').trim();
    keep.example = String(keep.example || '').trim();
    drop.example = String(drop.example || '').trim();
    keep.exampleMeaning = String(keep.exampleMeaning || '').trim();
    drop.exampleMeaning = String(drop.exampleMeaning || '').trim();

    if (!keep.meaning && drop.meaning) keep.meaning = drop.meaning;
    if (!keep.pronunciation && drop.pronunciation) keep.pronunciation = drop.pronunciation;
    keep.synonyms = Array.from(new Set([...(keep.synonyms || []), ...(drop.synonyms || [])]));
    keep.polysemy = Array.from(new Set([...(keep.polysemy || []), ...(drop.polysemy || [])]));
    if (!keep.mnemonic && drop.mnemonic) keep.mnemonic = drop.mnemonic;
    if (!keep.example && drop.example) keep.example = drop.example;
    if (!keep.exampleMeaning && drop.exampleMeaning) keep.exampleMeaning = drop.exampleMeaning;

    // Keep explanation in sync with meaning for vocab deck
    if (!keep.explanation && keep.meaning) keep.explanation = keep.meaning;
    if (keep.meaning && !keep.explanation) keep.explanation = keep.meaning;

    // Merge tags (set)
    keep.tags = Array.from(
      new Set([...(keep.tags || []), ...(drop.tags || [])].map((t) => String(t).trim()).filter(Boolean))
    );

    // Merge stats
    const ks = ensureStat(keep.id);
    const ds = ensureStat(drop.id);
    ks.correct = (ks.correct || 0) + (ds.correct || 0);
    ks.wrong = (ks.wrong || 0) + (ds.wrong || 0);

    const last = Math.max(ks.lastReviewed || 0, ds.lastReviewed || 0);
    ks.lastReviewed = last ? last : ks.lastReviewed || ds.lastReviewed || null;

    ks.bookmark = !!(ks.bookmark || ds.bookmark || keep.bookmarked || drop.bookmarked);
    keep.bookmarked = ks.bookmark;

    // update timestamp
    keep.updatedAt = Math.max(keep.updatedAt || 0, drop.updatedAt || 0, now());

    // Mark drop for removal
    removeIds.add(drop.id);
    delete DATA.stats[drop.id];
  };

  for (const c of cards) {
    if (!c || !c.prompt) continue;
    const key = normalizePromptKey(c.prompt);
    if (!key) continue;

    const keepId = byKey.get(key);
    if (!keepId) {
      byKey.set(key, c.id);
      continue;
    }

    const keep = DATA.cards.find((x) => x.id === keepId);
    if (!keep) {
      byKey.set(key, c.id);
      continue;
    }

    // Choose keep = most recently updated
    const keepIsNewer = (keep.updatedAt || 0) >= (c.updatedAt || 0);
    if (keepIsNewer) {
      mergeInto(keep, c);
    } else {
      // swap keep
      byKey.set(key, c.id);
      mergeInto(c, keep);
    }
    mergedExisting++;
  }

  if (removeIds.size) {
    DATA.cards = DATA.cards.filter((c) => !removeIds.has(c.id));
  }

  return { index: byKey, mergedExisting };
}



// -------------------------
// About
// -------------------------

function renderAbout() {
  setSubtitle('도움말');
  appEl.innerHTML = `
    <div class="card">
      <div style="font-weight: 850; font-size: 16px; margin-bottom: 10px;">이 앱은 어떤 방식인가요?</div>
      <div style="font-size: 13px; color: var(--muted); line-height: 1.7;">
        · 단어장 앱(Vocat)에서 문장→정답(O/X)→설명으로 만들어 회독하는 방식을 전용 앱으로 만든 버전입니다.<br>
        · 문장을 보고 <b>O/X를 선택</b>하면 정답·해설이 나오고, 맞춤/틀림이 자동 기록됩니다.<br>
        · 세션이 끝나면 틀린 것만 다시 모아서 반복할 수 있습니다.
      </div>

      <div class="hr"></div>

      <div style="font-weight: 850; margin-bottom: 10px;">스마트폰에 앱처럼 설치하기 (PWA)</div>
      <div style="font-size: 13px; color: var(--muted); line-height: 1.7;">
        · Android(Chrome): 메뉴(⋮) → <b>홈 화면에 추가</b><br>
        · iPhone(Safari): 공유(□↑) → <b>홈 화면에 추가</b><br>
        ※ 서비스워커 때문에 <b>https</b> 또는 <b>localhost</b>에서 열어야 오프라인이 동작합니다.
      </div>

      <div class="hr"></div>

      <div style="font-weight: 850; margin-bottom: 10px;">ChatGPT로 문제 세트 만들기</div>
      <div style="font-size: 13px; color: var(--muted); line-height: 1.7;">
        아래 템플릿대로 문법 포인트/예문을 보내면, 제가 <b>카드 배열(JSON)</b>로 정리해 드릴게요.<br>
        앱의 <b>가져오기/내보내기</b> 화면에서 JSON을 붙여넣으면 됩니다.
      </div>

      <div class="card" style="margin-top: 12px; background: #fff;">
        <div style="font-weight: 750; margin-bottom: 8px;">보내는 템플릿</div>
        <pre style="white-space: pre-wrap; margin: 0; font-size: 12px; line-height: 1.5; color: #111;">카테고리: (예: 리그래머 1-20)

문법 포인트(또는 책 페이지/단원):
- 

예문/문제 후보(있는 만큼):
1) 
2) 

요청: 위 내용으로 OX 문제로 쓸 문장을 골라서, 정답(O/X) + 한 줄 설명을 붙여 카드 배열(JSON)로 만들어줘.</pre>
      </div>

      <div class="hr"></div>

      <div style="font-weight: 850; margin-bottom: 10px;">백업 팁</div>
      <div style="font-size: 13px; color: var(--muted); line-height: 1.7;">
        · 핸드폰 교체/앱 삭제 대비: 주기적으로 <b>전체 백업 내보내기</b>로 JSON 저장해두세요.
      </div>
    </div>
  `;
}

// -------------------------
// Route dispatcher
// -------------------------

function renderRoute() {
  closeDrawer();

  // iOS/Safari에서 초기 진입 시 hashchange가 안 잡히는 경우가 있어서
  // 해시가 없어도 바로 홈을 렌더링하고, 주소만 조용히 #/ 로 맞춰준다.
  if (!location.hash || location.hash === '#') {
    try {
      if (history && history.replaceState) {
        history.replaceState(null, '', '#/');
      } else {
        location.hash = '#/';
      }
    } catch (e) {
      location.hash = '#/';
    }
    renderHome();
    return;
  }

  const { parts, query } = parseRoute();

  // Home
  if (parts.length === 0) {
    renderHome();
    return;
  }

  const [head, id] = parts;

  if (head === '') {
    renderHome();
    return;
  }

  if (head === 'deck' && id) {
    renderDeck(id);

    // If edit query exists, open edit modal automatically
    const editId = query.edit;
    if (editId) {
      const c = DATA.cards.find((x) => x.id === editId);
      if (c) openCardModal({ deckId: id, card: c });
      // remove query from hash for cleanliness
      const clean = `#/deck/${id}`;
      if (location.hash !== clean) history.replaceState(null, '', clean);
    }
    return;
  }

  if (head === 'study' && id) {
    renderStudy(id, { mode: query.mode, tags: query.tags || '', tagMatch: query.tagMatch || query.tagmatch || '' });
    return;
  }

  if (head === 'import') {
    renderImportExport();
    return;
  }

  if (head === 'about') {
    renderAbout();
    return;
  }

  // Fallback
  appEl.innerHTML = `<div class="card">페이지를 찾을 수 없습니다.</div>`;
  setSubtitle('');
}


function safeRenderRoute() {
  try {
    renderRoute();
  } catch (e) {
    console.error('Render failed', e);
    STUDY = null;
    clearStudyState();
    setSubtitle('오류');
    appEl.innerHTML = `
      <div class="card">
        <div style="font-weight:800; font-size:16px; margin-bottom:8px;">화면을 불러오지 못했어요</div>
        <div style="font-size:13px; color: var(--muted); line-height:1.6;">
          업데이트 직후 캐시나 이전 학습 상태 때문에 꼬였을 수 있어요.<br>
          아래 버튼으로 홈으로 돌아가거나, 새로고침 후 다시 시도해 주세요.
        </div>
        <div class="row" style="gap:8px; flex-wrap:wrap; margin-top:12px;">
          <button class="btn primary" id="btn-safe-home">홈으로</button>
          <button class="btn" id="btn-safe-reload">새로고침</button>
        </div>
      </div>
    `;
    const homeBtn = $('#btn-safe-home');
    if (homeBtn) homeBtn.addEventListener('click', () => { location.hash = '#/'; renderRoute(); });
    const reloadBtn = $('#btn-safe-reload');
    if (reloadBtn) reloadBtn.addEventListener('click', () => location.reload());
  }
}



// -------------------------
// Study persistence + 30/day recommendation (v10)
// -------------------------

function todayLocalYMD() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function parseLocalYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function diffDaysFrom(startYmd, endYmd = todayLocalYMD()) {
  const a = parseLocalYMD(startYmd);
  const b = parseLocalYMD(endYmd);
  if (!a || !b) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function isDayTag(tag) {
  return /^DAY\d{1,3}$/i.test(String(tag || '').trim());
}

function dayTagNum(tag) {
  const m = /^DAY(\d{1,3})$/i.exec(String(tag || '').trim());
  return m ? Number(m[1]) : null;
}

function formatDayTag(n) {
  const num = Math.max(1, Number(n) || 1);
  return `DAY${String(num).padStart(2, '0')}`;
}

function stripDayTags(tags) {
  return (Array.isArray(tags) ? tags : [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .filter((t) => !isDayTag(t));
}

function getCardsSortedForPlan(deckId) {
  return getCards(deckId)
    .slice()
    .sort((a, b) => {
      const ca = a.createdAt ?? 0;
      const cb = b.createdAt ?? 0;
      if (ca !== cb) return ca - cb;
      return String(a.prompt || '').localeCompare(String(b.prompt || ''), 'ko');
    });
}

function getDeckDayCount(deckId) {
  let max = 0;
  getCards(deckId).forEach((card) => {
    (card.tags || []).forEach((tag) => {
      const n = dayTagNum(tag);
      if (n && n > max) max = n;
    });
  });
  return max;
}

function ensureDeckPlanDefaults(deck) {
  if (!deck) return;
  if (!Number.isFinite(Number(deck.dailyCount)) || Number(deck.dailyCount) <= 0) {
    deck.dailyCount = DEFAULT_DAILY_NEW_COUNT;
  }
  if (!Array.isArray(deck.planReviewIntervals) || deck.planReviewIntervals.length === 0) {
    deck.planReviewIntervals = DEFAULT_REVIEW_INTERVALS.slice();
  }
  if (deck.planStartDate == null) deck.planStartDate = '';
}

function assignDeckDayTags(deckId, dailyCount = DEFAULT_DAILY_NEW_COUNT, resetStart = false) {
  const deck = getDeck(deckId);
  if (!deck) return 0;
  ensureDeckPlanDefaults(deck);

  const cards = getCardsSortedForPlan(deckId);
  cards.forEach((card, idx) => {
    const dayNo = Math.floor(idx / dailyCount) + 1;
    const baseTags = stripDayTags(card.tags);
    card.tags = [...baseTags, formatDayTag(dayNo)];
    card.updatedAt = now();
  });

  deck.dailyCount = dailyCount;
  deck.planReviewIntervals = DEFAULT_REVIEW_INTERVALS.slice();
  if (!deck.planStartDate || resetStart) deck.planStartDate = todayLocalYMD();
  commit();
  return Math.ceil(cards.length / dailyCount);
}

function getDeckPlanInfo(deckId) {
  const deck = getDeck(deckId);
  if (!deck || String(deck.type || '').toLowerCase() !== 'vocab') return null;
  ensureDeckPlanDefaults(deck);

  const totalDays = getDeckDayCount(deckId);
  const dailyCount = Number(deck.dailyCount) || DEFAULT_DAILY_NEW_COUNT;
  const intervals = (deck.planReviewIntervals || DEFAULT_REVIEW_INTERVALS)
    .map((x) => Number(x) || 0)
    .filter((x) => x > 0);

  const startDate = String(deck.planStartDate || '').trim();
  const elapsedDay = startDate ? Math.max(1, diffDaysFrom(startDate) + 1) : 1;
  const currentNewDay = elapsedDay <= totalDays ? elapsedDay : null;

  const dueSet = new Set();
  if (currentNewDay) dueSet.add(currentNewDay);
  intervals.forEach((gap) => {
    const dayNo = elapsedDay - gap;
    if (dayNo >= 1 && dayNo <= totalDays) dueSet.add(dayNo);
  });

  const dueNumbers = Array.from(dueSet).sort((a, b) => a - b);
  const reviewNumbers = dueNumbers.filter((n) => n !== currentNewDay);

  return {
    totalDays,
    dailyCount,
    intervals,
    startDate,
    elapsedDay,
    currentNewDay,
    dueNumbers,
    dueTags: dueNumbers.map(formatDayTag),
    reviewNumbers,
    reviewTags: reviewNumbers.map(formatDayTag),
    newTag: currentNewDay ? formatDayTag(currentNewDay) : '',
    finishedNew: totalDays > 0 && !currentNewDay,
  };
}

function formatPlanSummary(deckId) {
  const deck = getDeck(deckId);
  const cardsCount = getCards(deckId).length;
  if (!deck || String(deck.type || '').toLowerCase() !== 'vocab' || cardsCount === 0) return null;

  const info = getDeckPlanInfo(deckId);
  const totalDays = info?.totalDays || Math.ceil(cardsCount / (Number(deck.dailyCount) || DEFAULT_DAILY_NEW_COUNT));

  if (!info || !info.totalDays) {
    return `30개/day · 총 ${totalDays}일`;
  }

  if (!info.startDate) {
    return `30개/day · 총 ${info.totalDays}일 · 미시작`;
  }

  if (info.currentNewDay) {
    return `30개/day · 오늘 ${info.newTag}/${info.totalDays}`;
  }

  return `30개/day · 신규 완료 · 복습 ${info.reviewTags.length}세트`;
}

function ensureDeckPlan(deckId, opts = {}) {
  const deck = getDeck(deckId);
  if (!deck || String(deck.type || '').toLowerCase() !== 'vocab') return null;
  ensureDeckPlanDefaults(deck);

  if (getDeckDayCount(deckId) === 0) {
    assignDeckDayTags(deckId, Number(deck.dailyCount) || DEFAULT_DAILY_NEW_COUNT, true);
  } else if (!deck.planStartDate || opts.resetStart) {
    deck.planStartDate = todayLocalYMD();
    commit();
  }

  return getDeckPlanInfo(deckId);
}

function startRecommendedStudy(deckId) {
  const deck = getDeck(deckId);
  if (!deck) return;
  if (String(deck.type || '').toLowerCase() !== 'vocab') {
    location.hash = `#/study/${deckId}`;
    return;
  }

  const hadDayTags = getDeckDayCount(deckId) > 0;
  const info = ensureDeckPlan(deckId);
  if (!info || info.totalDays === 0) {
    toast('먼저 단어를 추가해 주세요.');
    return;
  }

  if (!hadDayTags) {
    toast(`30개/day로 자동 분할했어요 · 총 ${info.totalDays}일`);
  } else if (!deck.planStartDate) {
    toast('오늘을 DAY1 기준으로 설정했어요');
  }

  const preview = [info.newTag, ...info.reviewTags].filter(Boolean).join(', ');
  if (preview) toast(`오늘 추천: ${preview}`);

  location.hash = buildStudyHash(deckId, 'all', info.dueTags, 'any');
}

function resetPlanStartToday(deckId) {
  const deck = getDeck(deckId);
  if (!deck) return;
  ensureDeckPlanDefaults(deck);
  if (getDeckDayCount(deckId) === 0) {
    assignDeckDayTags(deckId, Number(deck.dailyCount) || DEFAULT_DAILY_NEW_COUNT, true);
  } else {
    deck.planStartDate = todayLocalYMD();
    commit();
  }
  toast('오늘을 DAY1 기준으로 설정했어요');
  renderRoute();
}

function rebuildPlan30(deckId) {
  const totalDays = assignDeckDayTags(deckId, DEFAULT_DAILY_NEW_COUNT, true);
  toast(`30개/day로 다시 나눴어요 · 총 ${totalDays}일`);
  renderRoute();
}

function saveStudyState() {
  try {
    if (!STUDY) {
      localStorage.removeItem(STUDY_STATE_KEY);
      return;
    }
    const payload = {
      ...STUDY,
      savedAt: now(),
    };
    localStorage.setItem(STUDY_STATE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed to save study state', e);
  }
}

function clearStudyState() {
  try {
    localStorage.removeItem(STUDY_STATE_KEY);
  } catch (e) {
    console.warn('Failed to clear study state', e);
  }
}

function loadStudyState() {
  try {
    const raw = localStorage.getItem(STUDY_STATE_KEY);
    if (!raw) return null;
    const study = JSON.parse(raw);
    if (!study || typeof study !== 'object') return null;

    const deck = getDeck(study.deckId);
    if (!deck) return null;

    if (!Array.isArray(study.queue)) return null;
    const validIds = new Set(getCards(study.deckId).map((c) => c.id));
    study.queue = study.queue.filter((id) => validIds.has(id));
    if (study.queue.length === 0) return null;

    study.index = clamp(Number(study.index) || 0, 0, study.queue.length - 1);
    study.phase = study.phase === 'summary' ? 'summary' : 'study';
    study.answered = !!study.answered;
    study.choice = normalizeAnswer(study.choice);
    study.lastIsCorrect = typeof study.lastIsCorrect === 'boolean' ? study.lastIsCorrect : null;
    study.wrongIds = Array.isArray(study.wrongIds) ? study.wrongIds.filter((id) => validIds.has(id)) : [];
    study.correctCount = Number(study.correctCount) || 0;
    study.wrongCount = Number(study.wrongCount) || 0;
    study.mode = normalizeStudyMode(study.mode || 'all');

    if (study.tagFilter && Array.isArray(study.tagFilter.tags) && study.tagFilter.tags.length) {
      study.tagFilter = {
        tags: uniqueSorted(study.tagFilter.tags.map((t) => String(t).trim()).filter(Boolean)),
        match: String(study.tagFilter.match || '').toLowerCase() === 'all' ? 'all' : 'any',
      };
    } else {
      study.tagFilter = null;
    }

    return study;
  } catch (e) {
    console.warn('Failed to load study state', e);
    return null;
  }
}

function getResumeStudyMeta() {
  if (!STUDY) return null;
  if (STUDY.phase === 'summary') return null;
  const deck = getDeck(STUDY.deckId);
  if (!deck) return null;
  if (!Array.isArray(STUDY.queue) || STUDY.queue.length === 0) return null;

  const total = STUDY.queue.length;
  const current = clamp((Number(STUDY.index) || 0) + 1, 1, total);
  const currentCardId = STUDY.queue[Math.min(Math.max(Number(STUDY.index) || 0, 0), total - 1)];
  const currentCard = DATA.cards.find((c) => c.id === currentCardId) || null;
  const isVocab = String(deck.type || '').toLowerCase() === 'vocab';

  let modeLabel = STUDY.mode === 'bookmarks' ? '북마크' : (STUDY.mode === 'wrongs' ? (isVocab ? '모름' : '오답') : '전체');
  const tf = STUDY.tagFilter;
  if (tf && Array.isArray(tf.tags) && tf.tags.length) {
    const preview = tf.tags.length === 1
      ? tf.tags[0]
      : `${tf.tags.slice(0, 2).join(', ')}${tf.tags.length > 2 ? ` +${tf.tags.length - 2}` : ''}`;
    modeLabel = modeLabel === '전체' ? preview : `${modeLabel} · ${preview}`;
  }

  return {
    deck,
    total,
    current,
    prompt: currentCard ? currentCard.prompt : '',
    isVocab,
    modeLabel,
  };
}

function openDeckModal(existingDeck = null) {
  const isEdit = !!existingDeck;
  const deck = existingDeck || { name: '', description: '', type: 'grammar', dailyCount: DEFAULT_DAILY_NEW_COUNT };
  const curType = String(deck.type || '').toLowerCase() === 'vocab' ? 'vocab' : 'grammar';

  openModal({
    title: isEdit ? '카테고리 수정' : '새 카테고리',
    bodyHTML: `
      <div class="field">
        <label>이름</label>
        <input type="text" id="deck-name" placeholder="예) 영단어 / 행정학 키워드 / 행정법 OX" value="${escapeText(deck.name)}" />
      </div>

      <div class="field">
        <label>유형</label>
        <select id="deck-type">
          <option value="grammar" ${curType === 'grammar' ? 'selected' : ''}>문법 OX (정답 있음)</option>
          <option value="vocab" ${curType === 'vocab' ? 'selected' : ''}>단어장 (O=앎 / X=모름)</option>
        </select>
      </div>

      <div class="field">
        <label>설명 (선택)</label>
        <textarea id="deck-desc" placeholder="예) 30개/day 자동추천 · 키워드→이론">${escapeText(deck.description || '')}</textarea>
      </div>

      <div class="card" style="background:#fff; font-size:13px; color:var(--muted); line-height:1.6;">
        · 단어장 카테고리는 <b>30개/day 자동추천</b>을 바로 사용할 수 있어요.<br>
        · 학습 도중 앱을 나가도 <b>이어하기</b>로 같은 위치에서 다시 시작할 수 있어요.
      </div>

      <div class="modal-actions">
        <button class="btn" id="deck-cancel">취소</button>
        <button class="btn primary" id="deck-save">저장</button>
      </div>
    `,
    onMount: (root) => {
      $('#deck-cancel', root).addEventListener('click', closeModal);
      $('#deck-save', root).addEventListener('click', () => {
        const name = $('#deck-name', root).value.trim();
        const description = $('#deck-desc', root).value.trim();
        const typeRaw = $('#deck-type', root).value;
        const type = String(typeRaw).toLowerCase() === 'vocab' ? 'vocab' : 'grammar';

        if (!name) {
          alert('카테고리 이름을 입력해 주세요.');
          return;
        }

        if (isEdit) {
          const d = getDeck(existingDeck.id);
          if (!d) return;
          d.name = name;
          d.description = description;
          d.type = type;
          ensureDeckPlanDefaults(d);
          if (type === 'vocab' && !d.planStartDate) d.planStartDate = '';
        } else {
          const nextOrder = (Math.max(0, ...DATA.decks.map((d) => d.order || 0)) + 1) || 1;
          DATA.decks.push({
            id: uuid(),
            name,
            description,
            type,
            createdAt: now(),
            order: nextOrder,
            dailyCount: DEFAULT_DAILY_NEW_COUNT,
            planStartDate: '',
            planReviewIntervals: DEFAULT_REVIEW_INTERVALS.slice(),
          });
        }

        commit();
        closeModal();
        toast('저장됨');
        renderRoute();
      });

      setTimeout(() => $('#deck-name', root).focus(), 0);
    },
  });
}

// Override: show resume + 30/day plan buttons
function buildStudyHashExact(deckId, mode = 'all', selectedTags = [], tagMatch = 'any') {
  const params = new URLSearchParams();
  params.set('mode', normalizeStudyMode(mode || 'all'));
  params.set('tags', Array.isArray(selectedTags) ? selectedTags.join(',') : '');
  params.set('tagMatch', String(tagMatch || '').toLowerCase() === 'all' ? 'all' : 'any');
  return `#/study/${deckId}?${params.toString()}`;
}

function getCardDayTag(card) {
  const tags = Array.isArray(card?.tags) ? card.tags : [];
  let best = null;
  tags.forEach((tag) => {
    const n = dayTagNum(tag);
    if (n && (!best || n < best.num)) best = { tag: formatDayTag(n), num: n };
  });
  return best;
}

function appendMissingDayTags(deckId, dailyCount = DEFAULT_DAILY_NEW_COUNT) {
  const deck = getDeck(deckId);
  if (!deck || String(deck.type || '').toLowerCase() !== 'vocab') return 0;
  ensureDeckPlanDefaults(deck);
  deck.dailyCount = Number(deck.dailyCount) || dailyCount || DEFAULT_DAILY_NEW_COUNT;

  const cards = getCards(deckId).slice().sort((a, b) => {
    const ca = Number(a.createdAt || 0);
    const cb = Number(b.createdAt || 0);
    if (ca !== cb) return ca - cb;
    return String(a.prompt || '').localeCompare(String(b.prompt || ''), 'ko');
  });

  const counts = new Map();
  let maxDay = 0;
  const unassigned = [];

  cards.forEach((card) => {
    const info = getCardDayTag(card);
    if (!info) {
      unassigned.push(card);
      return;
    }
    const prev = counts.get(info.num) || 0;
    counts.set(info.num, prev + 1);
    if (info.num > maxDay) maxDay = info.num;
  });

  if (unassigned.length === 0) return maxDay;

  let dayNo = maxDay || 1;
  let dayCount = counts.get(dayNo) || 0;

  unassigned.forEach((card) => {
    if (dayCount >= deck.dailyCount) {
      dayNo += 1;
      dayCount = counts.get(dayNo) || 0;
    }
    card.tags = [...stripDayTags(card.tags), formatDayTag(dayNo)];
    card.updatedAt = now();
    dayCount += 1;
    counts.set(dayNo, dayCount);
    if (dayNo > maxDay) maxDay = dayNo;
  });

  if (!deck.planStartDate) deck.planStartDate = '';
  commit();
  return maxDay;
}

function getDeckDayRows(deckId) {
  const deck = getDeck(deckId);
  if (!deck || String(deck.type || '').toLowerCase() !== 'vocab') return [];
  appendMissingDayTags(deckId, Number(deck.dailyCount) || DEFAULT_DAILY_NEW_COUNT);

  const map = new Map();
  getCards(deckId).forEach((card) => {
    const info = getCardDayTag(card);
    if (!info) return;
    let row = map.get(info.num);
    if (!row) {
      row = { num: info.num, tag: info.tag, total: 0, wrong: 0, bookmarked: 0 };
      map.set(info.num, row);
    }
    row.total += 1;
    if (isWrongCard(card.id)) row.wrong += 1;
    if (isBookmarked(card.id)) row.bookmarked += 1;
  });
  return Array.from(map.values()).sort((a, b) => a.num - b.num);
}

function getDeckPlanMeta(deckId) {
  const deck = getDeck(deckId);
  if (!deck || String(deck.type || '').toLowerCase() !== 'vocab') return null;
  const rows = getDeckDayRows(deckId);
  if (!rows.length) return `30개/day · DAY 없음`;
  return `30개/day · DAY ${rows.length}개`;
}

function openDayStudyModal(deckId) {
  const deck = getDeck(deckId);
  if (!deck) return;
  const rows = getDeckDayRows(deckId);
  if (!rows.length) {
    toast('DAY로 나눌 단어가 없습니다');
    return;
  }

  openModal({
    title: 'DAY 학습',
    bodyHTML: `
      <div class="card" style="margin-bottom:12px;">
        <div style="font-weight:800; margin-bottom:6px;">${escapeText(deck.name)}</div>
        <div style="font-size:13px; color: var(--muted); line-height:1.6;">
          단어장은 <b>30개/day</b> 기준으로 자동 분할됩니다.<br>
          <b>한 개 DAY만</b> 고르거나, <b>여러 DAY를 함께</b> 골라서 학습할 수 있어요.
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <div class="row" style="justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;">
          <div id="day-selected-info" style="font-size:13px; font-weight:700;">선택한 DAY 없음</div>
          <div class="row" style="gap:8px; flex-wrap:wrap;">
            <button class="btn small" id="btn-day-select-all">전체 선택</button>
            <button class="btn small" id="btn-day-clear">전체 해제</button>
            <button class="btn primary small" id="btn-day-start" disabled>선택한 DAY 학습</button>
          </div>
        </div>
      </div>

      <div id="day-list" style="display:flex; flex-direction:column; gap:10px;"></div>

      <div class="row" style="justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:12px;">
        <div style="font-size:12px; color:var(--muted);">새 단어를 추가하면 마지막 DAY 뒤로 이어서 자동 배정됩니다.</div>
        <button class="btn small" id="btn-day-rebuild">DAY 다시 정리</button>
      </div>
    `,
    onMount: (root) => {
      const listEl = $('#day-list', root);
      const infoEl = $('#day-selected-info', root);
      const startEl = $('#btn-day-start', root);
      const selected = new Set();

      function orderedSelectedTags() {
        return Array.from(selected).sort((a, b) => dayTagNum(a) - dayTagNum(b));
      }

      function refreshSelectionInfo() {
        const arr = orderedSelectedTags();
        if (!arr.length) {
          infoEl.textContent = '선택한 DAY 없음';
          startEl.disabled = true;
          return;
        }
        const preview = arr.slice(0, 3).join(', ') + (arr.length > 3 ? ` +${arr.length - 3}` : '');
        infoEl.textContent = `선택 ${arr.length}개 · ${preview}`;
        startEl.disabled = false;
      }

      function toggleDay(tag, forceValue = null) {
        if (forceValue === true) selected.add(tag);
        else if (forceValue === false) selected.delete(tag);
        else if (selected.has(tag)) selected.delete(tag);
        else selected.add(tag);
        renderRows();
      }

      function renderRows() {
        listEl.innerHTML = '';
        rows.forEach((row) => {
          const picked = selected.has(row.tag);
          const item = document.createElement('div');
          item.className = 'card';
          item.style.margin = '0';
          item.innerHTML = `
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap;">
              <label style="display:flex; gap:12px; align-items:flex-start; cursor:pointer; flex:1 1 260px; min-width:220px;">
                <input type="checkbox" ${picked ? 'checked' : ''} data-day-check="${escapeText(row.tag)}" style="width:18px; height:18px; margin-top:2px;" />
                <div>
                  <div style="font-weight:800; font-size:15px;">${escapeText(row.tag)}</div>
                  <div style="font-size:13px; color:var(--muted); margin-top:4px; line-height:1.5;">
                    단어 ${row.total}개 · 모름 ${row.wrong}개 · 북마크 ${row.bookmarked}개
                  </div>
                </div>
              </label>
              <div class="row" style="gap:8px; flex-wrap:wrap;">
                <button class="btn ${picked ? 'primary' : ''} small" data-day-toggle="${escapeText(row.tag)}">${picked ? '선택됨' : '선택'}</button>
                <button class="btn small" data-study-day="${escapeText(row.tag)}">이 DAY만</button>
              </div>
            </div>
          `;

          $('[data-day-check]', item).addEventListener('change', (e) => {
            toggleDay(row.tag, e.target.checked);
          });
          $('[data-day-toggle]', item).addEventListener('click', () => {
            toggleDay(row.tag);
          });
          $('[data-study-day]', item).addEventListener('click', () => {
            closeModal();
            location.hash = buildStudyHashExact(deckId, 'all', [row.tag], 'any');
          });

          listEl.appendChild(item);
        });
        refreshSelectionInfo();
      }

      $('#btn-day-select-all', root).addEventListener('click', () => {
        rows.forEach((row) => selected.add(row.tag));
        renderRows();
      });

      $('#btn-day-clear', root).addEventListener('click', () => {
        selected.clear();
        renderRows();
      });

      startEl.addEventListener('click', () => {
        const chosen = orderedSelectedTags();
        if (!chosen.length) {
          toast('DAY를 하나 이상 선택하세요');
          return;
        }
        closeModal();
        location.hash = buildStudyHashExact(deckId, 'all', chosen, 'any');
      });

      $('#btn-day-rebuild', root).addEventListener('click', () => {
        const ok = confirm('현재 단어장을 30개/day 기준으로 처음부터 다시 나눌까요? 기존 DAY 태그는 덮어써집니다.');
        if (!ok) return;
        assignDeckDayTags(deckId, DEFAULT_DAILY_NEW_COUNT, false);
        closeModal();
        toast('DAY를 30개/day 기준으로 다시 나눴어요');
        renderRoute();
      });

      renderRows();
    },
  });
}

function startStudyByExactFilter(deckId, mode = 'all', tags = [], tagMatch = 'any') {
  location.hash = buildStudyHashExact(deckId, mode, tags, tagMatch);
}

function preserveOrStartStudy(deckId, mode = 'all', tags = [], tagMatch = 'any') {
  const cleanTags = uniqueSorted((tags || []).map((t) => String(t).trim()).filter(Boolean));
  const modeNorm = normalizeStudyMode(mode);
  const currentTags = STUDY?.tagFilter?.tags ? uniqueSorted(STUDY.tagFilter.tags) : [];
  const currentMatch = STUDY?.tagFilter?.match || 'any';
  const sameDeck = STUDY && STUDY.deckId === deckId;
  const sameMode = STUDY && normalizeStudyMode(STUDY.mode) === modeNorm;
  const sameTags = JSON.stringify(currentTags) === JSON.stringify(cleanTags);
  const sameMatch = currentMatch === (String(tagMatch || '').toLowerCase() === 'all' ? 'all' : 'any');

  // Explicit full study should clear old tag filters.
  if (sameDeck && sameMode && sameTags && sameMatch) {
    location.hash = buildStudyHashExact(deckId, modeNorm, cleanTags, tagMatch);
    return;
  }
  location.hash = buildStudyHashExact(deckId, modeNorm, cleanTags, tagMatch);
}

function renderHome() {
  setSubtitle('카테고리 목록');

  const decks = DATA.decks.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const resume = getResumeStudyMeta();

  appEl.innerHTML = `
    <div class="row" style="justify-content: space-between; gap: 10px;">
      <button class="btn primary" id="btn-new-deck">+ 카테고리</button>
      <button class="btn" id="btn-go-import">가져오기</button>
    </div>

    <div class="section-title">카테고리</div>
    <div class="deck-grid" id="deck-grid"></div>

    <div class="hr"></div>
    <div class="card">
      <div style="font-weight: 750; margin-bottom: 8px;">빠른 시작</div>
      <div style="font-size: 13px; color: var(--muted); line-height: 1.6;">
        · <b>문법 OX</b>: 문장을 보고 <span class="kbd">O</span>/<span class="kbd">X</span> 선택 → 정답/해설 확인 → <span class="kbd">다음</span>.<br>
        · <b>단어장</b>: 단어를 보고 <span class="kbd">O</span>(앎)/<span class="kbd">X</span>(모름) 선택 → 뜻/연상/예문/해석 확인 → <span class="kbd">다음</span>.<br>
        · <b>DAY 학습</b>: 단어장은 <b>30개/day</b>로 자동 분할되고, 원하는 DAY를 직접 골라서 학습합니다.<br>
        · 앱을 나갔다 와도 <b>이어서 학습</b>으로 계속 볼 수 있어요.
      </div>
    </div>
  `;

  $('#btn-new-deck').addEventListener('click', () => openDeckModal());
  $('#btn-go-import').addEventListener('click', () => (location.hash = '#/import'));

  const grid = $('#deck-grid');
  if (decks.length === 0) {
    grid.innerHTML = `<div class="card">아직 카테고리가 없습니다. <b>+ 카테고리</b>로 시작하세요.</div>`;
    return;
  }

  decks.forEach((deck) => {
    const isVocab = String(deck.type || '').toLowerCase() === 'vocab';
    const s = deckStats(deck.id);
    const bmCount = deckBookmarkCount(deck.id);
    const wrongCount = deckWrongCount(deck.id);
    const tagCount = getDeckTags(deck.id, 'all').length;
    const labelCards = isVocab ? '단어' : '문제';
    const labelWrong = isVocab ? '모름' : '오답';
    const labelAcc = isVocab ? '알았음률' : '정답률';
    const dayMeta = isVocab ? getDeckPlanMeta(deck.id) : null;
    const deckResume = resume && resume.deck.id === deck.id ? resume : null;

    const meta = [
      `${labelCards} ${s.cardsCount}개`,
      bmCount ? `북마크 ${bmCount}개` : null,
      wrongCount ? `${labelWrong} ${wrongCount}개` : null,
      s.acc == null ? '기록 없음' : `${labelAcc} ${s.acc}% (기록 ${s.total}회)`,
      dayMeta,
    ].filter(Boolean).join(' · ');

    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <div class="deck-title">${escapeText(deck.name)}</div>
      <div class="deck-meta">${escapeText(meta)}</div>
      ${deckResume ? `
        <div class="card" style="margin: 10px 0 12px; background:#fff;">
          <div style="font-weight: 800; margin-bottom: 6px;">이어서 학습</div>
          <div style="font-size: 13px; color: var(--muted); line-height: 1.6;">
            <b>${escapeText(deckResume.modeLabel)}</b> · ${deckResume.current}/${deckResume.total}<br>
            ${deckResume.prompt ? escapeText(deckResume.prompt.length > 70 ? deckResume.prompt.slice(0, 70) + '…' : deckResume.prompt) : ''}
          </div>
          <div class="row" style="gap: 8px; flex-wrap: wrap; margin-top: 10px;">
            <button class="btn primary small" data-action="resume">이어서 학습</button>
            <button class="btn small" data-action="resume-clear">이어하기 삭제</button>
          </div>
        </div>
      ` : ''}
      <div class="deck-actions">
        ${isVocab
          ? `
            <button class="btn primary small" data-action="study-all">전체 학습</button>
            <button class="btn small" data-action="study-day">DAY 학습</button>
          `
          : `<button class="btn primary small" data-action="study-all">학습</button>`}
        <button class="btn small" data-action="bm" ${bmCount ? '' : 'disabled'}>북마크</button>
        <button class="btn small" data-action="wrong" ${wrongCount ? '' : 'disabled'}>${escapeText(labelWrong)}</button>
        <button class="btn small" data-action="tags" ${tagCount ? '' : 'disabled'}>태그</button>
        <button class="btn small" data-action="manage">관리</button>
      </div>
    `;

    el.querySelector('[data-action="study-all"]').addEventListener('click', () => {
      preserveOrStartStudy(deck.id, 'all', [], 'any');
    });

    if (isVocab) {
      el.querySelector('[data-action="study-day"]').addEventListener('click', () => {
        openDayStudyModal(deck.id);
      });
    }

    const resumeBtn = el.querySelector('[data-action="resume"]');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        location.hash = buildStudyHashExact(
          deck.id,
          STUDY?.mode || 'all',
          STUDY?.tagFilter?.tags || [],
          STUDY?.tagFilter?.match || 'any'
        );
      });
    }

    const resumeClearBtn = el.querySelector('[data-action="resume-clear"]');
    if (resumeClearBtn) {
      resumeClearBtn.addEventListener('click', () => {
        STUDY = null;
        clearStudyState();
        toast('이어하기가 삭제되었어요');
        renderHome();
      });
    }

    el.querySelector('[data-action="bm"]').addEventListener('click', () => {
      if (!bmCount) return;
      preserveOrStartStudy(deck.id, 'bookmarks', [], 'any');
    });

    el.querySelector('[data-action="wrong"]').addEventListener('click', () => {
      if (!wrongCount) return;
      preserveOrStartStudy(deck.id, 'wrongs', [], 'any');
    });

    el.querySelector('[data-action="manage"]').addEventListener('click', () => {
      location.hash = `#/deck/${deck.id}`;
    });

    el.querySelector('[data-action="tags"]').addEventListener('click', () => {
      if (!tagCount) {
        toast('태그가 없습니다');
        return;
      }
      openTagStudyModal(deck.id, { mode: 'all', tags: [], tagMatch: 'any' });
    });

    grid.appendChild(el);
  });
}

function renderDeck(deckId) {
  const deck = getDeck(deckId);
  if (!deck) {
    appEl.innerHTML = `<div class="card">존재하지 않는 카테고리입니다.</div>`;
    setSubtitle('');
    return;
  }

  const isVocab = String(deck.type || '').toLowerCase() === 'vocab';
  const labelCards = isVocab ? '단어' : '문제';
  const labelCorrect = isVocab ? '알았음' : '맞춤';
  const labelWrong = isVocab ? '모름' : '틀림';
  const labelWrongOnly = isVocab ? '모름' : '오답';

  const cards = getCards(deckId);
  const s = deckStats(deckId);
  const bmCount = deckBookmarkCount(deckId);
  const wrongCount = deckWrongCount(deckId);
  const tagCount = getDeckTags(deckId, 'all').length;
  const dayRows = isVocab ? getDeckDayRows(deckId) : [];

  setSubtitle(`${deck.name} · ${labelCards} ${s.cardsCount}개`);

  const vocabPlanCard = isVocab ? `
    <div class="card" style="margin-bottom: 12px;">
      <div style="font-weight:800; font-size:15px;">DAY 분할</div>
      <div style="color: var(--muted); font-size: 13px; line-height:1.6; margin-top:8px;">
        30개/day 기준 · 총 <b>${dayRows.length}</b>개 DAY
        <br>새 단어를 추가하면 마지막 DAY 뒤에 이어서 자동 배정됩니다.
      </div>
      <div class="row" style="gap:8px; flex-wrap:wrap; margin-top:10px;">
        <button class="btn primary small" id="btn-day-study-top">DAY 학습</button>
        <button class="btn small" id="btn-rebuild-day-top">DAY 다시 정리</button>
      </div>
    </div>
  ` : '';

  appEl.innerHTML = `
    <div class="card" style="margin-bottom: 12px;">
      <div style="display:flex; justify-content: space-between; gap: 10px;">
        <div>
          <div style="font-weight: 800; font-size: 16px;">${escapeText(deck.name)}</div>
          <div style="color: var(--muted); font-size: 13px; margin-top: 6px; line-height: 1.4;">${escapeText(deck.description || '')}</div>
          <div style="margin-top: 10px; font-size: 12px; color: var(--muted);">
            기록: ${labelCorrect} ${s.correct} · ${labelWrong} ${s.wrong} · ${labelWrongOnly} ${wrongCount} · 북마크 ${bmCount}
          </div>
        </div>
        <div style="display:flex; flex-direction: column; gap: 8px; min-width: 150px;">
          ${isVocab ? `<button class="btn primary small" id="btn-study-all">전체 학습</button>` : `<button class="btn primary small" id="btn-study-all">학습</button>`}
          ${isVocab ? `<button class="btn small" id="btn-day-study">DAY 학습</button>` : ''}
          <button class="btn small" id="btn-study-bookmarks" ${bmCount ? '' : 'disabled'}>북마크 학습 (${bmCount})</button>
          <button class="btn small" id="btn-study-wrongs" ${wrongCount ? '' : 'disabled'}>${labelWrongOnly} 학습 (${wrongCount})</button>
          <button class="btn small" id="btn-study-tags" ${tagCount ? '' : 'disabled'}>태그 학습 (${tagCount})</button>
          <button class="btn small" id="btn-edit-deck">카테고리 수정</button>
          <button class="btn danger small" id="btn-delete-deck">카테고리 삭제</button>
        </div>
      </div>
    </div>

    ${vocabPlanCard}

    <div class="row" style="justify-content: space-between; gap: 10px;">
      <button class="btn primary" id="btn-add-card">+ ${labelCards} 추가</button>
      <button class="btn" id="btn-bulk-add">여러 개 붙여넣기</button>
    </div>

    <div class="field" style="margin-top: 12px;">
      <label>검색</label>
      <input type="text" id="search" placeholder="${isVocab ? '단어/뜻/연상/예문/해석/태그 검색' : '문장/설명/태그 검색'}" />
    </div>

    <div class="section-title">${labelCards} 목록</div>
    <div class="list" id="card-list"></div>
  `;

  $('#btn-study-all').addEventListener('click', () => preserveOrStartStudy(deckId, 'all', [], 'any'));
  if (isVocab) {
    $('#btn-day-study').addEventListener('click', () => openDayStudyModal(deckId));
    const topDayBtn = $('#btn-day-study-top');
    if (topDayBtn) topDayBtn.addEventListener('click', () => openDayStudyModal(deckId));
    const rebuildDayBtn = $('#btn-rebuild-day-top');
    if (rebuildDayBtn) rebuildDayBtn.addEventListener('click', () => {
      const ok = confirm('현재 단어장을 30개/day 기준으로 처음부터 다시 나눌까요? 기존 DAY 태그는 덮어써집니다.');
      if (!ok) return;
      assignDeckDayTags(deckId, DEFAULT_DAILY_NEW_COUNT, false);
      toast('DAY를 30개/day 기준으로 다시 나눴어요');
      renderRoute();
    });
  }

  $('#btn-study-bookmarks').addEventListener('click', () => {
    if (!bmCount) {
      toast('북마크된 카드가 없습니다');
      return;
    }
    preserveOrStartStudy(deckId, 'bookmarks', [], 'any');
  });

  $('#btn-study-wrongs').addEventListener('click', () => {
    if (!wrongCount) {
      toast(isVocab ? '모르는 카드가 없습니다' : '틀린 문제가 없습니다');
      return;
    }
    preserveOrStartStudy(deckId, 'wrongs', [], 'any');
  });

  $('#btn-study-tags').addEventListener('click', () => {
    if (!tagCount) {
      toast('태그가 없습니다');
      return;
    }
    openTagStudyModal(deckId, { mode: 'all', tags: [], tagMatch: 'any' });
  });

  $('#btn-edit-deck').addEventListener('click', () => openDeckModal(deck));

  $('#btn-delete-deck').addEventListener('click', () => {
    if (cards.length > 0) {
      const ok = confirm('이 카테고리의 카드도 함께 삭제됩니다. 계속할까요?');
      if (!ok) return;
    } else {
      const ok = confirm('카테고리를 삭제할까요?');
      if (!ok) return;
    }
    DATA.decks = DATA.decks.filter((d) => d.id !== deckId);
    DATA.cards = DATA.cards.filter((c) => c.deckId !== deckId);
    if (STUDY && STUDY.deckId === deckId) {
      STUDY = null;
      clearStudyState();
    }
    commit();
    toast('삭제됨');
    location.hash = '#/';
  });

  $('#btn-add-card').addEventListener('click', () => openCardModal({ deckId }));
  $('#btn-bulk-add').addEventListener('click', () => openBulkAddModal(deckId));

  const listEl = $('#card-list');
  const searchEl = $('#search');

  function renderList() {
    const q = searchEl.value.trim().toLowerCase();
    const filtered = !q
      ? cards
      : cards.filter((c) => {
          const meaning = String(c.meaning || c.explanation || '').trim();
          const mnemonic = String(c.mnemonic || '').trim();
          const example = String(c.example || '').trim();
          const exampleMeaning = String(c.exampleMeaning || '').trim();
          const pronunciation = String(c.pronunciation || '').trim();
          const synonyms = normalizeStringArray(c.synonyms).join(', ');
          const polysemy = normalizeStringArray(c.polysemy ?? c.senses ?? '').join('\n');
          const hay = isVocab
            ? `${c.prompt}\n${meaning}\n${pronunciation}\n${synonyms}\n${polysemy}\n${mnemonic}\n${example}\n${exampleMeaning}\n${(c.tags || []).join(',')}`.toLowerCase()
            : `${c.prompt}\n${c.explanation || ''}\n${(c.tags || []).join(',')}`.toLowerCase();
          return hay.includes(q);
        });

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="card">표시할 카드가 없습니다.</div>`;
      return;
    }

    listEl.innerHTML = '';
    filtered
      .slice()
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .forEach((c) => {
        const st = DATA.stats[c.id] || { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
        const bm = isBookmarked(c.id);
        const total = (st.correct || 0) + (st.wrong || 0);
        const acc = total === 0 ? '' : ` · ${isVocab ? '알았음률' : '정답률'} ${Math.round(((st.correct || 0) / total) * 100)}%`;
        const tags = (c.tags || []).slice(0, 6).join(', ');
        const meaning = String(c.meaning || c.explanation || '').trim();
        const meaningPreview = isVocab && meaning
          ? ` · 뜻 ${escapeText(meaning.length > 44 ? meaning.slice(0, 44) + '…' : meaning)}`
          : '';
        const dayInfo = isVocab ? getCardDayTag(c) : null;
        const dayPreview = dayInfo ? ` · ${escapeText(dayInfo.tag)}` : '';

        const sub = isVocab
          ? `기록 ${total}회 · 알았음 ${(st.correct || 0)} · 모름 ${(st.wrong || 0)}${acc}${dayPreview}${tags ? ` · 태그 ${escapeText(tags)}` : ''}${meaningPreview}`
          : `정답 ${escapeText(c.answer)} · 기록 ${total}회${acc}${tags ? ` · 태그 ${escapeText(tags)}` : ''}`;

        const row = document.createElement('div');
        row.className = 'item';
        row.innerHTML = `
          <div>
            <div class="item-title">${escapeText(c.prompt)}</div>
            <div class="item-sub">${sub}</div>
          </div>
          <div class="item-actions">
            <button class="btn small" data-bm title="북마크">${bm ? '★' : '☆'}</button>
            <button class="btn small" data-edit>수정</button>
            <button class="btn danger small" data-del>삭제</button>
          </div>
        `;

        $('[data-bm]', row).addEventListener('click', () => {
          const next = toggleBookmark(c.id);
          toast(next ? '북마크됨' : '북마크 해제');
          renderList();
        });
        $('[data-edit]', row).addEventListener('click', () => openCardModal({ deckId, card: c }));
        $('[data-del]', row).addEventListener('click', () => {
          const ok = confirm('이 카드를 삭제할까요?');
          if (!ok) return;
          DATA.cards = DATA.cards.filter((x) => x.id !== c.id);
          delete DATA.stats[c.id];
          if (STUDY && STUDY.deckId === deckId) saveStudyState();
          commit();
          toast('삭제됨');
          const idx = cards.findIndex((x) => x.id === c.id);
          if (idx >= 0) cards.splice(idx, 1);
          renderList();
        });

        listEl.appendChild(row);
      });
  }

  searchEl.addEventListener('input', renderList);
  renderList();
}

function openCardModal({ deckId, card = null } = {}) {
  const deck = getDeck(deckId);
  if (!deck) return;
  const isVocab = String(deck.type || '').toLowerCase() === 'vocab';
  const isEdit = !!card;

  const c = isEdit
    ? card
    : { prompt: '', meaning: '', pronunciation: '', synonyms: [], polysemy: [], mnemonic: '', example: '', exampleMeaning: '', tags: [] };

  const meaningVal = isVocab ? String(c.meaning || c.explanation || '') : '';
  const pronunciationVal = isVocab ? String(c.pronunciation || '') : '';
  const synonymsVal = isVocab ? normalizeStringArray(c.synonyms).join(', ') : '';
  const polysemyVal = isVocab ? normalizeStringArray(c.polysemy ?? c.senses ?? '').join('\n') : '';
  const mnemonicVal = isVocab ? String(c.mnemonic || '') : '';
  const exampleVal = isVocab ? String(c.example || '') : '';
  const exampleMeaningVal = isVocab ? String(c.exampleMeaning || '') : '';

  openModal({
    title: isEdit ? `${isVocab ? '단어' : '문제'} 수정` : `${isVocab ? '단어' : '문제'} 추가`,
    bodyHTML: isVocab
      ? `
        <div class="field">
          <label>단어</label>
          <input type="text" id="card-prompt" placeholder="예) avalanche" value="${escapeText(c.prompt || '')}" />
        </div>
        <div class="field">
          <label>뜻</label>
          <textarea id="card-meaning" placeholder="예) n. 눈사태; 쇄도">${escapeText(meaningVal)}</textarea>
        </div>
        <div class="field">
          <label>발음기호</label>
          <input type="text" id="card-pronunciation" placeholder="예) ˈævəlæntʃ" value="${escapeText(pronunciationVal)}" />
        </div>
        <div class="field">
          <label>동의어 (쉼표 구분)</label>
          <input type="text" id="card-synonyms" placeholder="예) snowslide, landslide" value="${escapeText(synonymsVal)}" />
        </div>
        <div class="field">
          <label>다의어 (한 줄에 1개)</label>
          <textarea id="card-polysemy" placeholder="예) n. 눈사태\n(비유) 쇄도">${escapeText(polysemyVal)}</textarea>
        </div>
        <div class="field">
          <label>연상</label>
          <textarea id="card-mnemonic" placeholder="예) 아~ 발 안 차! 눈사태처럼 몰려온다">${escapeText(mnemonicVal)}</textarea>
        </div>
        <div class="field">
          <label>예문</label>
          <textarea id="card-example" placeholder="예) An avalanche of complaints followed.">${escapeText(exampleVal)}</textarea>
        </div>
        <div class="field">
          <label>예문 해석</label>
          <textarea id="card-example-meaning" placeholder="예) 항의가 눈사태처럼 쏟아졌다.">${escapeText(exampleMeaningVal)}</textarea>
        </div>
        <div class="field">
          <label>태그 (쉼표 구분)</label>
          <input type="text" id="card-tags" placeholder="예) 경선식, DAY01" value="${escapeText((c.tags || []).join(', '))}" />
        </div>
        <div class="modal-actions">
          <button class="btn" id="card-cancel">취소</button>
          <button class="btn primary" id="card-save">저장</button>
        </div>
      `
      : `
        <div class="field">
          <label>문장</label>
          <textarea id="card-prompt" placeholder="예) The man whom I met yesterday is my teacher.">${escapeText(c.prompt || '')}</textarea>
        </div>
        <div class="field">
          <label>정답</label>
          <select id="card-answer">
            <option value="O" ${normalizeAnswer(c.answer) === 'O' ? 'selected' : ''}>O</option>
            <option value="X" ${normalizeAnswer(c.answer) === 'X' ? 'selected' : ''}>X</option>
          </select>
        </div>
        <div class="field">
          <label>해설</label>
          <textarea id="card-expl" placeholder="예) I met him → 목적어이므로 whom 가능">${escapeText(c.explanation || '')}</textarea>
        </div>
        <div class="field">
          <label>태그 (쉼표 구분)</label>
          <input type="text" id="card-tags" placeholder="예) 관계사, who/whom" value="${escapeText((c.tags || []).join(', '))}" />
        </div>
        <div class="modal-actions">
          <button class="btn" id="card-cancel">취소</button>
          <button class="btn primary" id="card-save">저장</button>
        </div>
      `,
    onMount: (root) => {
      $('#card-cancel', root).addEventListener('click', closeModal);
      $('#card-save', root).addEventListener('click', () => {
        const prompt = $('#card-prompt', root).value.trim();
        if (!prompt) {
          alert(isVocab ? '단어를 입력해 주세요.' : '문장을 입력해 주세요.');
          return;
        }

        const tags = $('#card-tags', root)
          .value
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        if (isVocab) {
          const meaning = $('#card-meaning', root).value.trim();
          const pronunciation = $('#card-pronunciation', root).value.trim();
          const synonyms = normalizeStringArray($('#card-synonyms', root).value);
          const polysemy = normalizeStringArray($('#card-polysemy', root).value);
          const mnemonic = $('#card-mnemonic', root).value.trim();
          const example = $('#card-example', root).value.trim();
          const exampleMeaning = $('#card-example-meaning', root).value.trim();

          if (isEdit) {
            const target = DATA.cards.find((x) => x.id === c.id);
            if (!target) return;
            target.prompt = prompt;
            target.answer = 'O';
            target.meaning = meaning;
            target.pronunciation = pronunciation;
            target.synonyms = synonyms;
            target.polysemy = polysemy;
            target.mnemonic = mnemonic;
            target.example = example;
            target.exampleMeaning = exampleMeaning;
            target.explanation = meaning;
            target.tags = tags;
            target.updatedAt = now();
          } else {
            const id = uuid();
            DATA.cards.push({
              id,
              deckId,
              prompt,
              answer: 'O',
              meaning,
              pronunciation,
              synonyms,
              polysemy,
              mnemonic,
              example,
              exampleMeaning,
              explanation: meaning,
              tags,
              createdAt: now(),
              updatedAt: now(),
            });
            DATA.stats[id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
          }

          appendMissingDayTags(deckId, DEFAULT_DAILY_NEW_COUNT);
        } else {
          const answer = normalizeAnswer($('#card-answer', root).value) || 'O';
          const explanation = $('#card-expl', root).value.trim();

          if (isEdit) {
            const target = DATA.cards.find((x) => x.id === c.id);
            if (!target) return;
            target.prompt = prompt;
            target.answer = answer;
            target.explanation = explanation;
            target.tags = tags;
            target.updatedAt = now();
          } else {
            const id = uuid();
            DATA.cards.push({ id, deckId, prompt, answer, explanation, tags, createdAt: now(), updatedAt: now() });
            DATA.stats[id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
          }
        }

        commit();
        closeModal();
        toast('저장됨');
        renderRoute();
      });
    },
  });
}

function openBulkAddModal(deckId) {
  const deck = getDeck(deckId);
  if (!deck) return;
  const isVocab = String(deck.type || '').toLowerCase() === 'vocab';

  openModal({
    title: isVocab ? '여러 단어 붙여넣기' : '여러 개 붙여넣기',
    bodyHTML: `
      <div class="card" style="margin-bottom: 12px;">
        <div style="font-size: 13px; color: var(--muted); line-height: 1.5;">
          한 줄에 1개씩 붙여넣으세요.<br>
          ${isVocab
            ? `형식: <span class="kbd">단어</span> <span class="kbd">|</span> <span class="kbd">뜻</span> <span class="kbd">|</span> <span class="kbd">발음(선택)</span> <span class="kbd">|</span> <span class="kbd">동의어(선택)</span> <span class="kbd">|</span> <span class="kbd">다의어(선택)</span> <span class="kbd">|</span> <span class="kbd">연상(선택)</span> <span class="kbd">|</span> <span class="kbd">예문(선택)</span> <span class="kbd">|</span> <span class="kbd">예문 해석(선택)</span><br>`
            : `형식: <span class="kbd">문장</span> <span class="kbd">|</span> <span class="kbd">O/X</span> <span class="kbd">|</span> <span class="kbd">설명(선택)</span><br>`}
          탭(<span class="kbd">\t</span>) 구분도 지원합니다.
        </div>
      </div>
      <div class="field">
        <label>붙여넣기</label>
        <textarea id="bulk" placeholder="${isVocab
          ? `avalanche | n. 눈사태; 산사태; 쇄도 | 아~ 발 안 차! 눈사태처럼 몰려온다 | An avalanche of emails arrived. | 이메일이 눈사태처럼 쏟아졌다.`
          : `think it better to tell the truth | O | think + it + adj + toV`} "></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn" id="bulk-cancel">취소</button>
        <button class="btn primary" id="bulk-add">추가</button>
      </div>
    `,
    onMount: (root) => {
      $('#bulk-cancel', root).addEventListener('click', closeModal);
      $('#bulk-add', root).addEventListener('click', () => {
        const text = $('#bulk', root).value;
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) {
          alert('붙여넣을 내용이 없습니다.');
          return;
        }

        const added = [];
        const errors = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const cols = line.includes('\t') ? line.split('\t').map((x) => x.trim()) : line.split('|').map((x) => x.trim());
          if (isVocab) {
            const word = cols[0] || '';
            const legacyCompact = cols.length <= 5;
            const meaning = cols[1] || '';
            const pronunciation = legacyCompact ? '' : (cols[2] || '');
            const synonyms = legacyCompact ? [] : normalizeStringArray(cols[3] || '');
            const polysemy = legacyCompact ? [] : normalizeStringArray(cols[4] || '');
            const mnemonic = legacyCompact ? (cols[2] || '') : (cols[5] || '');
            const example = legacyCompact ? (cols[3] || '') : (cols[6] || '');
            const exampleMeaning = legacyCompact ? (cols[4] || '') : (cols[7] || '');
            if (!word) {
              errors.push(`${i + 1}행: 단어가 비어있음`);
              continue;
            }
            added.push({ prompt: word, meaning, pronunciation, synonyms, polysemy, mnemonic, example, exampleMeaning });
          } else {
            if (cols.length < 2) {
              errors.push(`${i + 1}행: 구분자를 확인하세요`);
              continue;
            }
            const prompt = cols[0];
            const ans = normalizeAnswer(cols[1]);
            const explanation = cols.slice(2).join(' | ').trim();
            if (!prompt) {
              errors.push(`${i + 1}행: 문장이 비어있음`);
              continue;
            }
            if (!ans) {
              errors.push(`${i + 1}행: O/X 판별 불가`);
              continue;
            }
            added.push({ prompt, answer: ans, explanation });
          }
        }

        if (added.length === 0) {
          alert('추가할 수 있는 줄이 없습니다.\n' + errors.slice(0, 5).join('\n'));
          return;
        }

        const ok = confirm(`총 ${added.length}개를 추가할까요?` + (errors.length ? `\n(오류 ${errors.length}개는 건너뜀)` : ''));
        if (!ok) return;

        added.forEach((x) => {
          const id = uuid();
          if (isVocab) {
            DATA.cards.push({
              id,
              deckId,
              prompt: x.prompt,
              answer: 'O',
              meaning: x.meaning || '',
              pronunciation: x.pronunciation || '',
              synonyms: normalizeStringArray(x.synonyms || ''),
              polysemy: normalizeStringArray(x.polysemy || ''),
              mnemonic: x.mnemonic || '',
              example: x.example || '',
              exampleMeaning: x.exampleMeaning || '',
              explanation: x.meaning || '',
              tags: [],
              createdAt: now(),
              updatedAt: now(),
            });
          } else {
            DATA.cards.push({
              id,
              deckId,
              prompt: x.prompt,
              answer: x.answer,
              explanation: x.explanation,
              tags: [],
              createdAt: now(),
              updatedAt: now(),
            });
          }
          DATA.stats[id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
        });

        if (isVocab) appendMissingDayTags(deckId, DEFAULT_DAILY_NEW_COUNT);
        commit();
        closeModal();
        toast(`추가됨: ${added.length}개`);
        renderRoute();
      });
    },
  });
}

function importObject(obj, opts = {}) {
  const { targetDeckId, vocabDedupe = true } = opts;

  if (obj && typeof obj === 'object' && !Array.isArray(obj) && Array.isArray(obj.decks) && Array.isArray(obj.cards)) {
    const ok = confirm('전체 데이터를 덮어쓸까요? (현재 데이터는 사라짐)');
    if (!ok) return;
    DATA = normalizeData(obj);
    DATA.decks.forEach((deck) => {
      if (String(deck.type || '').toLowerCase() === 'vocab') appendMissingDayTags(deck.id, Number(deck.dailyCount) || DEFAULT_DAILY_NEW_COUNT);
    });
    STUDY = null;
    clearStudyState();
    commit();
    toast('가져오기 완료');
    location.hash = '#/';
    renderRoute();
    return;
  }

  if (!Array.isArray(obj)) {
    alert('지원하지 않는 JSON 형식입니다.\n전체 백업 또는 카드 배열(JSON)을 넣어주세요.');
    return;
  }

  if (!targetDeckId) {
    alert('대상 카테고리를 선택해 주세요.');
    return;
  }
  const deck = getDeck(targetDeckId);
  if (!deck) {
    alert('대상 카테고리를 찾을 수 없습니다.');
    return;
  }

  const isVocab = String(deck.type || '').toLowerCase() === 'vocab';
  const parsed = [];
  const errors = [];

  for (let i = 0; i < obj.length; i++) {
    const row = obj[i];
    if (!row || typeof row !== 'object') {
      errors.push(`${i + 1}번째: 객체가 아님`);
      continue;
    }

    const prompt = String(row.prompt ?? row.word ?? '').trim();
    if (!prompt) {
      errors.push(`${i + 1}번째: prompt(word) 비어있음`);
      continue;
    }

    if (isVocab) {
      const meaning = String(row.meaning ?? row.explanation ?? '').trim();
      const pronunciation = String(row.pronunciation ?? row.ipa ?? row.phonetic ?? row.pron ?? '').trim();
      const synonyms = normalizeStringArray(row.synonyms ?? row.synonym ?? row.syns ?? row.동의어 ?? '');
      const polysemy = normalizeStringArray(row.polysemy ?? row.senses ?? row.다의어 ?? '');
      const mnemonic = String(row.mnemonic ?? row.assoc ?? row.association ?? '').trim();
      const example = String(row.example ?? row.sentence ?? '').trim();
      const exampleMeaning = String(row.exampleMeaning ?? row.example_ko ?? row.exampleKo ?? row.example_meaning ?? '').trim();
      const tags = Array.isArray(row.tags) ? row.tags.map((t) => String(t).trim()).filter(Boolean) : normalizeStringArray(row.tags ?? '');
      parsed.push({ prompt, answer: 'O', meaning, pronunciation, synonyms, polysemy, mnemonic, example, exampleMeaning, explanation: meaning, tags });
    } else {
      const ans = normalizeAnswer(row.answer ?? row.meaning ?? row.ox ?? row.OX ?? row.correct ?? row.tf ?? row.trueFalse);
      const explanation = String(row.explanation ?? row.example ?? row.mnemonic ?? '').trim();
      const tags = Array.isArray(row.tags) ? row.tags.map((t) => String(t).trim()).filter(Boolean) : [];
      if (!ans) {
        errors.push(`${i + 1}번째: answer O/X 판별 불가`);
        continue;
      }
      parsed.push({ prompt, answer: ans, explanation, tags });
    }
  }

  if (parsed.length === 0) {
    alert('추가할 카드가 없습니다.\n' + errors.slice(0, 5).join('\n'));
    return;
  }

  if (isVocab && vocabDedupe) {
    const { index: existingIndex, mergedExisting } = mergeVocabDuplicatesInDeck(targetDeckId);
    const inputMap = new Map();
    let inputDup = 0;
    parsed.forEach((it) => {
      const k = normalizePromptKey(it.prompt);
      if (!k) return;
      if (inputMap.has(k)) inputDup++;
      inputMap.set(k, it);
    });
    const uniqueParsed = Array.from(inputMap.values());

    let willAdd = 0;
    let willOverwrite = 0;
    uniqueParsed.forEach((it) => {
      const k = normalizePromptKey(it.prompt);
      if (!k) return;
      if (existingIndex.has(k)) willOverwrite++;
      else willAdd++;
    });

    const ok = confirm(
      `단어 ${uniqueParsed.length}개를 '${deck.name}'에 반영할까요?\n` +
      `- 새로 추가: ${willAdd}개\n` +
      `- 덮어쓰기(중복 제거): ${willOverwrite}개` +
      (inputDup ? `\n- 입력 중복 제거: ${inputDup}개` : '') +
      (mergedExisting ? `\n- 기존 중복 정리: ${mergedExisting}개` : '') +
      (errors.length ? `\n(오류 ${errors.length}개는 건너뜀)` : '')
    );
    if (!ok) return;

    let added = 0;
    let overwritten = 0;
    uniqueParsed.forEach((it) => {
      const k = normalizePromptKey(it.prompt);
      if (!k) return;
      const existingId = existingIndex.get(k);
      const meaning = String(it.meaning ?? it.explanation ?? '').trim();
      const pronunciation = String(it.pronunciation ?? it.ipa ?? it.phonetic ?? it.pron ?? '').trim();
      const synonyms = normalizeStringArray(it.synonyms ?? it.synonym ?? it.syns ?? it.동의어 ?? '');
      const polysemy = normalizeStringArray(it.polysemy ?? it.senses ?? it.다의어 ?? '');
      const mnemonic = String(it.mnemonic ?? '').trim();
      const example = String(it.example ?? '').trim();
      const exampleMeaning = String(it.exampleMeaning ?? it.example_ko ?? it.exampleKo ?? it.example_meaning ?? '').trim();
      const tags = Array.isArray(it.tags) ? it.tags.map((t) => String(t).trim()).filter(Boolean) : normalizeStringArray(it.tags ?? '');

      if (existingId) {
        const card = DATA.cards.find((c) => c.id === existingId);
        if (card) {
          card.prompt = it.prompt;
          card.answer = 'O';
          if (meaning) {
            card.meaning = meaning;
            card.explanation = meaning;
          } else {
            if (!card.meaning && card.explanation) card.meaning = String(card.explanation || '').trim();
            if (card.meaning && !card.explanation) card.explanation = String(card.meaning || '').trim();
          }
          if (pronunciation) card.pronunciation = pronunciation;
          if (synonyms.length) card.synonyms = Array.from(new Set([...(normalizeStringArray(card.synonyms)), ...synonyms]));
          if (polysemy.length) card.polysemy = Array.from(new Set([...(normalizeStringArray(card.polysemy)), ...polysemy]));
          if (mnemonic) card.mnemonic = mnemonic;
          if (example) card.example = example;
          if (exampleMeaning) card.exampleMeaning = exampleMeaning;
          if (tags.length) {
            card.tags = Array.from(new Set([...(card.tags || []), ...tags].map((t) => String(t).trim()).filter(Boolean)));
          }
          card.updatedAt = now();
          if (!DATA.stats[existingId]) DATA.stats[existingId] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
          card.bookmarked = !!DATA.stats[existingId].bookmark;
          overwritten++;
          return;
        }
      }

      const id = uuid();
      DATA.cards.push({
        id,
        deckId: targetDeckId,
        prompt: it.prompt,
        answer: 'O',
        explanation: meaning || '',
        tags: tags || [],
        meaning: meaning || '',
        pronunciation: pronunciation || '',
        synonyms: synonyms || [],
        polysemy: polysemy || [],
        mnemonic: mnemonic || '',
        example: example || '',
        exampleMeaning: exampleMeaning || '',
        createdAt: now(),
        updatedAt: now(),
        bookmarked: false,
      });
      DATA.stats[id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
      existingIndex.set(k, id);
      added++;
    });

    appendMissingDayTags(targetDeckId, DEFAULT_DAILY_NEW_COUNT);
    commit();
    toast(`완료: 추가 ${added}개 / 덮어쓰기 ${overwritten}개` + (inputDup ? ` / 입력중복 ${inputDup}개` : '') + (mergedExisting ? ` / 기존중복정리 ${mergedExisting}개` : ''));
    location.hash = `#/deck/${targetDeckId}`;
    renderRoute();
    return;
  }

  const ok = confirm(`카드 ${parsed.length}개를 '${deck.name}'에 추가할까요?` + (errors.length ? `\n(오류 ${errors.length}개는 건너뜀)` : ''));
  if (!ok) return;

  parsed.forEach((x) => {
    const id = uuid();
    DATA.cards.push({
      id,
      deckId: targetDeckId,
      prompt: x.prompt,
      answer: x.answer,
      explanation: x.explanation,
      tags: x.tags || [],
      meaning: x.meaning || '',
      mnemonic: x.mnemonic || '',
      example: x.example || '',
      exampleMeaning: x.exampleMeaning || '',
      createdAt: now(),
      updatedAt: now(),
      bookmarked: false,
    });
    DATA.stats[id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
  });

  if (isVocab) appendMissingDayTags(targetDeckId, DEFAULT_DAILY_NEW_COUNT);
  commit();
  toast(`추가됨: ${parsed.length}개`);
  location.hash = `#/deck/${targetDeckId}`;
  renderRoute();
}

function normalizeInitialHash() {
  const h = location.hash || '';
  // 앱을 다시 열 때 마지막 학습 화면(#/study, #/variant)으로 바로 들어가지 않고
  // 홈에서 '이어서 학습'을 누르게 한다.
  if (h.startsWith('#/study/') || h.startsWith('#/variant')) {
    history.replaceState(null, '', location.pathname + location.search + '#/');
    return;
  }
}


// Initial render
STUDY = loadStudyState();
normalizeInitialHash();
safeRenderRoute();
