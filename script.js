/* Times Tables Trainer — script.js (frontpage-40)
   Changes in 40:
   - Fix: keypad is hidden on Home/Mini/Ninja and only shown on the Quiz screen (prevents overlay blocking clicks).
   - Keeps frontpage-39 features:
     • Dynamic answer length allows +2 digits beyond correct answer length.
     • Hidden 5-min timer, keypad, offline queue, and all belt rules preserved.
*/

const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbyIuCIgbFisSKqA0YBtC5s5ATHsHXxoqbZteJ4en7hYrf4AXmxbnMOUfeQ2ERZIERN-/exec";
const SHEET_SECRET   = "Banstead123";

const QUIZ_SECONDS_DEFAULT = 300; // 5 minutes
const BASE_MAX_ANSWER_LEN  = 4;   // most modes fit ≤ 4 digits
const EXTRA_DIGITS_ALLOWED = 2;   // allow +2 beyond correct answer length
const QUEUE_KEY            = "tttQueueV1";
const NAME_KEY             = "tttName";

let userName = "";
let modeLabel = "";
let quizSeconds = QUIZ_SECONDS_DEFAULT;

let allQuestions = [];
let userAnswers = [];
let currentIndex = 0;
let ended = false;

let timerInterval = null;
let timerDeadline = 0;

let desktopKeyHandler = null;
let submitLockedUntil = 0; // anti double-submit

/* ---------- utils ---------- */
function $(id){ return document.getElementById(id); }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function cryptoRandom(){ return String(Date.now())+"-"+Math.floor(Math.random()*1e9); }
function hashDJB2(s){ let h=5381; for(let i=0;i<s.length;i++){h=((h<<5)+h)+s.charCodeAt(i); h|=0;} return h>>>0; }

/* ---------- dynamic max length (with +2 headroom) ---------- */
function getMaxLenForCurrentQuestion(){
  try{
    const q = allQuestions[currentIndex];
    if (!q || typeof q.a === "undefined") return BASE_MAX_ANSWER_LEN;
    const ansLen = String(q.a).length;
    return Math.max(BASE_MAX_ANSWER_LEN, ansLen + EXTRA_DIGITS_ALLOWED);
  }catch{
    return BASE_MAX_ANSWER_LEN;
  }
}
function syncAnswerMaxLen(){
  const a = $("answer");
  if (!a) return;
  const cap = getMaxLenForCurrentQuestion();
  try{ a.setAttribute("maxlength", String(cap)); }catch{}
  if (a.value.length > cap) a.value = a.value.slice(0, cap);
}

/* ---------- navigation (now also toggles keypad visibility) ---------- */
function showOnly(id){
  ["home","mini","ninja","quiz-container"].forEach(v=>{
    const el = $(v);
    if (el) el.style.display = (v===id ? "block" : "none");
  });
  // NEW: show keypad only on quiz screen
  const k = $("keypad");
  if (k) k.style.display = (id === "quiz-container" ? "block" : "none");
}

function goHome(){ showOnly("home"); }
function goMini(){
  if (!userName) { userName = (localStorage.getItem(NAME_KEY) || "").trim(); }
  const nameInput = $("name-input");
  if (nameInput){
    const val = nameInput.value.trim();
    if (val) { userName = val; localStorage.setItem(NAME_KEY, userName); }
  }
  const hello = $("mini-hello");
  if (hello) hello.textContent = userName ? `Hello, ${userName}!` : "Hello!";
  buildTableButtons();
  showOnly("mini");
}
function goNinja(){
  if (!userName) { userName = (localStorage.getItem(NAME_KEY) || "").trim(); }
  const nameInput = $("name-input");
  if (nameInput){
    const val = nameInput.value.trim();
    if (val) { userName = val; localStorage.setItem(NAME_KEY, userName); }
  }
  showOnly("ninja");
}
function quitFromQuiz(){
  teardownQuiz();
  goHome();
}

/* ---------- mini tests ---------- */
let selectedBase = 2;
function buildTableButtons(){
  const wrap = $("mini-buttons");
  if (!wrap) return;
  let html = "";
  for (let b=2; b<=12; b++){
    html += `<button class="table-btn" onclick="selectTable(${b})">${b}×</button>`;
  }
  wrap.innerHTML = html;
}
function selectTable(b){ selectedBase = clamp(b,2,12); }
function startQuiz(){
  modeLabel = `Mini ${selectedBase}×`;
  quizSeconds = QUIZ_SECONDS_DEFAULT;
  preflightAndStart(buildMiniQuestions(selectedBase, 50));
}

