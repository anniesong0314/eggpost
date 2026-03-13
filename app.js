/* app.js — eggpost frontend logic */

// ── State ──────────────────────────────────────
const state = {
  photos: [],       // { file, dataUrl }[]
  platform: null,
  tone: null,
  result: '',
  refineSelected: new Set(),
};

// ── DOM refs ───────────────────────────────────
const memo        = document.getElementById('memo');
const charCount   = document.getElementById('char-count');
const dropZone    = document.getElementById('drop-zone');
const photoInput  = document.getElementById('photo-input');
const photoPrev   = document.getElementById('photo-previews');
const dropInner   = document.getElementById('drop-zone-inner');
const btnGenerate = document.getElementById('btn-generate');
const sectionRes  = document.getElementById('section-result');
const resultText  = document.getElementById('result-text');
const btnCopy     = document.getElementById('btn-copy');
const btnRefine   = document.getElementById('btn-refine');

// ── Char counter ───────────────────────────────
memo.addEventListener('input', () => {
  charCount.textContent = memo.value.length;
});

// ── Chip selection (single) ────────────────────
function initSingleChip(groupId, stateKey) {
  document.getElementById(groupId).addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll(`#${groupId} .chip`).forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    state[stateKey] = chip.dataset.value;
  });
}
initSingleChip('platform-group', 'platform');
initSingleChip('tone-group', 'tone');

// ── Chip selection (multi) for refine ─────────
document.getElementById('refine-group').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip-refine');
  if (!chip) return;
  chip.classList.toggle('selected');
  if (chip.classList.contains('selected')) {
    state.refineSelected.add(chip.dataset.value);
  } else {
    state.refineSelected.delete(chip.dataset.value);
  }
  btnRefine.disabled = state.refineSelected.size === 0;
});

// ── Photo upload ───────────────────────────────
dropZone.addEventListener('click', (e) => {
  if (e.target.classList.contains('photo-remove')) return;
  photoInput.click();
});
photoInput.addEventListener('change', () => handleFiles(photoInput.files));
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});

function handleFiles(files) {
  const remaining = 3 - state.photos.length;
  const toAdd = Array.from(files).slice(0, remaining);
  toAdd.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      state.photos.push({ file, dataUrl: e.target.result });
      renderPhotos();
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotos() {
  photoPrev.innerHTML = state.photos.map((p, i) => `
    <div class="photo-thumb">
      <img src="${p.dataUrl}" alt="사진 ${i + 1}" />
      <button class="photo-remove" data-index="${i}" title="삭제">✕</button>
    </div>
  `).join('');
  dropInner.style.display = state.photos.length >= 3 ? 'none' : '';
  photoPrev.querySelectorAll('.photo-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.photos.splice(+btn.dataset.index, 1);
      renderPhotos();
    });
  });
}

// ── Generate ───────────────────────────────────
btnGenerate.addEventListener('click', async () => {
  const text = memo.value.trim();
  if (!text) return alert('메모를 입력해주세요.');
  if (!state.platform) return alert('플랫폼을 선택해주세요.');
  if (!state.tone) return alert('글 톤을 선택해주세요.');

  setLoading(btnGenerate, true);
  try {
    const body = {
      memo: text,
      platform: state.platform,
      tone: state.tone,
      images: state.photos.map(p => p.dataUrl),
    };
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    state.result = data.text;
    showResult(data.text);
  } catch (err) {
    alert('오류가 발생했어요: ' + err.message);
  } finally {
    setLoading(btnGenerate, false);
  }
});

// ── Copy ───────────────────────────────────────
btnCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(resultText.innerText).then(() => {
    btnCopy.textContent = '복사됨 ✓';
    btnCopy.classList.add('copied');
    setTimeout(() => { btnCopy.textContent = '복사'; btnCopy.classList.remove('copied'); }, 2000);
  });
});

// ── Refine ─────────────────────────────────────
btnRefine.addEventListener('click', async () => {
  if (state.refineSelected.size === 0) return;
  setLoading(btnRefine, true);
  try {
    const body = {
      current: resultText.innerText,
      platform: state.platform,
      tone: state.tone,
      refinements: Array.from(state.refineSelected),
    };
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, mode: 'refine' }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    showResult(data.text, state.result);
    state.result = data.text;

    // 선택 초기화
    document.querySelectorAll('#refine-group .chip-refine').forEach(c => c.classList.remove('selected'));
    state.refineSelected.clear();
    btnRefine.disabled = true;
  } catch (err) {
    alert('다듬기 오류: ' + err.message);
  } finally {
    setLoading(btnRefine, false);
  }
});

// ── Helpers ────────────────────────────────────
function showResult(newText, oldText = null) {
  sectionRes.classList.remove('hidden');
  if (oldText) {
    resultText.innerHTML = diffHighlight(oldText, newText);
  } else {
    resultText.textContent = newText;
  }
  sectionRes.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function diffHighlight(oldText, newText) {
  // 줄 단위 간단 diff — 바뀐 줄에 하이라이트
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  return newLines.map((line, i) => {
    const escaped = line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return line !== oldLines[i] ? `<mark>${escaped}</mark>` : escaped;
  }).join('\n');
}

function setLoading(btn, isLoading) {
  btn.disabled = isLoading;
  btn.querySelector('.btn-text').hidden = isLoading;
  btn.querySelector('.btn-loading').hidden = !isLoading;
}
