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
    stats[c.id] = { correct: 0, wrong: 0, lastReviewed: null };
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

  // Ensure order exists
  d.decks.forEach((deck, idx) => {
    if (!deck.id) deck.id = uuid();
    if (!deck.name) deck.name = `카테고리 ${idx + 1}`;
    if (deck.order == null) deck.order = idx + 1;
    if (!deck.createdAt) deck.createdAt = now();
  });

  // Ensure card shape & stats
  d.cards.forEach((c) => {
    if (!c.id) c.id = uuid();
    if (!c.deckId) {
      // If missing deck, attach to first deck (or create one)
      if (!d.decks[0]) {
        d.decks.push({ id: uuid(), name: '기본', description: '', createdAt: now(), order: 1 });
      }
      c.deckId = d.decks[0].id;
    }
    if (!c.prompt) c.prompt = '';
    c.answer = normalizeAnswer(c.answer) || 'O';
    if (!Array.isArray(c.tags)) c.tags = [];
    if (!c.createdAt) c.createdAt = now();
    if (!c.updatedAt) c.updatedAt = now();

    if (!d.stats[c.id]) d.stats[c.id] = { correct: 0, wrong: 0, lastReviewed: null };
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
        · 문장을 보고 <span class="kbd">O</span> 또는 <span class="kbd">X</span> 선택 → 정답/해설 확인 → <span class="kbd">다음</span>.<br>
        · 끝나면 <b>틀린 것만 다시</b> 모아서 반복할 수 있어요.
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
    const s = deckStats(deck.id);
    const meta = [
      `문제 ${s.cardsCount}개`,
      s.acc == null ? '기록 없음' : `정답률 ${s.acc}% (기록 ${s.total}회)`
    ].join(' · ');

    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <div class="deck-title">${escapeText(deck.name)}</div>
      <div class="deck-meta">${escapeText(meta)}</div>
      <div class="deck-actions">
        <button class="btn primary small" data-action="study">학습</button>
        <button class="btn small" data-action="manage">관리</button>
      </div>
    `;
    el.querySelector('[data-action="study"]').addEventListener('click', () => {
      location.hash = `#/study/${deck.id}`;
    });
    el.querySelector('[data-action="manage"]').addEventListener('click', () => {
      location.hash = `#/deck/${deck.id}`;
    });
    grid.appendChild(el);
  });
}

