const API_URL = 'https://script.google.com/macros/s/AKfycbymJ_OflCYsIJdR9IEUS_iwEym2AfI7WNurbIt64YXZkJEKLJcXi3sAnEhCv-qBR8EN/exec';

let state = {
  users: [],
  matches: [],
  finishedMatches: [],
  upcomingMatches: [],
  rankings: [],
  predictionMap: {}
};

let selectedMatchRowIndex = null;
let modalMatchRowIndex = null;

const els = {
  userSelect: document.getElementById('userSelect'),
  selectedUserName: document.getElementById('selectedUserName'),
  selectedContribution: document.getElementById('selectedContribution'),
  selectedMatchName: document.getElementById('selectedMatchName'),
  selectedDateTime: document.getElementById('selectedDateTime'),
  selectedHandicap: document.getElementById('selectedHandicap'),
  currentPrediction: document.getElementById('currentPrediction'),
  predictionDeadline: document.getElementById('predictionDeadline'),
  handicapExplanation: document.getElementById('handicapExplanation'),
  scheduleTable: document.getElementById('scheduleTable'),
  openMatchCount: document.getElementById('openMatchCount'),
  expertOpinions: document.getElementById('expertOpinions'),
  expertOpinionCount: document.getElementById('expertOpinionCount'),
  scoreTable: document.getElementById('scoreTable'),
  rankingTable: document.getElementById('rankingTable'),
  finishedCount: document.getElementById('finishedCount'),
  detailPredictionTable: document.getElementById('detailPredictionTable'),
  detailPredictionCount: document.getElementById('detailPredictionCount'),
  lastUpdated: document.getElementById('lastUpdated'),
  refreshBtn: document.getElementById('refreshBtn'),
  modal: document.getElementById('predictionModal'),
  closeModalBtn: document.getElementById('closeModalBtn'),
  modalUserName: document.getElementById('modalUserName'),
  modalMatchName: document.getElementById('modalMatchName'),
  modalDateTime: document.getElementById('modalDateTime'),
  modalHandicap: document.getElementById('modalHandicap'),
  modalDeadline: document.getElementById('modalDeadline'),
  modalHandicapExplanation: document.getElementById('modalHandicapExplanation'),
  modalCurrentBox: document.getElementById('modalCurrentBox'),
  modalCurrentPrediction: document.getElementById('modalCurrentPrediction'),
  modalPredictionOptions: document.getElementById('modalPredictionOptions'),
  modalStatusBox: document.getElementById('modalStatusBox')
};

function assertApiUrl() {
  if (!API_URL || API_URL.includes('PASTE_YOUR_APPS_SCRIPT')) {
    throw new Error('Bạn chưa dán Apps Script Web App URL trong file app.js.');
  }
}

function jsonpGet(params = {}) {
  assertApiUrl();
  return new Promise((resolve, reject) => {
    const callbackName = '__nemChuaCb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const url = new URL(API_URL);
    Object.entries({ action: 'getData', ...params, callback: callbackName }).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Quá thời gian tải dữ liệu từ Apps Script.'));
    }, 15000);
    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }
    window[callbackName] = data => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('Không tải được dữ liệu. Kiểm tra Web App URL và quyền truy cập.'));
    };
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

async function postPrediction(payload) {
  assertApiUrl();
  await fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
}

async function loadData() {
  setModalStatus('Đang tải dữ liệu...', 'loading');
  try {
    const data = await jsonpGet();
    if (!data.success) throw new Error(data.message || 'Không lấy được dữ liệu.');
    state = data;
    renderUserSelect();
    selectDefaultMatchIfNeeded();
    renderAll();
    els.lastUpdated.textContent = 'Cập nhật lần cuối: ' + new Date().toLocaleString('vi-VN');
    setModalStatus('Đã tải dữ liệu.', 'success');
  } catch (err) {
    setModalStatus(err.message, 'error');
  }
}

function renderAll() {
  renderScheduleTable();
  renderSelectedInfo();
  renderExpertOpinions();
  renderTrackingTables();
}

