/* ============================================================
   Classroom Jeopardy — static front-end (question-library model)

   Questions live in a flat LIBRARY (questions/*.yaml), each entry
   tagged with category + value + level. A board is ASSEMBLED at
   game time: for every chosen category-column and each value tier,
   one matching question is drawn at random from the pool.

   - Pick a level + categories + point tier, click Generate Board
   - 1–5 teams with editable names and live scores
   - Click a square -> full-screen question -> award points -> blank it
   - State persists in localStorage so a refresh is safe
   ============================================================ */

const MANIFEST_URL = "questions/library.yaml";
const STORAGE_KEY = "classroom-jeopardy-state-v2";
const MAX_TEAMS = 5;
const MAX_COLUMNS = 6;          // soft cap so the board stays readable
const BASE_VALUES = [100, 200, 300, 400, 500];

// ---- Library pool (loaded from YAML) ----
let pool = [];                  // [{category, level, value, question, answer}]
let levels = [];                // unique level tags
let allCategories = [];         // unique category tags (across all levels)

// ---- Game state (persisted) ----
let state = {
  numTeams: 3,
  teams: defaultTeams(),        // length MAX_TEAMS so names survive count changes
  level: "All",                 // level filter ("All" or a specific level)
  selectedCategories: [],       // ordered list of chosen category columns
  tier: 1,                      // 1 => 100–500, 2 => 200–1000
  board: null,                  // [{category, cells:[{base, display, question, answer, used, empty}]}]
};

let activeCell = null;          // {col, row, display}

function defaultTeams() {
  const t = [];
  for (let i = 0; i < MAX_TEAMS; i++) t.push({ name: `Team ${i + 1}`, score: 0 });
  return t;
}

// ---- DOM refs ----
const els = {
  title: document.getElementById("game-title"),
  poolInfo: document.getElementById("pool-info"),
  newGameBtn: document.getElementById("newgame-btn"),
  levelSelect: document.getElementById("level-select"),
  categoryList: document.getElementById("category-list"),
  catHint: document.getElementById("cat-hint"),
  generateBtn: document.getElementById("generate-btn"),
  buildMsg: document.getElementById("build-msg"),
  teamCount: document.getElementById("team-count-select"),
  teamList: document.getElementById("team-list"),
  board: document.getElementById("board"),
  boardEmpty: document.getElementById("board-empty"),
  overlay: document.getElementById("overlay"),
  overlayMeta: document.getElementById("overlay-meta"),
  overlayQuestion: document.getElementById("overlay-question"),
  overlayAnswer: document.getElementById("overlay-answer"),
  revealBtn: document.getElementById("reveal-btn"),
  assignValue: document.getElementById("assign-value"),
  assignButtons: document.getElementById("assign-buttons"),
  cancelBtn: document.getElementById("cancel-btn"),
};

// ============================================================
// Persistence
// ============================================================
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* storage may be unavailable; ignore */
  }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return;
    state.numTeams = saved.numTeams || 3;
    state.level = saved.level || "All";
    state.selectedCategories = Array.isArray(saved.selectedCategories) ? saved.selectedCategories : [];
    state.tier = saved.tier === 2 ? 2 : 1;
    state.board = saved.board || null;
    if (Array.isArray(saved.teams)) {
      for (let i = 0; i < MAX_TEAMS; i++) {
        if (saved.teams[i]) {
          state.teams[i].name = saved.teams[i].name ?? state.teams[i].name;
          state.teams[i].score = saved.teams[i].score ?? 0;
        }
      }
    }
  } catch (e) {
    /* corrupt storage; start fresh */
  }
}

