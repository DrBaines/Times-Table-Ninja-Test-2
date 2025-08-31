/* =========================================================
   Times Tables Trainer - Script (frontpage-14)
   - Desktop/laptop keyboard typing fixed & hardened
   - Global key routing to the answer box (0–9, Backspace, Delete, Enter)
   - Tester removed (baseline only)
   - White Ninja Belt (3× & 4×): 30Q / 90s baseline format
   ========================================================= */

/******** Google Sheet endpoint (multi-device) ********/
const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbyIuCIgbFisSKqA0YBtC5s5ATHsHXxoqbZteJ4en7hYrf4AXmxbnMOUfeQ2ERZIERN-/exec";
const SHEET_SECRET   = "Banstead123";
/******************************************************/

/********* Offline/refresh-safe queue for submissions *********/
let pendingSubmissions = JSON.parse(localStorage.getItem("pendingSubmissions") || "[]");
let isFlushing = false;
function saveQueue_(){ localStorage.setItem("pendingSubmissions", JSON.stringify(pendingSubmissions)); }
function queueSubmission(payload){
  if (!payload || !payload.id || !payload.table) { console.warn("Not queuing bad payload:", payload); return; }
  if (pendingSubmissions.some(p => p.id === payload.id)) return;
  pendingSubmissions.push(payload); saveQueue_();
}
async function flushQueue(){
  if (isFlushing || !pendingSubmissions.length) return;
  isFlushing = true;
  const remaining = [];
  for (const payload of pendingSubmissions){
    try {
      if (!payload || !payload.id || !payload.table) { console.warn("Skipping bad queued payload:", payload); continue; }
      await fetch(SHEET_ENDPOINT, { method: "POST", mode: "no-cors",
        body: new Blob([JSON.stringify(payload)], { type: "text/plain;charset=utf-8" }) });
    } catch (e){ remaining.push(payload); console.error("Flush failed, will retry:", e); }
  }
  pendingSubmissions = remaining; saveQueue_(); isFlushing = false;
}
window.addEventListener("online", flushQueue);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") flushQueue(); });
window.addEventListener("pagehide", () => {
  try { if (!pendingSubmissions.length) return;
    const payload = new Blob([JSON.stringify({ pending: pendingSubmissions })], { type: "text/plain;charset=utf-8" });
    navigator.sendBeacon?.(SHEET_ENDPOINT, payload);
  } catch(_) {}
});
window.addEventListener("DOMContentLoaded", flushQueue);

/******************** STATE ********************/
let selectedBase = null;         // for Mini: 2..12
let quizType = 'single';         // 'single' | 'ninja'
let ninjaName = '';              // e.g., 'White Ninja Belt'
const NINJA_QUESTIONS = 30;      // Baseline: 30
const NINJA_TIME = 90;           // Baseline time

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
  const a = getAnswer(); if (a && a.readOnly){ e.preventDefault(); a.blur(); }
}

/******************** SMALL UI HELPERS ********************/
function show(el){ if(el) el.style.display = "block"; }
function hide(el){ if(el) el.style.display = "none"; }
function clearResultsUI(){ const s = getScoreEl(); if (s) s.innerHTML = ""; }

/******************** NAME PERSISTENCE ********************/
(function bootstrapName(){
  const saved = localStorage.getItem('ttt_username') || '';
  if (saved) {
    username = saved;
    const input = $('home-username'); if (input) input.value = saved;
    const hello = $('hello-user'); if (hello) hello.textContent = `Hello, ${username}!`;
  }
})();
function setUsernameFromHome(){
  const name = $('home-username')?.value.trim() || "";
  if (name){ username = name; try { localStorage.setItem('ttt_username', username); } catch(_){} }
}

/******************** NAVIGATION ********************/
function goHome(){ clearResultsUI(); hide(getMini()); hide(getNinja()); hide(getQuiz()); show(getHome()); }
function goMini(){
  setUsernameFromHome();
  const hello = $('hello-user'); if (hello) hello.textContent = username ? `Hello, ${username}!` : "";
  clearResultsUI(); hide(getHome()); hide(getNinja()); hide(getQuiz()); show(getMini());
}
function goNinja(){ setUsernameFromHome(); clearResultsUI(); hide(getHome()); hide(getMini()); hide(getQuiz()); show(getNinja()); }
function quitToMini(){ if (timer){ clearInterval(timer); timer = null; } clearResultsUI(); hide(getQuiz()); show(getMini()); }

