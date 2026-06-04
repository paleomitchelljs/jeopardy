# Classroom Jeopardy

A static, no-build Jeopardy board for the classroom. Questions live in an editable
**library** (YAML); at game time you choose a level, pick category-columns, and the
board **draws a random question** for each category + value cell. Set up 1–5 teams,
click a square to show the question full-screen, then award the points to a team (or
to no one). Used squares blank out automatically.

Everything is plain HTML/CSS/JS plus YAML, so it runs on **GitHub Pages** with no
build step.

## How it works

Instead of fixed boards, every question is a standalone library entry tagged with a
`category`, a point `value`, and a `level`. A board is *assembled* from the pool:

- Pick a **level** (or "All levels") and check the **categories** you want as columns.
- Pick a **point tier** — `100–500` or `200–1000` (the tier just scales the display
  and the points awarded; base values in the YAML stay `100–500`).
- Click **Generate Board**. For each chosen category and each value, one matching
  question is drawn at random (no question repeats on a board). Generate again to
  reshuffle.

The deeper a category's pool (more entries sharing a `category` + `value`), the more
variety each board has. The Earth & Space categories ship with **5 questions per
cell**; the 7th-grade categories with **2**.

## Files

```
index.html                 Page structure
style.css                  Classic blue-and-gold styling + setup panel
app.js                     Library loading, board draw, team scoring
questions/
  library.yaml             Manifest: which library files to load
  life-science.yaml        Question entries (edit these!)
  physical-science.yaml
  earth-space.yaml
```

## Hosting on GitHub Pages

1. Push these files to a repo (`index.html`, `style.css`, `app.js`, and `questions/`).
2. In the repo, **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, pick
   your branch (e.g. `main`) and the `/ (root)` folder, **Save**.
4. After a minute it's live at `https://<username>.github.io/<repo>/`.

## Testing locally

Browsers block `fetch()` of local files opened directly (`file://`), so run a tiny
server:

```bash
# from inside this folder
python3 -m http.server 8000
# then open http://localhost:8000
```

## Editing / adding questions

Open any file in `questions/`. Each is a flat list of entries:

```yaml
questions:
  - category: "Geology"                 # the column theme / tag
    level: "Earth & Space (8-9)"        # grouping tag for the Level filter
    value: 100                          # base point tier: 100,200,300,400,500
    question: "The thin, solid outer layer of the Earth where we live."
    answer: "The crust"                 # optional; powers the Reveal Answer button
```

To add a question, copy an entry and edit it. To **deepen a cell** (more variety in
random draws), add more entries with the same `category` + `value`. To make a **new
category**, just use a new `category` name — it shows up automatically in the
Categories list. To make a **new level**, use a new `level` string.

`answer` is optional: include it and a **Reveal Answer** button appears on the
full-screen question; omit it and no button shows. Wrap text in double quotes so
colons and apostrophes are safe.

### Adding a whole new library file

1. Create `questions/my-topic.yaml` with a `questions:` list as above.
2. Add it to `questions/library.yaml`:

```yaml
files:
  - life-science.yaml
  - physical-science.yaml
  - earth-space.yaml
  - my-topic.yaml
```

## Playing

- **Build Board (left panel):** choose a level, check up to 6 categories, pick the
  point tier, and click **Generate Board**. Re-click any time to reshuffle.
- **Teams:** choose 1–5. Click a team name to rename it. The `+`/`−` buttons (±100)
  fix scores manually.
- **Play a square:** click it → the question fills the screen → optionally **Reveal
  Answer** → click the team that got it right, or **No Team**. The square blanks and
  the score updates. **Cancel / Esc** closes without using the square.
- **New Game (top bar):** clears all scores and restores every square of the *current*
  board (same questions). Use **Generate Board** for fresh questions.
- Scores, selections, and the current board are saved in your browser, so a refresh
  won't lose the game. (Stored per browser, not shared between devices.)

## Included content

120 questions across 9 categories and 2 levels:

- **7th Grade** — *Cells & Classification, Human Body, Genetics, Ecology* (life),
  *Matter & Atoms, Forces & Energy, Reactions & Mixtures* (physical) — 2 per cell.
- **Earth & Space (Gr 8–9)** — *Geology* (Earth's layers, plate tectonics, rocks,
  earthquakes/volcanoes, weathering) and *Astronomy* (solar system, stars, Earth/Moon,
  exploration, the universe) — 5 per cell, so columns draw from a real pool.

> Clues are written in plain "question → answer" form (clearer for class) rather than
> the show's "answer → question" phrasing. Edit any entry's `question`/`answer` to
> switch styles.

## Notes / roadmap

- A two-page **landing → setup → launch** flow was discussed and deferred; the setup
  controls currently live inline in the left panel.