// ============================================================
// Library loading
// ============================================================
async function loadLibrary() {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error(`Could not load ${MANIFEST_URL} (${res.status})`);
  const manifest = jsyaml.load(await res.text()) || {};
  const files = manifest.files || [];

  const loaded = await Promise.all(
    files.map(async (f) => {
      const r = await fetch("questions/" + f);
      if (!r.ok) throw new Error(`Could not load ${f} (${r.status})`);
      const data = jsyaml.load(await r.text()) || {};
      return data.questions || [];
    })
  );

  pool = loaded.flat().filter((q) => q && q.category && q.value && q.question);
  levels = [...new Set(pool.map((q) => q.level).filter(Boolean))];
  allCategories = [...new Set(pool.map((q) => q.category))];

  els.poolInfo.textContent = `${pool.length} questions · ${allCategories.length} categories`;
}

// ---- Pool queries ----
function categoriesForLevel(level) {
  const match = level === "All" ? pool : pool.filter((q) => q.level === level);
  return [...new Set(match.map((q) => q.category))];
}

function candidates(category, base, level) {
  return pool.filter(
    (q) =>
      q.category === category &&
      q.value === base &&
      (level === "All" || q.level === level)
  );
}

// ============================================================
// Setup controls
// ============================================================
function renderLevelSelect() {
  els.levelSelect.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "All";
  optAll.textContent = "All levels";
  els.levelSelect.appendChild(optAll);
  levels.forEach((lv) => {
    const o = document.createElement("option");
    o.value = lv;
    o.textContent = lv;
    els.levelSelect.appendChild(o);
  });
  els.levelSelect.value = state.level;
}

function renderCategoryList() {
  const avail = categoriesForLevel(state.level);
  // Drop any selected categories no longer available under this level.
  state.selectedCategories = state.selectedCategories.filter((c) => avail.includes(c));

  els.categoryList.innerHTML = "";
  avail.forEach((cat) => {
    const count = pool.filter((q) => q.category === cat).length;
    const id = "cat-" + cat.replace(/\W+/g, "-");
    const label = document.createElement("label");
    label.className = "cat-item";
    label.htmlFor = id;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.checked = state.selectedCategories.includes(cat);
    cb.addEventListener("change", () => toggleCategory(cat, cb.checked));

    const text = document.createElement("span");
    text.innerHTML = `${cat} <small>· ${count}</small>`;

    label.appendChild(cb);
    label.appendChild(text);
    els.categoryList.appendChild(label);
  });

  els.catHint.textContent = `(${state.selectedCategories.length} chosen, up to ${MAX_COLUMNS})`;
}

function toggleCategory(cat, checked) {
  if (checked) {
    if (state.selectedCategories.length >= MAX_COLUMNS) {
      flashBuildMsg(`Up to ${MAX_COLUMNS} categories — uncheck one first.`);
      renderCategoryList(); // re-sync the checkbox that we are rejecting
      return;
    }
    if (!state.selectedCategories.includes(cat)) state.selectedCategories.push(cat);
  } else {
    state.selectedCategories = state.selectedCategories.filter((c) => c !== cat);
  }
  els.catHint.textContent = `(${state.selectedCategories.length} chosen, up to ${MAX_COLUMNS})`;
  saveState();
}

function selectedTier() {
  const r = document.querySelector('input[name="tier"]:checked');
  return r && r.value === "2" ? 2 : 1;
}

function flashBuildMsg(msg) {
  els.buildMsg.textContent = msg;
  clearTimeout(flashBuildMsg._t);
  flashBuildMsg._t = setTimeout(() => (els.buildMsg.textContent = ""), 4000);
}