/******************** UI BUILDERS ********************/
function buildTableButtons(){
  const container = $('table-choices'); if (!container) return;
  container.innerHTML = '';
  TABLES.forEach(b => { const btn = document.createElement('button');
    btn.type = "button"; btn.className = "choice"; btn.id = `btn-${b}`; btn.textContent = `${b}×`;
    btn.addEventListener('click', () => selectTable(b)); container.appendChild(btn);
  });
}

/* Answer Echo (for iOS readOnly visual refresh issues) */
function ensureAnswerEcho(){
  let echo = $('answer-echo');
  if (!echo){
    echo = document.createElement('div'); echo.id='answer-echo'; echo.className='answer-echo';
    const a=getAnswer(); if (a && a.parentElement){ a.parentElement.insertBefore(echo, a.nextSibling); }
  }
  return echo;
}
function updateAnswerEcho(){
  const a = getAnswer(); if (!a) return; const echo = ensureAnswerEcho(); const useEcho = isIOSLike();
  if (useEcho){ echo.style.display = "block"; echo.textContent = (a.value || ""); } else { echo.style.display = "none"; }
}

/* Build the keypad if missing, and always force it visible */
function buildKeypadIfNeeded(){
  const pad = getPadEl(); const a = getAnswer(); if (!pad || !a) return;
  pad.classList.add('calc-pad');
  if (pad.childElementCount === 0){
    const labels = ['7','8','9','⌫', '4','5','6','Enter', '1','2','3', '0','Clear'];
    const pos = { '7':'key-7','8':'key-8','9':'key-9','⌫':'key-back','4':'key-4','5':'key-5','6':'key-6','Enter':'key-enter','1':'key-1','2':'key-2','3':'key-3','0':'key-0','Clear':'key-clear' };
    labels.forEach(label => {
      const btn = document.createElement('button'); btn.type='button'; btn.textContent=label;
      btn.setAttribute('aria-label', label==='⌫'?'Backspace':label);
      if (label==='Enter') btn.classList.add('calc-btn--enter');
      if (label==='Clear') btn.classList.add('calc-btn--clear');
      if (label==='⌫')     btn.classList.add('calc-btn--back');
      btn.classList.add(pos[label]);
      btn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); e.stopPropagation(); if (isIOSLike()) getAnswer()?.blur(); handlePadPress(label); });
      pad.appendChild(btn);
    });
  }
  pad.style.display = "grid";

  function handlePadPress(label){
    const a = getAnswer(); if (!a) return;
    switch(label){
      case 'Clear': a.value=''; a.dispatchEvent(new Event('input',{bubbles:true})); updateAnswerEcho(); break;
      case '⌫': a.value=a.value.slice(0,-1); a.dispatchEvent(new Event('input',{bubbles:true})); updateAnswerEcho(); break;
      case 'Enter': if (!timerStarted){ startTimer(); timerStarted = true; } window.handleKey({ key:'Enter' }); updateAnswerEcho(); break;
      default:
        if (/^\d$/.test(label)){
          if (a.value.length>=MAX_ANSWER_LEN) return;
          a.value += label;
          try { a.setSelectionRange(a.value.length, a.value.length); } catch(_) {}
          a.dispatchEvent(new Event('input',{bubbles:true}));
          updateAnswerEcho();
        }
    }
  }
}

/******************** SELECTION (Mini) ********************/
function selectTable(base){
  selectedBase = base;
  TABLES.forEach(b => { const el = $(`btn-${b}`); if (el) el.classList.toggle('selected', b === base); });
}
(function init(){
  document.addEventListener('DOMContentLoaded', buildTableButtons);
})();

/******************** QUESTION BUILDERS ********************/
/* Mini baseline: always 30 (10 mul1, 10 mul2, 10 div) */
function buildQuestionsSingle(base){
  const mul1=[]; for(let i=0;i<=12;i++) mul1.push({q:`${i} × ${base}`, a:base*i});
  const mul2=[]; for(let i=0;i<=12;i++) mul2.push({q:`${base} × ${i}`, a:base*i});
  const div =[]; for(let i=0;i<=12;i++) div.push({q:`${base*i} ÷ ${base}`, a:i});
  const set1 = mul1.sort(()=>0.5-Math.random()).slice(0,10);
  const set2 = mul2.sort(()=>0.5-Math.random()).slice(0,10);
  const set3 = div .sort(()=>0.5-Math.random()).slice(0,10);
  return [...set1, ...set2, ...set3];
}