/* ---------- belts ---------- */
function startWhiteBelt(){
  modeLabel = "White Belt";
  quizSeconds = QUIZ_SECONDS_DEFAULT;
  const qs = buildBeltMixStructured([3,4], 50);
  preflightAndStart(qs, { theme: "white" });
}
function startYellowBelt(){ modeLabel="Yellow Belt"; quizSeconds=QUIZ_SECONDS_DEFAULT; preflightAndStart(buildMixedBases([4,6],50), {theme:"yellow"}); }
function startOrangeBelt(){ modeLabel="Orange Belt (2x – 6x)"; quizSeconds=QUIZ_SECONDS_DEFAULT; preflightAndStart(buildMixedBases([2,3,4,5,6],50), {theme:"orange"}); }
function startGreenBelt(){ modeLabel="Green Belt"; quizSeconds=QUIZ_SECONDS_DEFAULT; preflightAndStart(buildMixedBases([4,8],50), {theme:"green"}); }
function startBlueBelt(){ modeLabel="Blue Belt"; quizSeconds=QUIZ_SECONDS_DEFAULT; preflightAndStart(buildMixedBases([7,8],50), {theme:"blue"}); }
function startPinkBelt(){ modeLabel="Pink Belt"; quizSeconds=QUIZ_SECONDS_DEFAULT; preflightAndStart(buildMixedBases([7,9],50), {theme:"pink"}); }
function startPurpleBelt(){ modeLabel="Purple Belt (2×–10×)"; quizSeconds=QUIZ_SECONDS_DEFAULT; preflightAndStart(buildFullyMixed(50,{min:2,max:10}), {theme:"purple"}); }
function startRedBelt(){ modeLabel="Red Belt (2×–10×, 100 Q)"; quizSeconds=QUIZ_SECONDS_DEFAULT; preflightAndStart(buildFullyMixed(100,{min:2,max:10}), {theme:"red"}); }
function startBlackBelt(){ modeLabel="Black Belt (2×–12×, 100 Q)"; quizSeconds=QUIZ_SECONDS_DEFAULT; preflightAndStart(buildFullyMixed(100,{min:2,max:12}), {theme:"black"}); }
function startBronzeBelt(){ modeLabel="Bronze Belt (2×–12× + blanks, 100 Q)"; quizSeconds=QUIZ_SECONDS_DEFAULT; preflightAndStart(buildBronzeQuestions(100), {theme:"bronze"}); }
function startSilverBelt(){ modeLabel="Silver Belt (2×–12×, powers of 10, 100 Q)"; quizSeconds=QUIZ_SECONDS_DEFAULT; preflightAndStart(buildSilverQuestions(100), {theme:"silver"}); }

