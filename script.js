/* =========================================================
   Times Tables Trainer - Script (improved Aug 2025, no corrected answers in review)
   REMINDER: bump versions in index.html when you change files:
   <link rel="stylesheet" href="./styles.css?v=frontpage-8" />
   <script src="./script.js?v=frontpage-8"></script>
   ========================================================= */

/******** Google Sheet endpoint (multi-device) ********/
// ⚠️ Note: secrets in client code are discoverable. Consider validating on Apps Script side
const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbyIuCIgbFisSKqA0YBtC5s5ATHsHXxoqbZteJ4en7hYrf4AXmxbnMOUfeQ2ERZIERN-/exec";
const SHEET_SECRET   = "Banstead123";
/******************************************************/

/********* Offline/refresh-safe queue for submissions *********/
let pendingSubmissions = JSON.parse(localStorage.getItem("pendingSubmissions") || "[]");
let isFlushing = false;

function saveQueue_(){
  localStorage.setItem("pendingSubmissions", JSON.stringify(pendingSubmissions));
}

function queueSubmission(payload){
  if (!payload || !payload.id || !payload.table) {
    console.warn("Not queuing bad payload (missing id/table):", payload);
    return;
  }
  if (pendingSubmissions.some(p => p.id === payload.id)) return; // de-dupe
  pendingSubmissions.push(payload);
  saveQueue_();
}

async function flushQueue(){
  if (isFlushing) return;
  if (!pendingSubmissions.length) return;
  isFlushing = true;

  const remaining = [];
  for (const payload of pendingSubmissions){
    try {
      if (!payload || !payload.id || !payload.table) {
        console.warn("Skipping bad queued payload:", payload);
        continue;
      }
      await fetch(SHEET_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        body: new Blob([JSON.stringify(payload)], { type: "text/plain;charset=utf-8" })
      });
    } catch (e){
      remaining.push(payload);
      console.error("Flush failed, will retry:", e);
    }
  }
  pendingSubmissions = remaining;
  saveQueue_();
  isFlushing = false;
}

window.addEventListener("online", flushQueue);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") flushQueue();
});
window.addEventListener("pagehide", () => {
  try {
    if (!pendingSubmissions.length) return;
    const payload = new Blob([JSON.stringify({ pending: pendingSubmissions })], { type: "text/plain;charset=utf-8" });
    navigator.sendBeacon?.(SHEET_ENDPOINT, payload);
  } catch(_) {}
});
window.addEventListener("DOMContentLoaded", flushQueue);

/******************** STATE ********************/
let selectedBase = null;      // 2..12
let mode = 'baseline';        // 'baseline' | 'tester'
let allQuestions = [];
let current = 0;
let score = 0;
let time = 90;
let timer = null;
let timerStarted = false;
let ended = false;
let userAnswers = [];
let username = "";

const TABLES = [2,3,4,5,6,7,8,9,10,11,12];
const MAX_ANSWER_LEN = 4;

/******************** FRESH DOM GETTERS ********************/
const $ = (id) => document.getElementById(id);
const getQEl     = () => $("question");
const getAnswer  = () => $("answer");
const getTimerEl = () => $("timer");
const getScoreEl = () => $("score");
const getPadEl   = () => $("answer-pad");

const getHome  = () => $("home-screen");
const getMini  = () => $("mini-screen");
const getNinja = () => $("ninja-screen");
const getQuiz  = () => $("quiz-container");

/******************** DEVICE DETECTION ********************/
function isIOSLike(){
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadAsMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOS || iPadAsMac;
}
function preventSoftKeyboard(e){
  const a = getAnswer();
  if (a && a.readOnly){
    e.preventDefault();
    a.blur();
  }
}

/******************** SMALL UI HELPERS ********************/
function show(el){ if(el) el.style.display = "block"; }
function hide(el){ if(el) el.style.display = "none"; }

function clearResultsUI(){
  const s = getScoreEl();
  if (s) s.innerHTML = "";
}

