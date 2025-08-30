/* =========================================================
   Times Tables Trainer - Script
   REMINDER:
   If you update this file, bump the version numbers in index.html:
   <link rel="stylesheet" href="./styles.css?v=frontpage-5" />
   <script src="./script.js?v=frontpage-5"></script>
   ========================================================= */

/******** Google Sheet endpoint (multi-device) ********/
const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbyIuCIgbFisSKqA0YBtC5s5ATHsHXxoqbZteJ4en7hYrf4AXmxbnMOUfeQ2ERZIERN-/exec";
const SHEET_SECRET   = "Banstead123";
/******************************************************/

/********* Offline/refresh-safe queue for submissions *********/
let pendingSubmissions = JSON.parse(localStorage.getItem("pendingSubmissions") || "[]");
let isFlushing = false;

function saveQueue_() { localStorage.setItem("pendingSubmissions", JSON.stringify(pendingSubmissions)); }

function queueSubmission(payload) {
  if (!payload || !payload.id || !payload.table) {
    console.warn("Not queuing bad payload (missing id/table):", payload);
    return;
  }
  if (pendingSubmissions.some(p => p.id === payload.id)) return;
  pendingSubmissions.push(payload);
  saveQueue_();
}

async function flushQueue() {
  if (isFlushing) return;
  if (!pendingSubmissions.length) return;
  isFlushing = true;

  const remaining = [];
  for (const payload of pendingSubmissions) {
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
    } catch (e) {
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

/******************** QUIZ STATE ********************/
let selectedBase = null;                  // 2..12
let mode = 'baseline';                    // 'baseline' | 'tester'
let allQuestions = [];
let current = 0;
let score = 0;
let time = 90;                            // set per mode on start
let timer = null;
let timerStarted = false;
let ended = false;
let userAnswers = [];
let username = "";

// Offer these times tables:
const TABLES = [2,3,4,5,6,7,8,9,10,11,12];

/******************** ELEMENT HELPERS (fresh lookups) ********************/
function getQEl()       { return document.getElementById("question"); }
function getAnswerEl()  { return document.getElementById("answer"); }
function getTimerEl()   { return document.getElementById("timer"); }
function getScoreEl()   { return document.getElementById("score"); }
function getPadEl()     { return document.getElementById("answer-pad"); }

function getHome()  { return document.getElementById("home-screen"); }
function getMini()  { return document.getElementById("mini-screen"); }
function getNinja() { return document.getElementById("ninja-screen"); }
function getQuiz()  { return document.getElementById("quiz-container"); }

/******************** DEVICE DETECTION ********************/
function isIOSLike() {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadAsMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOS || iPadAsMac;
}
function preventSoftKeyboard(e) {
  const aEl = getAnswerEl();
  if (aEl && aEl.readOnly) {
    e.preventDefault();
    aEl.blur();
  }
}

/******************** NAVIGATION ********************/
function show(el) { if (el) el.style.display = "block"; }
function hide(el) { if (el) el.style.display = "none"; }

function goHome() {
  hide(getMini()); hide(getNinja()); hide(getQuiz());
  show(getHome());
}

function goMini() {
  // Let pupils in even if the name is blank (no blocking here)
  const name = document.getElementById('home-username')?.value.trim() || "";
  if (name) username = name;

  const hello = document.getElementById('hello-user');
  if (hello) {
    hello.textContent = username
      ? `Hello, ${username}! Choose your times table:`
      : `Choose your times table:`;
  }

  hide(getHome()); hide(getNinja()); hide(getQuiz());
  show(getMini());
}

function goNinja() {
  const name = document.getElementById('home-username')?.value.trim() || "";
  if (name) username = name;

  hide(getHome()); hide(getMini()); hide(getQuiz());
  show(getNinja());
}

function quitToMini() {
  if (timer) { clearInterval(timer); timer = null; }
  hide(getQuiz());
  show(getMini());
}

/******************** UI BUILDERS ********************/
function buildTableButtons() {
  const container = document.getElementById('table-choices');
  if (!container) return;
  container.innerHTML = '';
  TABLES.forEach(b => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    btn.id = `btn-${b}`;
    btn.textContent = `${b}×`;
    btn.addEventListener('click', () => selectTable(b));
    container.appendChild(btn);
  });
}

/* Build the keypad only if it isn't present (robust across screen switches) */
function buildKeypadIfNeeded() {
  const pad = getPadEl();
  const aEl = getAnswerEl();
  if (!pad || !aEl) return;

  pad.classList.add('calc-pad'); // ensure grid class exists

  if (pad.childElementCount > 0) {
    pad.style.display = "grid";
    return; // already built
  }

  const MAX_LEN = 4;
  const labels = ['7','8','9','⌫', '4','5','6','Enter', '1','2','3', '0','Clear'];
  const posClassMap = {
    '7':'key-7','8':'key-8','9':'key-9','⌫':'key-back',
    '4':'key-4','5':'key-5','6':'key-6','Enter':'key-enter',
    '1':'key-1','2':'key-2','3':'key-3','0':'key-0','Clear':'key-clear'
  };

  labels.forEach((label) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('aria-label', label === '⌫' ? 'Backspace' : label);

    if (label === 'Enter') btn.classList.add('calc-btn--enter');
    if (label === 'Clear') btn.classList.add('calc-btn--clear');
    if (label === '⌫')     btn.classList.add('calc-btn--back');

    btn.classList.add(posClassMap[label]); // grid area placement

    // Single-event to avoid duplicate input on touch devices
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isIOSLike()) aEl.blur();
      handlePadPress(label);
    });

    pad.appendChild(btn);
  });

  function handlePadPress(label) {
    switch (label) {
      case 'Clear':
        aEl.value = '';
        aEl.dispatchEvent(new Event('input', { bubbles: true }));
        break;
      case '⌫':
        aEl.value = aEl.value.slice(0, -1);
        aEl.dispatchEvent(new Event('input', { bubbles: true }));
        break;
      case 'Enter':
        if (!timerStarted) { startTimer(); timerStarted = true; }
        window.handleKey({ key: 'Enter' });
        break;
      default:
        if (/^\d$/.test(label)) {
          if (aEl.value.length >= MAX_LEN) return;
          aEl.value += label;
          aEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
  }

  // Restrict hardware typing (attach once)
  aEl.addEventListener('keydown', (e) => {
    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Enter'];
    if (allowed.includes(e.key)) return;
    if (!/^\d$/.test(e.key)) e.preventDefault();
    if (aEl.value.length >= MAX_LEN && /^\d$/.test(e.key)) e.preventDefault();
  }, { once: true });

  pad.style.display = "grid";
}

/******************** SELECTION ********************/
function selectTable(base) {
  selectedBase = base;
  TABLES.forEach(b => {
    const el = document.getElementById(`btn-${b}`);
    if (el) el.classList.toggle("selected", b === base);
  });
}

/* Init: highlight Baseline, build table buttons + (optionally) keypad after DOM ready */
(function initModeSelection(){
  const elB = document.getElementById('mode-baseline');
  const elT = document.getElementById('mode-tester');
  if (elB && elT) {
    elB.classList.add('selected');
    elT.classList.remove('selected');
  }
})();
document.addEventListener('DOMContentLoaded', buildTableButtons);
// Optional early build; the definitive build happens when quiz screen is shown
document.addEventListener('DOMContentLoaded', buildKeypadIfNeeded);

/******************** QUESTION BUILDER ********************/
function buildQuestions(base) {
  const perSet = (mode === 'tester') ? 4 : 10; // tester=4, baseline=10

  const mul1 = []; for (let i = 0; i <= 12; i++) mul1.push({ q: `${base} × ${i}`, a: base * i });
  const mul2 = []; for (let i = 0; i <= 12; i++) mul2.push({ q: `${i} × ${base}`, a: base * i });
  const div  = []; for (let i = 0; i <= 12; i++) div.push({ q: `${base * i} ÷ ${base}`, a: i });

  const set1 = mul1.sort(() => 0.5 - Math.random()).slice(0, perSet);
  const set2 = mul2.sort(() => 0.5 - Math.random()).slice(0, perSet);
  const set3 = div.sort(() => 0.5 - Math.random()).slice(0, perSet);

  return [...set1, ...set2, ...set3];
}

/******************** QUIZ FLOW ********************/
function startQuiz() {
  if (!selectedBase) { alert("Please choose a times table (2×–12×)."); return; }

  // Require a name before starting the actual test
  if (!username) {
    const name = document.getElementById('home-username')?.value.trim() || "";
    if (!name) { alert("Please enter your name on the home page first."); return; }
    username = name;
  }

  if (timer) { clearInterval(timer); timer = null; }
  time = (mode === 'tester') ? 30 : 90;
  timerStarted = false;
  ended = false;
  score = 0;
  current = 0;
  userAnswers = [];
  const tEl = getTimerEl();
  const initMin = Math.floor(time / 60);
  const initSec = time % 60;
  if (tEl) tEl.textContent = `Time left: ${initMin}:${initSec < 10 ? "0" : ""}${initSec}`;

  allQuestions = buildQuestions(selectedBase);

  hide(getHome()); hide(getMini()); hide(getNinja());
  show(getQuiz());

  const modeLabel = (mode === 'tester') ? ' (Tester)' : '';
  const welcome = document.getElementById("welcome-user");
  if (welcome) welcome.textContent = `Practising ${selectedBase}×${modeLabel}`;

  const aEl = getAnswerEl();
  if (aEl) {
    aEl.style.display = "inline-block";
    aEl.disabled = false;

    // iPad keyboard suppression
    if (isIOSLike()) {
      aEl.readOnly = true;
      aEl.setAttribute('inputmode', 'none');
      aEl.setAttribute('tabindex', '-1');
      aEl.blur();
      aEl.addEventListener('touchstart', preventSoftKeyboard, { passive: false });
      aEl.addEventListener('mousedown', preventSoftKeyboard, { passive: false });
      aEl.addEventListener('focus', preventSoftKeyboard, true);
    } else {
      aEl.readOnly = false;
      aEl.setAttribute('inputmode', 'numeric');
      aEl.removeAttribute('tabindex');
      aEl.removeEventListener('touchstart', preventSoftKeyboard);
      aEl.removeEventListener('mousedown', preventSoftKeyboard);
      aEl.removeEventListener('focus', preventSoftKeyboard, true);
    }
  }

  // Ensure keypad exists and is visible — build AFTER showing quiz screen
  buildKeypadIfNeeded();
  const pad = getPadEl();
  if (pad) pad.style.display = "grid";

  showQuestion();
}

function showQuestion() {
  const qEl = getQEl();
  const aEl = getAnswerEl();

  if (current < allQuestions.length && !ended) {
    if (qEl) qEl.textContent = allQuestions[current].q;
    if (aEl) {
      aEl.value = "";
      aEl.disabled = false;
      aEl.style.display = "inline-block";

      if (isIOSLike()) {
        aEl.readOnly = true;
        aEl.setAttribute('inputmode', 'none');
        aEl.setAttribute('tabindex', '-1');
        aEl.blur();
      } else {
        aEl.readOnly = false;
        aEl.setAttribute('inputmode', 'numeric');
        aEl.removeAttribute('tabindex');
        setTimeout(() => aEl.focus(), 0);
      }
    }

    const pad = getPadEl();
    if (pad) pad.style.display = "grid";
  } else {
    endQuiz();
  }
}

function handleKey(e) {
  if (e.key !== "Enter" || ended) return;
  if (!timerStarted) { startTimer(); timerStarted = true; }

  const aEl = getAnswerEl();
  const raw = (aEl?.value || "").trim();
  const userAns = raw === "" ? NaN : parseInt(raw, 10);
  userAnswers.push(isNaN(userAns) ? "" : userAns);

  if (!isNaN(userAns) && userAns === allQuestions[current].a) {
    score++;
  }
  current++;
  showQuestion();
}

/******************** TIMER ********************/
function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    time--;
    const tEl = getTimerEl();
    const min = Math.floor(time / 60);
    const sec = time % 60;
    if (tEl) tEl.textContent = `Time left: ${min}:${sec < 10 ? "0" : ""}${sec}`; // hidden by CSS
    if (time <= 0) {
      endQuiz();
    }
  }, 1000);
}

