
/******** Google Sheet endpoint (multi-device) ********/
const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbyIuCIgbFisSKqA0YBtC5s5ATHsHXxoqbZteJ4en7hYrf4AXmxbnMOUfeQ2ERZIERN-/exec"; // e.g., https://script.google.com/macros/s/.../exec
const SHEET_SECRET   = "Banstead123";   // must match SECRET in your Apps Script
/******************************************************/

/********* Offline/refresh-safe queue for submissions *********/
let pendingSubmissions = JSON.parse(localStorage.getItem("pendingSubmissions") || "[]");
let isFlushing = false;

function saveQueue_() {
  localStorage.setItem("pendingSubmissions", JSON.stringify(pendingSubmissions));
}
function queueSubmission(payload) {
  if (pendingSubmissions.some(p => p.id === payload.id)) return; // prevent duplicate queue entries
  pendingSubmissions.push(payload);
  localStorage.setItem("pendingSubmissions", JSON.stringify(pendingSubmissions));
  saveQueue_();
}

async function flushQueue() {
  if (isFlushing) return;
  if (!pendingSubmissions.length) return;
@@ -26,17 +29,15 @@
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      // success → drop from queue
      // success: drop it
    } catch (e) {
      // network failed → keep it to retry later
      remaining.push(payload);
      remaining.push(payload); // keep to retry later
    }
  }
  pendingSubmissions = remaining;
  localStorage.setItem("pendingSubmissions", JSON.stringify(pendingSubmissions));
  saveQueue_();
  isFlushing = false;
}

window.addEventListener("online", flushQueue);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") flushQueue();
@@ -47,128 +48,123 @@
let allQuestions = [];
let current = 0;
let score = 0;
let time = 90; // seconds
let timer;
let time = 90;       // seconds
let timer = null;    // ensure we can clear it
let timerStarted = false;
let ended = false;   // 🔒 prevents double end
let userAnswers = [];
let username = "";

// Elements
// Elements (exist on page load)
const qEl = document.getElementById("question");
const aEl = document.getElementById("answer");
const tEl = document.getElementById("timer");
const sEl = document.getElementById("score");

// Table selection UI
// ===== Table selection helpers (index.html has buttons calling selectTable) =====
function selectTable(base) {
  selectedBase = base;
  // Visual selection
  [2,3,4].forEach(b => {
    const el = document.getElementById(`btn-${b}`);
    if (el) el.classList.toggle("selected", b === base);
  });
}

// Build 30 questions for the chosen base
// Build 30 questions for chosen base (0..12 with reversed/division)
function buildQuestions(base) {
  // First 10 from base × (0..12), random 10
  const mul1 = [];
  for (let i = 0; i <= 12; i++) mul1.push({ q: `${base} × ${i}`, a: base * i });
  const firstTen = mul1.sort(() => 0.5 - Math.random()).slice(0, 10);

  // Next 10 from (0..12) × base, random 10
  const mul2 = [];
  for (let i = 0; i <= 12; i++) mul2.push({ q: `${i} × ${base}`, a: base * i });
  const secondTen = mul2.sort(() => 0.5 - Math.random()).slice(0, 10);

  // Final 10: division facts ((base*i) ÷ base = i), includes 0 ÷ base = 0
  const div = [];
  for (let i = 0; i <= 12; i++) div.push({ q: `${base * i} ÷ ${base}`, a: i });
  const finalTen = div.sort(() => 0.5 - Math.random()).slice(0, 10);
  const mul1 = []; for (let i = 0; i <= 12; i++) mul1.push({ q: `${base} × ${i}`, a: base * i });
  const mul2 = []; for (let i = 0; i <= 12; i++) mul2.push({ q: `${i} × ${base}`, a: base * i });
  const div  = []; for (let i = 0; i <= 12; i++) div.push({ q: `${base * i} ÷ ${base}`, a: i });

  const firstTen  = mul1.sort(() => 0.5 - Math.random()).slice(0, 10);
  const secondTen = mul2.sort(() => 0.5 - Math.random()).slice(0, 10);
  const finalTen  = div.sort(() => 0.5 - Math.random()).slice(0, 10);
  return [...firstTen, ...secondTen, ...finalTen];
}

