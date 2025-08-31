/* =========================================================
   Times Tables Trainer - Script (frontpage-21)
   - Fixed: fully closed JS (no stray braces) so functions export
   - Time limit increased to 5 minutes (300s)
   - 50-question quizzes (30 baseline + 20 mixed)
   - Quit: during quiz -> Mini; after quiz -> Home
   - Keyboard routing & double-submit lock retained
   ========================================================= */

/******** Google Sheet endpoint (multi-device) ********/
const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbyIuCIgbFisSKqA0YBtC5s5ATHsHXxoqbZteJ4en7hYrf4AXmxbnMOUfeQ2ERZIERN-/exec";
const SHEET_SECRET   = "Banstead123";

/********* Offline/refresh-safe queue for submissions *********/
let pendingSubmissions = JSON.parse(localStorage.getItem("pendingSubmissions") || "[]");
let isFlushing = false;
function saveQueue_(){ localStorage.setItem("pendingSubmissions", JSON.stringify(pendingSubmissions)); }
function queueSubmission(payload){
  if (!payload || !payload.id || !payload.table) return;
  if (pendingSubmissions.some(p => p.id === payload.id)) return;
  pendingSubmissions.push(payload); saveQueue_();
}
async function flushQueue(){
  if (isFlushing || !pendingSubmissions.length) return;
  isFlushing = true;
  const remaining = [];
  for (const payload of pendingSubmissions){
    try {
      await fetch(SHEET_ENDPOINT, { method:"POST", mode:"no-cors",
        body:new Blob([JSON.stringify(payload)], { type:"text/plain;charset=utf-8" }) });
    } catch (e){ remaining.push(payload); }
  }
  pendingSubmissions = remaining; saveQueue_(); isFlushing = false;
}
window.addEventListener("online", flushQueue);
document.addEventListener("visibilitychange", ()=>{ if (document.visibilityState==="visible") flushQueue(); });
window.addEventListener("DOMContentLoaded", flushQueue);

/******************** STATE ********************/
let selectedBase = null;         // Mini: 2..12
let quizType = 'single';         // 'single' | 'ninja'
let ninjaName = '';              // e.g., 'White Ninja Belt'
const QUIZ_TIME = 300;           // 5 minutes
const MAX_ANSWER_LEN = 4;

let allQuestions = [];
let current = 0;
let score = 0;
let time = QUIZ_TIME;
let timer = null;
let timerStarted = false;
let ended = false;
let userAnswers = [];
let username = "";
let submitLock = false;          // prevents double-advance

/******************** DOM GETTERS ********************/
const $ = (id) => document.getElementById(id);
const getQEl     = () => $("question");
const getAnswer  = () => $("answer");
const getTimerEl = () => $("timer");
const getScoreEl = () => $("score");
const getPadEl   = () => $("answer-pad");
const getHome    = () => $("home-screen");
const getMini    = () => $("mini-screen");
const getNinja   = () => $("ninja-screen");
const getQuiz    = () => $("quiz-container");

/******************** PLATFORM (force desktop typing unless set otherwise) ********************/
const FORCE_DESKTOP = true;
function isIOSLike(){
  if (FORCE_DESKTOP) return false;
  const ua = navigator.userAgent || '';
  const iOSUA = /iPad|iPhone|iPod/.test(ua);
  const iPadAsMac = (navigator.platform === "MacIntel" || /Mac/.test(ua)) && navigator.maxTouchPoints > 1;
  return (iOSUA || iPadAsMac) && navigator.maxTouchPoints > 0;
}
const isiOS = isIOSLike();
function preventSoftKeyboard(e){ const a=getAnswer(); if(a && a.readOnly){ e.preventDefault(); a.blur(); }}

/******************** HELPERS ********************/
function show(el){ if(el) el.style.display="block"; }
function hide(el){ if(el) el.style.display="none"; }
function clearResultsUI(){ const s=getScoreEl(); if(s) s.innerHTML=""; }

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
  if (name){ username = name; try{ localStorage.setItem('ttt_username', username); }catch{} }
}

/******************** NAVIGATION ********************/
function goHome(){ clearResultsUI(); hide(getMini()); hide(getNinja()); hide(getQuiz()); show(getHome()); }
function goMini(){
  setUsernameFromHome();
  const hello = $('hello-user'); if (hello) hello.textContent = username ? `Hello, ${username}!` : "";
  clearResultsUI(); hide(getHome()); hide(getNinja()); hide(getQuiz()); show(getMini());
}
function goNinja(){ setUsernameFromHome(); clearResultsUI(); hide(getHome()); hide(getMini()); hide(getQuiz()); show(getNinja()); }

