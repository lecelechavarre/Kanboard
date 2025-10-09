const STORAGE_KEY = "kanban.wow.v3";
const WIDTH_KEY = "kanban.wow.widths.v3";
const bc = new BroadcastChannel("kanban-wow-sync-v3");
const boardEl = document.getElementById("board");
const modal = document.getElementById("modal");
const snackbar = document.getElementById("snackbar");
const fileInput = document.getElementById("fileInput");

function uid(prefix = "id") { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function qs(sel, el = document) { return el.querySelector(sel); }
function qsa(sel, el = document) { return Array.from(el.querySelectorAll(sel)); }

function saveBoard(b) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
    bc.postMessage({type: "board:update", board: b});
  } catch (err) { console.error("save failed", err); }
}
function loadBoard() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function saveWidths(cols) {
  const map = {};
  cols.forEach(c => map[c.id] = c.width);
  try { localStorage.setItem(WIDTH_KEY, JSON.stringify(map)); } catch {}
}
function loadWidths() {
  try { return JSON.parse(localStorage.getItem(WIDTH_KEY)) || {}; } catch { return {}; }
}
bc.onmessage = (e) => {
  if (e.data?.type === "board:update") {
    board = e.data.board;
    render();
  }
};

/* ====== Initial board (if none) ====== */
let board = loadBoard() || {
  columns: [
    { id: "col-1", title: "Backlog", icon: "📝", width: 300, taskIds: [] },
    { id: "col-2", title: "In Progress", icon: "⚙️", width: 320, taskIds: [] },
    { id: "col-3", title: "Done", icon: "✅", width: 300, taskIds: [] }
  ],
  tasks: {}
};

/* apply saved widths */
const savedW = loadWidths();
board.columns.forEach(c => { if (savedW[c.id]) c.width = savedW[c.id]; });

/* undo stack: keep last move action */
let undoStack = [];

/* ====== Simple Markdown renderer (small, safe) ======
   Supports:
   - headings (# ...)
   - bold **text**
   - italic *text*
   - unordered lists starting with - or *
   - links [text](url)
   - inline code `code`
   This is minimal and sanitizes by escaping HTML.
*/
function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function renderMarkdown(md) {
  if (!md) return "";
  const lines = md.split(/\r?\n/);
  const out = [];
  lines.forEach(line => {
    let l = line.trim();
    if (l.startsWith('# ')) out.push(`<h1>${escapeHtml(l.slice(2))}</h1>`);
    else if (l.startsWith('## ')) out.push(`<h2>${escapeHtml(l.slice(3))}</h2>`);
    else if (l.match(/^[-*]\s+/)) {
      // list: accumulate contiguous list items
      out.push(`<ul><li>${escapeHtml(l.replace(/^[-*]\s+/, ''))}</li>`);
      // merge subsequent list lines
    } else {
      // inline transforms
      let html = escapeHtml(l)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
      out.push(`<p>${html}</p>`);
    }
  });
  // Post-process to join separated UL placeholders (simple)
  let html = out.join("");
  // fix adjacent <ul> fragments (very small patch)
  html = html.replace(/<\/ul><ul>/g, '');
  return html;
}