function openDeckModal(existingDeck = null) {
  const isEdit = !!existingDeck;
  const deck = existingDeck || { name: '', description: '' };

  openModal({
    title: isEdit ? '카테고리 수정' : '새 카테고리',
    bodyHTML: `
      <div class="field">
        <label>이름</label>
        <input type="text" id="deck-name" placeholder="예) 리그래머 1-20" value="${escapeText(deck.name)}" />
      </div>
      <div class="field">
        <label>설명 (선택)</label>
        <textarea id="deck-desc" placeholder="예) 5형식/가목적어 회독">${escapeText(deck.description || '')}</textarea>
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
        if (!name) {
          alert('카테고리 이름을 입력해 주세요.');
          return;
        }
        if (isEdit) {
          const d = getDeck(existingDeck.id);
          if (!d) return;
          d.name = name;
          d.description = description;
        } else {
          const nextOrder = (Math.max(0, ...DATA.decks.map((d) => d.order || 0)) + 1) || 1;
          DATA.decks.push({ id: uuid(), name, description, createdAt: now(), order: nextOrder });
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

  const cards = getCards(deckId);
  const s = deckStats(deckId);

  setSubtitle(`${deck.name} · 문제 ${s.cardsCount}개`);

  appEl.innerHTML = `
    <div class="card" style="margin-bottom: 12px;">
      <div style="display:flex; justify-content: space-between; gap: 10px;">
        <div>
          <div style="font-weight: 800; font-size: 16px;">${escapeText(deck.name)}</div>
          <div style="color: var(--muted); font-size: 13px; margin-top: 6px; line-height: 1.4;">${escapeText(deck.description || '')}</div>
          <div style="margin-top: 10px; font-size: 12px; color: var(--muted);">기록: 맞춤 ${s.correct} · 틀림 ${s.wrong}</div>
        </div>
        <div style="display:flex; flex-direction: column; gap: 8px; min-width: 120px;">
          <button class="btn primary small" id="btn-study">학습</button>
          <button class="btn small" id="btn-edit-deck">카테고리 수정</button>
          <button class="btn danger small" id="btn-delete-deck">카테고리 삭제</button>
        </div>
      </div>
    </div>

    <div class="row" style="justify-content: space-between; gap: 10px;">
      <button class="btn primary" id="btn-add-card">+ 문제 추가</button>
      <button class="btn" id="btn-bulk-add">여러 개 붙여넣기</button>
    </div>

    <div class="field" style="margin-top: 12px;">
      <label>검색</label>
      <input type="text" id="search" placeholder="문장/설명/태그 검색" />
    </div>

    <div class="section-title">문제 목록</div>
    <div class="list" id="card-list"></div>
  `;

  $('#btn-study').addEventListener('click', () => (location.hash = `#/study/${deckId}`));
  $('#btn-edit-deck').addEventListener('click', () => openDeckModal(deck));
  $('#btn-delete-deck').addEventListener('click', () => {
    if (cards.length > 0) {
      const ok = confirm('이 카테고리의 문제도 함께 삭제됩니다. 계속할까요?');
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
          const hay = `${c.prompt}\n${c.explanation || ''}\n${(c.tags || []).join(',')}`.toLowerCase();
          return hay.includes(q);
        });

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="card">표시할 문제가 없습니다.</div>`;
      return;
    }

    listEl.innerHTML = '';
    filtered
      .slice()
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .forEach((c) => {
        const st = DATA.stats[c.id] || { correct: 0, wrong: 0 };
        const total = (st.correct || 0) + (st.wrong || 0);
        const acc = total === 0 ? '' : ` · 정답률 ${Math.round(((st.correct || 0) / total) * 100)}%`;
        const tags = (c.tags || []).slice(0, 3).join(', ');

        const row = document.createElement('div');
        row.className = 'item';
        row.innerHTML = `
          <div>
            <div class="item-title">${escapeText(c.prompt)}</div>
            <div class="item-sub">정답 ${escapeText(c.answer)} · 기록 ${total}회${escapeText(acc)}${tags ? ` · 태그 ${escapeText(tags)}` : ''}</div>
          </div>
          <div class="item-actions">
            <span class="pill">${escapeText(c.answer)}</span>
            <button class="btn small" data-edit>수정</button>
            <button class="btn small danger" data-del>삭제</button>
          </div>
        `;
        $('[data-edit]', row).addEventListener('click', () => openCardModal({ deckId, card: c }));
        $('[data-del]', row).addEventListener('click', () => {
          const ok = confirm('이 문제를 삭제할까요?');
          if (!ok) return;
          DATA.cards = DATA.cards.filter((x) => x.id !== c.id);
          delete DATA.stats[c.id];
          commit();
          toast('삭제됨');
          // update local card list
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
  const isEdit = !!card;
  const c = card || { prompt: '', answer: 'O', explanation: '', tags: [] };

  openModal({
    title: isEdit ? '문제 수정' : '새 문제',
    bodyHTML: `
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
        const answer = normalizeAnswer($('#card-answer', root).value) || 'O';
        const explanation = $('#card-expl', root).value.trim();
        const tags = $('#card-tags', root)
          .value
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        if (!prompt) {
          alert('문장을 입력해 주세요.');
          return;
        }

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
          DATA.stats[id] = { correct: 0, wrong: 0, lastReviewed: null };
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
  openModal({
    title: '여러 개 붙여넣기',
    bodyHTML: `
      <div class="card" style="margin-bottom: 12px;">
        <div style="font-size: 13px; color: var(--muted); line-height: 1.5;">
          한 줄에 1문제씩 붙여넣으세요.<br>
          형식: <span class="kbd">문장</span> <span class="kbd">|</span> <span class="kbd">O/X</span> <span class="kbd">|</span> <span class="kbd">설명(선택)</span><br>
          탭(<span class="kbd">\t</span>) 구분도 지원합니다.
        </div>
      </div>
      <div class="field">
        <label>붙여넣기</label>
        <textarea id="bulk" placeholder="think it better to tell the truth | O | think + it + adj + toV\nthink better to tell the truth | X | 가목적어 it 필요"></textarea>
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

        if (added.length === 0) {
          alert('추가할 수 있는 줄이 없습니다.\n' + errors.slice(0, 5).join('\n'));
          return;
        }

        const ok = confirm(`총 ${added.length}개를 추가할까요?` + (errors.length ? `\n(오류 ${errors.length}개는 건너뜀)` : ''));
        if (!ok) return;

        added.forEach((x) => {
          const id = uuid();
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
          DATA.stats[id] = { correct: 0, wrong: 0, lastReviewed: null };
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

function newStudySession(deckId, cardIds) {
  STUDY = {
    deckId,
    phase: 'study',
    queue: shuffle(cardIds),
    index: 0,

    // per-card
    answered: false,
    choice: null, // 'O' | 'X'
    lastIsCorrect: null,

    // session
    wrongIds: [],
    correctCount: 0,
    wrongCount: 0,
    mode: 'all',
  };
}

function resetPerCardState() {
  if (!STUDY) return;
  STUDY.answered = false;
  STUDY.choice = null;
  STUDY.lastIsCorrect = null;
}

function renderStudy(deckId) {
  const deck = getDeck(deckId);
  if (!deck) {
    appEl.innerHTML = `<div class="card">존재하지 않는 카테고리입니다.</div>`;
    setSubtitle('');
    return;
  }

  const cards = getCards(deckId);
  if (cards.length === 0) {
    setSubtitle(deck.name);
    appEl.innerHTML = `
      <div class="card">
        <div style="font-weight: 750; margin-bottom: 6px;">문제가 없습니다</div>
        <div style="color: var(--muted); margin-bottom: 12px;">먼저 문제를 추가해 주세요.</div>
        <button class="btn primary" id="go-add">+ 문제 추가</button>
      </div>
    `;
    $('#go-add').addEventListener('click', () => {
      location.hash = `#/deck/${deckId}`;
    });
    return;
  }

  // init session if needed
  if (!STUDY || STUDY.deckId !== deckId) {
    newStudySession(deckId, cards.map((c) => c.id));
  }

  setSubtitle(`${deck.name} · 학습`);

  // Summary
  if (STUDY.phase === 'summary') {
    const total = STUDY.correctCount + STUDY.wrongCount;
    const acc = total === 0 ? 0 : Math.round((STUDY.correctCount / total) * 100);

    appEl.innerHTML = `
      <div class="card">
        <div style="font-weight: 850; font-size: 18px;">학습 완료</div>
        <div style="margin-top: 10px; color: var(--muted); line-height: 1.6;">
          총 ${total}개 중 <b>맞춤 ${STUDY.correctCount}</b>, <b>틀림 ${STUDY.wrongCount}</b> · 정답률 <b>${acc}%</b>
        </div>
        <div class="hr"></div>
        <div class="row" style="gap: 10px; flex-wrap: wrap;">
          <button class="btn primary" id="btn-review-wrong" ${STUDY.wrongIds.length ? '' : 'disabled'}>틀린 것만 다시</button>
          <button class="btn" id="btn-restart">처음부터 다시</button>
          <button class="btn" id="btn-manage">문제 관리</button>
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
      newStudySession(deckId, cards.map((c) => c.id));
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

  const expl = card.explanation?.trim() ? card.explanation.trim() : '(설명 없음)';
  const answered = !!STUDY.answered;

  appEl.innerHTML = `
    <div class="study-card">
      <div class="row" style="justify-content: space-between; margin-bottom: 8px;">
        <span class="pill">${pos} / ${total}</span>
        <span class="pill">틀림 ${STUDY.wrongCount}</span>
      </div>

      <div class="study-prompt">${escapeText(card.prompt)}</div>

      ${answered ? `
        <div class="card" style="margin: 10px 0 12px; background: var(--card);">
          <div style="font-weight: 900; margin-bottom: 8px;">
            ${STUDY.lastIsCorrect ? '✅ 정답' : '❌ 오답'}
          </div>
          <div class="study-answer" style="margin-bottom: 8px;">
            <div class="answer-badge">${escapeText(card.answer)}</div>
            <div>내 선택: <b>${escapeText(STUDY.choice)}</b> · 정답: <b>${escapeText(card.answer)}</b></div>
          </div>
          <div class="study-expl">${escapeText(expl)}</div>
        </div>

        <button class="btn primary block" id="btn-next">다음</button>

        <div style="margin-top: 10px; display:flex; gap: 8px; justify-content: space-between; flex-wrap: wrap;">
          <button class="btn small" id="btn-edit">이 문제 수정</button>
          <button class="btn small" id="btn-skip">건너뛰기</button>
        </div>
      ` : `
        <div class="big-actions">
          <button class="btn primary big-btn" id="btn-choose-o">O</button>
          <button class="btn danger big-btn" id="btn-choose-x">X</button>
        </div>

        <div style="margin-top: 10px; display:flex; gap: 8px; justify-content: space-between; flex-wrap: wrap;">
          <button class="btn small" id="btn-edit">이 문제 수정</button>
          <button class="btn small" id="btn-skip">건너뛰기</button>
        </div>

        <div style="margin-top: 10px; font-size: 12px; color: var(--muted); line-height: 1.4;">
          O/X를 선택하면 정답과 해설이 표시됩니다.
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

    const isCorrect = normalized === card.answer;
    STUDY.lastIsCorrect = isCorrect;

    const st = DATA.stats[card.id] || (DATA.stats[card.id] = { correct: 0, wrong: 0, lastReviewed: null });

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
      <div class="field">
        <label>JSON 파일 선택 (전체 백업 권장)</label>
        <input type="file" id="file" accept="application/json" />
      </div>
      <div class="row" style="gap: 10px; flex-wrap: wrap;">
        <button class="btn primary" id="btn-import-file">파일 가져오기</button>
        <button class="btn" id="btn-clear-file">선택 해제</button>
      </div>

      <div class="hr"></div>

      <div class="field">
        <label>붙여넣기 (ChatGPT가 준 JSON)</label>
        <textarea id="paste" placeholder='예) [{"prompt":"...","answer":"O","explanation":"..."}, ...]'></textarea>
      </div>
      <div class="row" style="gap: 10px; flex-wrap: wrap;">
        <select id="paste-target" style="flex: 1; min-width: 180px;">
          ${deckOptions}
        </select>
        <button class="btn primary" id="btn-import-paste">붙여넣기 가져오기</button>
      </div>
    </div>

    <div class="card">
      <div style="font-weight: 800; margin-bottom: 8px;">데이터 형식</div>
      <div style="font-size: 13px; color: var(--muted); line-height: 1.6;">
        1) <b>전체 백업</b>: <span class="kbd">{ decks: [...], cards: [...], stats: {...} }</span><br>
        2) <b>카드 배열</b>: <span class="kbd">[{ prompt, answer, explanation?, tags? }, ...]</span> (선택한 카테고리에 추가)
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
      exportObj.stats[c.id] = DATA.stats[c.id] || { correct: 0, wrong: 0, lastReviewed: null };
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
      importObject(obj);
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
      importObject(obj, { targetDeckId });
    } catch (e) {
      alert('JSON 파싱에 실패했습니다.');
    }
  });
}

function importObject(obj, opts = {}) {
  const { targetDeckId } = opts;

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

    const parsed = [];
    const errors = [];

    for (let i = 0; i < obj.length; i++) {
      const row = obj[i];
      if (!row || typeof row !== 'object') {
        errors.push(`${i + 1}번째: 객체가 아님`);
        continue;
      }
      const prompt = String(row.prompt ?? '').trim();
      const ans = normalizeAnswer(row.answer);
      const explanation = String(row.explanation ?? '').trim();
      const tags = Array.isArray(row.tags) ? row.tags.map((t) => String(t).trim()).filter(Boolean) : [];

      if (!prompt) {
        errors.push(`${i + 1}번째: prompt 비어있음`);
        continue;
      }
      if (!ans) {
        errors.push(`${i + 1}번째: answer O/X 판별 불가`);
        continue;
      }

      parsed.push({ prompt, answer: ans, explanation, tags });
    }

    if (parsed.length === 0) {
      alert('추가할 카드가 없습니다.\n' + errors.slice(0, 5).join('\n'));
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
        tags: x.tags,
        createdAt: now(),
        updatedAt: now(),
      });
      DATA.stats[id] = { correct: 0, wrong: 0, lastReviewed: null };
    });

    commit();
    toast(`추가됨: ${parsed.length}개`);
    location.hash = `#/deck/${targetDeckId}`;
    renderRoute();
    return;
  }

  alert('지원하지 않는 JSON 형식입니다.\n전체 백업 또는 카드 배열(JSON)을 넣어주세요.');
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
    renderStudy(id);
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