/* Quit: during quiz -> Mini; after quiz -> Home (index.html button calls this) */
function quitFromQuiz(){
  if (timer){ clearInterval(timer); timer=null; }
  clearResultsUI();
  hide(getQuiz());
  if (ended) { show(getHome()); } else { show(getMini()); }
}

/******************** UI BUILDERS ********************/
const TABLES = [2,3,4,5,6,7,8,9,10,11,12];
function buildTableButtons(){
  const container = $('table-choices'); if (!container) return;
  container.innerHTML = '';
  TABLES.forEach(b=>{
    const btn=document.createElement('button');
    btn.type="button"; btn.className="choice"; btn.id=`btn-${b}`; btn.textContent=`${b}×`;
    btn.addEventListener('click', ()=>selectTable(b));
    container.appendChild(btn);
  });
}
document.addEventListener('DOMContentLoaded', buildTableButtons);

/* Build keypad once */
function buildKeypadIfNeeded(){
  const pad = getPadEl(); const a = getAnswer(); if(!pad || !a) return;
  pad.classList.add('calc-pad');
  if (pad.childElementCount === 0){
    const labels = ['7','8','9','⌫','4','5','6','Enter','1','2','3','0','Clear'];
    const pos = {'7':'key-7','8':'key-8','9':'key-9','⌫':'key-back','4':'key-4','5':'key-5','6':'key-6','Enter':'key-enter','1':'key-1','2':'key-2','3':'key-3','0':'key-0','Clear':'key-clear'};
    labels.forEach(label=>{
      const btn=document.createElement('button'); btn.type='button'; btn.textContent=label;
      btn.setAttribute('aria-label', label==='⌫'?'Backspace':label);
      if (label==='Enter') btn.classList.add('calc-btn--enter');
      if (label==='Clear') btn.classList.add('calc-btn--clear');
      if (label==='⌫')     btn.classList.add('calc-btn--back');
      btn.classList.add(pos[label]);
      btn.addEventListener('pointerdown',(e)=>{ e.preventDefault(); e.stopPropagation(); if (isiOS) getAnswer()?.blur(); handlePadPress(label); });
      pad.appendChild(btn);
    });
  }
  pad.style.display = "grid";
}
function handlePadPress(label){
  const a=getAnswer(); if(!a) return;
  switch(label){
    case 'Clear': a.value=''; a.dispatchEvent(new Event('input',{bubbles:true})); break;
    case '⌫': a.value=a.value.slice(0,-1); a.dispatchEvent(new Event('input',{bubbles:true})); break;
    case 'Enter': safeSubmit(); break;
    default:
      if (/^\d$/.test(label)){
        if (a.value.length>=MAX_ANSWER_LEN) return;
        a.value += label;
        try { a.setSelectionRange(a.value.length, a.value.length); } catch {}
        a.dispatchEvent(new Event('input',{bubbles:true}));
      }
  }
}

/******************** SELECTION (Mini) ********************/
function selectTable(base){
  selectedBase = base;
  TABLES.forEach(b=>{ const el=$(`btn-${b}`); if(el) el.classList.toggle('selected', b===base); });
}

/******************** QUESTION BUILDERS ********************/
/* 30-question baseline blocks */
function block30_single(base){
  const mul1=[]; for(let i=0;i<=12;i++) mul1.push({q:`${i} × ${base}`, a:base*i});
  const mul2=[]; for(let i=0;i<=12;i++) mul2.push({q:`${base} × ${i}`, a:base*i});
  const div =[]; for(let i=0;i<=12;i++) div.push({q:`${base*i} ÷ ${base}`, a:i});
  const set1 = mul1.sort(()=>0.5-Math.random()).slice(0,10);
  const set2 = mul2.sort(()=>0.5-Math.random()).slice(0,10);
  const set3 = div .sort(()=>0.5-Math.random()).slice(0,10);
  return [...set1, ...set2, ...set3];
}
function block30_mixed(bases){
  const pick = () => bases[Math.floor(Math.random()*bases.length)];
  const r = () => Math.floor(Math.random()*13); // 0..12
  const a1=[], a2=[], a3=[];
  for(let k=0;k<10;k++){ const b=pick(), i=r(); a1.push({q:`${i} × ${b}`, a:i*b}); }
  for(let k=0;k<10;k++){ const b=pick(), i=r(); a2.push({q:`${b} × ${i}`, a:i*b}); }
  for(let k=0;k<10;k++){ const b=pick(), i=r(); a3.push({q:`${b*i} ÷ ${b}`, a:i}); }
  return [...a1, ...a2, ...a3];
}