// ============================================================
// Board generation (draw from the pool)
// ============================================================
function generateBoard() {
  if (state.selectedCategories.length === 0) {
    flashBuildMsg("Pick at least one category.");
    return;
  }
  if (boardHasProgress() && !confirm("Generate a new board? This replaces the current questions.")) {
    return;
  }

  state.tier = selectedTier();
  const usedEntries = new Set(); // avoid the same question appearing twice
  const thin = [];

  state.board = state.selectedCategories.map((cat) => {
    const cells = BASE_VALUES.map((base) => {
      const opts = candidates(cat, base, state.level).filter((q) => !usedEntries.has(q));
      if (opts.length === 0) {
        return { base, display: base * state.tier, empty: true, used: false };
      }
      if (opts.length === 1) thin.push(`${cat} ${base}`);
      const pick = opts[Math.floor(Math.random() * opts.length)];
      usedEntries.add(pick);
      return {
        base,
        display: base * state.tier,
        question: pick.question,
        answer: pick.answer || "",
        used: false,
        empty: false,
      };
    });
    return { category: cat, cells };
  });

  saveState();
  renderBoard();

  const emptyCount = state.board.reduce(
    (n, col) => n + col.cells.filter((c) => c.empty).length,
    0
  );
  if (emptyCount > 0) {
    flashBuildMsg(`Board built. ${emptyCount} cell(s) had no question in the pool — add more entries to fill them.`);
  } else {
    flashBuildMsg("Board built.");
  }
}

function boardHasProgress() {
  if (!state.board) return false;
  return state.board.some((col) => col.cells.some((c) => c.used));
}

// ============================================================
// Board rendering
// ============================================================
function renderBoard() {
  els.board.innerHTML = "";
  if (!state.board || state.board.length === 0) {
    els.boardEmpty.classList.remove("hidden");
    els.board.classList.add("hidden");
    return;
  }
  els.boardEmpty.classList.add("hidden");
  els.board.classList.remove("hidden");

  const numCols = state.board.length;
  els.board.style.gridTemplateColumns = `repeat(${numCols}, 1fr)`;
  els.board.style.gridTemplateRows = `auto repeat(${BASE_VALUES.length}, 1fr)`;

  // Header row
  state.board.forEach((col) => {
    const h = document.createElement("div");
    h.className = "cat-header";
    h.textContent = col.category;
    els.board.appendChild(h);
  });

  // Value rows
  for (let r = 0; r < BASE_VALUES.length; r++) {
    state.board.forEach((col, c) => {
      const cell = col.cells[r];
      const div = document.createElement("div");
      div.className = "cell";
      div.setAttribute("role", "gridcell");
      if (cell.empty || cell.used) {
        div.classList.add("used");
        div.textContent = "";
      } else {
        div.textContent = cell.display;
        div.addEventListener("click", () => openQuestion(c, r));
      }
      els.board.appendChild(div);
    });
  }
}

// ============================================================
// Question overlay
// ============================================================
function openQuestion(col, row) {
  const cell = state.board[col].cells[row];
  if (!cell || cell.empty || cell.used) return;
  activeCell = { col, row, display: cell.display };

  els.overlayMeta.textContent = `${state.board[col].category} — ${cell.display}`;
  els.overlayQuestion.textContent = cell.question || "";

  if (cell.answer) {
    els.overlayAnswer.textContent = cell.answer;
    els.overlayAnswer.classList.add("hidden");
    els.revealBtn.classList.remove("hidden");
  } else {
    els.overlayAnswer.classList.add("hidden");
    els.revealBtn.classList.add("hidden");
  }

  els.assignValue.textContent = cell.display;
  buildAssignButtons();
  els.overlay.classList.remove("hidden");
}

function buildAssignButtons() {
  els.assignButtons.innerHTML = "";
  for (let i = 0; i < state.numTeams; i++) {
    const btn = document.createElement("button");
    btn.textContent = state.teams[i].name || `Team ${i + 1}`;
    btn.addEventListener("click", () => resolveQuestion(i));
    els.assignButtons.appendChild(btn);
  }
  const none = document.createElement("button");
  none.className = "no-team";
  none.textContent = "No Team";
  none.addEventListener("click", () => resolveQuestion(null));
  els.assignButtons.appendChild(none);
}

function resolveQuestion(teamIndex) {
  if (!activeCell) return;
  if (teamIndex !== null) {
    state.teams[teamIndex].score += activeCell.display;
  }
  state.board[activeCell.col].cells[activeCell.row].used = true;
  closeOverlay();
  renderBoard();
  renderTeams();
  saveState();
}

