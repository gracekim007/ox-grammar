/*
  OX 문법 - offline PWA
  Data is stored in localStorage.
*/

const STORAGE_KEY = 'oxGrammarData.v2';
const APP_DATA_VERSION = 2;

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

function escapeText(s) {
  // For safety when interpolating into HTML.
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
  DATA = loadData();
  toast('초기화 완료');
  location.hash = '#/';
  renderRoute();
});

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

window.addEventListener('hashchange', renderRoute);

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

function renderHome() {
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


function openDeckModal(existingDeck = null) {
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

          const hay = isVocab
            ? `${c.prompt}\n${meaning}\n${mnemonic}\n${example}\n${(c.tags || []).join(',')}`.toLowerCase()
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


function openCardModal({ deckId, card }) {
  const deck = getDeck(deckId);
  if (!deck) {
    alert('대상 카테고리를 찾을 수 없습니다.');
    return;
  }

  const isVocab = String(deck.type || '').toLowerCase() === 'vocab';
  const isEdit = !!card;

  const c = card || (isVocab
    ? { prompt: '', meaning: '', mnemonic: '', example: '', tags: [] }
    : { prompt: '', answer: 'O', explanation: '', tags: [] }
  );

  const meaningVal = isVocab ? String(c.meaning || c.explanation || '') : '';
  const mnemonicVal = isVocab ? String(c.mnemonic || '') : '';
  const exampleVal = isVocab ? String(c.example || '') : '';

  openModal({
    title: isEdit ? (isVocab ? '단어 수정' : '문제 수정') : (isVocab ? '새 단어' : '새 문제'),
    bodyHTML: isVocab ? `
      <div class="field">
        <label>단어</label>
        <input type="text" id="card-prompt" placeholder="예) avalanche" value="${escapeText(c.prompt)}" />
      </div>
      <div class="field">
        <label>뜻 (품사 포함)</label>
        <textarea id="card-meaning" placeholder="예) n. 눈사태; 산사태; 쇄도">${escapeText(meaningVal)}</textarea>
      </div>
      <div class="field">
        <label>연상문장/경선식 (선택)</label>
        <textarea id="card-mnemonic" placeholder="예) 아~ 발 안 차! 눈사태(쇄도)처럼 몰려온다">${escapeText(mnemonicVal)}</textarea>
      </div>
      <div class="field">
        <label>예문 (선택)</label>
        <textarea id="card-example" placeholder="예) An avalanche of complaints followed.">${escapeText(exampleVal)}</textarea>
      </div>
      <div class="field">
        <label>태그 (쉼표로 구분, 선택)</label>
        <input type="text" id="card-tags" placeholder="예) vocab, 경선식" value="${escapeText((c.tags || []).join(', '))}" />
      </div>
      <div class="modal-actions">
        <button class="btn" id="card-cancel">취소</button>
        <button class="btn primary" id="card-save">저장</button>
      </div>
    ` : `
      <div class="field">
        <label>문장 (영문)</label>
        <textarea id="card-prompt" placeholder="예) think it better to tell the truth">${escapeText(c.prompt)}</textarea>
      </div>
      <div class="field">
        <label>정답</label>
        <select id="card-answer">
          <option value="O" ${c.answer === 'O' ? 'selected' : ''}>O (옳음)</option>
          <option value="X" ${c.answer === 'X' ? 'selected' : ''}>X (틀림)</option>
        </select>
      </div>
      <div class="field">
        <label>설명 (문법 포인트 / 암기팁)</label>
        <textarea id="card-expl" placeholder="예) think + it + 형용사 + to V">${escapeText(c.explanation || '')}</textarea>
      </div>
      <div class="field">
        <label>태그 (쉼표로 구분, 선택)</label>
        <input type="text" id="card-tags" placeholder="예) 5형식, 가목적어" value="${escapeText((c.tags || []).join(', '))}" />
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
          const mnemonic = $('#card-mnemonic', root).value.trim();
          const example = $('#card-example', root).value.trim();

          if (!meaning) {
            // 뜻은 사실상 필수(그래도 저장은 가능하도록 완화)
            // alert('뜻을 입력해 주세요.');
            // return;
          }

          if (isEdit) {
            const target = DATA.cards.find((x) => x.id === c.id);
            if (!target) return;
            target.prompt = prompt;
            target.answer = 'O';            // ✅ vocab deck: fixed
            target.meaning = meaning;
            target.mnemonic = mnemonic;
            target.example = example;
            target.explanation = meaning;    // ✅ 검색/호환용
            target.tags = tags;
            target.updatedAt = now();
          } else {
            const id = uuid();
            DATA.cards.push({
              id,
              deckId,
              prompt,
              answer: 'O',                  // ✅ fixed
              meaning,
              mnemonic,
              example,
              explanation: meaning,          // ✅ 검색/호환용
              tags,
              createdAt: now(),
              updatedAt: now(),
            });
            DATA.stats[id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
          }
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
            DATA.cards.push({
              id,
              deckId,
              prompt,
              answer,
              explanation,
              tags,
              createdAt: now(),
              updatedAt: now(),
            });
            DATA.stats[id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
          }
        }

        commit();
        closeModal();
        toast('저장됨');
        renderRoute();
      });

      setTimeout(() => $('#card-prompt', root).focus(), 0);
    },
  });
}


function openBulkAddModal(deckId) {
  const deck = getDeck(deckId);
  if (!deck) {
    alert('대상 카테고리를 찾을 수 없습니다.');
    return;
  }
  const isVocab = String(deck.type || '').toLowerCase() === 'vocab';

  openModal({
    title: isVocab ? '여러 단어 붙여넣기' : '여러 개 붙여넣기',
    bodyHTML: `
      <div class="card" style="margin-bottom: 12px;">
        <div style="font-size: 13px; color: var(--muted); line-height: 1.5;">
          한 줄에 1개씩 붙여넣으세요.<br>
          ${isVocab
            ? `형식: <span class="kbd">단어</span> <span class="kbd">|</span> <span class="kbd">뜻</span> <span class="kbd">|</span> <span class="kbd">연상(선택)</span> <span class="kbd">|</span> <span class="kbd">예문(선택)</span><br>`
            : `형식: <span class="kbd">문장</span> <span class="kbd">|</span> <span class="kbd">O/X</span> <span class="kbd">|</span> <span class="kbd">설명(선택)</span><br>`}
          탭(<span class="kbd">\t</span>) 구분도 지원합니다.
        </div>
      </div>
      <div class="field">
        <label>붙여넣기</label>
        <textarea id="bulk" placeholder="${isVocab
          ? `avalanche | n. 눈사태; 산사태; 쇄도 | 아~ 발 안 차! 눈사태처럼 몰려온다 | An avalanche of emails arrived.\naccentuate | v. (악센트를) 강조하다 | 악센트 세게! 강조하다 | She accentuated the first syllable.`
          : `think it better to tell the truth | O | think + it + adj + toV\nthink better to tell the truth | X | 가목적어 it 필요`}"></textarea>
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
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        if (lines.length === 0) {
          alert('붙여넣을 내용이 없습니다.');
          return;
        }

        const added = [];
        const errors = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const cols = line.includes('\t')
            ? line.split('\t').map((x) => x.trim())
            : line.split('|').map((x) => x.trim());

          if (isVocab) {
            if (cols.length < 1) {
              errors.push(`${i + 1}행: 구분자를 확인하세요`);
              continue;
            }
            const word = cols[0] || '';
            const meaning = cols[1] || '';
            const mnemonic = cols[2] || '';
            const example = cols[3] || '';

            if (!word) {
              errors.push(`${i + 1}행: 단어가 비어있음`);
              continue;
            }

            added.push({ prompt: word, meaning, mnemonic, example });
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
              mnemonic: x.mnemonic || '',
              example: x.example || '',
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

        commit();
        closeModal();
        toast(`추가됨: ${added.length}개`);
        renderRoute();
      });
    },
  });
}