/* Extra 20 mixed (randomly choose from the same three patterns) */
function extra20_mixed(bases){
  const pick = () => bases[Math.floor(Math.random()*bases.length)];
  const r = () => Math.floor(Math.random()*13);
  const out = [];
  for (let k=0;k<20;k++){
    const type = Math.floor(Math.random()*3); // 0,1,2
    const b = pick(); const i = r();
    if (type === 0){ out.push({ q:`${i} × ${b}`, a:i*b }); }
    else if (type === 1){ out.push({ q:`${b} × ${i}`, a:i*b }); }
    else { out.push({ q:`${b*i} ÷ ${b}`, a:i }); }
  }
  return out;
}

/* Public builders: now return 50 questions total */
function buildQuestionsSingle(base){
  const base30 = block30_single(base);
  const extra = extra20_mixed([base]);
  return base30.concat(extra);
}
function buildQuestionsMixedBaseline(bases){
  const base30 = block30_mixed(bases);
  const extra = extra20_mixed(bases);
  return base30.concat(extra);
}

/******************** QUIZ FLOW ********************/
let desktopKeyHandler = null;

function startQuiz(){ // Mini baseline (50/5 min)
  quizType='single';
  if(!selectedBase){ alert("Please choose a times table (2×–12×)."); return; }
  preflightAndStart(()=>buildQuestionsSingle(selectedBase), `Practising ${selectedBase}×`, QUIZ_TIME);
}

/* ===== Ninja belts ===== */
function startWhiteBelt(){  quizType='ninja'; ninjaName='White Ninja Belt';  preflightAndStart(()=>buildQuestionsMixedBaseline([3,4]),       `${ninjaName} — 3× & 4× (50Qs / 5 min)`, QUIZ_TIME); }
function startYellowBelt(){ quizType='ninja'; ninjaName='Yellow Ninja Belt'; preflightAndStart(()=>buildQuestionsMixedBaseline([4,6]),       `${ninjaName} — 4× & 6× (50Qs / 5 min)`, QUIZ_TIME); }
function startOrangeBelt(){ quizType='ninja'; ninjaName='Orange Ninja Belt'; preflightAndStart(()=>buildQuestionsMixedBaseline([2,3,4,5,6]), `${ninjaName} — 2×,3×,4×,5×,6× (50Qs / 5 min)`, QUIZ_TIME); }
function startGreenBelt(){  quizType='ninja'; ninjaName='Green Ninja Belt';  preflightAndStart(()=>buildQuestionsMixedBaseline([4,8]),       `${ninjaName} — 4× & 8× (50Qs / 5 min)`, QUIZ_TIME); }
function startBlueBelt(){   quizType='ninja'; ninjaName='Blue Ninja Belt';   preflightAndStart(()=>buildQuestionsMixedBaseline([7,8]),       `${ninjaName} — 7× & 8× (50Qs / 5 min)`, QUIZ_TIME); }
function startPinkBelt(){   quizType='ninja'; ninjaName='Pink Ninja Belt';   preflightAndStart(()=>buildQuestionsMixedBaseline([7,9]),       `${ninjaName} — 7× & 9× (50Qs / 5 min)`, QUIZ_TIME); }

function preflightAndStart(qBuilder, welcomeText, timerSeconds){
  clearResultsUI();
  if(!username){
    const name=$('home-username')?.value.trim() || "";
    if(!name){ alert("Please enter your name on the home page first."); return; }
    username=name; try{ localStorage.setItem('ttt_username', username); }catch{}
  }

  if(timer){ clearInterval(timer); timer=null; }
  time=timerSeconds; timerStarted=false; ended=false; score=0; current=0; userAnswers=[]; submitLock=false;
  const t=getTimerEl(); const m=Math.floor(time/60), s=time%60; if(t) t.textContent=`Time left: ${m}:${s<10?"0":""}${s}`;

  allQuestions = qBuilder();

  hide(getHome()); hide(getMini()); hide(getNinja()); show(getQuiz());
  const welcome=$("welcome-user"); if(welcome) welcome.textContent=welcomeText;

  const a=getAnswer();
  if(a){
    a.value=""; a.disabled=false; a.style.display="inline-block";
    if(!isiOS){
      a.readOnly=false; a.removeAttribute('tabindex'); a.setAttribute('inputmode','numeric');
      a.addEventListener('input', ()=>{ a.value = a.value.replace(/\D+/g,'').slice(0,MAX_ANSWER_LEN); });
      setTimeout(()=>a.focus(),0);

      // Global routing (single handler)
      desktopKeyHandler = (e)=>{
        const quizVisible = getQuiz() && getQuiz().style.display !== "none";
        if(!quizVisible || ended) return;
        if (!a || a.style.display==="none") return;

        if (/^\d$/.test(e.key)){
          e.preventDefault();
          if (a.value.length < MAX_ANSWER_LEN){ a.value += e.key; a.dispatchEvent(new Event('input',{bubbles:true})); }
          try{ a.setSelectionRange(a.value.length, a.value.length); }catch{}
        } else if (e.key==='Backspace' || e.key==='Delete'){
          e.preventDefault();
          a.value = a.value.slice(0,-1);
          a.dispatchEvent(new Event('input',{bubbles:true}));
        } else if (e.key==='Enter'){
          e.preventDefault();
          safeSubmit();
        }
      };
      document.addEventListener('keydown', desktopKeyHandler);
    } else {
      // iOS path (only if FORCE_DESKTOP=false)
      a.readOnly=true; a.setAttribute('inputmode','none'); a.setAttribute('tabindex','-1'); a.blur();
      a.addEventListener('touchstart', preventSoftKeyboard, {passive:false});
      a.addEventListener('mousedown',  preventSoftKeyboard, {passive:false});
      a.addEventListener('focus',      preventSoftKeyboard, true);
    }
  }

  const pad=getPadEl(); if(pad){ pad.innerHTML=''; pad.style.display='grid'; }
  buildKeypadIfNeeded();

  showQuestion();
}