/* ---------- question builders ---------- */
function buildMiniQuestions(base, total){
  const out = [];
  for (let i=1;i<=10;i++) out.push({ q:`${i} × ${base}`, a:i*base });
  for (let i=1;i<=10;i++) out.push({ q:`${base} × ${i}`, a:base*i });
  for (let i=1;i<=10;i++) out.push({ q:`${base*i} ÷ ${base}`, a:i });
  const mix = [];
  for (let i=0;i<20;i++){
    const k = randInt(1,10);
    const t = randInt(1,3);
    if (t===1) mix.push({ q:`${k} × ${base}`, a:k*base });
    else if (t===2) mix.push({ q:`${base} × ${k}`, a:base*k });
    else mix.push({ q:`${base*k} ÷ ${base}`, a:k });
  }
  return out.concat(shuffle(mix));
}
function buildBeltMixStructured(bases,total){
  const out = [];
  for (const base of bases){
    for (let i=1;i<=10;i++) out.push({ q:`${i} × ${base}`, a:i*base });
    for (let i=1;i<=10;i++) out.push({ q:`${base} × ${i}`, a:base*i });
    for (let i=1;i<=10;i++) out.push({ q:`${base*i} ÷ ${base}`, a:i });
  }
  const need = Math.max(0, total - out.length);
  const mix = [];
  for (let i=0;i<need;i++){
    const base = bases[randInt(0,bases.length-1)];
    const k = randInt(1,10);
    const t = randInt(1,3);
    if (t===1) mix.push({ q:`${k} × ${base}`, a:k*base });
    else if (t===2) mix.push({ q:`${base} × ${k}`, a:base*k });
    else mix.push({ q:`${base*k} ÷ ${base}`, a:k });
  }
  return out.concat(shuffle(mix)).slice(0,total);
}
function buildMixedBases(bases,total){
  const out = [];
  for (let i=0;i<total;i++){
    const base = bases[i % bases.length];
    const k = randInt(1,10);
    const t = randInt(1,3);
    if (t===1) out.push({ q:`${k} × ${base}`, a:k*base });
    else if (t===2) out.push({ q:`${base} × ${k}`, a:base*k });
    else out.push({ q:`${base*k} ÷ ${base}`, a:k });
  }
  return shuffle(out);
}
function buildFullyMixed(total, range){
  const out = [];
  for (let n=0;n<total;n++){
    const a = randInt(range.min, range.max);
    const b = randInt(1,10);
    const t = randInt(1,3);
    if (t===1) out.push({ q:`${a} × ${b}`, a:a*b });
    else if (t===2) out.push({ q:`${b} × ${a}`, a:b*a });
    else out.push({ q:`${a*b} ÷ ${a}`, a:b });
  }
  return shuffle(out);
}
function buildBronzeQuestions(total){
  const out = [];
  for (let n=0;n<total;n++){
    const a = randInt(2,12);
    const b = randInt(1,10);
    const prod = a*b;
    const t = randInt(1,6);
    if (t===1){ out.push({ q:`___ × ${a} = ${prod}`, a:b }); }
    else if (t===2){ out.push({ q:`${a} × ___ = ${prod}`, a:b }); }
    else if (t===3){ out.push({ q:`___ ÷ ${a} = ${b}`, a:prod }); }
    else if (t===4){ out.push({ q:`${prod} ÷ ___ = ${b}`, a:a }); }
    else if (t===5){ out.push({ q:`${a} × ${b}`, a:prod }); }
    else { out.push({ q:`${b} × ${a}`, a:prod }); }
  }
  return shuffle(out);
}
function buildSilverQuestions(total){
  const bases = [2,3,4,5,6,7,8,9,10,11,12];
  const pow = [0,1];
  const out = [];
  for (let n=0;n<total;n++){
    const a = bases[Math.floor(Math.random()*bases.length)];
    const b = bases[Math.floor(Math.random()*bases.length)];
    const k = pow[Math.floor(Math.random()*pow.length)];
    const m = pow[Math.floor(Math.random()*pow.length)];
    const A = a * Math.pow(10, k);
    const B = b * Math.pow(10, m);
    const c = A * B;
    if (Math.random() < 0.5) out.push({ q:`${A} × ${B}`, a:c });
    else out.push({ q:`${c} ÷ ${A}`, a:B });
  }
  return shuffle(out);
}

