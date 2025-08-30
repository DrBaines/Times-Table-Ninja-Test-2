# Times Table Ninja Quiz

A simple, child-friendly web app to practise multiplication and division facts.

- Built with **HTML, CSS, and JavaScript**.
- Hosted on **GitHub Pages**.
- Saves scores to **Google Sheets** via Apps Script.
- Supports multiple tables (2×, 3×, 4×), baseline mode, and tester mode.

---

## 🧩 Project Structure

- `index.html` — The main page (UI layout).
- `styles.css` — Styling for the quiz.
- `script.js` — Quiz logic, timer, score handling, and Google Sheets submission.
- `Apps Script` (not in repo) — Google Sheets backend to collect results.

---

## ⚡ Modes

- **Baseline** → 30 questions (10 × base, 10 × reversed, 10 ÷ base), 90-second timer.
- **Tester** → 12 questions (4 + 4 + 4), 30-second timer.

Results appear in Google Sheets with the table name and mode (`2x`, `3x (tester)`, etc).

---

## 🔒 Safety

- Results queue locally and retry if offline.
- Duplicate submissions prevented.
- Uses a shared `SHEET_SECRET` for validation in Apps Script.

---

## 📚 ChatGPT Guidance

To avoid long sessions becoming slow or unresponsive, split questions into **separate chats**:

1. **Quiz Core**  
   Front-end logic, gameplay changes, timers, new features.

2. **Data & Google Sheets**  
   Apps Script code, Google Sheets setup, result filtering.

3. **Deployment & GitHub**  
   Hosting, releases, rollbacks, repo management.

4. **Future Enhancements**  
   Leaderboards, more tables, adaptive difficulty, reporting.

When asking for help, **open a new chat per area** and paste only the relevant code (not the whole project).

---

## 🗂 Baselines

- Keep a ZIP of working versions (e.g. `quiz-baseline.zip`) as a rollback point.
- Tag stable commits in GitHub (e.g. `baseline-v1`).
- Use **Releases** on GitHub to store downloadable snapshots.

---

## 🚀 Deployment

- Hosted on **GitHub Pages** — push to `main` branch and changes go live.
- Web app URL is `https://YOUR-USERNAME.github.io/REPO-NAME/`.

---

## ✅ To-Do (Future Ideas)

- Add tables 5×–12×.  
- Mixed-tables practice (random across chosen sets).  
- Leaderboard or class report view.  
- Export results to CSV or PDF.  