function closeOverlay() {
  els.overlay.classList.add("hidden");
  els.overlayAnswer.classList.add("hidden");
  activeCell = null;
}

// ============================================================
// Teams sidebar
// ============================================================
function renderTeams() {
  els.teamList.innerHTML = "";
  for (let i = 0; i < state.numTeams; i++) {
    const team = state.teams[i];
    const li = document.createElement("li");
    li.className = "team-card";

    const nameInput = document.createElement("input");
    nameInput.className = "team-name";
    nameInput.type = "text";
    nameInput.value = team.name;
    nameInput.addEventListener("input", () => {
      team.name = nameInput.value;
      saveState();
    });

    const score = document.createElement("div");
    score.className = "score" + (team.score < 0 ? " negative" : "");
    score.textContent = team.score;

    const adjust = document.createElement("div");
    adjust.className = "score-adjust";
    const minus = document.createElement("button");
    minus.textContent = "−";
    minus.title = "Subtract 100 (fix a mistake)";
    minus.addEventListener("click", () => {
      team.score -= 100;
      renderTeams();
      saveState();
    });
    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.title = "Add 100";
    plus.addEventListener("click", () => {
      team.score += 100;
      renderTeams();
      saveState();
    });
    adjust.appendChild(minus);
    adjust.appendChild(plus);

    li.appendChild(nameInput);
    li.appendChild(score);
    li.appendChild(adjust);
    els.teamList.appendChild(li);
  }
}

function setTeamCount(n) {
  state.numTeams = Math.min(MAX_TEAMS, Math.max(1, n));
  els.teamCount.value = String(state.numTeams);
  renderTeams();
  saveState();
}

// ============================================================
// New game (reset scores, restore squares of the current board)
// ============================================================
function newGame() {
  if (!confirm("Start a new game? This clears all scores and restores every square (same board).")) return;
  state.teams.forEach((t) => (t.score = 0));
  if (state.board) state.board.forEach((col) => col.cells.forEach((c) => (c.used = false)));
  renderBoard();
  renderTeams();
  saveState();
}

// ============================================================
// Wiring
// ============================================================
function attachEvents() {
  els.newGameBtn.addEventListener("click", newGame);
  els.generateBtn.addEventListener("click", generateBoard);
  els.levelSelect.addEventListener("change", () => {
    state.level = els.levelSelect.value;
    renderCategoryList();
    saveState();
  });
  els.teamCount.addEventListener("change", () => setTeamCount(parseInt(els.teamCount.value, 10)));
  els.revealBtn.addEventListener("click", () => els.overlayAnswer.classList.remove("hidden"));
  els.cancelBtn.addEventListener("click", closeOverlay);
  els.overlay.addEventListener("click", (e) => {
    if (e.target === els.overlay) closeOverlay();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.overlay.classList.contains("hidden")) closeOverlay();
  });
  document.querySelectorAll('input[name="tier"]').forEach((r) =>
    r.addEventListener("change", () => {
      state.tier = selectedTier();
      saveState();
    })
  );
}

function showError(err) {
  console.error(err);
  els.boardEmpty.innerHTML =
    "Could not load the question library. If you opened index.html directly, " +
    "run a local server instead (see README) or view it via GitHub Pages.";
  els.boardEmpty.classList.remove("hidden");
}

async function init() {
  loadState();
  els.teamCount.value = String(state.numTeams);
  document.querySelector(`input[name="tier"][value="${state.tier}"]`).checked = true;
  renderTeams();
  attachEvents();

  try {
    await loadLibrary();
    renderLevelSelect();

    // First-time visit: preselect a default set of columns and auto-build.
    if (state.selectedCategories.length === 0 && !state.board) {
      state.selectedCategories = categoriesForLevel(state.level).slice(0, MAX_COLUMNS);
    }
    renderCategoryList();

    if (state.board) {
      renderBoard();
    } else if (state.selectedCategories.length > 0) {
      generateBoard();
    }
  } catch (err) {
    showError(err);
  }
}

init();
