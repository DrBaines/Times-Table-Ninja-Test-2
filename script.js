/* =========================================================
   Times Tables Trainer - Script
   REMINDER: bump versions in index.html when you change files:
   <link rel="stylesheet" href="./styles.css?v=frontpage-6" />
   <script src="./script.js?v=frontpage-6"></script>
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

// Tables offered
const TABLES = [2,3,4,5,6,7,8,9,10,11,12];

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
function isIOSLike() {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadAsMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOS || iPadAsMac;
}
function preventSoftKeyboard(e) {
  const a = getAnswer();
  if (a && a.readOnly) {
    e.preventDefault();
    a.blur();
  }
}

/******************** NAVIGATION ********************/
function show(el){ if(el) el.style.display="block"; }
function hide(el){ if(el) el.style.display="none"; }

function goHome(){ hide(getMini()); hide(getNinja()); hide(getQuiz()); show(getHome()); }

function goMini(){
  const name = $('home-username')?.value.trim() || "";
  if (name) username = name;
  const hello = $('hello-user');
  if (hello) hello.textContent = username ? `Hello, ${username}! Choose your times table:` : `Choose your times table:`;
  hide(getHome()); hide(getNinja()); hide(getQuiz()); show(getMini());
}

function goNinja(){
  const name = $('home-username')?.value.trim() || "";
  if (name) username = name;
  hide(getHome()); hide(getMini()); hide(getQuiz()); show(getNinja());
}

function quitToMini(){
  if (timer) { clearInterval(timer); timer = null; }
  hide(getQuiz()); show(getMini());
}

/******************** UI BUILDERS ********************/
function buildTableButtons(){
  const container = $('table-choices');
  if (!container) return;
  container.innerHTML = '';
  TABLES.forEach(b=>{
    const btn = document.createElement('button');
    btn.type="button"; btn.className="choice"; btn.id=`btn-${b}`; btn.textContent=`${b}×`;
    btn.addEventListener('click', ()=>selectTable(b));
    container.appendChild(btn);
  });
}

/* Build the keypad if missing, and always force it visible */
function buildKeypadIfNeeded(){
  const pad = getPadEl();
  const a = getAnswer();
  if (!pad || !a) return;

  pad.classList.add('calc-pad'); // ensure grid styling
  // If already built, just show it
  if (pad.childElementCount > 0){
    pad.style.display = "grid";
    return;
  }

  const MAX_LEN = 4;
  const labels = ['7','8','9','⌫', '4','5','6','Enter', '1','2','3', '0','Clear'];
  const pos = {
    '7':'key-7','8':'key-8','9':'key-9','⌫':'key-back',
    '4':'key-4','5':'key-5','6':'key-6','Enter':'key-enter',
    '1':'key-1','2':'key-2','3':'key-3','0':'key-0','Clear':'key-clear'
  };

  labels.forEach(label=>{
    const btn = document.createElement('button');
    btn.type='button'; btn.textContent=label;
    btn.setAttribute('aria-label', label==='⌫'?'Backspace':label);
    if (label==='Enter') btn.classList.add('calc-btn--enter');
    if (label==='Clear') btn.classList.add('calc-btn--clear');
    if (label==='⌫')     btn.classList.add('calc-btn--back');
    btn.classList.add(pos[label]);

    btn.addEventListener('pointerdown', (e)=>{
      e.preventDefault(); e.stopPropagation();
      if (isIOSLike()) a.blur();
      handlePadPress(label);
    });
    pad.appendChild(btn);
  });

  function handlePadPress(label){
    switch(label){
      case 'Clear':
        a.value=''; a.dispatchEvent(new Event('input',{bubbles:true})); break;
      case '⌫':
        a.value=a.value.slice(0,-1); a.dispatchEvent(new Event('input',{bubbles:true})); break;
      case 'Enter':
        if (!timerStarted){ startTimer(); timerStarted=true; }
        window.handleKey({ key:'Enter' }); break;
      default:
        if (/^\d$/.test(label)){
          if (a.value.length>=MAX_LEN) return;
          a.value+=label; a.dispatchEvent(new Event('input',{bubbles:true}));
        }
    }
  }

  // Restrict hardware typing (attach once)
  a.addEventListener('keydown',(e)=>{
    const ok = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Enter'];
    if (ok.includes(e.key)) return;
    if (!/^\d$/.test(e.key)) e.preventDefault();
    if (/^\d$/.test(e.key) && a.value.length>=MAX_LEN) e.preventDefault();
  }, { once:true });

  pad.style.display = "grid";
}