function renderUserSelect() {
  const current = els.userSelect.value || localStorage.getItem('nemChuaUser') || '';
  els.userSelect.innerHTML = '<option value="">-- Chọn tên --</option>';
  state.users.forEach(user => {
    const option = document.createElement('option');
    option.value = user.name;
    option.textContent = user.name;
    els.userSelect.appendChild(option);
  });
  if (current && state.users.some(u => u.name === current)) {
    els.userSelect.value = current;
  }
}

function selectDefaultMatchIfNeeded() {
  const openMatches = getOpenMatches();
  if (!selectedMatchRowIndex || !state.matches.some(m => m.rowIndex === selectedMatchRowIndex)) {
    selectedMatchRowIndex = openMatches[0] ? openMatches[0].rowIndex : (state.matches[0] ? state.matches[0].rowIndex : null);
  }
}

function getOpenMatches() {
  return state.matches.filter(match => !match.isPredictionLocked);
}

function renderScheduleTable() {
  const matches = getOpenMatches();
  els.openMatchCount.textContent = matches.length + ' trận';
  if (!matches.length) {
    els.scheduleTable.innerHTML = '<p class="empty">Không còn trận nào đang mở dự đoán.</p>';
    return;
  }

  const rows = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const prev = matches[i - 1];
    const next = matches[i + 1];
    const showDate = !prev || prev.date !== current.date;
    const rowSpan = showDate ? matches.filter(m => m.date === current.date).length : 0;
    rows.push({ match: current, showDate, rowSpan, isLastOfDate: !next || next.date !== current.date });
  }

  const body = rows.map(item => {
    const match = item.match;
    const user = getSelectedUser();
    const prediction = user ? getPredictionFor(match, user) : '';
    const selectedClass = match.rowIndex === selectedMatchRowIndex ? ' selected' : '';
    const dateCell = item.showDate ? `<td class="schedule-date-cell" rowspan="${item.rowSpan}">${escapeHtml(match.date)}</td>` : '';
    const voteHtml = buildVoteCellHtml(prediction, match.rowIndex);
    const explanation = user && prediction ? getSingleHandicapExplanation(match, prediction) : '';
    return `<tr class="schedule-row${selectedClass}" data-row-index="${match.rowIndex}">
      ${dateCell}
      <td>${escapeHtml(match.time || '-')}</td>
      <td><button class="match-link" type="button" data-row-index="${match.rowIndex}">${escapeHtml(match.matchName)}</button></td>
      <td>${escapeHtml(match.handicap || '-')}</td>
      <td>${escapeHtml(formatDeadline(match.lockAt))}</td>
      <td>${voteHtml}</td>
      <td class="schedule-explain">${explanation ? escapeHtml(explanation) : '-'}</td>
    </tr>`;
  }).join('');

  els.scheduleTable.innerHTML = `<table class="schedule-table">
    <thead><tr>
      <th>Ngày</th>
      <th>Giờ</th>
      <th>Tên trận đấu</th>
      <th>Gia vị</th>
      <th>Hạn dự đoán</th>
      <th>Chọn</th>
      <th>Giải thích</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function buildVoteCellHtml(prediction, rowIndex) {
  if (!prediction) {
    return `<button class="vote-btn" type="button" data-row-index="${rowIndex}">Dự đoán</button>`;
  }
  return `<button class="vote-btn vote-result ${getPredictionClass(prediction)}" type="button" data-row-index="${rowIndex}">${escapeHtml(prediction)}</button>`;
}

function renderSelectedInfo() {
  const user = getSelectedUser();
  const match = getSelectedMatch();
  const currentPrediction = getCurrentPrediction();

  els.selectedUserName.textContent = user ? user.name : '-';
  els.selectedContribution.textContent = user ? user.contributionDisplay : '-';
  els.selectedMatchName.textContent = match ? match.matchName : '-';
  els.selectedDateTime.textContent = match ? [match.date, match.time].filter(Boolean).join(' · ') : '-';
  els.selectedHandicap.textContent = match ? (match.handicap || 'Không có') : '-';
  els.currentPrediction.textContent = currentPrediction || '-';
  els.predictionDeadline.textContent = match ? formatDeadline(match.lockAt) : '-';
  els.handicapExplanation.textContent = match ? getFullHandicapExplanation(match) : '-';
}

function renderExpertOpinions() {
  const match = getSelectedMatch();
  if (!match) {
    els.expertOpinionCount.textContent = '0 ý kiến';
    els.expertOpinions.innerHTML = '<p class="empty">Chọn một trận đấu để xem ý kiến.</p>';
    return;
  }

  const opinionRows = state.users.map(user => {
    const prediction = getPredictionFor(match, user);
    return { name: user.name, prediction: prediction || 'Chưa dự đoán', hasPrediction: Boolean(prediction) };
  });
  const predictionCount = opinionRows.filter(item => item.hasPrediction).length;
  els.expertOpinionCount.textContent = predictionCount + '/' + opinionRows.length + ' ý kiến';
  els.expertOpinions.innerHTML = opinionRows.map(item => {
    const predictionClass = item.hasPrediction ? 'expert-prediction' : 'expert-prediction empty-prediction';
    return `<article class="expert-box">
      <span class="expert-name">${escapeHtml(item.name)}</span>
      <strong class="${predictionClass}">${escapeHtml(item.prediction)}</strong>
    </article>`;
  }).join('');
}

function openPredictionModal(rowIndex) {
  const user = getSelectedUser();
  const match = state.matches.find(m => m.rowIndex === Number(rowIndex));
  if (!user) {
    alert('Vui lòng chọn tên người dùng trước khi dự đoán.');
    return;
  }
  if (!match) return;
  selectedMatchRowIndex = match.rowIndex;
  modalMatchRowIndex = match.rowIndex;
  renderAll();
  renderModal(match, user);
  els.modal.classList.add('active');
  els.modal.setAttribute('aria-hidden', 'false');
}

function closePredictionModal() {
  els.modal.classList.remove('active');
  els.modal.setAttribute('aria-hidden', 'true');
  modalMatchRowIndex = null;
}

function renderModal(match, user) {
  const currentPrediction = getPredictionFor(match, user);
  els.modalUserName.textContent = user.name;
  els.modalMatchName.textContent = match.matchName;
  els.modalDateTime.textContent = [match.date, match.time].filter(Boolean).join(' · ');
  els.modalHandicap.textContent = match.handicap || 'Không có';
  els.modalDeadline.textContent = formatDeadline(match.lockAt);
  els.modalHandicapExplanation.textContent = getFullHandicapExplanation(match);
  els.modalCurrentPrediction.textContent = currentPrediction || 'Chưa dự đoán';
  els.modalCurrentBox.className = 'modal-current-box ' + getPredictionClass(currentPrediction);

  const options = getAllowedPredictionOptions(match);
  els.modalPredictionOptions.innerHTML = options.map(option => {
    const activeClass = option === currentPrediction ? ' active ' + getPredictionClass(option) : '';
    const disabled = match.isPredictionLocked ? ' disabled' : '';
    return `<button class="modal-choice-btn${activeClass}" type="button" data-prediction="${escapeHtml(option)}"${disabled}>${escapeHtml(option)}</button>`;
  }).join('');

  if (match.isPredictionLocked) {
    setModalStatus('Trận này đã khóa dự đoán.', 'error');
  } else {
    setModalStatus(currentPrediction ? 'Bạn có thể bấm lựa chọn khác để chọn lại.' : 'Chọn dự đoán của bạn.', 'success');
  }
}

async function handlePrediction(prediction) {
  const user = getSelectedUser();
  const match = state.matches.find(m => m.rowIndex === modalMatchRowIndex);
  if (!user || !match) return;
  if (match.isPredictionLocked) {
    setModalStatus('Trận này đã khóa dự đoán.', 'error');
    return;
  }
  setModalStatus('Đang gửi dự đoán...', 'loading');
  await postPrediction({ userName: user.name, matchName: match.matchName, prediction });
  await sleep(1200);
  await loadData();
  const updatedMatch = state.matches.find(m => m.rowIndex === modalMatchRowIndex);
  if (updatedMatch) renderModal(updatedMatch, user);
  const savedValue = getPredictionFor(updatedMatch || match, user);
  if (savedValue === prediction) {
    setModalStatus('Đã lưu dự đoán: ' + prediction, 'success');
  } else {
    setModalStatus('Đã gửi yêu cầu. Nếu chưa thấy cập nhật, kiểm tra trạng thái khóa hoặc Web App.', 'warning');
  }
}

function getSelectedUser() {
  return state.users.find(u => u.name === els.userSelect.value) || null;
}

function getSelectedMatch() {
  return state.matches.find(m => m.rowIndex === selectedMatchRowIndex) || null;
}

function getPredictionFor(match, user) {
  if (!match || !user) return '';
  return state.predictionMap[match.rowIndex + '_' + user.colIndex] || '';
}

function getCurrentPrediction() {
  return getPredictionFor(getSelectedMatch(), getSelectedUser());
}

function parseHandicap(handicap) {
  const text = String(handicap || '').trim().replace(',', '.');
  if (!text || text === '-') return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return n;
}

function splitTeams(matchName) {
  const parts = String(matchName || '').split(/\s+-\s+/);
  return { teamA: parts[0] || 'Đội A', teamB: parts[1] || 'Đội B' };
}

function getAllowedPredictionOptions(match) {
  const n = parseHandicap(match.handicap);
  if (n === null) return ['Thắng', 'Hòa', 'Thua'];
  return Number.isInteger(n) ? ['Thắng', 'Hòa', 'Thua'] : ['Thắng', 'Thua'];
}

function getSingleHandicapExplanation(match, prediction) {
  const n = parseHandicap(match.handicap);
  if (n === null) return 'Trận này chưa có gia vị nên chưa có phần giải thích.';
  const { teamA, teamB } = splitTeams(match.matchName);
  const isInteger = Number.isInteger(n);

  if (prediction === 'Thắng') {
    const threshold = isInteger ? n + 1 : Math.ceil(n);
    return `Chọn Thắng nếu bạn tin rằng ${teamA} thắng ${teamB} với cách biệt từ ${threshold} bàn trở lên.`;
  }

  if (prediction === 'Hòa') {
    if (!isInteger) return '';
    if (n === 0) return `Chọn Hòa nếu bạn tin rằng ${teamA} hòa ${teamB}.`;
    return `Chọn Hòa nếu bạn tin rằng ${teamA} thắng ${teamB} với cách biệt đúng ${n} bàn.`;
  }

  if (prediction === 'Thua') {
    if (!isInteger) {
      const maxWin = Math.floor(n);
      if (maxWin <= 0) return `Chọn Thua nếu bạn tin rằng ${teamA} hòa hoặc thua ${teamB}.`;
      return `Chọn Thua nếu bạn tin rằng ${teamA} chỉ thắng ${teamB} với cách biệt tối đa ${maxWin} bàn, hoặc hòa/thua trước ${teamB}.`;
    }
    if (n === 0) return `Chọn Thua nếu bạn tin rằng ${teamA} thua ${teamB}.`;
    if (n === 1) return `Chọn Thua nếu bạn tin rằng ${teamA} hòa hoặc thua ${teamB}.`;
    return `Chọn Thua nếu bạn tin rằng ${teamA} chỉ thắng ${teamB} với cách biệt tối đa ${n - 1} bàn, hoặc hòa/thua trước ${teamB}.`;
  }

  return '';
}

function getFullHandicapExplanation(match) {
  const n = parseHandicap(match.handicap);
  if (n === null) return 'Trận này chưa có gia vị nên chưa có phần giải thích.';
  return getAllowedPredictionOptions(match)
    .map(option => getSingleHandicapExplanation(match, option))
    .filter(Boolean)
    .join(' ');
}

function formatDeadline(value) {
  const text = String(value || '').trim();
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m) return `${pad(m[4])}:${m[5]} ngày ${pad(m[1])}/${pad(m[2])}/${m[3]}`;
  return text || '-';
}

function getPredictionClass(prediction) {
  if (prediction === 'Thắng') return 'win';
  if (prediction === 'Hòa') return 'draw';
  if (prediction === 'Thua') return 'lose';
  return '';
}

function renderTrackingTables() {
  els.finishedCount.textContent = state.finishedMatches.length + ' trận';
  if (els.detailPredictionCount) els.detailPredictionCount.textContent = state.matches.length + ' trận';

  renderTable(
    els.scoreTable,
    ['Ngày', 'Giờ', 'Trận đấu', 'Tỷ số', 'Sau gia vị'],
    state.finishedMatches.map(m => [m.date, m.time, m.matchName, m.score, m.resultAfterHandicap || '-']),
    'Chưa có trận nào có kết quả.'
  );

  renderTable(
    els.rankingTable,
    ['Tên người dùng', 'Số nem chua đã đóng góp'],
    state.rankings.map(u => [u.name, u.contributionDisplay]),
    'Chưa có dữ liệu người dùng.'
  );

  renderDetailPredictionTable();
}

function renderDetailPredictionTable() {
  if (!els.detailPredictionTable) return;

  if (!state.matches || state.matches.length === 0) {
    els.detailPredictionTable.innerHTML = '<p class="empty">Chưa có dữ liệu dự đoán.</p>';
    return;
  }

  const baseHeaders = ['Menu', 'Tỷ lệ chấp', 'Kết quả trận đấu'];
  const userHeaders = state.users.map(user => user.name);
  const headers = baseHeaders.concat(userHeaders);

  const thead = '<thead><tr>' + headers.map((header, index) => {
    const cls = index >= baseHeaders.length ? ' class="user-prediction-header"' : '';
    return '<th' + cls + '>' + escapeHtml(header) + '</th>';
  }).join('') + '</tr></thead>';

  const tbody = '<tbody>' + state.matches.map(match => {
    const baseCells = [
      match.matchName || '-',
      match.handicap || '-',
      match.score || '-'
    ];
    const predictionCells = state.users.map(user => getPredictionFor(match, user) || '');
    const cells = baseCells.concat(predictionCells);

    return '<tr>' + cells.map((cell, index) => {
      const predictionClass = index >= baseHeaders.length ? getPredictionClass(cell) : '';
      const cls = index >= baseHeaders.length ? ' class="prediction-detail-cell ' + predictionClass + '"' : '';
      return '<td' + cls + '>' + escapeHtml(cell || '-') + '</td>';
    }).join('') + '</tr>';
  }).join('') + '</tbody>';

  els.detailPredictionTable.innerHTML = '<table class="detail-prediction-table">' + thead + tbody + '</table>';
}

function renderTable(container, headers, rows, emptyText) {
  if (!rows || rows.length === 0) {
    container.innerHTML = '<p class="empty">' + escapeHtml(emptyText) + '</p>';
    return;
  }
  const thead = '<thead><tr>' + headers.map(h => '<th>' + escapeHtml(h) + '</th>').join('') + '</tr></thead>';
  const tbody = '<tbody>' + rows.map(row => '<tr>' + row.map(cell => '<td>' + escapeHtml(cell) + '</td>').join('') + '</tr>').join('') + '</tbody>';
  container.innerHTML = '<table>' + thead + tbody + '</table>';
}

function setModalStatus(message, type = '') {
  els.modalStatusBox.textContent = message;
  els.modalStatusBox.className = 'status-box ' + type;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.page).classList.add('active');
    });
  });
}

function setupEvents() {
  els.userSelect.addEventListener('change', () => {
    localStorage.setItem('nemChuaUser', els.userSelect.value);
    renderAll();
  });
  els.refreshBtn.addEventListener('click', loadData);
  els.closeModalBtn.addEventListener('click', closePredictionModal);
  els.modal.addEventListener('click', event => {
    if (event.target === els.modal) closePredictionModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePredictionModal();
  });
  document.addEventListener('click', event => {
    const matchTrigger = event.target.closest('[data-row-index]');
    if (matchTrigger && (matchTrigger.classList.contains('vote-btn') || matchTrigger.classList.contains('match-link'))) {
      openPredictionModal(Number(matchTrigger.dataset.rowIndex));
      return;
    }
    const optionBtn = event.target.closest('[data-prediction]');
    if (optionBtn && optionBtn.classList.contains('modal-choice-btn')) {
      handlePrediction(optionBtn.dataset.prediction);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupEvents();
  loadData();
});