// Start quiz from welcome screen
// ===== Start quiz =====
function startQuiz() {
  username = document.getElementById("username").value.trim();
  if (!selectedBase) {
    alert("Please choose 2×, 3× or 4×.");
    return;
  }
  if (username === "") {
    alert("Please enter your name to begin.");
    return;
  }

  // Build the questions for the chosen base
  allQuestions = buildQuestions(selectedBase);
  if (!selectedBase) { alert("Please choose 2×, 3× or 4×."); return; }
  if (username === "") { alert("Please enter your name to begin."); return; }

  // Reset run state
  current = 0;
  score = 0;
  if (timer) { clearInterval(timer); timer = null; }
  time = 90;
  timerStarted = false;
  ended = false;              // 🔄 allow answering again
  score = 0;
  current = 0;
  userAnswers = [];
  tEl.textContent = "Time left: 1:30";
  let ended = false;   // add near your other run-state vars (score, time, etc.)
let timer = null;    // make sure timer is declared so we can clear it

  // Build questions for this run
  allQuestions = buildQuestions(selectedBase);

  // Show UI
  document.getElementById("login-container").style.display = "none";
  document.getElementById("quiz-container").style.display = "block";
  document.getElementById("welcome-user").textContent = `Good luck, ${username}! Practising ${selectedBase}×`;

  // Ensure input is usable
  aEl.style.display = "inline-block";
  aEl.disabled = false;

  showQuestion();
}

// Render current question
// ===== Render current question =====
function showQuestion() {
  if (current < allQuestions.length) {
  if (current < allQuestions.length && !ended) {
    qEl.textContent = allQuestions[current].q;
    // Reset and focus the input every question
    aEl.value = "";
    aEl.focus();
    aEl.disabled = false;
    aEl.style.display = "inline-block";
    setTimeout(() => aEl.focus(), 0); // ensure focus after layout
  } else {
    endQuiz();
  }
}

// Handle Enter key to submit an answer

// ===== Handle Enter to submit =====
function handleKey(e) {
  if (e.key !== "Enter" || ended) return;  // ignore after end
  if (!timerStarted) { startTimer(); timerStarted = true; }
  if (e.key !== "Enter" || ended) return; // ignore when ended
  if (!timerStarted) {
    startTimer();
    timerStarted = true;
  }
  const raw = aEl.value.trim();
  const userAns = raw === "" ? NaN : parseInt(raw, 10);
  userAnswers.push(isNaN(userAns) ? "" : userAns);
  if (!isNaN(userAns) && userAns === allQuestions[current].a) score++;

  if (!isNaN(userAns) && userAns === allQuestions[current].a) {
    score++;
  }
  current++;
  showQuestion();   // this may call endQuiz(); guard above stops double-run
  showQuestion(); // will call endQuiz() at the end (guarded)
}

// Countdown
// ===== Countdown =====
function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    time--;
    const min = Math.floor(time / 60);
    const sec = time % 60;
    tEl.textContent = `Time left: ${min}:${sec < 10 ? "0" : ""}${sec}`;
    if (time <= 0) {
      clearInterval(timer);
      endQuiz();
      endQuiz(); // end safely; guard prevents double-run
    }
  }, 1000);
}

// Finish -> show score, then POST to Google Sheet via queue (CORS-safe)
// ===== Finish & queue submission =====
function endQuiz() {
  if (ended) return;          // 🔒 prevent double end
  if (ended) return;  // 🔒 prevent double end
  ended = true;

  if (timer) {                // stop countdown immediately
    clearInterval(timer);
    timer = null;
  }
  if (timer) { clearInterval(timer); timer = null; }

  qEl.textContent = "";
  aEl.style.display = "none";
@@ -181,13 +177,13 @@
  sEl.innerHTML = `${username}, you scored ${score}/${total} <br><br>
    <button onclick="showAnswers()" style="font-size:32px; padding:15px 40px;">Click to display answers</button>`;

  // Unique id for dedup (client + server)
  // Unique id for dedup (server can use it)
  const submissionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const payload = {
    id: submissionId,
    secret: SHEET_SECRET,
    table: `${selectedBase || 2}x`,
    table: `${selectedBase}x`,
    name: username,
    score: score,
    asked: asked,
@@ -196,28 +192,27 @@
    device: navigator.userAgent
  };

  // Queue once; DO NOT send directly here
  // Queue once; flush will send it
  queueSubmission(payload);
  flushQueue();   // ask queue to send
  flushQueue();
}


// Show answers with green/red colouring for entire item
// ===== Answers review =====
function showAnswers() {
  let answersHTML = "<div style='display:flex; flex-wrap:wrap; justify-content:center;'>";
  let html = "<div style='display:flex; flex-wrap:wrap; justify-content:center;'>";
  allQuestions.forEach((q, i) => {
    const userAns = userAnswers[i] !== undefined ? userAnswers[i] : "";
    const correct = userAns === q.a;
    const color = correct ? "green" : "red";
    answersHTML += `<div style="width: 30%; min-width:260px; margin:10px; font-size:24px; color:${color}; font-weight:bold;">
    html += `<div style="width: 30%; min-width:260px; margin:10px; font-size:24px; color:${color}; font-weight:bold;">
      ${q.q} = ${userAns}
    </div>`;
  });
  answersHTML += "</div>";
  sEl.innerHTML += answersHTML;
  html += "</div>";
  sEl.innerHTML += html;
}

// Expose to HTML handlers
// Expose to HTML
window.selectTable = selectTable;
window.startQuiz   = startQuiz;
window.handleKey   = handleKey;