/* ====== Render (main) ====== */
function render() {
  // record first positions for FLIP
  const firstRects = {};
  qsa(".card").forEach(el => firstRects[el.dataset.id] = el.getBoundingClientRect());

  boardEl.innerHTML = "";
  board.columns.forEach((col, idx) => {
    const colEl = document.createElement("div");
    colEl.className = "column";
    colEl.style.width = (col.width || 300) + "px";
    colEl.dataset.col = col.id;

    // header
    const header = document.createElement("div");
    header.className = "column-header";
    header.innerHTML = `
      <div class="col-icon">${col.icon || "📂"}</div>
      <div class="col-title">${col.title}</div>
      <div class="col-stats">
        <div class="progress" aria-hidden="true"><div class="progress-bar" style="width:0%"></div></div>
        <div class="count" style="font-size:12px;color:var(--muted)"></div>
      </div>
    `;
    colEl.appendChild(header);

    // list
    const list = document.createElement("div");
    list.className = "list";
    list.dataset.col = col.id;

    // tasks
    col.taskIds.forEach(tid => {
      const t = board.tasks[tid];
      if (!t) return;
      const card = document.createElement("div");
      card.className = "card";
      card.draggable = true;
      card.dataset.id = tid;

      // build labels markup
      const labelsHtml = (t.labels || []).map(l => `<span class="label" title="${escapeHtml(l.trim())}">${escapeHtml(l.trim())}</span>`).join("");

      // due date formatting
      let dueHtml = "";
      if (t.due) {
        const d = new Date(t.due);
        if (!isNaN(d)) {
          const today = new Date(); today.setHours(0,0,0,0);
          const dd = new Date(d); dd.setHours(0,0,0,0);
          const ms = dd - today;
          let hint = "";
          if (ms < 0) hint = " (overdue)";
          else if (ms === 0) hint = " (today)";
          dueHtml = `<div class="due">${dd.toLocaleDateString()}${hint}</div>`;
        }
      }

      // done checkbox
      const doneChecked = t.done ? 'checked' : '';

      card.innerHTML = `
        <div class="card-top">
          <div class="card-left">
            <div>
              <div class="title">${escapeHtml(t.title)}</div>
              <div class="desc">${escapeHtml((t.desc || "").slice(0,120))}${(t.desc||"").length>120?"…":""}</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <div class="labels">${labelsHtml}</div>
            ${dueHtml}
            <label style="font-size:12px;color:var(--muted)"><input class="done-checkbox" type="checkbox" ${doneChecked} /> Done</label>
          </div>
        </div>
      `;

      // drag events
      card.addEventListener("dragstart", (ev) => {
        ev.dataTransfer.setData("text/plain", tid);
        card.classList.add("dragging");
        card.dataset.startCol = col.id;
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));

      // double-click to edit
      card.addEventListener("dblclick", () => openEditTask(tid));

      // done checkbox handling
      card.querySelectorAll(".done-checkbox").forEach(inp => {
        inp.addEventListener("change", (ev) => {
          t.done = ev.target.checked;
          saveBoard(board);
          render(); // re-render to update progress
        });
      });

      list.appendChild(card);
    });

    // quick-add button
    const addWrap = document.createElement("div");
    addWrap.className = "add-col";
    addWrap.innerHTML = `<button class="btn small-btn">＋ Add</button>`;
    addWrap.querySelector("button").addEventListener("click", () => {
      const title = prompt("Task title:");
      if (!title) return;
      const id = uid("t");
      board.tasks[id] = { id, title, desc: "", labels: [], due: null, done: false };
      col.taskIds.unshift(id); // top
      saveBoard(board);
      render();
      showSnackbar("Task added");
    });

    colEl.appendChild(list);
    colEl.appendChild(addWrap);

    // list drop handlers
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      list.classList.add("drag-over");
      const dragging = document.querySelector(".dragging");
      const after = getDragAfterElement(list, e.clientY);
      if (dragging && after == null) list.appendChild(dragging);
      else if (dragging && after) list.insertBefore(dragging, after);
    });
    list.addEventListener("dragleave", () => list.classList.remove("drag-over"));
    list.addEventListener("drop", (e) => {
      e.preventDefault();
      list.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      const fromCol = findColumnContainingTask(id);
      const toCol = col.id;
      if (!id || !fromCol) return;
      // compute index where it ended
      const currentChildren = [...list.querySelectorAll(".card")];
      const index = currentChildren.findIndex(ch => ch.dataset.id === id);
      // store index in original column for undo
      const indexFrom = board.columns.find(c => c.id === fromCol).taskIds.indexOf(id);
      moveTask(id, fromCol, toCol, index);
      saveBoard(board);
      // push undo info
      undoStack.push({ type: "move", taskId: id, from: fromCol, to: toCol, indexFrom });
      showSnackbar("Task moved", true);
      render();
    });

    // append column and gutter
    boardEl.appendChild(colEl);
    if (idx < board.columns.length - 1) {
      const gutter = document.createElement("div");
      gutter.className = "gutter";
      gutter.addEventListener("pointerdown", startResize(col));
      boardEl.appendChild(gutter);
    }
  });

  // update progress bars
  board.columns.forEach(col => {
    const colNode = boardEl.querySelector(`.column[data-col="${col.id}"]`);
    if (!colNode) return;
    const progressEl = colNode.querySelector(".progress-bar");
    const countEl = colNode.querySelector(".count");
    const total = col.taskIds.length || 0;
    const done = col.taskIds.filter(tid => (board.tasks[tid] && board.tasks[tid].done)).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    progressEl.style.width = pct + "%";
    countEl.textContent = `${done}/${total}`;
  });

  // FLIP animation
  requestAnimationFrame(() => {
    qsa(".card").forEach(el => {
      const id = el.dataset.id;
      if (!id) return;
      const first = firstRects[id];
      if (!first) return;
      const last = el.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.transition = "transform 260ms cubic-bezier(.2,.8,.2,1)";
        requestAnimationFrame(() => el.style.transform = "");
        el.addEventListener("transitionend", () => { el.style.transition = ""; }, { once: true });
      }
    });
  });
}

/* ====== Drag helpers ====== */
function getDragAfterElement(container, y) {
  const elements = [...container.querySelectorAll(".card:not(.dragging)")];
  return elements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity }).element;
}
function findColumnContainingTask(taskId) {
  const col = board.columns.find(c => c.taskIds.includes(taskId));
  return col ? col.id : null;
}
function moveTask(taskId, fromColId, toColId, index = null) {
  const fromCol = board.columns.find(c => c.id === fromColId);
  const toCol = board.columns.find(c => c.id === toColId);
  if (!fromCol || !toCol) return;
  // remove
  fromCol.taskIds = fromCol.taskIds.filter(id => id !== taskId);
  // insert
  if (index === null || index === -1) toCol.taskIds.push(taskId);
  else toCol.taskIds.splice(index, 0, taskId);
}

