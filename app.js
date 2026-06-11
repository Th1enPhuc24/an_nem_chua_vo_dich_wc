// Apps Script Web App /exec URL.
const API_URL = 'https://script.google.com/macros/s/AKfycbymJ_OflCYsIJdR9IEUS_iwEym2AfI7WNurbIt64YXZkJEKLJcXi3sAnEhCv-qBR8EN/exec';
const APP_TIMEZONE = 'Asia/Ho_Chi_Minh';

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
let isPredictionModalOpen = false;
let modalChoicesVisible = false;

const els = {
  userSelect: document.getElementById('userSelect'),
  selectedUserName: document.getElementById('selectedUserName'),
  selectedContribution: document.getElementById('selectedContribution'),
  selectedMatchName: document.getElementById('selectedMatchName'),
  selectedDateTime: document.getElementById('selectedDateTime'),
  selectedHandicap: document.getElementById('selectedHandicap'),
  currentPrediction: document.getElementById('currentPrediction'),
  predictionLockStatus: document.getElementById('predictionLockStatus'),
  statusBox: document.getElementById('statusBox'),
  weeklyScheduleTable: document.getElementById('weeklyScheduleTable'),
  weeklyScheduleCount: document.getElementById('weeklyScheduleCount'),
  predictionModal: document.getElementById('predictionModal'),
  predictionModalClose: document.getElementById('predictionModalClose'),
  modalUserName: document.getElementById('modalUserName'),
  modalMatchName: document.getElementById('modalMatchName'),
  modalDateTime: document.getElementById('modalDateTime'),
  modalHandicap: document.getElementById('modalHandicap'),
  modalDeadline: document.getElementById('modalDeadline'),
  modalHandicapExplanation: document.getElementById('modalHandicapExplanation'),
  modalCurrentPrediction: document.getElementById('modalCurrentPrediction'),
  modalPredictionOptions: document.getElementById('modalPredictionOptions'),
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
  const matches = getOpenMatches();
  const user = getSelectedUser();
  els.weeklyScheduleCount.textContent = matches.length + ' trận';

  if (!matches.length) {
    els.weeklyScheduleTable.innerHTML = '<p class="empty">Không còn trận nào đang mở dự đoán.</p>';
    return;
  }

  const groups = groupMatchesByDate(matches);
  const rows = groups.map(group => {
    return group.matches.map((match, index) => {
      const isSelected = Number(match.rowIndex) === Number(selectedMatchRowIndex);
      const deadlineText = formatDeadlineText(match.lockAt);
      const explanation = getHandicapExplanation(match);
      const userPrediction = user ? getPredictionFor(match, user) : '';
      const actionHtml = getScheduleActionHtml(match, userPrediction);
      const dateCell = index === 0
        ? '<td class="date-cell merged-date-cell" rowspan="' + group.matches.length + '">' + escapeHtml(group.date || '-') + '</td>'
        : '';

      return [
        '<tr class="weekly-match-row' + (isSelected ? ' selected' : '') + '" data-row-index="' + escapeHtml(match.rowIndex) + '">',
        dateCell,
        '<td class="time-cell">' + escapeHtml(match.time || '-') + '</td>',
        '<td class="match-name-cell"><button type="button" class="match-link-btn" data-row-index="' + escapeHtml(match.rowIndex) + '">' + escapeHtml(match.matchName || '-') + '</button></td>',
        '<td class="handicap-cell">' + escapeHtml(match.handicap || '-') + '</td>',
        '<td class="deadline-cell">' + escapeHtml(deadlineText) + '</td>',
        '<td class="schedule-action-cell">' + actionHtml + '</td>',
        '<td class="schedule-explain-cell">' + escapeHtml(explanation) + '</td>',
        '</tr>'
      ].join('');
    }).join('');
  }).join('');

  els.weeklyScheduleTable.innerHTML = [
    '<table class="weekly-schedule-table">',
    '<colgroup>',
    '<col class="weekly-col-date">',
    '<col class="weekly-col-time">',
    '<col class="weekly-col-match">',
    '<col class="weekly-col-handicap">',
    '<col class="weekly-col-deadline">',
    '<col class="weekly-col-action">',
    '<col class="weekly-col-explain">',
    '</colgroup>',
    '<thead><tr>',
    '<th>Ngày</th>',
    '<th>Giờ</th>',
    '<th>Tên trận đấu</th>',
    '<th>Gia vị</th>',
    '<th>Hạn dự đoán</th>',
    '<th>Chọn</th>',
    '<th>Giải thích</th>',
    '</tr></thead>',
    '<tbody>', rows, '</tbody>',
    '</table>'
  ].join('');
}