/******************** SELECTION ********************/
function selectTable(base){
  selectedBase = base;
  TABLES.forEach(b=>{
    const el = $(`btn-${b}`);
    if (el) el.classList.toggle('selected', b===base);
  });
}

function selectMode(m){
  mode = m;
  const elB = $('mode-baseline');
  const elT = $('mode-tester');
  if (elB && elT){
    elB.classList.toggle('selected', mode==='baseline');
    elT.classList.toggle('selected', mode==='tester');
  }
}

/* Init: highlight Baseline; build table buttons on DOM ready */
(function init(){
  const elB = $('mode-baseline'), elT = $('mode-tester');
  if (elB && elT){ elB.classList.add('selected'); elT.classList.remove('selected'); }
})();
document.addEventListener('DOMContentLoaded', buildTableButtons);

/******************** QUESTION BUILDER ********************/
function buildQuestions(base){
  const perSet = (mode==='tester')? 4 : 10;
  const mul1=[]; for(let i=0;i<=12;i++) mul1.push({q:`${base} × ${i}`, a:base*i});
  const mul2=[]; for(let i=0;i<=12;i++) mul2.push({q:`${i} × ${base}`, a:base*i});
  const div =[]; for(let i=0;i<=12;i++) div.push({q:`${base*i} ÷ ${base}`, a:i});
  const set1 = mul1.sort(()=>0.5-Math.random()).slice(0,perSet);
  const set2 = mul2.sort(()=>0.5-Math.random()).slice(0,perSet);
  const set3 = div .sort(()=>0.5-Math.random()).slice(0,perSet);
  return [...set1,...set2,...set3];
}

/******************** QUIZ FLOW ********************/
function startQuiz(){
  if (!selectedBase){ alert("Please choose a times table (2×–12×)."); return; }

  if (!username){
    const name = $('home-username')?.value.trim() || "";
    if (!name){ alert("Please enter your name on the home page first."); return; }
    username = name;
  }

  if (timer){ clearInterval(timer); timer=null; }
  time = (mode==='tester')?30:90;
  timerStarted=false; ended=false; score=0; current=0; userAnswers=[];
  const t = getTimerEl(); const m=Math.floor(time/60), s=time%60;
  if (t) t.textContent = `Time left: ${m}:${s<10?"0":""}${s}`;

  allQuestions = buildQuestions(selectedBase);

  hide(getHome()); hide(getMini()); hide(getNinja()); show(getQuiz());

  const welcome = $("welcome-user");
  if (welcome) welcome.textContent = `Practising ${selectedBase}×${mode==='tester'?' (Tester)':''}`;

  const a = getAnswer();
  if (a){
    a.style.display="inline-block"; a.disabled=false;
    if (isIOSLike()){
      a.readOnly=true; a.setAttribute('inputmode','none'); a.setAttribute('tabindex','-1'); a.blur();
      a.addEventListener('touchstart', preventSoftKeyboard, {passive:false});
      a.addEventListener('mousedown',  preventSoftKeyboard, {passive:false});
      a.addEventListener('focus',      preventSoftKeyboard, true);
    } else {
      a.readOnly=false; a.setAttribute('inputmode','numeric'); a.removeAttribute('tabindex');
      a.removeEventListener('touchstart', preventSoftKeyboard);
      a.removeEventListener('mousedown',  preventSoftKeyboard);
      a.removeEventListener('focus',      preventSoftKeyboard, true);
    }
  }

  // 🔧 Build keypad AFTER the quiz screen is visible
  buildKeypadIfNeeded();
  const pad = getPadEl(); if (pad) pad.style.display="grid";

  showQuestion();
}