/******************** NAME PERSISTENCE ********************/
(function bootstrapName(){
  const saved = localStorage.getItem('ttt_username') || '';
  if (saved) {
    username = saved;
    const input = $('home-username');
    if (input) input.value = saved;
    const hello = $('hello-user');
    if (hello) hello.textContent = `Hello, ${username}! Choose your times table:`;
  }
})();
function setUsernameFromHome(){
  const name = $('home-username')?.value.trim() || "";
  if (name){
    username = name;
    try { localStorage.setItem('ttt_username', username); } catch(_) {}
  }
}

/******************** NAVIGATION ********************/
function goHome(){
  clearResultsUI();
  hide(getMini()); hide(getNinja()); hide(getQuiz());
  show(getHome());
}
function goMini(){
  setUsernameFromHome();
  const hello = $('hello-user');
  if (hello) hello.textContent = username ? `Hello, ${username}! Choose your times table:` : `Choose your times table:`;
  clearResultsUI();
  hide(getHome()); hide(getNinja()); hide(getQuiz());
  show(getMini());
}
function goNinja(){
  setUsernameFromHome();
  clearResultsUI();
  hide(getHome()); hide(getMini()); hide(getQuiz());
  show(getNinja());
}
function quitToMini(){
  if (timer){ clearInterval(timer); timer = null; }
  clearResultsUI();
  hide(getQuiz());
  show(getMini());
}

/******************** UI BUILDERS ********************/
function buildTableButtons(){
  const container = $('table-choices');
  if (!container) return;
  container.innerHTML = '';
  TABLES.forEach(b => {
    const btn = document.createElement('button');
    btn.type = "button";
    btn.className = "choice";
    btn.id = `btn-${b}`;
    btn.textContent = `${b}×`;
    btn.addEventListener('click', () => selectTable(b));
    container.appendChild(btn);
  });
}

let hasAnswerKeydownHandler = false;
function buildKeypadIfNeeded(){
  const pad = getPadEl();
  const a = getAnswer();
  if (!pad || !a) return;

  pad.classList.add('calc-pad');
  if (pad.childElementCount > 0){
    pad.style.display = "grid";
  } else {
    const labels = ['7','8','9','⌫', '4','5','6','Enter', '1','2','3', '0','Clear'];
    const pos = {
      '7':'key-7','8':'key-8','9':'key-9','⌫':'key-back',
      '4':'key-4','5':'key-5','6':'key-6','Enter':'key-enter',
      '1':'key-1','2':'key-2','3':'key-3','0':'key-0','Clear':'key-clear'
    };
    labels.forEach(label => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.setAttribute('aria-label', label==='⌫' ? 'Backspace' : label);
      if (label==='Enter') btn.classList.add('calc-btn--enter');
      if (label==='Clear') btn.classList.add('calc-btn--clear');
      if (label==='⌫')     btn.classList.add('calc-btn--back');
      btn.classList.add(pos[label]);

      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (isIOSLike()) a.blur();
        handlePadPress(label);
      });
      pad.appendChild(btn);
    });
  }

  function handlePadPress(label){
    switch(label){
      case 'Clear':
        a.value=''; a.dispatchEvent(new Event('input',{bubbles:true})); break;
      case '⌫':
        a.value=a.value.slice(0,-1); a.dispatchEvent(new Event('input',{bubbles:true})); break;
      case 'Enter':
        if (!timerStarted){ startTimer(); timerStarted = true; }
        window.handleKey({ key:'Enter' });
        break;
      default:
        if (/^\\d$/.test(label)){
          if (a.value.length>=MAX_ANSWER_LEN) return;
          a.value += label;
          a.dispatchEvent(new Event('input',{bubbles:true}));
        }
    }
  }

  if (!hasAnswerKeydownHandler){
    a.addEventListener('keydown', (e) => {
      const ok = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Enter'];
      if (ok.includes(e.key)) return;
      if (!/^\\d$/.test(e.key)) e.preve