function getScheduleActionHtml(match, userPrediction) {
  if (match.isPredictionLocked) {
    return '<span class="schedule-locked-chip">Đã khóa</span>';
  }

  if (userPrediction) {
    return '<button type="button" class="prediction-result-chip ' + getPredictionClass(userPrediction) + '" data-row-index="' + escapeHtml(match.rowIndex) + '" title="Bấm để chọn lại">' + escapeHtml(userPrediction) + '</button>';
  }

  return '<button type="button" class="pick-match-btn" data-row-index="' + escapeHtml(match.rowIndex) + '">Dự đoán</button>';
}

function getOpenMatches() {
  return state.matches
    .filter(match => !match.isPredictionLocked)
    .map(match => ({ match, dateParts: parseDateDisplay(match.date), timeParts: parseTimeDisplay(match.time) }))
    .sort((a, b) => {
      const aDate = a.dateParts ? datePartsToTime(a.dateParts) : Number.MAX_SAFE_INTEGER;
      const bDate = b.dateParts ? datePartsToTime(b.dateParts) : Number.MAX_SAFE_INTEGER;
      if (aDate !== bDate) return aDate - bDate;
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

function selectMatch(rowIndex, options = {}) {
  selectedMatchRowIndex = Number(rowIndex);
  modalChoicesVisible = false;
  renderWeeklyScheduleTable();
  updateSelectedInfo({ showStatusMessage: true });
  const match = getSelectedMatch();
  if (match) {
    setStatus('Đã chọn trận: ' + match.matchName + '.', match.isPredictionLocked ? 'warning' : 'success');
  }
  if (options.openModal) {
    openPredictionModal();
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

  renderExpertOpinions();
  updatePredictionAvailability(showStatusMessage);
  renderPredictionModal();
}

function getLockStatusText(match) {
  if (!match) return '-';
  return formatDeadlineText(match.lockAt);
}

function formatDeadlineText(lockAt) {
  const text = String(lockAt || '').trim();
  if (!text || text === '-') return '-';
  const m = text.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})$/);
  if (m) return m[2] + ' ngày ' + m[1];
  return text;
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

  if (!user || !match) {
    setStatus('Vui lòng chọn tên người dùng và chọn trận đấu trước khi dự đoán.', 'warning');
    return;
  }

  if (match.isPredictionLocked) {
    setStatus('Trận này đã khóa dự đoán từ ' + formatDeadlineText(match.lockAt) + '.', 'error');
    return;
  }

  setStatus('Trận này còn mở dự đoán. Hạn chót: ' + formatDeadlineText(match.lockAt) + '.', 'success');
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
  if (handicap === null) return 'Trận này chưa có gia vị nên chưa có phần giải thích.';

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
      return 'Chọn Thắng nếu bạn tin rằng ' + teamA + ' thắng ' + teamB + ' với cách biệt từ 1 bàn trở lên. Chọn Hòa nếu bạn tin rằng ' + teamA + ' hòa ' + teamB + '. Chọn Thua nếu bạn tin rằng ' + teamA + ' thua ' + teamB + '.';
    }

    const winGap = h + 1;
    const drawGap = h;
    const loseMaxGap = h - 1;
    let loseSentence;
    if (loseMaxGap <= 0) {
      loseSentence = 'Chọn Thua nếu bạn tin rằng ' + teamA + ' hòa hoặc thua ' + teamB + '.';
    } else {
      loseSentence = 'Chọn Thua nếu bạn tin rằng ' + teamA + ' chỉ thắng ' + teamB + ' với cách biệt tối đa ' + loseMaxGap + ' bàn, hoặc hòa/thua trước ' + teamB + '.';
    }

    return 'Chọn Thắng nếu bạn tin rằng ' + teamA + ' thắng ' + teamB + ' với cách biệt từ ' + winGap + ' bàn trở lên. Chọn Hòa nếu bạn tin rằng ' + teamA + ' thắng ' + teamB + ' với cách biệt đúng ' + drawGap + ' bàn. ' + loseSentence;
  }

  const winGap = Math.ceil(absHandicap);
  const loseMaxGap = Math.floor(absHandicap);
  let loseSentence;
  if (loseMaxGap <= 0) {
    loseSentence = 'Chọn Thua nếu bạn tin rằng ' + teamA + ' hòa hoặc thua ' + teamB + '.';
  } else {
    loseSentence = 'Chọn Thua nếu bạn tin rằng ' + teamA + ' chỉ thắng ' + teamB + ' với cách biệt tối đa ' + loseMaxGap + ' bàn, hoặc hòa/thua trước ' + teamB + '.';
  }

  return 'Chọn Thắng nếu bạn tin rằng ' + teamA + ' thắng ' + teamB + ' với cách biệt từ ' + winGap + ' bàn trở lên. ' + loseSentence;
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

function getPredictionChoices(match) {
  const handicap = parseHandicap(match && match.handicap);
  if (handicap !== null && !isNearlyInteger(Math.abs(handicap))) {
    return ['Thắng', 'Thua'];
  }
  return ['Thắng', 'Hòa', 'Thua'];
}