/* Exact Baseline-style 30Q builder for mixed 3 & 4 */
function buildQuestionsMixedBaseline34(){
  const bases = [3,4];
  const pickBase = () => bases[Math.floor(Math.random()*bases.length)];
  const randI = () => Math.floor(Math.random()*13); // 0..12

  const first10 = [];  // * × 3 or 4
  for (let k=0;k<10;k++){ const b = pickBase(); const i = randI(); first10.push({ q: `${i} × ${b}`, a: i*b }); }

  const next10 = [];   // 3 or 4 × *
  for (let k=0;k<10;k++){ const b = pickBase(); const i = randI(); next10.push({ q: `${b} × ${i}`, a: i*b }); }

  const last10 = [];   // * ÷ 3 or 4
  for (let k=0;k<10;k++){ const b = pickBase(); const i = randI(); last10.push({ q: `${b*i} ÷ ${b}`, a: i }); }

  return [...first10, ...next10, ...last10];
}

/******************** QUIZ FLOW ********************/
function startQuiz(){ // Mini (baseline)
  quizType = 'single';
  if (!selectedBase){ alert("Please choose a times table (2×–12×)."); return; }
  preflightAndStart(() => buildQuestionsSingle(selectedBase), `Practising ${selectedBase}×`, 90);
}

function startWhiteBelt(){ // Ninja: White (3 & 4 mixed, baseline style)
  quizType = 'ninja';
  ninjaName = 'White Ninja Belt';
  preflightAndStart(buildQuestionsMixedBaseline34, `${ninjaName} — 3× & 4× (30Qs / 90s)`, NINJA_TIME);
}

function preflightAndStart(qBuilder, welcomeText, timerSeconds){
  clearResultsUI();
  if (!username){
    const name = $('home-username')?.value.trim() || "";
    if (!name){ alert("Please enter your name on the home page first."); return; }
    username = name; try { localStorage.setItem('ttt_username', username); } catch(_) {}
  }
  if (timer){ clearInterval(timer); timer = null; }
  time = timerSeconds; timerStarted = false; ended = false; score = 0; current = 0; userAnswers = [];
  const t = getTimerEl(); const m = Math.floor(time/60), s = time%60; if (t) t.textContent = `Time left: ${m}:${s<10?"0":""}${s}`;

  allQuestions = qBuilder();

  hide(getHome()); hide(getMini()); hide(getNinja()); show(getQuiz());
  const welcome = $("welcome-user"); if (welcome) welcome.textContent = welcomeText;

  const a = getAnswer();
  if (a){
    a.value = "";
    a.style.display = "inline-block"; a.disabled = false;

    if (!isIOSLike()){
      // Desktop/laptop: fully enable typing & focus
      a.readOnly = false;
      a.removeAttribute('tabindex');
      a.setAttribute('inputmode','numeric');

      // Keep only digits, cap length
      a.oninput = () => { a.value = a.value.replace(/\D+/g, '').slice(0, MAX_ANSWER_LEN); };

      // Submit on Enter
      a.onkeydown = (e) => { if (e.key === 'Enter') handleKey(e); };

      const echo = $('answer-echo'); if (echo) echo.style.display = "none";
      setTimeout(()=>a.focus(), 0);
    } else {
      // iOS-like path: keypad only (no soft keyboard)
      a.readOnly = true; a.setAttribute('inputmode','none'); a.setAttribute('tabindex','-1'); a.blur();
      a.addEventListener('touchstart', preventSoftKeyboard, {passive:false});
      a.addEventListener('mousedown',  preventSoftKeyboard, {passive:false});
      a.addEventListener('focus',      preventSoftKeyboard, true);
      updateAnswerEcho();
    }
  }

  const pad = getPadEl(); if (pad){ pad.innerHTML = ''; pad.style.display = 'grid'; }
  buildKeypadIfNeeded();

  // 🔑 Global key routing (desktop): send digits/backspace/delete/enter to the answer box
  if (!isIOSLike()){
    window.onkeydown = (e) => {
      const a = getAnswer();
      const quizVisible = getQuiz() && getQuiz().style.display !== "none";
      if (!quizVisible || !a || ended) return;

      // Route digits
      if (/^\d$/.test(e.key)){
        e.preventDefault();
        if (a.value.length < MAX_ANSWER_LEN){
          a.value += e.key;
          a.dispatchEvent(new Event('input', { bubbles:true }));
        }
        try { a.setSelectionRange(a.value.length, a.value.length); } catch(_) {}
      }
      // Backspace / Delete
      else if (e.key === 'Backspace' || e.key === 'Delete'){
        e.preventDefault();
        a.value = a.value.slice(0, -1);
        a.dispatchEvent(new Event('input', { bubbles:true }));
      }
      // Enter submits
      else if (e.key === 'Enter'){
        e.preventDefault();
        handleKey({ key:'Enter' });
      }
    };
  }

  showQuestion();
}

