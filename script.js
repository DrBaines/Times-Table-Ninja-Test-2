
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Times Table Quiz (2× / 3× / 4×)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧮</text></svg>">
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <!-- Welcome / Login -->
  <div id="login-container" class="center">
    <h1 class="title">Choose your times table</h1>

    <div id="table-choices" class="choice-buttons">
      <button type="button" class="choice" id="btn-2" onclick="selectTable(2)">2×</button>
      <button type="button" class="choice" id="btn-3" onclick="selectTable(3)">3×</button>
      <button type="button" class="choice" id="btn-4" onclick="selectTable(4)">4×</button>
    </div>

    <div class="name-row">
      <input type="text" id="username" placeholder="Enter your name" class="big-input" />
    </div>

    <button id="start-btn" onclick="startQuiz()" class="big-button">Start Quiz</button>
  </div>

  <!-- Quiz UI -->
  <div id="quiz-container" class="center" style="display:none;">
    <h2 id="welcome-user" class="subtitle"></h2>
    <div id="question" class="question"></div>
    <input type="number" id="answer" onkeydown="handleKey(event)" class="answer-input" autofocus />
    <div id="timer" class="timer">Time left: 1:30</div>
    <div id="score" class="score"></div>
  </div>

  <script src="script.js"></script>
</body>
</html>
