// Apps Script Web App /exec URL.
const API_URL = 'https://script.google.com/macros/s/AKfycbymJ_OflCYsIJdR9IEUS_iwEym2AfI7WNurbIt64YXZkJEKLJcXi3sAnEhCv-qBR8EN/exec';
const APP_TIMEZONE = 'Asia/Ho_Chi_Minh';
const WEEK_DAYS_AHEAD = 7;

let state = {
  users: [],
  matches: [],
  finishedMatches: [],
  upcomingMatches: [],
  rankings: [],
  predictionMap: {},
  lockRule: { minutesBeforeMatch: 15 }
};

let selectedMatchRowIndex = null;

const els = {
  userSelect: document.getElementById('userSelect'),
  selectedUserName: document.getElementById('selectedUserName'),
  selectedContribution: document.getElementById('selectedContribution'),
  selectedMatchName: document.getElementById('selectedMatchName'),
  selectedDateTime: document.getElementById('selectedDateTime'),
  selectedHandicap: document.getElementById('selectedHandicap'),
  currentPrediction: document.getElementById('currentPrediction'),
  predictionLockStatus: document.getElementById('predictionLockStatus'),
  handicapExplanation: document.getElementById('handicapExplanation'),
  statusBox: document.getElementById('statusBox'),
  weeklyScheduleTable: document.getElementById('weeklyScheduleTable'),
  weeklyScheduleCount: document.getElementById('weeklyScheduleCount'),
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

async function loadData(options = {}) {
  const silent = Boolean(options.silent);
  if (!silent) setStatus('Đang tải dữ liệu...', 'loading');

  try {
    const data = await jsonpGet();
    if (!data.success) throw new Error(data.message || 'Không lấy được dữ liệu.');

    state = data;

    if (selectedMatchRowIndex && !state.matches.some(m => Number(m.rowIndex) === Number(selectedMatchRowIndex))) {
      selectedMatchRowIndex = null;
    }

    renderUserSelect();
    renderWeeklyScheduleTable();
    renderTrackingTables();
    updateSelectedInfo({ showStatusMessage: !silent });

    els.lastUpdated.textContent = 'Cập nhật lần cuối: ' + new Date().toLocaleString('vi-VN');
    if (!silent) setStatus('Đã tải dữ liệu.', 'success');
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

function renderWeeklyScheduleTable() {
  const matches = getMatchesInNextWeek();
  els.weeklyScheduleCount.textContent = matches.length + ' trận';

  if (!matches.length) {
    els.weeklyScheduleTable.innerHTML = '<p class="empty">Không có trận nào trong một tuần tới.</p>';
    return;
  }

  const groups = groupMatchesByDate(matches);
  let rows = '';

  groups.forEach(group => {
    group.matches.forEach((match, index) => {
      const isSelected = Number(match.rowIndex) === Number(selectedMatchRowIndex);
      const statusText = getCompactLockStatusText(match);
      rows += '<tr class="weekly-match-row' + (isSelected ? ' selected' : '') + '" data-row-index="' + escapeHtml(match.rowIndex) + '">';
      if (index === 0) {
        rows += '<td class="merged-date-cell" rowspan="' + group.matches.length + '">' + escapeHtml(group.date) + '</td>';
      }
      rows += '<td class="time-cell">' + escapeHtml(match.time || '-') + '</td>';
      rows += '<td><button type="button" class="match-link-btn" data-row-index="' + escapeHtml(match.rowIndex) + '">' + escapeHtml(match.matchName || '-') + '</button></td>';
      rows += '<td class="handicap-cell">' + escapeHtml(match.handicap || '-') + '</td>';
      rows += '<td>' + escapeHtml(statusText) + '</td>';
      rows += '<td><button type="button" class="pick-match-btn" data-row-index="' + escapeHtml(match.rowIndex) + '">' + (match.isPredictionLocked ? 'Xem' : 'Dự đoán') + '</button></td>';
      rows += '</tr>';
    });
  });

  els.weeklyScheduleTable.innerHTML = [
    '<table class="weekly-schedule-table">',
    '<thead><tr>',
    '<th>Ngày</th>',
    '<th>Giờ</th>',
    '<th>Tên trận đấu</th>',
    '<th>Gia vị</th>',
    '<th>Trạng thái dự đoán</th>',
    '<th>Chọn</th>',
    '</tr></thead>',
    '<tbody>', rows, '</tbody>',
    '</table>'
  ].join('');
}

function getMatchesInNextWeek() {
  const today = getTodayVNParts();

  return state.matches
    .map(match => ({ match, dateParts: parseDateDisplay(match.date), timeParts: parseTimeDisplay(match.time) }))
    .filter(item => {
      if (!item.dateParts) return false;
      const diff = daysBetween(today, item.dateParts);
      return diff >= 0 && diff <= WEEK_DAYS_AHEAD;
    })
    .sort((a, b) => {
      const dateDiff = datePartsToTime(a.dateParts) - datePartsToTime(b.dateParts);
      if (dateDiff !== 0) return dateDiff;
      const aMinutes = itemTimeToMinutes(a.timeParts);
      const bMinutes = itemTimeToMinutes(b.timeParts);
      if (aMinutes !== bMinutes) return aMinutes - bMinutes;
      return Number(a.match.rowIndex) - Number(b.match.rowIndex);
    })
    .map(item => item.match);
}

function groupMatchesByDate(matches) {
  const map = new Map();

  matches.forEach(match => {
    const key = match.date || '-';
    if (!map.has(key)) map.set(key, { date: key, matches: [] });
    map.get(key).matches.push(match);
  });

  return Array.from(map.values());
}

function selectMatch(rowIndex) {
  selectedMatchRowIndex = Number(rowIndex);
  renderWeeklyScheduleTable();
  updateSelectedInfo({ showStatusMessage: true });
  const match = getSelectedMatch();
  if (match) {
    setStatus('Đã chọn trận: ' + match.matchName + '.', match.isPredictionLocked ? 'warning' : 'success');
  }
}

function updateSelectedInfo(options = {}) {
  const showStatusMessage = options.showStatusMessage !== false;
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
  updatePredictionAvailability(showStatusMessage);
}

function getLockStatusText(match) {
  if (!match) return '-';
  if (match.isPredictionLocked) return 'Đã khóa từ ' + (match.lockAt || '-');
  return 'Còn mở. Khóa lúc ' + (match.lockAt || '-');
}

function getCompactLockStatusText(match) {
  if (!match) return '-';
  if (match.isPredictionLocked) return 'Đã khóa từ ' + (match.lockAt || '-');
  return 'Còn mở đến ' + (match.lockAt || '-');
}

function updatePredictionAvailability(showStatusMessage = true) {
  const user = getSelectedUser();
  const match = getSelectedMatch();
  const buttons = document.querySelectorAll('.prediction-btn');
  const disabled = !user || !match || Boolean(match.isPredictionLocked);

  buttons.forEach(btn => {
    btn.disabled = disabled;
  });

  if (!showStatusMessage) return;

  if (!user && !match) {
    setStatus('Vui lòng chọn tên người dùng và chọn trận ở bảng lịch phía trên.', 'warning');
    return;
  }

  if (!user) {
    setStatus('Vui lòng chọn tên người dùng trước khi dự đoán.', 'warning');
    return;
  }

  if (!match) {
    setStatus('Vui lòng chọn trận đấu ở bảng lịch phía trên.', 'warning');
    return;
  }

  if (match.isPredictionLocked) {
    setStatus('Trận này đã khóa dự đoán từ ' + (match.lockAt || '-') + '.', 'error');
    return;
  }

  setStatus('Trận này còn mở dự đoán. Hạn chót: ' + (match.lockAt || '-') + '.', 'success');
}

function getSelectedUser() {
  return state.users.find(u => u.name === els.userSelect.value) || null;
}

function getSelectedMatch() {
  if (!selectedMatchRowIndex) return null;
  return state.matches.find(m => Number(m.rowIndex) === Number(selectedMatchRowIndex)) || null;
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

function getHandicapExplanation(match) {
  if (!match) return 'Chọn trận đấu để xem cách tính gia vị.';

  const handicap = parseHandicap(match.handicap);
  if (handicap === null) return 'Trận này chưa có gia vị/chấp nên chưa có phần giải thích.';

  const teams = splitTeams(match.matchName);
  if (!teams) return 'Không tách được tên hai đội từ dữ liệu trận đấu.';

  const teamA = teams[0];
  const teamB = teams[1];
  const absHandicap = Math.abs(handicap);

  if (handicap < 0) {
    return 'Gia vị âm chưa được chuẩn hóa trong phần giải thích tự động. Vui lòng kiểm tra lại cách nhập gia vị trên Sheet.';
  }

  if (isNearlyInteger(absHandicap)) {
    const h = Math.round(absHandicap);
    if (h === 0) {
      return 'Nếu ' + teamA + ' thắng ' + teamB + ' với cách biệt từ 1 bàn trở lên thì kết quả là Thắng. Nếu ' + teamA + ' hòa ' + teamB + ' thì kết quả là Hòa. Nếu ' + teamA + ' thua ' + teamB + ' thì kết quả là Thua.';
    }

    const winGap = h + 1;
    const drawGap = h;
    const loseMaxGap = h - 1;
    let loseSentence;
    if (loseMaxGap <= 0) {
      loseSentence = 'Nếu ' + teamA + ' hòa hoặc thua ' + teamB + ' thì kết quả là Thua.';
    } else {
      loseSentence = 'Nếu ' + teamA + ' chỉ thắng ' + teamB + ' với cách biệt tối đa ' + loseMaxGap + ' bàn, hoặc hòa/thua trước ' + teamB + ', thì kết quả là Thua.';
    }

    return 'Nếu ' + teamA + ' thắng ' + teamB + ' với cách biệt từ ' + winGap + ' bàn trở lên thì kết quả là Thắng. Nếu ' + teamA + ' thắng ' + teamB + ' với cách biệt đúng ' + drawGap + ' bàn thì kết quả là Hòa. ' + loseSentence;
  }

  const winGap = Math.ceil(absHandicap);
  const loseMaxGap = Math.floor(absHandicap);
  let loseSentence;
  if (loseMaxGap <= 0) {
    loseSentence = 'Nếu ' + teamA + ' hòa hoặc thua ' + teamB + ' thì kết quả là Thua.';
  } else {
    loseSentence = 'Nếu ' + teamA + ' chỉ thắng ' + teamB + ' với cách biệt tối đa ' + loseMaxGap + ' bàn, hoặc hòa/thua trước ' + teamB + ', thì kết quả là Thua.';
  }

  return 'Nếu ' + teamA + ' thắng ' + teamB + ' với cách biệt từ ' + winGap + ' bàn trở lên thì kết quả là Thắng. ' + loseSentence;
}

function parseHandicap(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '-') return null;
  const normalized = text.replace(/\s/g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function splitTeams(matchName) {
  const parts = String(matchName || '').split(/\s+-\s+/);
  if (parts.length < 2) return null;
  return [parts[0].trim(), parts.slice(1).join(' - ').trim()];
}

function isNearlyInteger(value) {
  return Math.abs(value - Math.round(value)) < 0.000001;
}

async function handlePredictionClick(prediction) {
  const user = getSelectedUser();
  const match = getSelectedMatch();

  if (!user || !match) {
    setStatus('Vui lòng chọn tên người dùng và chọn trận đấu trước khi dự đoán.', 'error');
    return;
  }

  if (match.isPredictionLocked) {
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
    await loadData({ silent: true });

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
    m.isPredictionLocked ? 'Đã khóa' : 'Còn mở đến ' + (m.lockAt || '-')
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

function parseDateDisplay(dateText) {
  const text = String(dateText || '').trim();
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
}

function parseTimeDisplay(timeText) {
  const text = String(timeText || '').trim();
  const m = text.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

function getTodayVNParts() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date()).reduce((obj, part) => {
    if (part.type !== 'literal') obj[part.type] = Number(part.value);
    return obj;
  }, {});
  return { year: parts.year, month: parts.month, day: parts.day };
}

function datePartsToTime(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function daysBetween(startParts, targetParts) {
  return Math.round((datePartsToTime(targetParts) - datePartsToTime(startParts)) / 86400000);
}

function itemTimeToMinutes(timeParts) {
  if (!timeParts) return 0;
  return timeParts.hour * 60 + timeParts.minute;
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
  els.userSelect.addEventListener('change', () => updateSelectedInfo({ showStatusMessage: true }));
  els.refreshBtn.addEventListener('click', () => loadData());

  els.weeklyScheduleTable.addEventListener('click', event => {
    const target = event.target.closest('[data-row-index]');
    if (!target) return;
    selectMatch(target.dataset.rowIndex);
  });

  document.querySelectorAll('.prediction-btn').forEach(btn => {
    btn.addEventListener('click', () => handlePredictionClick(btn.dataset.prediction));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupEvents();
  loadData();

  window.setInterval(() => {
    loadData({ silent: true });
  }, 60000);
});
