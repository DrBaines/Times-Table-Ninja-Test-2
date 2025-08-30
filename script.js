/******** Google Sheet endpoint (multi-device) ********/
const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbyIuCIgbFisSKqA0YBtC5s5ATHsHXxoqbZteJ4en7hYrf4AXmxbnMOUfeQ2ERZIERN-/exec"; // Your Web App /exec URL
const SHEET_SECRET   = "Banstead123";   // must match SECRET in your Apps Script
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
let selectedBase = null;   // 2, 3, or 4
let mode = 'baseline';     // 'baseline' | 'tester'
let allQuestions = [];
let current = 0;
let score = 0;
let time = 90;             // set per mode on start
let timer = null;
let timerStarted = false;
let ended = false;
let userAnswers = [];
let username = "";

// Elements
const qEl = document.getElementById("question");
const aEl = document.getElementById("answer");
const tEl = document.getElementById("timer");
const sEl = document.getElementById("score");
const padEl = document.getElementById("answer-pad"); // keypad container

/******************** SELECTION ********************/
function selectTable(base) {
  selectedBase = base;
  [2,3,4].forEach(b => {
    const el = document.getElementById(`btn-${b}`);
    if (el) el.classList.toggle("selected", b === base);
  });
}

// Default highlight: set Baseline selected on load
(function initModeSelection(){
  const elB = document.getElementById('mode-baseline');
  const elT = document.getElementById('mode-tester');
  if (elB && elT) {
    elB.classList.add('selected');
    elT.classList.remove('selected');
  }
})();

function selectMode(m) {
  mode = m;
  const elB = document.getElementById('mode-baseline');
  const elT = document.getElementById('mode-tester');
  if (elB && elT) {
    elB.classList.toggle('selected', mode === 'baseline');
    elT.classList.toggle('selected', mode === 'tester');
  }
}

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
  username = document.getElementById("username").value.trim();
  if (!selectedBase) { alert("Please choose 2×, 3× or 4×."); return; }
  if (username === "") { alert("Please enter your name to begin."); return; }

  if (timer) { clearInterval(timer); timer = null; }
  time = (mode === 'tester') ? 30 : 90;
  timerStarted = false;
  ended = false;
  score = 0;
  current = 0;
  userAnswers = [];
  const initMin = Math.floor(time / 60);
  const initSec = time % 60;
  tEl.textContent = `Time left: ${initMin}:${initSec < 10 ? "0" : ""}${initSec}`;

  allQuestions = buildQuestions(selectedBase);

  document.getElementById("login-container").style.display = "none";
  document.getElementById("quiz-container").style.display = "block";
  const modeLabel = (mode === 'tester') ? ' (Tester)' : '';
  document.getElementById("welcome-user").textContent =
    `Good luck, ${username}! Practis