/* ====== Resize columns (pointer) ====== */
function startResize(column) {
  return function (e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = column.width || 300;
    function onMove(ev) {
      const dx = ev.clientX - startX;
      column.width = Math.max(200, startW + dx);
      render();
    }
    function onUp() {
      saveWidths(board.columns);
      saveBoard(board);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };
}

/* ====== Modal (edit task) ====== */
let editingId = null;
function openEditTask(taskId) {
  editingId = taskId;
  const t = board.tasks[taskId];
  if (!t) return;
  modal.setAttribute("aria-hidden", "false");
  qs("#taskTitle").value = t.title || "";
  qs("#taskDesc").value = t.desc || "";
  qs("#taskLabels").value = (t.labels || []).join(", ");
  qs("#taskDue").value = t.due ? t.due.split("T")[0] : "";
  qs("#taskDone").checked = !!t.done;
  // reset preview
  qs("#mdPreview").innerHTML = "";
  qs("#mdPreview").hidden = true;
}
function closeModal() {
  modal.setAttribute("aria-hidden", "true");
  editingId = null;
}
qs("[data-close='true']", modal).addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target.dataset.close === "true") closeModal();
});

qs("#togglePreview").addEventListener("click", () => {
  const preview = qs("#mdPreview");
  const shown = !preview.hidden;
  if (shown) {
    preview.hidden = true;
    return;
  }
  const md = qs("#taskDesc").value;
  preview.innerHTML = renderMarkdown(md);
  preview.hidden = false;
});

qs("#saveTask").addEventListener("click", () => {
  if (!editingId) return;
  const t = board.tasks[editingId];
  t.title = qs("#taskTitle").value.trim() || t.title;
  t.desc = qs("#taskDesc").value;
  const labels = qs("#taskLabels").value.split(",").map(s => s.trim()).filter(Boolean);
  t.labels = labels;
  const dueVal = qs("#taskDue").value;
  t.due = dueVal ? new Date(dueVal).toISOString() : null;
  t.done = !!qs("#taskDone").checked;
  saveBoard(board);
  closeModal();
  render();
});

qs("#deleteTask").addEventListener("click", () => {
  if (!editingId) return;
  if (!confirm("Delete this task?")) return;
  delete board.tasks[editingId];
  board.columns.forEach(c => c.taskIds = c.taskIds.filter(id => id !== editingId));
  saveBoard(board);
  closeModal();
  render();
  showSnackbar("Task deleted");
});

/* ====== Snackbar & Undo ====== */
let snackbarTimeout = null;
function showSnackbar(message = "", withUndo = false) {
  snackbar.innerHTML = `<span>${escapeHtml(message)}</span>`;
  if (withUndo) {
    const btn = document.createElement("button");
    btn.textContent = "Undo";
    btn.addEventListener("click", () => {
      const action = undoStack.pop();
      if (action && action.type === "move") {
        // revert: move task back to origin at original index
        moveTask(action.taskId, action.to, action.from, action.indexFrom || 0);
        saveBoard(board);
        render();
        showSnackbar("Reverted");
      }
      hideSnackbar();
    });
    snackbar.appendChild(btn);
  }
  snackbar.classList.add("show");
  clearTimeout(snackbarTimeout);
  snackbarTimeout = setTimeout(hideSnackbar, 6000);
}
function hideSnackbar() { snackbar.classList.remove("show"); }

/* ====== Export / Import ====== */
document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `kanban-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById("importBtn").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data && data.columns && data.tasks) {
        board = data;
        saveBoard(board);
        saveWidths(board.columns);
        render();
        showSnackbar("Board imported");
      } else showSnackbar("Invalid board JSON");
    } catch (err) { showSnackbar("Failed to import"); }
  };
  reader.readAsText(f);
});

/* ====== Global Add + Keyboard shortcuts ====== */
document.getElementById("addTaskGlobal").addEventListener("click", () => {
  const title = prompt("Global task title:");
  if (!title) return;
  const id = uid("t");
  board.tasks[id] = { id, title, desc: "", labels: [], due: null, done: false };
  board.columns[0].taskIds.unshift(id);
  saveBoard(board);
  render();
  showSnackbar("Task added");
});
boardEl.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "n") {
    const focusedCol = document.activeElement?.closest?.(".column")?.dataset?.col;
    const col = board.columns.find(c => c.id === focusedCol) || board.columns[0];
    const title = prompt(`New task in "${col.title}"`);
    if (!title) return;
    const id = uid("t");
    board.tasks[id] = { id, title, desc: "", labels: [], due: null, done: false };
    col.taskIds.unshift(id);
    saveBoard(board);
    render();
    showSnackbar("Task added");
  }
  if (e.key === "Escape") {
    if (modal.getAttribute("aria-hidden") === "false") closeModal();
  }
});

/* ====== Helpers ====== */
function animateFLIPForAll() {
  qsa(".card").forEach(el => {
    el.style.transition = "transform .26s cubic-bezier(.2,.8,.2,1)";
    el.style.transform = "";
    setTimeout(() => el.style.transition = "", 300);
  });
}

/* ====== Init render & periodic save ====== */
render();
setInterval(() => saveBoard(board), 5000);