// -------------------------
// Study mode
// -------------------------

let STUDY = null;

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

      renderStudy(deckId);
    });

    $('#btn-restart').addEventListener('click', () => {
      newStudySession(deckId, STUDY.mode, null, STUDY.tagFilter);
      renderStudy(deckId);
    });

    $('#btn-manage').addEventListener('click', () => {
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
    renderStudy(deckId);
    return;
  }

  const pos = STUDY.index + 1;
  const total = STUDY.queue.length;

  const answered = !!STUDY.answered;
  const bookmarked = isBookmarked(card.id);

  // vocab fields
  const meaning = String(card.meaning || card.explanation || '').trim();
  const mnemonic = String(card.mnemonic || '').trim();
  const example = String(card.example || '').trim();

  const expl = card.explanation?.trim() ? card.explanation.trim() : '(설명 없음)';

  const showMeaning = meaning ? escapeText(meaning) : '(뜻 없음)';
  const showMnemonic = mnemonic ? escapeText(mnemonic) : null;
  const showExample = example ? escapeText(example) : null;

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

      <div class="study-prompt">${escapeText(card.prompt)}</div>

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

            <div class="study-expl" style="line-height: 1.6;">
              <div><b>뜻</b>: ${showMeaning}</div>
              ${showMnemonic ? `<div style="margin-top: 6px;"><b>연상</b>: ${showMnemonic}</div>` : ''}
              ${showExample ? `<div style="margin-top: 6px;"><b>예문</b>: ${showExample}</div>` : ''}
            </div>
          ` : `
            <div class="study-answer" style="margin-bottom: 8px;">
              <div class="answer-badge">${escapeText(card.answer)}</div>
              <div>내 선택: <b>${escapeText(STUDY.choice)}</b> · 정답: <b>${escapeText(card.answer)}</b></div>
            </div>
            <div class="study-expl">${escapeText(expl)}</div>
          `}
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

  function grade(choice) {
    if (STUDY.answered) return;

    const normalized = normalizeAnswer(choice);
    if (!normalized) return;

    STUDY.choice = normalized; // 'O' | 'X'
    STUDY.answered = true;

    const isCorrect = isVocab ? (normalized === 'O') : (normalized === card.answer);
    STUDY.lastIsCorrect = isCorrect;

    const st = DATA.stats[card.id] || (DATA.stats[card.id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false });

    if (isCorrect) {
      st.correct = (st.correct || 0) + 1;
      STUDY.correctCount += 1;
    } else {
      st.wrong = (st.wrong || 0) + 1;
      STUDY.wrongCount += 1;
      STUDY.wrongIds.push(card.id);
    }

    st.lastReviewed = now();
    commit();

    renderStudy(deckId);
  }

  function goNext() {
    STUDY.index += 1;
    resetPerCardState();

    if (STUDY.index >= STUDY.queue.length) {
      STUDY.phase = 'summary';
    }

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
      renderStudy(deckId);
    });
  }

  const chooseO = $('#btn-choose-o');
  if (chooseO) chooseO.addEventListener('click', () => grade('O'));

  const chooseX = $('#btn-choose-x');
  if (chooseX) chooseX.addEventListener('click', () => grade('X'));

  const nextBtn = $('#btn-next');
  if (nextBtn) nextBtn.addEventListener('click', goNext);
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
        <textarea id="paste" placeholder='예) 문법: [{"prompt":"...","answer":"O","explanation":"..."}, ...] / 단어: [{"prompt":"avalanche","meaning":"n. ...","mnemonic":"...","example":"..."}, ...]'></textarea>
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
        · 단어장: <span class="kbd">{ prompt, meaning, mnemonic?, example?, tags? }</span>
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
  const hasHeader = header.some((h) => /키워드|용어|term|word|뜻|의미|meaning|해설|설명|explanation|answer|정답/i.test(h));

  const dataRows = hasHeader ? rows.slice(1) : rows;

  const colIndex = (patterns, fallback) => {
    if (!hasHeader) return fallback;
    const idx = header.findIndex((h) => patterns.some((p) => p.test(h)));
    return idx >= 0 ? idx : fallback;
  };

  if (isVocab) {
    const idxPrompt = colIndex([/키워드/i, /용어/i, /^term$/i, /^word$/i], 0);
    const idxMeaning = colIndex([/뜻/i, /의미/i, /^meaning$/i, /정의/i, /설명/i], 1);
    const idxMnemonic = colIndex([/연상/i, /암기/i, /^mnemonic$/i, /assoc/i], 2);
    const idxExample = colIndex([/예문/i, /^example$/i, /sentence/i], 3);
    const idxTags = colIndex([/^tags?$/i, /태그/i], 4);

    const out = [];
    for (const r of dataRows) {
      const prompt = String(r[idxPrompt] ?? '').trim();
      const meaning = String(r[idxMeaning] ?? '').trim();
      if (!prompt) continue;
      const mnemonic = String(r[idxMnemonic] ?? '').trim();
      const example = String(r[idxExample] ?? '').trim();
      const tagsCell = String(r[idxTags] ?? '').trim();
      const tags = tagsCell
        ? tagsCell
            .split(/[,，;；\n]+/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      out.push({ prompt, meaning, mnemonic, example, tags });
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

function importObject(obj, opts = {}) {
  const { targetDeckId, vocabDedupe = true } = opts;

  // Case A: full backup object
  if (obj && typeof obj === 'object' && !Array.isArray(obj) && Array.isArray(obj.decks) && Array.isArray(obj.cards)) {
    const ok = confirm('전체 데이터를 덮어쓸까요? (현재 데이터는 사라짐)');
    if (!ok) return;
    DATA = normalizeData(obj);
    commit();
    toast('가져오기 완료');
    location.hash = '#/';
    renderRoute();
    return;
  }

  // Case B: array of cards
  if (Array.isArray(obj)) {
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
        const mnemonic = String(row.mnemonic ?? row.assoc ?? row.association ?? '').trim();
        const example = String(row.example ?? row.sentence ?? '').trim();
        const tags = Array.isArray(row.tags) ? row.tags.map((t) => String(t).trim()).filter(Boolean) : [];

        parsed.push({ prompt, answer: 'O', meaning, mnemonic, example, explanation: meaning, tags });
      } else {
        const ans = normalizeAnswer(row.answer);
        const explanation = String(row.explanation ?? '').trim();
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

    // --------
    // NEW: vocab import de-dup / overwrite by prompt (단어장 중복 제거)
    // --------
    if (isVocab && vocabDedupe) {
      // 1) Merge existing duplicates inside the deck (by normalized prompt)
      const { index: existingIndex, mergedExisting } = mergeVocabDuplicatesInDeck(targetDeckId);

      // 2) De-dup duplicates inside input JSON (last one wins)
      const inputMap = new Map();
      let inputDup = 0;
      parsed.forEach((it) => {
        const k = normalizePromptKey(it.prompt);
        if (!k) return;
        if (inputMap.has(k)) inputDup++;
        inputMap.set(k, it);
      });
      const uniqueParsed = Array.from(inputMap.values());

      // 3) Preview counts
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
        const mnemonic = String(it.mnemonic ?? '').trim();
        const example = String(it.example ?? '').trim();
        const tags = Array.isArray(it.tags) ? it.tags.map((t) => String(t).trim()).filter(Boolean) : [];

        if (existingId) {
          const card = DATA.cards.find((c) => c.id === existingId);
          if (card) {
            // Update (빈 값은 기존 값 유지)
            card.prompt = it.prompt;
            card.answer = 'O';

            if (meaning) {
              card.meaning = meaning;
              card.explanation = meaning;
            } else {
              if (!card.meaning && card.explanation) card.meaning = String(card.explanation || '').trim();
              if (card.meaning && !card.explanation) card.explanation = String(card.meaning || '').trim();
            }

            if (mnemonic) card.mnemonic = mnemonic;
            if (example) card.example = example;

            // Tags: merge (keep existing tags)
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

        // Create new
        const id = uuid();
        DATA.cards.push({
          id,
          deckId: targetDeckId,
          prompt: it.prompt,
          answer: 'O',
          explanation: meaning || '',
          tags: tags || [],
          meaning: meaning || '',
          mnemonic: mnemonic || '',
          example: example || '',
          createdAt: now(),
          updatedAt: now(),
          bookmarked: false,
        });
        DATA.stats[id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
        existingIndex.set(k, id);
        added++;
      });

      commit();
      toast(
        `완료: 추가 ${added}개 / 덮어쓰기 ${overwritten}개` +
          (inputDup ? ` / 입력중복 ${inputDup}개` : '') +
          (mergedExisting ? ` / 기존중복정리 ${mergedExisting}개` : '')
      );
      location.hash = `#/deck/${targetDeckId}`;
      renderRoute();
      return;
    }

    // Default behavior (문법/또는 덮어쓰기 OFF): 그냥 추가
    const ok = confirm(
      `카드 ${parsed.length}개를 '${deck.name}'에 추가할까요?` + (errors.length ? `\n(오류 ${errors.length}개는 건너뜀)` : '')
    );
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
        createdAt: now(),
        updatedAt: now(),
        bookmarked: false,
      });
      DATA.stats[id] = { correct: 0, wrong: 0, lastReviewed: null, bookmark: false };
    });

    commit();
    toast(`추가됨: ${parsed.length}개`);
    location.hash = `#/deck/${targetDeckId}`;
    renderRoute();
    return;
  }

  alert('지원하지 않는 JSON 형식입니다.\n전체 백업 또는 카드 배열(JSON)을 넣어주세요.');
}

function mergeVocabDuplicatesInDeck(deckId) {
  // Merge duplicates inside a vocab deck by normalized prompt.
  // - Keep the most recently updated card
  // - Combine stats (correct/wrong), keep bookmark if any
  // - Fill empty fields (meaning/mnemonic/example) from duplicates
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
    keep.mnemonic = String(keep.mnemonic || '').trim();
    drop.mnemonic = String(drop.mnemonic || '').trim();
    keep.example = String(keep.example || '').trim();
    drop.example = String(drop.example || '').trim();

    if (!keep.meaning && drop.meaning) keep.meaning = drop.meaning;
    if (!keep.mnemonic && drop.mnemonic) keep.mnemonic = drop.mnemonic;
    if (!keep.example && drop.example) keep.example = drop.example;

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

  const { parts, query } = parseRoute();

  // If no hash, set default
  if (!location.hash || location.hash === '#') {
    location.hash = '#/';
    return;
  }

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

// Initial render
renderRoute();
