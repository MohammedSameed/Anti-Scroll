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

let reclaimed = 42;
let coins = 184;
let challengeMinutes = 12;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

reclaimButton.addEventListener('click', () => {
  reclaimed = Math.min(reclaimed + 5, 60);
  coins += 5;
  reclaimedTime.textContent = `${reclaimed} min`;
  coinBalance.textContent = coins;
  goalLabel.textContent = `${reclaimed} / 60 min`;
  goalFill.style.width = `${(reclaimed / 60) * 100}%`;
  showToast('Time reclaimed. +5 TimeCoins added.');
  if (reclaimed === 60) showToast('Daily goal complete. Nice work.');
});

challengeButton.addEventListener('click', () => {
  challengeMinutes = Math.min(challengeMinutes + 5, 20);
  challengeAmount.innerHTML = `${challengeMinutes} <small>/ 20 min</small>`;
  challengeFill.style.width = `${(challengeMinutes / 20) * 100}%`;
  if (challengeMinutes === 20) {
    challengeStatus.textContent = 'COMPLETE';
    challengeStatus.style.color = '#668b32';
    challengeButton.innerHTML = 'Challenge complete <span>✓</span>';
    challengeButton.disabled = true;
    showToast('Challenge complete. +20 TimeCoins added.');
  } else {
    showToast('Challenge progress saved.');
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
}