function showQuestion(){
  const q = getQEl(); const a = getAnswer();
  if (current < allQuestions.length && !ended){
    if (q) q.textContent = allQuestions[current].q;
    if (a){
      a.value = ""; a.disabled = false; a.style.display = "inline-block";
      if (!isIOSLike()){
        a.readOnly = false; a.removeAttribute('tabindex'); a.setAttribute('inputmode','numeric');
        const echo=$('answer-echo'); if (echo) echo.style.display="none";
        setTimeout(()=>a.focus(), 0);
      } else {
        a.readOnly = true; a.setAttribute('inputmode','none'); a.setAttribute('tabindex','-1'); a.blur();
        updateAnswerEcho();
      }
    }
    const pad = getPadEl(); if (pad) pad.style.display = "grid";
  } else { endQuiz(); }
}

function handleKey(e){
  if (e.key !== "Enter" || ended) return;
  if (!timerStarted){ startTimer(); timerStarted = true; }

  const a = getAnswer();
  const raw = (a?.value || "").trim();
  const userAns = raw === "" ? NaN : parseInt(raw, 10);
  userAnswers.push(isNaN(userAns) ? "" : userAns);

  if (!isNaN(userAns) && userAns === allQuestions[current].a) score++;
  current++; showQuestion();
}

/******************** TIMER (hidden UI) ********************/
function startTimer(){
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    time--;
    const t = getTimerEl(); const m = Math.floor(time/60), s = time%60;
    if (t) t.textContent = `Time left: ${m}:${s<10?"0":""}${s}`; // hidden by CSS
    if (time <= 0) endQuiz();
  }, 1000);
}

/******************** END & SUBMIT ********************/
function endQuiz(){
  if (ended) return; ended = true;
  if (timer){ clearInterval(timer); timer = null; }
  if (!isIOSLike()){ window.onkeydown = null; } // remove global key routing

  const q = getQEl(), a = getAnswer(), t = getTimerEl(), pad = getPadEl(), s = getScoreEl();
  if (q) q.textContent = ""; if (a) a.style.display = "none"; if (pad) pad.style.display = "none"; if (t) t.style.display = "none";
  const echo = $('answer-echo'); if (echo) echo.style.display = "none";

  if (a){
    a.readOnly = false; a.setAttribute('inputmode','numeric'); a.removeAttribute('tabindex');
    a.removeEventListener('touchstart', preventSoftKeyboard);
    a.removeEventListener('mousedown',  preventSoftKeyboard);
    a.removeEventListener('focus',      preventSoftKeyboard, true);
  }

  const asked = Math.min(current, allQuestions.length);
  const total = allQuestions.length;

  if (s){
    s.innerHTML = `${username}, you scored ${score}/${total} <br><br>
      <button id="btn-show-answers" style="font-size:32px; padding:15px 40px;">Click to display answers</button>`;
    const btn = document.getElementById('btn-show-answers'); if (btn) btn.onclick = showAnswers;
  }

  const submissionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tableStr = (quizType === 'single') ? `${selectedBase}x` : `White Ninja Belt (3&4)`;
  const uaSafe = String(navigator.userAgent || '').slice(0, 180);

  const payload = { id: submissionId, secret: SHEET_SECRET, table: tableStr, name: username,
                    score, asked, total, date: new Date().toISOString(), device: uaSafe };
  if (!payload.id || !payload.table){ alert("Missing id or table — not sending"); return; }
  queueSubmission(payload); flushQueue();
}

/******************** ANSWER REVIEW ********************/
function showAnswers(){
  const s = getScoreEl(); if (!s) return;
  let html = "<div style='display:flex; flex-wrap:wrap; justify-content:center;'>";
  allQuestions.forEach((q,i) => {
    const userAns = (userAnswers[i] !== undefined && userAnswers[i] !== "") ? userAnswers[i] : "—";
    const correct = (userAnswers[i] === q.a);
    const color = correct ? "green" : "red";
    html += `<div style="width: 30%; min-width:260px; margin:10px; font-size:24px; font-weight:bold; color:${color};">
      ${q.q} = ${userAns}
    </div>`;
  });
  html += "</div>";
  s.innerHTML += html;
}

/******************** EXPORTS (used by HTML) ********************/
window.goHome = goHome;
window.goMini = goMini;
window.goNinja = goNinja;
window.quitToMini = quitToMini;
window.selectTable = selectTable;
window.startQuiz   = startQuiz;
window.handleKey   = handleKey;
window.startWhiteBelt = startWhiteBelt;
