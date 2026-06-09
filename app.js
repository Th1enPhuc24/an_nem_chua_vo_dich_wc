// 1) Deploy Apps Script as Web App.
// 2) Paste the /exec URL below.
const API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_EXEC_URL_HERE';

let state = {
  users: [],
  matches: [],
  finishedMatches: [],
  upcomingMatches: [],
  rankings: [],
  predictionMap: {}
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
  statusBox: document.getElementById('statusBox'),
  scoreTable: document.getElementById('scoreTable'),
  upcomingTable: document.getElementById('upcomingTable'),
  rankingTable: document.getElementById('rankingTable'),
  finishedCount: document.getElementById('finishedCount'),
  upcomingCount: document.getElementById('upcomingCount'),
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

  // no-cors: browser sends the request but hides the response.
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
    renderTrackingTables();
    updateSelectedInfo();

    els.lastUpdated.textContent = 'Cập nhật lần cuối: ' + new Date().toLocaleString('vi-VN');
    setStatus('Đã tải dữ liệu.', 'success');
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
    option.textContent = [match.date, match.time, match.matchName].filter(Boolean).join(' · ');
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
  return state.predictionMap[match.rowIndex + '_' + user.colIndex] || '';
}

async function handlePredictionClick(prediction) {
  const user = getSelectedUser();
  const match = getSelectedMatch();

  if (!user || !match) {
    setStatus('Vui lòng chọn tên và trận đấu trước khi dự đoán.', 'error');
    return;
  }

  setStatus('Đang gửi dự đoán...', 'loading');

  try {
    await postPrediction({
      userName: user.name,
      matchName: match.matchName,
      prediction
    });

    // Apps Script POST response is opaque in no-cors mode, so reload data to verify.
    await sleep(1200);
    await loadData();

    const savedValue = getCurrentPrediction();
    if (savedValue === prediction) {
      setStatus('Đã lưu dự đoán: ' + prediction, 'success');
    } else {
      setStatus('Đã gửi yêu cầu. Nếu chưa thấy cập nhật, kiểm tra quyền Web App hoặc thử làm mới dữ liệu.', 'warning');
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

  renderTable(els.upcomingTable, ['Ngày', 'Giờ', 'Trận đấu', 'Gia vị'], state.upcomingMatches.map(m => [
    m.date,
    m.time,
    m.matchName,
    m.handicap || '-'
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

  document.querySelectorAll('.prediction-btn').forEach(btn => {
    btn.addEventListener('click', () => handlePredictionClick(btn.dataset.prediction));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupEvents();
  loadData();
});