/* ---------- quiz flow ---------- */
function preflightAndStart(questions, opts={}){
  ended = false;
  currentIndex = 0;
  allQuestions = questions.slice();
  userAnswers = new Array(allQuestions.length).fill("");

  const quiz = $("quiz-container");
  if (quiz) quiz.setAttribute("data-theme", opts.theme || "");

  buildKeypadIfNeeded();
  showOnly("quiz-container"); // will also show keypad

  const title = $("quiz-title");
  if (title) title.textContent = modeLabel || "Quiz";

  showQuestion();
  startTimer(quizSeconds);

  const a = $("answer");
  attachKeyboard(a);
}
function showQuestion(){
  const q = allQuestions[currentIndex];
  const qEl = $("question");
  const aEl = $("answer");
  if (qEl) qEl.textContent = q ? q.q : "";
  if (aEl){
    aEl.value = "";
    syncAnswerMaxLen();
    try{ aEl.focus(); aEl.setSelectionRange(aEl.value.length, aEl.value.length); }catch{}
  }
  const p = $("progress");
  if (p) p.textContent = `${currentIndex+1} / ${allQuestions.length}`;
}
function handleKey(val){
  const a = $("answer");
  if (!a || ended) return;
  if (val === "enter"){ safeSubmit(); return; }
  if (val === "back"){
    a.value = a.value.slice(0,-1);
    a.dispatchEvent(new Event("input",{bubbles:true}));
    try{ a.setSelectionRange(a.value.length, a.value.length); }catch{}
    return;
  }
  if (val === "clear"){
    a.value = "";
    a.dispatchEvent(new Event("input",{bubbles:true}));
    return;
  }
  if (/^\d$/.test(val)){
    const cap = getMaxLenForCurrentQuestion();
    if (a.value.length < cap){
      a.value += val;
      a.dispatchEvent(new Event("input",{bubbles:true}));
      try{ a.setSelectionRange(a.value.length, a.value.length); }catch{}
    }
  }
}
function safeSubmit(){
  const now = Date.now();
  if (now < submitLockedUntil) return;
  submitLockedUntil = now + 200;

  const a = $("answer");
  if (!a || ended) return;
  const valStr = a.value.trim();
  userAnswers[currentIndex] = (valStr === "") ? "" : Number(valStr);

  currentIndex++;
  if (currentIndex >= allQuestions.length){ endQuiz(); return; }
  showQuestion();
}
function startTimer(seconds){
  clearInterval(timerInterval);
  timerDeadline = Date.now() + seconds*1000;
  timerInterval = setInterval(()=>{
    const remaining = Math.max(0, Math.ceil((timerDeadline - Date.now())/1000));
    const t = $("timer");
    if (t) t.textContent = String(remaining);
    if (remaining <= 0){ clearInterval(timerInterval); endQuiz(); }
  }, 250);
}
function teardownQuiz(){
  clearInterval(timerInterval);
  timerInterval = null;
  ended = true;
  submitLockedUntil = 0;
  if (desktopKeyHandler){
    document.removeEventListener("keydown", desktopKeyHandler);
    desktopKeyHandler = null;
  }
}

/* ---------- end & answers ---------- */
function endQuiz(){
  teardownQuiz();
  let correct = 0;
  for (let i=0;i<allQuestions.length;i++){
    const c = Number(allQuestions[i].a);
    const u = (userAnswers[i]==="" ? NaN : Number(userAnswers[i]));
    if (!Number.isNaN(u) && u===c) correct++;
  }
  const s = $("score");
  if (s){
    s.innerHTML = `
      <div class="result-line">
        <strong>${modeLabel}:</strong> ${correct} / ${allQuestions.length}
      </div>
      <button class="btn" onclick="showAnswers()">Show answers</button>
      <button class="btn" onclick="quitFromQuiz()">Quit</button>
    `;
  }
  try{
    queueResult({
      secret: SHEET_SECRET,
      mode: modeLabel,
      name: userName || (localStorage.getItem(NAME_KEY) || ""),
      total: allQuestions.length,
      correct: correct,
      ts: new Date().toISOString()
    });
    flushQueue();
  }catch(e){}
}
function showAnswers(){
  const s = $("score"); if(!s) return;
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
    const u = (userAnswers[i]!==undefined && userAnswers[i]!=="") ? userAnswers[i] : "—";
    const correct = (userAnswers[i]===q.a);
    html += `<div style="font-size:22px; font-weight:bold; color:${correct?'green':'red'}; text-align:left;">
      ${q.q} = ${u}
    </div>`;
  });
  html += "</div>";
  s.innerHTML += html;
}