function getPredictionClass(prediction) {
  if (prediction === 'Thắng') return 'prediction-win';
  if (prediction === 'Hòa') return 'prediction-draw';
  if (prediction === 'Thua') return 'prediction-lose';
  return '';
}

function openPredictionModal() {
  isPredictionModalOpen = true;
  const currentPrediction = getCurrentPrediction();
  modalChoicesVisible = !currentPrediction;
  if (els.predictionModal) {
    els.predictionModal.classList.add('open');
    els.predictionModal.setAttribute('aria-hidden', 'false');
  }
  renderPredictionModal();
}

function closePredictionModal() {
  isPredictionModalOpen = false;
  modalChoicesVisible = false;
  if (els.predictionModal) {
    els.predictionModal.classList.remove('open');
    els.predictionModal.setAttribute('aria-hidden', 'true');
  }
}

function renderPredictionModal() {
  if (!isPredictionModalOpen || !els.predictionModal) return;

  const user = getSelectedUser();
  const match = getSelectedMatch();
  const currentPrediction = getCurrentPrediction();

  els.modalUserName.textContent = user ? user.name : '-';
  els.modalMatchName.textContent = match ? match.matchName : '-';
  els.modalDateTime.textContent = match ? [match.date, match.time].filter(Boolean).join(' · ') : '-';
  els.modalHandicap.textContent = match ? (match.handicap || 'Không có') : '-';
  els.modalDeadline.textContent = match ? formatDeadlineText(match.lockAt) : '-';
  els.modalHandicapExplanation.textContent = getHandicapExplanation(match);

  if (currentPrediction) {
    els.modalCurrentPrediction.innerHTML = [
      '<button type="button" class="current-prediction-box ' + getPredictionClass(currentPrediction) + '" title="Bấm để chọn lại">',
      '<span>Dự đoán hiện tại</span>',
      '<strong>' + escapeHtml(currentPrediction) + '</strong>',
      '</button>'
    ].join('');
  } else {
    els.modalCurrentPrediction.innerHTML = '<div class="current-prediction-box no-prediction"><span>Dự đoán hiện tại</span><strong>Chưa dự đoán</strong></div>';
  }

  const choices = match ? getPredictionChoices(match) : [];
  if (!modalChoicesVisible && currentPrediction) {
    els.modalPredictionOptions.innerHTML = '';
  } else {
    els.modalPredictionOptions.innerHTML = choices.map(choice => {
      const activeClass = currentPrediction === choice ? ' active' : '';
      return '<button class="prediction-btn' + activeClass + '" data-prediction="' + escapeHtml(choice) + '" type="button">' + escapeHtml(choice) + '</button>';
    }).join('');
  }

  updatePredictionAvailability(false);
}

async function handlePredictionClick(prediction) {
  const user = getSelectedUser();
  const match = getSelectedMatch();

  if (!user || !match) {
    setStatus('Vui lòng chọn tên người dùng và chọn trận đấu trước khi dự đoán.', 'error');
    return;
  }

  if (match.isPredictionLocked) {
    setStatus('Trận này đã khóa dự đoán từ ' + formatDeadlineText(match.lockAt) + '.', 'error');
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
    renderWeeklyScheduleTable();
    modalChoicesVisible = false;
    renderPredictionModal();
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

  renderTable(els.upcomingTable, ['Ngày', 'Giờ', 'Trận đấu', 'Gia vị', 'Hạn dự đoán'], state.upcomingMatches.map(m => [
    m.date,
    m.time,
    m.matchName,
    m.handicap || '-',
    m.isPredictionLocked ? 'Đã khóa' : formatDeadlineText(m.lockAt)
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
  els.userSelect.addEventListener('change', () => {
    renderWeeklyScheduleTable();
    updateSelectedInfo({ showStatusMessage: true });
  });
  els.refreshBtn.addEventListener('click', () => loadData());

  els.weeklyScheduleTable.addEventListener('click', event => {
    const target = event.target.closest('[data-row-index]');
    if (!target) return;
    const shouldOpenModal = Boolean(event.target.closest('.pick-match-btn, .prediction-result-chip'));
    selectMatch(target.dataset.rowIndex, { openModal: shouldOpenModal });
  });

  els.modalPredictionOptions.addEventListener('click', event => {
    const btn = event.target.closest('.prediction-btn');
    if (!btn) return;
    handlePredictionClick(btn.dataset.prediction);
  });

  els.modalCurrentPrediction.addEventListener('click', event => {
    const target = event.target.closest('.current-prediction-box');
    if (!target || target.classList.contains('no-prediction')) return;
    modalChoicesVisible = true;
    renderPredictionModal();
  });

  els.predictionModalClose.addEventListener('click', closePredictionModal);
  els.predictionModal.addEventListener('click', event => {
    if (event.target.dataset.closeModal === 'true') closePredictionModal();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isPredictionModalOpen) closePredictionModal();
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
