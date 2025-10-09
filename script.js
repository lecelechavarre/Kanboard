// ============ CONFIG & DATA ============
const STORAGE_KEY = "kanban-wow.v1";
const bc = new BroadcastChannel("kanban-wow-sync");

let board = loadBoard() || defaultBoard();
let undoStack = [];

function defaultBoard() {
  return {
    columns: [
      { id: "col-1", title: "Backlog", width: 280, taskIds: ["t1", "t2"] },
      { id: "col-2", title: "In Progress", width: 280, taskIds: ["t3"] },
      { id: "col-3", title: "Done", width: 280, taskIds: [] },
    ],
    tasks: {
      t1: { id: "t1", title: "✨ Design the UI" },
      t2: { id: "t2", title: "🧠 Build Logic" },
      t3: { id: "t3", title: "🚀 Polish UX" },
    },
  };
}

// ============ STORAGE ============
function saveBoard() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  bc.postMessage({ type: "update", board });
}
function loadBoard() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}
bc.onmessage = (e) => {
  if (e.data.type === "update") {
    board = e.data.board;
    render();
  }
};

// ============ RENDER ============
const boardEl = document.getElementById("board");
function render() {
  boardEl.innerHTML = "";

  board.columns.forEach((col, idx) => {
    const colEl = document.createElement("div");
    colEl.className = "column";
    colEl.style.width = col.width + "px";
    colEl.dataset.id = col.id;

    colEl.innerHTML = `<h3>${col.title}</h3><div class="list"></div>`;
    const list = colEl.querySelector(".list");

    col.taskIds.forEach((tid) => {
      const t = board.tasks[tid];
      const card = document.createElement("div");
      card.className = "card";
      card.textContent = t.title;
      card.draggable = true;
      card.dataset.id = t.id;

      card.addEventListener("dragstart", () => {
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
      });

      list.appendChild(card);
    });

    // Drop logic
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      const dragging = document.querySelector(".dragging");
      const after = getDragAfterElement(list, e.clientY);
      if (after == null) list.appendChild(dragging);
      else list.insertBefore(dragging, after);
    });

    list.addEventListener("drop", () => {
      const dragging = document.querySelector(".dragging");
      if (!dragging) return;
      const id = dragging.dataset.id;
      moveTaskToColumn(id, col.id);
      saveBoard();
      showUndo({ type: "move", taskId: id });
      render();
    });

    boardEl.appendChild(colEl);

    // Gutter
    if (idx < board.columns.length - 1) {
      const gutter = document.createElement("div");
      gutter.className = "gutter";
      gutter.addEventListener("pointerdown", startResize(col));
      boardEl.appendChild(gutter);
    }
  });
}

// ============ LOGIC ============
function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".card:not(.dragging)")];
  return els.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      } else return closest;
    },
    { offset: -Infinity }
  ).element;
}

function moveTaskToColumn(taskId, newColId) {
  const oldCol = board.columns.find((c) => c.taskIds.includes(taskId));
  const newCol = board.columns.find((c) => c.id === newColId);
  if (!oldCol || !newCol) return;
  oldCol.taskIds = oldCol.taskIds.filter((id) => id !== taskId);
  newCol.taskIds.push(taskId);
  animateFLIP();
}

function animateFLIP() {
  const cards = document.querySelectorAll(".card");
  cards.forEach((el) => {
    const first = el.getBoundingClientRect();
    requestAnimationFrame(() => {
      const last = el.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.transition = "transform 260ms cubic-bezier(.2,.8,.2,1)";
      requestAnimationFrame(() => (el.style.transform = ""));
    });
  });
}

// ============ RESIZE ============
function startResize(col) {
  return (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = col.width;
    function onMove(ev) {
      const dx = ev.clientX - startX;
      col.width = Math.max(200, startW + dx);
      render();
    }
    function onUp() {
      saveBoard();
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };
}

// ============ UNDO ============
function showUndo(action) {
  undoStack.push(action);
  const bar = document.getElementById("snackbar");
  bar.innerHTML = `Task moved <button>Undo</button>`;
  bar.className = "snackbar show";

  const btn = bar.querySelector("button");
  btn.onclick = () => {
    const last = undoStack.pop();
    if (last) undoMove(last.taskId);
    bar.className = "snackbar";
  };
  setTimeout(() => (bar.className = "snackbar"), 4000);
}

function undoMove(taskId) {
  // Just move back to first column for simplicity
  const t = board.tasks[taskId];
  if (!t) return;
  board.columns.forEach((c) => (c.taskIds = c.taskIds.filter((id) => id !== taskId)));
  board.columns[0].taskIds.push(taskId);
  saveBoard();
  render();
}

// ============ ADD TASK ============
document.getElementById("addTaskBtn").addEventListener("click", () => {
  const id = "t" + Date.now();
  const title = prompt("Task title:");
  if (!title) return;
  board.tasks[id] = { id, title };
  board.columns[0].taskIds.push(id);
  saveBoard();
  render();
});

// ============ INIT ============
render();