/* ---------- keypad & keyboard ---------- */
function buildKeypadIfNeeded(){
  const k = $("keypad");
  if (!k) return;
  k.innerHTML = `
    <div class="pad">
      <button class="pad-btn" data-k="7">7</button>
      <button class="pad-btn" data-k="8">8</button>
      <button class="pad-btn" data-k="9">9</button>
      <button class="pad-btn pad-enter" data-k="enter">Enter</button>

      <button class="pad-btn" data-k="4">4</button>
      <button class="pad-btn" data-k="5">5</button>
      <button class="pad-btn" data-k="6">6</button>
      <button class="pad-btn pad-enter" data-k="enter">Enter</button>

      <button class="pad-btn" data-k="1">1</button>
      <button class="pad-btn" data-k="2">2</button>
      <button class="pad-btn" data-k="3">3</button>
      <button class="pad-btn pad-enter" data-k="enter">Enter</button>

      <button class="pad-btn pad-wide" data-k="0">0</button>
      <button class="pad-btn pad-back" data-k="back">⌫</button>
      <button class="pad-btn pad-clear" data-k="clear">Clear</button>
      <button class="pad-btn pad-enter" data-k="enter">Enter</button>
    </div>
  `;
  k.querySelectorAll(".pad-btn").forEach(btn=>{
    btn.addEventListener("pointerdown", (e)=>{
      e.preventDefault();
      handleKey(btn.getAttribute("data-k"));
    }, { passive:false });
  });
}
function attachKeyboard(a){
  if (desktopKeyHandler) document.removeEventListener("keydown", desktopKeyHandler);
  desktopKeyHandler = (e)=>{
    const quiz = $("quiz-container");
    if (!quiz || quiz.style.display === "none" || ended) return;
    if (!a || a.style.display === "none") return;

    if (/^\d$/.test(e.key)){
      e.preventDefault();
      const cap = getMaxLenForCurrentQuestion();
      if (a.value.length < cap){
        a.value += e.key;
        a.dispatchEvent(new Event("input",{bubbles:true}));
      }
      try{ a.setSelectionRange(a.value.length, a.value.length); }catch{}
    } else if (e.key==="Backspace" || e.key==="Delete"){
      e.preventDefault();
      a.value = a.value.slice(0,-1);
      a.dispatchEvent(new Event("input",{bubbles:true}));
    } else if (e.key==="Enter"){
      e.preventDefault();
      safeSubmit();
    }
  };
  document.addEventListener("keydown", desktopKeyHandler);

  if (a){
    a.addEventListener("input", ()=>{
      const cap = getMaxLenForCurrentQuestion();
      if (a.value.length > cap) a.value = a.value.slice(0, cap);
    });
  }
}

/* ---------- offline queue ---------- */
function queueResult(item){
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  const body = JSON.stringify(item);
  const rec = { id: cryptoRandom(), idempotency: hashDJB2(body), body, ts: Date.now() };
  if (!q.some(r=>r.idempotency===rec.idempotency)) q.push(rec);
  while (q.length > 200) q.shift();
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}
let flushing = false, backoffMs = 0;
async function flushQueue(){
  if (flushing) return;
  let q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  if (!q.length) return;
  flushing = true;
  try{
    const next = q[0];
    const blob = new Blob([next.body], { type:"application/json" });
    await fetch(SHEET_ENDPOINT, { method:"POST", mode:"no-cors", body: blob });
    q.shift();
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    backoffMs = 0;
  }catch(e){
    backoffMs = Math.min(backoffMs ? backoffMs*2 : 1000, 30000);
  }finally{
    flushing = false;
  }
  q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  if (q.length) setTimeout(flushQueue, backoffMs || 0);
}
document.addEventListener("visibilitychange", ()=>{ if (document.visibilityState==="visible") flushQueue(); });
window.addEventListener("online", flushQueue);

/* ---------- exports ---------- */
window.goHome = goHome;
window.goMini = goMini;
window.goNinja = goNinja;
window.quitFromQuiz = quitFromQuiz;

window.startQuiz = startQuiz;

window.buildTableButtons = buildTableButtons;
window.buildKeypadIfNeeded = buildKeypadIfNeeded;
window.selectTable = selectTable;

window.preflightAndStart = preflightAndStart;
window.showQuestion = showQuestion;
window.handleKey = handleKey;
window.safeSubmit = safeSubmit;
window.startTimer = startTimer;
window.endQuiz = endQuiz;
window.showAnswers = showAnswers;

window.startWhiteBelt  = startWhiteBelt;
window.startYellowBelt = startYellowBelt;
window.startOrangeBelt = startOrangeBelt;
window.startGreenBelt  = startGreenBelt;
window.startBlueBelt   = startBlueBelt;
window.startPinkBelt   = startPinkBelt;
window.startPurpleBelt = startPurpleBelt;
window.startRedBelt    = startRedBelt;
window.startBlackBelt  = startBlackBelt;
window.startBronzeBelt = startBronzeBelt;
window.startSilverBelt = startSilverBelt;

/* ---------- init ---------- */
(function init(){
  const saved = localStorage.getItem(NAME_KEY);
  if (saved && $("name-input")) $("name-input").value = saved;
  // Ensure keypad hidden on first load (home screen)
  const k = $("keypad");
  if (k) k.style.display = "none";
})();