function showQuestion(){
  const q=getQEl(); const a=getAnswer();
  if(current < allQuestions.length && !ended){
    if(q) q.textContent = allQuestions[current].q;
    if(a){
      a.value=""; a.disabled=false; a.style.display="inline-block";
      if(!isiOS){
        a.readOnly=false; a.removeAttribute('tabindex'); a.setAttribute('inputmode','numeric');
        setTimeout(()=>a.focus(),0);
      } else {
        a.readOnly=true; a.setAttribute('inputmode','none'); a.setAttribute('tabindex','-1'); a.blur();
      }
    }
    const pad=getPadEl(); if(pad) pad.style.display="grid";
  } else {
    endQuiz();
  }
}

/******************** SUBMIT (single entry) & TIMER ********************/
function safeSubmit(){
  if (submitLock || ended) return;
  submitLock = true;
  handleKey({ key:'Enter' });
  setTimeout(()=>{ submitLock = false; }, 120);
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

function startTimer(){
  if (timer) clearInterval(timer);
  timer = setInterval(()=>{
    time--;
    const t=getTimerEl(); const m=Math.floor(time/60), s=time%60;
    if (t) t.textContent = `Time left: ${m}:${s<10?"0":""}${s}`; // hidden by CSS
    if (time <= 0) endQuiz();
  }, 1000);
}

/******************** END & SUBMIT ********************/
function endQuiz(){
  if (ended) return; ended = true;
  if (timer){ clearInterval(timer); timer=null; }

  if (desktopKeyHandler){ document.removeEventListener('keydown', desktopKeyHandler); desktopKeyHandler=null; }

  const q=getQEl(), a=getAnswer(), t=getTimerEl(), pad=getPadEl(), s=getScoreEl();
  if(q) q.textContent=""; if(a) a.style.display="none"; if(pad) pad.style.display="none"; if(t) t.style.display="none";

  if(a){
    a.readOnly=false; a.setAttribute('inputmode','numeric'); a.removeAttribute('tabindex');
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

  // Submit result
  const submissionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tableStr = (quizType==='single') ? `${selectedBase}x` : ninjaName;
  const uaSafe = String(navigator.userAgent || '').slice(0, 180);
  const payload = { id:submissionId, secret:SHEET_SECRET, table:tableStr, name:username,
                    score, asked, total, date:new Date().toISOString(), device:uaSafe };
  if (!payload.id || !payload.table) return;
  queueSubmission(payload); flushQueue();
}

/******************** ANSWER REVIEW ********************/
function showAnswers(){
  const s=getScoreEl(); if(!s) return;
  let html = `
    <div style="
      display:grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
      justify-items: start;
      max-width: 1200px;
      margin: 20px auto;
    ">
  `;
  allQuestions.forEach((q,i)=>{
    const userAns = (userAnswers[i]!==undefined && userAnswers[i]!=="") ? userAnswers[i] : "—";
    const correct = (userAnswers[i]===q.a);
    const color = correct ? "green" : "red";
    html += `
      <div style="font-size:22px; font-weight:bold; color:${color}; text-align:left;">
        ${q.q} = ${userAns}
      </div>
    `;
  });
  html += "</div>";
  s.innerHTML += html;
}


/******************** EXPORTS ********************/
window.goHome = goHome;
window.goMini = goMini;
window.goNinja = goNinja;
window.quitFromQuiz = quitFromQuiz;
window.selectTable = selectTable;
window.startQuiz   = startQuiz;
window.handleKey   = handleKey;

/* Ninja exports */
window.startWhiteBelt  = startWhiteBelt;
window.startYellowBelt = startYellowBelt;
window.startOrangeBelt = startOrangeBelt;
window.startGreenBelt  = startGreenBelt;
window.startBlueBelt   = startBlueBelt;
window.startPinkBelt   = startPinkBelt;
