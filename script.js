/******** Google Sheet endpoint (multi-device) ********/
const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbyIuCIgbFisSKqA0YBtC5s5ATHsHXxoqbZteJ4en7hYrf4AXmxbnMOUfeQ2ERZIERN-/exec"; // Your Web App /exec URL
const SHEET_SECRET   = "Banstead123";   // must match SECRET in your Apps Script
/******************************************************/

/********* Offline/refresh-safe queue for submissions *********/
let pendingSubmissions = JSON.parse(localStorage.getItem("pendingSubmissions") || "[]");
let isFlushing = false;

function saveQueue_() { localStorage.setItem("pendingSubmissions", JSON.stringify(pendingSubmissions)); }

function queueSubmission(payload) {
  // Require id + table before queuing
  if (!payload || !payload.id || !payload.table) {
    console.warn("Not queuing bad payload (missing id/table):", payload);
    return;
  }
  if (pendingSubmissions.some(p => p.id === payload.id)) return; // prevent duplicate queue entries
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
      // Skip any legacy/bad entries defensively
      if (!payload || !payload.id || !payload.table) {
        console.warn("Skipping bad queued payload:", payload);
        continue;
      }
      await fetch(SHEET_ENDPOINT, {
        method: "POST",
        mode: "no-cors", // avoid CORS preflight
        // IMPORTANT: do NOT set Content-Type header; send as text/plain Blob
        body: new Blob([JSON.stringify(payload)], { type: "text/plain;charset=utf-8" })
      });
      // success: drop it
    } catch (e) {
      remaining.push(payload); // keep to retry later
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
let time = 90;             // will be set per mode on start
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
const padEl = document.getElementById("answer-pad"); // <-- keypad container

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
  mode = m; // 'baseline' or 'tester'
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

  // Reset run state
  if (timer) { clearInterval(timer); timer = null; }
  time = (mode === 'tester') ? 30 : 90; // timer per mode
  timerStarted = false;
  ended = false;
  score = 0;
  current = 0;
  userAnswers = [];
  const initMin = Math.floor(time / 60);
  const initSec = time % 60;
  tEl.textContent = `Time left: ${initMin}:${initSec < 10 ? "0" : ""}${initSec}`;

  // Build Qs
  allQuestions = buildQuestions(selectedBase);

  // Show UI
  document.getElementById("login-container").style.display = "none";
  document.getElementById("quiz-container").style.display = "block";
  const modeLabel = (mode === 'tester') ? ' (Tester)' : '';
  document.getElementById("welcome-user").textContent =
    `Good luck, ${username}! Practising ${selectedBase}×${modeLabel}`;

  // Prepare input
  aEl.style.display = "inline-block";
  aEl.disabled = false;

  showQuestion();
}

function showQuestion() {
  if (current < allQuestions.length && !ended) {
    qEl.textContent = allQuestions[current].q;
    aEl.value = "";
    aEl.disabled = false;
    aEl.style.display = "inline-block";
    if (padEl) padEl.style.display = "grid"; // <-- show keypad with each question
    setTimeout(() => aEl.focus(), 0);
  } else {
    endQuiz();
  }
}

function handleKey(e) {
  if (e.key !== "Enter" || ended) return;
  if (!timerStarted) { startTimer(); timerStarted = true; }

  const raw = aEl.value.trim();
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
    const min = Math.floor(time / 60);
    const sec = time % 60;
    tEl.textContent = `Time left: ${min}:${sec < 10 ? "0" : ""}${sec}`;
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

  qEl.textContent = "";
  aEl.style.display = "none";
  if (padEl) padEl.style.display = "none"; // <-- hide keypad at end
  tEl.style.display = "none";

  const asked = Math.min(current, allQuestions.length);
  const total = allQuestions.length;

  sEl.innerHTML = `${username}, you scored ${score}/${total} <br><br>
    <button onclick="showAnswers()" style="font-size:32px; padding:15px 40px;">Click to display answers</button>`;

  // ----- Build payload correctly -----
  const submissionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const modeMark = (mode === 'tester') ? ' (tester)' : '';
  const tableStr = `${selectedBase}x${modeMark}`.trim(); // e.g. "3x" or "3x (tester)"

  const payload = {
    id: submissionId,                // REQUIRED
    secret: SHEET_SECRET,            // REQUIRED
    table: tableStr,                 // REQUIRED
    name: username,
    score,
    asked,
    total,
    date: new Date().toISOString(),
    device: navigator.userAgent
  };

  // Guard: don't send if id/table are missing
  if (!payload.id || !payload.table) {
    alert("Missing id or table — not sending");
    return;
  }

  // Queue + flush
  queueSubmission(payload);
  flushQueue();
}

/******************** ANSWER REVIEW ********************/
function showAnswers() {
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

// Expose to HTML (must be at the end so onclick handlers can find them)
window.selectTable = selectTable;
window.selectMode  = selectMode;
window.startQuiz   = startQuiz;
window.handleKey   = handleKey;

/* ============================================================
   ON-SCREEN KEYPAD (creates buttons inside #answer-pad)
   - Taps fill the #answer input
   - "⌫" deletes one digit, "Clear" wipes, "Enter" calls handleKey()
   ============================================================ */
(function () {
  if (!padEl || !aEl) return;

  const MAX_LEN = 4; // change or set to null to allow any length
  const labels = [
    '1','2','3',
    '4','5','6',
    '7','8','9',
    '⌫','0','Clear',
    'Enter'
  ];

  // Build the buttons
  labels.forEach((label) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('aria-label', label === '⌫' ? 'Backspace' : label);
    if (label === 'Enter') btn.classList.add('span-3');
    btn.addEventListener('click', () => handlePress(label));
    padEl.appendChild(btn);
  });

  function handlePress(label) {
    switch (label) {
      case 'Clear':
        aEl.value = '';
        aEl.dispatchEvent(new Event('input', { bubbles: true }));
        aEl.focus();
        break;
      case '⌫':
        aEl.value = aEl.value.slice(0, -1);
        aEl.dispatchEvent(new Event('input', { bubbles: true }));
        aEl.focus();
        break;
      case 'Enter':
        // Trigger your existing flow exactly as if Enter was pressed
        window.handleKey({ key: 'Enter' });
        break;
      default:
        if (/^\d$/.test(label)) {
          if (typeof MAX_LEN === 'number' && aEl.value.length >= MAX_LEN) return;
          aEl.value += label;
          aEl.dispatchEvent(new Event('input', { bubbles: true }));
          aEl.focus();
        }
    }
  }

  // Optional: restrict hardware keyboard to digits (keeps Backspace/Delete/Arrows/Tab/Enter)
  aEl.addEventListener('keydown', (e) => {
    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Enter'];
    if (allowed.includes(e.key)) return;
    if (!/^\d$/.test(e.key)) e.preventDefault();
    if (typeof MAX_LEN === 'number' && aEl.value.length >= MAX_LEN && /^\d$/.test(e.key)) {
      e.preventDefault();
    }
  });
})();
