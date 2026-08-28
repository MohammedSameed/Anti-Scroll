const coinBalance = document.querySelector('#coinBalance');
const reclaimedTime = document.querySelector('#reclaimedTime');
const goalLabel = document.querySelector('#goalLabel');
const goalFill = document.querySelector('#goalFill');
const reclaimButton = document.querySelector('#reclaimButton');
const challengeButton = document.querySelector('#challengeButton');
const challengeFill = document.querySelector('#challengeFill');
const challengeAmount = document.querySelector('#challengeAmount');
const challengeStatus = document.querySelector('#challengeStatus');
const toast = document.querySelector('#toast');
const currentDate = document.querySelector('#currentDate');
const DATE_STORAGE_KEY = 'reclaim-selected-date-v1';
const selectedDate = loadSelectedDate();

const STORAGE_KEY = 'reclaim-progress-v1';
const defaultProgress = { reclaimed: 42, coins: 184, challengeMinutes: 12 };
let progress = loadProgress();
let { reclaimed, coins, challengeMinutes } = progress;
let toastTimer;

function loadSelectedDate() {
  const savedDate = localStorage.getItem(DATE_STORAGE_KEY);
  const date = savedDate ? new Date(`${savedDate}T12:00:00`) : new Date(2024, 7, 20, 12);
  return Number.isNaN(date.getTime()) ? new Date(2024, 7, 20, 12) : date;
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return defaultProgress;
    return {
      reclaimed: Number.isFinite(saved.reclaimed) ? Math.min(Math.max(saved.reclaimed, 0), 60) : defaultProgress.reclaimed,
      coins: Number.isFinite(saved.coins) ? Math.max(saved.coins, 0) : defaultProgress.coins,
      challengeMinutes: Number.isFinite(saved.challengeMinutes) ? Math.min(Math.max(saved.challengeMinutes, 0), 20) : defaultProgress.challengeMinutes
    };
  } catch {
    return defaultProgress;
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ reclaimed, coins, challengeMinutes }));
}

function renderProgress() {
  coinBalance.textContent = coins;
  reclaimedTime.textContent = `${reclaimed} min`;
  goalLabel.textContent = `${reclaimed} / 60 min`;
  goalFill.style.width = `${(reclaimed / 60) * 100}%`;
  challengeAmount.innerHTML = `${challengeMinutes} <small>/ 20 min</small>`;
  challengeFill.style.width = `${(challengeMinutes / 20) * 100}%`;
  if (challengeMinutes === 20) {
    challengeStatus.textContent = 'COMPLETE';
    challengeStatus.style.color = '#668b32';
    challengeButton.innerHTML = 'Challenge complete <span>✓</span>';
    challengeButton.disabled = true;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function renderDate() {
  currentDate.textContent = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  }).format(selectedDate);
}

function shiftDate(days) {
  selectedDate.setDate(selectedDate.getDate() + days);
  localStorage.setItem(DATE_STORAGE_KEY, selectedDate.toISOString().slice(0, 10));
  renderDate();
  showToast(`Showing ${currentDate.textContent}.`);
}

reclaimButton.addEventListener('click', () => {
  reclaimed = Math.min(reclaimed + 5, 60);
  coins += 5;
  saveProgress();
  renderProgress();
  showToast('Time reclaimed. +5 TimeCoins added.');
  if (reclaimed === 60) showToast('Daily goal complete. Nice work.');
});

challengeButton.addEventListener('click', () => {
  challengeMinutes = Math.min(challengeMinutes + 5, 20);
  if (challengeMinutes === 20) coins += 20;
  saveProgress();
  renderProgress();
  if (challengeMinutes === 20) {
    showToast('Challenge complete. +20 TimeCoins added.');
  } else {
    showToast('Challenge progress saved.');
  }
});

document.querySelector('#previousDay').addEventListener('click', () => shiftDate(-1));
document.querySelector('#nextDay').addEventListener('click', () => shiftDate(1));
document.querySelector('#notificationsButton').addEventListener('click', () => showToast('You are all caught up.'));
document.querySelector('#upgradeButton').addEventListener('click', () => showToast('Reclaim Pro will be available soon.'));
document.querySelector('#detailsButton').addEventListener('click', () => showToast('Detailed activity history is coming soon.'));
document.querySelector('#experimentButton').addEventListener('click', (event) => {
  event.currentTarget.textContent = 'Experiment started';
  event.currentTarget.disabled = true;
  showToast('Experiment started. We will check in tonight.');
});
document.querySelector('#walletOptionsButton').addEventListener('click', () => showToast('Wallet history will be available with your account.'));
document.querySelector('#suggestionButton').addEventListener('click', () => {
  document.querySelector('#experimentButton').click();
});

document.querySelectorAll('.tab-item').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab-item').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
  });
});

renderProgress();
renderDate();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
}