function showQuestion(){
  const q = getQEl();
  const a = getAnswer();
  if (current < allQuestions.length && !ended){
    if (q) q.textContent = allQuestions[current].q;
    if (a){
      a.value=""; a.disabled=false; a.style.display="inline-block";
      if (isIOSLike()){
        a.readOnly=true; a.setAttribute('inputmode','none'); a.setAttribute('tabindex','-1'); a.blur();
      } else {
        a.readOnly=false; a.setAttribute('inputmode','numeric'); a.removeAttribute('tabindex');
        setTimeout(()=>a.focus(),0);
      }
    }
    const pad = getPadEl(); if (pad) pad.style.display="grid";
  } else {
    endQuiz();
  }
}

function handleKey(e){
  if (e.key!=="Enter" || ended) return;
  if (!timerStarted){ startTimer(); timerStarted=true; }

  const a = getAnswer();
  const raw = (a?.value || "").trim();
  const userAns = raw===""? NaN : parseInt(raw,10);
  userAnswers.push(isNaN(userAns)? "" : userAns);

  if (!isNaN(userAns) && userAns===allQuestions[current].a) score++;
  current++; showQuestion();
}

/******************** TIMER (hidden UI) ********************/
function startTimer(){
  if (timer) clearInterval(timer);
  timer = setInterval(()=>{
    time--;
    const t=getTimerEl(); const m=Math.floor(time/60), s=time%60;
    if (t) t.textContent=`Time left: ${m}:${s<10?"0":""}${s}`; // hidden by CSS
    if (time<=0) endQuiz();
  },1000);
}

/******************** END & SUBMIT ********************/
function endQuiz(){
  if (ended) return; ended=true;
  if (timer){ clearInterval(timer); timer=null; }

  const q=getQEl(), a=getAnswer(), t=getTimerEl(), pad=getPadEl(), s=getScoreEl();
  if (q) q.textContent=""; if (a) a.style.display="none"; if (pad) pad.style.display="none"; if (t) t.style.display="none";

  if (a){
    a.readOnly=false; a.setAttribute('inputmode','numeric'); a.removeAttribute('tabindex');
    a.removeEventListener('touchstart', preventSoftKeyboard);
    a.removeEventListener('mousedown',  preventSoftKeyboard);
    a.removeEventListener('focus',      preventSoftKeyboard, true);
  }

  const asked = Math.min(current, allQuestions.length);
  const total = allQuestions.length;

  if (s){
    s.innerHTML = `${username}, you scored ${score}/${total} <br><br>
      <button onclick="showAnswers()" style="font-size:32px; padding:15px 40px;">Click to display answers</button>`;
  }

  const submissionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const modeMark = (mode==='tester') ? ' (tester)' : '';
  const tableStr = `${selectedBase}x${modeMark}`.trim();

  const payload = { id:submissionId, secret:SHEET_SECRET, table:tableStr, name:username,
                    score, asked, total, date:new Date().toISOString(), device:navigator.userAgent };
  if (!payload.id || !payload.table){ alert("Missing id or table — not sending"); return; }
  queueSubmission(payload); flushQueue();
}

/******************** ANSWER REVIEW ********************/
function showAnswers(){
  const s=getScoreEl(); if (!s) return;
  let html="<div style='display:flex; flex-wrap:wrap; justify-content:center;'>";
  allQuestions.forEach((q,i)=>{
    const userAns = userAnswers[i]!==undefined ? userAnswers[i] : "";
    const correct = userAns===q.a; const color = correct ? "green" : "red";
    html += `<div style="width: 30%; min-width:260px; margin:10px; font-size:24px; color:${color}; font-weight:bold;">
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
window.selectMode  = selectMode;
window.startQuiz   = startQuiz;
window.handleKey   = handleKey;
