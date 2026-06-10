// Apps Script Web App /exec URL.
const API_URL = 'https://script.google.com/macros/s/AKfycbymJ_OflCYsIJdR9IEUS_iwEym2AfI7WNurbIt64YXZkJEKLJcXi3sAnEhCv-qBR8EN/exec';

let state = {
  users: [],
  matches: [],
  finishedMatches: [],
  upcomingMatches: [],
  rankings: [],
  predictionMap: {},
  lockRule: { minutesBeforeMatch: 15 }
};

const els = {
  userSelect: document.getElementById('userSelect'),
  matchSelect: document.getElementById('matchSelect'),
  selectedUserName: document.getElementById('selectedUserName'),
  selectedContribution: document.getElementById('selectedContribution'),
  selectedMatchName: document.getElementById('selectedMatchName'),
  selectedDateTime: document.getElementById('selectedDateTime'),
  selectedHandicap: document.getElementById('selectedHandicap'),
  currentPrediction: document.getElementById('currentPrediction'),
  predictionLockStatus: document.getElementById('predictionLockStatus'),
  statusBox: document.getElementById('statusBox'),
  todayTomorrowTable: document.getElementById('todayTomorrowTable'),
  todayTomorrowCount: document.getElementById('todayTomorrowCount'),
  handicapExplanation: document.getElementById('handicapExplanation'),
  scoreTable: document.getElementById('scoreTable'),
  upcomingTable: document.getElementById('upcomingTable'),
  rankingTable: document.getElementById('rankingTable'),
  finishedCount: document.getElementById('finishedCount'),
  upcomingCount: document.getElementById('upcomingCount'),
  expertOpinions: document.getElementById('expertOpinions'),
  expertOpinionCount: document.getElementById('expertOpinionCount'),
  lastUpdated: document.getElementById('lastUpdated'),
  refreshBtn: document.getElementById('refreshBtn')
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
  setStatus('Đang tải dữ liệu...', 'loading');

  try {
    const data = await jsonpGet();
    if (!data.success) throw new Error(data.message || 'Không lấy được dữ liệu.');

    state = data;
    renderUserSelect();
    renderMatchSelect();
    renderTodayTomorrowMatches();
    renderTrackingTables();
    updateSelectedInfo();

    els.lastUpdated.textContent = 'Cập nhật lần cuối: ' + new Date().toLocaleString('vi-VN');
    setStatus('Đã tải dữ liệu.', 'success');
    updatePredictionAvailability(false);
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function renderUserSelect() {
  const current = els.userSelect.value;
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

function renderMatchSelect() {
  const current = els.matchSelect.value;
  els.matchSelect.innerHTML = '<option value="">-- Chọn trận đấu --</option>';

  state.matches.forEach(match => {
    const option = document.createElement('option');
    option.value = match.matchName;
    option.textContent = [match.date, match.time, match.matchName, isMatchLockedNow(match) ? 'Đã khóa' : 'Còn mở'].filter(Boolean).join(' · ');
    els.matchSelect.appendChild(option);
  });

  if (current && state.matches.some(m => m.matchName === current)) {
    els.matchSelect.value = current;
  }
}

function updateSelectedInfo() {
  const user = getSelectedUser();
  const match = getSelectedMatch();

  els.selectedUserName.textContent = user ? user.name : '-';
  els.selectedContribution.textContent = user ? user.contributionDisplay : '-';
  els.selectedMatchName.textContent = match ? match.matchName : '-';
  els.selectedDateTime.textContent = match ? [match.date, match.time].filter(Boolean).join(' · ') : '-';
  els.selectedHandicap.textContent = match ? (match.handicap || 'Không có') : '-';
  els.currentPrediction.textContent = getCurrentPrediction() || '-';
  els.predictionLockStatus.textContent = getLockStatusText(match);
  els.handicapExplanation.textContent = getHandicapExplanation(match);

  renderExpertOpinions();
  updatePredictionAvailability(true);
}

function getLockStatusText(match) {
  if (!match) return '-';
  if (isMatchLockedNow(match)) return 'Đã khóa từ ' + (match.lockAt || '-');
  return 'Còn mở. Khóa lúc ' + (match.lockAt || '-');
}

function isMatchLockedNow(match) {
  if (!match) return false;
  if (match.lockAtIso) {
    const lockDate = new Date(match.lockAtIso);
    if (!Number.isNaN(lockDate.getTime())) {
      return Date.now() >= lockDate.getTime();
    }
  }
  return Boolean(match.isPredictionLocked);
}

function getMatchStatusText(match) {
  if (!match) return '-';
  return isMatchLockedNow(match) ? 'Đã khóa' : 'Còn mở đến ' + (match.lockAt || '-');
}

function getDateKeyFromDisplay(dateText) {
  const m = String(dateText || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
}

function getDateKeyInVietnam(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(date).reduce((obj, item) => {
    obj[item.type] = item.value;
    return obj;
  }, {});
  return parts.year + '-' + parts.month + '-' + parts.day;
}

function getTodayAndTomorrowKeys() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return new Set([getDateKeyInVietnam(now), getDateKeyInVietnam(tomorrow)]);
}

function compareMatchDateTime(a, b) {
  const dateCompare = getDateKeyFromDisplay(a.date).localeCompare(getDateKeyFromDisplay(b.date));
  if (dateCompare !== 0) return dateCompare;
  return String(a.time || '').localeCompare(String(b.time || ''));
}

function renderTodayTomorrowMatches() {
  if (!els.todayTomorrowTable || !els.todayTomorrowCount) return;

  const keys = getTodayAndTomorrowKeys();
  const rows = state.matches
    .filter(match => keys.has(getDateKeyFromDisplay(match.date)))
    .slice()
    .sort(compareMatchDateTime);

  els.todayTomorrowCount.textContent = rows.length + ' trận';
  renderTable(els.todayTomorrowTable, ['Tên trận đấu', 'Ngày', 'Giờ', 'Gia vị', 'Trạng thái dự đoán'], rows.map(match => [
    match.matchName,
    match.date,
    match.time,
    match.handicap || '-',
    getMatchStatusText(match)
  ]), 'Không có trận đấu nào trong hôm nay và ngày mai.');
}

function splitTeams(matchName) {
  const parts = String(matchName || '').split(/\s+[-–—]\s+/).map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { teamA: parts[0], teamB: parts.slice(1).join(' - ') };
  return { teamA: String(matchName || '').trim() || 'Đội A', teamB: 'Đội B' };
}

function parseHandicapValue(value) {
  const text = String(value || '').replace(',', '.').trim();
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function formatGoalCount(n) {
  return n + ' bàn';
}

function getHandicapExplanation(match) {
  if (!match) return 'Chọn trận đấu để xem cách tính gia vị.';

  const handicap = parseHandicapValue(match.handicap);
  if (handicap === null) return 'Trận này chưa có dữ liệu gia vị/chấp.';

  const { teamA, teamB } = splitTeams(match.matchName);
  const displayHandicap = match.handicap || String(handicap).replace('.', ',');

  if (handicap < 0) {
    return 'Gia vị đang là số âm (' + displayHandicap + '). Bản giải thích tự động hiện ưu tiên trường hợp đội A chấp đội B; vui lòng kiểm tra lại dữ liệu gia vị của trận này.';
  }

  if (Number.isInteger(handicap)) {
    if (handicap === 0) {
      return 'Gia vị ' + displayHandicap + ': Nếu ' + teamA + ' thắng ' + teamB + ' thì kết quả là Thắng. Nếu hai đội hòa thì kết quả là Hòa. Nếu ' + teamA + ' thua ' + teamB + ' thì kết quả là Thua.';
    }

    const winLine = 'Nếu ' + teamA + ' thắng ' + teamB + ' với cách biệt từ ' + formatGoalCount(handicap + 1) + ' trở lên thì kết quả là Thắng.';
    const drawLine = 'Nếu ' + teamA + ' thắng ' + teamB + ' với cách biệt đúng ' + formatGoalCount(handicap) + ' thì kết quả là Hòa.';
    const loseLine = handicap - 1 <= 0
      ? 'Nếu ' + teamA + ' hòa hoặc thua ' + teamB + ' thì kết quả là Thua.'
      : 'Nếu ' + teamA + ' chỉ thắng ' + teamB + ' với cách biệt tối đa ' + formatGoalCount(handicap - 1) + ', hoặc hòa/thua trước ' + teamB + ', thì kết quả là Thua.';

    return 'Gia vị ' + displayHandicap + ': ' + winLine + ' ' + drawLine + ' ' + loseLine;
  }

  const upper = Math.ceil(handicap);
  const lower = Math.floor(handicap);
  const winLine = 'Nếu ' + teamA + ' thắng ' + teamB + ' với cách biệt từ ' + formatGoalCount(upper) + ' trở lên thì kết quả là Thắng.';
  const loseLine = lower <= 0
    ? 'Nếu ' + teamA + ' hòa hoặc thua ' + teamB + ' thì kết quả là Thua.'
    : 'Nếu ' + teamA + ' chỉ thắng ' + teamB + ' với cách biệt tối đa ' + formatGoalCount(lower) + ', hoặc hòa/thua trước ' + teamB + ', thì kết quả là Thua.';

  return 'Gia vị ' + displayHandicap + ': ' + winLine + ' ' + loseLine;
}

function refreshRealtimeViews() {
  const selectedMatch = els.matchSelect.value;
  renderMatchSelect();
  if (selectedMatch && state.matches.some(m => m.matchName === selectedMatch)) {
    els.matchSelect.value = selectedMatch;
  }
  renderTodayTomorrowMatches();
  renderTrackingTables();
  updateSelectedInfo();
}

function updatePredictionAvailability(showStatusMessage = true) {
  const user = getSelectedUser();
  const match = getSelectedMatch();
  const buttons = document.querySelectorAll('.prediction-btn');
  const disabled = !user || !match || isMatchLockedNow(match);

  buttons.forEach(btn => {
    btn.disabled = disabled;
  });

  if (!showStatusMessage) return;

  if (!user || !match) {
    setStatus('Vui lòng chọn tên và trận đấu trước khi dự đoán.', 'warning');
    return;
  }

  if (isMatchLockedNow(match)) {
    setStatus('Trận này đã khóa dự đoán từ ' + (match.lockAt || '-') + '.', 'error');
    return;
  }

  setStatus('Trận này còn mở dự đoán. Hạn chót: ' + (match.lockAt || '-') + '.', 'success');
}

function getSelectedUser() {
  return state.users.find(u => u.name === els.userSelect.value) || null;
}

function getSelectedMatch() {
  return state.matches.find(m => m.matchName === els.matchSelect.value) || null;
}

function getCurrentPrediction() {
  const user = getSelectedUser();
  const match = getSelectedMatch();
  if (!user || !match) return '';
  return getPredictionFor(match, user);
}

function getPredictionFor(match, user) {
  if (!match || !user) return '';
  return state.predictionMap[match.rowIndex + '_' + user.colIndex] || '';
}

function renderExpertOpinions() {
  const match = getSelectedMatch();

  if (!els.expertOpinions || !els.expertOpinionCount) return;

  if (!match) {
    els.expertOpinionCount.textContent = '0 ý kiến';
    els.expertOpinions.innerHTML = '<p class="empty">Chọn một trận đấu để xem ý kiến.</p>';
    return;
  }

  const opinionRows = state.users.map(user => {
    const prediction = getPredictionFor(match, user);
    return {
      name: user.name,
      prediction: prediction || 'Chưa dự đoán',
      hasPrediction: Boolean(prediction)
    };
  });

  const predictionCount = opinionRows.filter(item => item.hasPrediction).length;
  els.expertOpinionCount.textContent = predictionCount + '/' + opinionRows.length + ' ý kiến';

  if (opinionRows.length === 0) {
    els.expertOpinions.innerHTML = '<p class="empty">Chưa có dữ liệu người dùng.</p>';
    return;
  }

  els.expertOpinions.innerHTML = opinionRows.map(item => {
    const predictionClass = item.hasPrediction ? 'expert-prediction' : 'expert-prediction empty-prediction';
    return [
      '<article class="expert-box">',
      '<span class="expert-name">' + escapeHtml(item.name) + '</span>',
      '<strong class="' + predictionClass + '">' + escapeHtml(item.prediction) + '</strong>',
      '</article>'
    ].join('');
  }).join('');
}

async function handlePredictionClick(prediction) {
  const user = getSelectedUser();
  const match = getSelectedMatch();

  if (!user || !match) {
    setStatus('Vui lòng chọn tên và trận đấu trước khi dự đoán.', 'error');
    return;
  }

  if (isMatchLockedNow(match)) {
    setStatus('Trận này đã khóa dự đoán từ ' + (match.lockAt || '-') + '.', 'error');
    return;
  }

  setStatus('Đang gửi dự đoán...', 'loading');

  try {
    await postPrediction({
      userName: user.name,
      matchName: match.matchName,
      prediction
    });

    await sleep(1200);
    await loadData();

    const savedValue = getCurrentPrediction();
    if (savedValue === prediction) {
      setStatus('Đã lưu dự đoán: ' + prediction, 'success');
    } else {
      setStatus('Đã gửi yêu cầu. Nếu chưa thấy cập nhật, trận có thể đã khóa hoặc Web App chưa được deploy bản mới.', 'warning');
    }
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function renderTrackingTables() {
  els.finishedCount.textContent = state.finishedMatches.length + ' trận';
  els.upcomingCount.textContent = state.upcomingMatches.length + ' trận';

  renderTable(els.scoreTable, ['Ngày', 'Giờ', 'Trận đấu', 'Tỷ số', 'Sau gia vị'], state.finishedMatches.map(m => [
    m.date,
    m.time,
    m.matchName,
    m.score,
    m.resultAfterHandicap || '-'
  ]), 'Chưa có trận nào có kết quả.');

  renderTable(els.upcomingTable, ['Ngày', 'Giờ', 'Trận đấu', 'Gia vị', 'Trạng thái'], state.upcomingMatches.map(m => [
    m.date,
    m.time,
    m.matchName,
    m.handicap || '-',
    getMatchStatusText(m)
  ]), 'Không còn trận sắp tới.');

  renderTable(els.rankingTable, ['Tên người dùng', 'Số nem chua đã đóng góp'], state.rankings.map(u => [
    u.name,
    u.contributionDisplay
  ]), 'Chưa có dữ liệu người dùng.');
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

function setStatus(message, type = '') {
  els.statusBox.textContent = message;
  els.statusBox.className = 'status-box ' + type;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
  els.userSelect.addEventListener('change', updateSelectedInfo);
  els.matchSelect.addEventListener('change', updateSelectedInfo);
  els.refreshBtn.addEventListener('click', loadData);
  window.setInterval(refreshRealtimeViews, 30000);

  document.querySelectorAll('.prediction-btn').forEach(btn => {
    btn.addEventListener('click', () => handlePredictionClick(btn.dataset.prediction));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupEvents();
  loadData();
});
