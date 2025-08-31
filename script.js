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