/******************** END & SUBMIT ********************/
function endQuiz() {
  if (ended) return;
  ended = true;

  if (timer) { clearInterval(timer); timer = null; }

  const qEl = getQEl();
  const aEl = getAnswerEl();
  const tEl = getTimerEl();
  const pad = getPadEl();
  const sEl = getScoreEl();

  if (qEl) qEl.textContent = "";
  if (aEl) aEl.style.display = "none";
  if (pad) pad.style.display = "none";
  if (tEl) tEl.style.display = "none";

  // Restore input behavior
  if (aEl) {
    aEl.readOnly = false;
    aEl.setAttribute('inputmode', 'numeric');
    aEl.removeAttribute('tabindex');
    aEl.removeEventListener('touchstart', preventSoftKeyboard);
    aEl.removeEventListener('mousedown', preventSoftKeyboard);
    aEl.removeEventListener('focus', preventSoftKeyboard, true);
  }

  const asked = Math.min(current, allQuestions.length);
  const total = allQuestions.length;

  if (sEl) {
    sEl.innerHTML = `${username}, you scored ${score}/${total} <br><br>
      <button onclick="showAnswers()" style="font-size:32px; padding:15px 40px;">Click to display answers</button>`;
  }

  const submissionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const modeMark = (mode === 'tester') ? ' (tester)' : '';
  const tableStr = `${selectedBase}x${modeMark}`.trim();

  const payload = {
    id: submissionId,
    secret: SHEET_SECRET,
    table: tableStr,
    name: username,
    score,
    asked,
    total,
    date: new Date().toISOString(),
    device: navigator.userAgent
  };

  if (!payload.id || !payload.table) {
    alert("Missing id or table — not sending");
    return;
  }

  queueSubmission(payload);
  flushQueue();
}

/******************** ANSWER REVIEW ********************/
function showAnswers() {
  const sEl = getScoreEl();
  if (!sEl) return;
  let html = "<div style='display:flex; flex-wrap:wrap; justify-content:center;'>";
  allQuestions.forEach((q, i) => {
    const userAns = userAnswers[i] !== undefined ? userAnswers[i] : "";
    const correct = userAns === q.a;
    const color = correct ? "green" : "red";
    html += `<div style="width: 30%; min-width:260px; margin:10px; font-size:24px; color:${color}; font-weight:bold;">
      ${q.q} = ${userAns}
    </div>`;
  });
  html += "</div>";
  sEl.innerHTML += html;
}

/******************** EXPOSED FUNCTIONS ********************/
window.goHome = goHome;
window.goMini = goMini;
window.goNinja = goNinja;
window.quitToMini = quitToMini;
window.selectTable = selectTable;
window.selectMode  = selectMode;
window.startQuiz   = startQuiz;
window.handleKey   = handleKey;
