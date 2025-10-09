const STORAGE_KEY = "kanban.pro.v1";
const WIDTH_KEY = "kanban.pro.widths.v1";
const THEME_KEY = "kanban.pro.theme.v1";
const bc = new BroadcastChannel("kanban-pro-sync-v1");

const boardEl = document.getElementById("board");
const modal = document.getElementById("modal");
const snackbar = document.getElementById("snackbar");
const fileInput = document.getElementById("fileInput");
const labelFiltersEl = document.getElementById("labelFilters");
const themeToggle = document.getElementById("themeToggle");

function uid(pref = "id"){ return pref + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function qs(sel, el=document){ return el.querySelector(sel); }
function qsa(sel, el=document){ return Array.from(el.querySelectorAll(sel)); }
function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ===== Storage, BC ===== */
function saveBoard(b){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
    bc.postMessage({type:"board:update", board: b});
  }catch(e){ console.error("save failed", e); }
}
function loadBoard(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)); }catch{ return null; } }
function saveWidths(cols){
  const m={}; cols.forEach(c=>m[c.id]=c.width);
  try{ localStorage.setItem(WIDTH_KEY, JSON.stringify(m)); }catch{}
}
function loadWidths(){ try{ return JSON.parse(localStorage.getItem(WIDTH_KEY)) || {}; }catch{return {}; } }
bc.onmessage = (e)=>{ if(e.data?.type==="board:update"){ board = e.data.board; render(); } };

/* ===== Theme handling ===== */
function setTheme(t){
  document.body.setAttribute("data-theme", t);
  localStorage.setItem(THEME_KEY, t);
  themeToggle.textContent = t === "dark" ? "☀️" : "🌙";
}
const savedTheme = localStorage.getItem(THEME_KEY) || "light";
setTheme(savedTheme);
themeToggle.addEventListener("click", ()=> setTheme(document.body.getAttribute("data-theme")==="dark"?"light":"dark"));

/* ===== Board initial state ===== */
let board = loadBoard() || {
  columns: [
    { id:"col-1", title:"Backlog", icon:"📝", width:300, taskIds:[] },
    { id:"col-2", title:"In Progress", icon:"⚙️", width:320, taskIds:[] },
    { id:"col-3", title:"Done", icon:"✅", width:300, taskIds:[] }
  ],
  tasks: {}
};
const savedW = loadWidths(); board.columns.forEach(c=>{ if(savedW[c.id]) c.width = savedW[c.id]; });

/* undo stack */
let undoStack = [];

/* label palette (colors for chips) */
const LABEL_COLORS = ["gray","red","orange","green","blue"];
let activeLabelFilters = new Set();

/* ===== Markdown (simple) ===== */
function renderMarkdown(md){
  if(!md) return "";
  const esc = escapeHtml(md);
  return esc
    .replace(/^###### (.*$)/gm,'<h6>$1</h6>')
    .replace(/^##### (.*$)/gm,'<h5>$1</h5>')
    .replace(/^#### (.*$)/gm,'<h4>$1</h4>')
    .replace(/^### (.*$)/gm,'<h3>$1</h3>')
    .replace(/^## (.*$)/gm,'<h2>$1</h2>')
    .replace(/^# (.*$)/gm,'<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
    .replace(/^\s*-\s+(.*)$/gm,'<li>$1</li>')
    .replace(/(<li>.*<\/li>)/g,'<ul>$1</ul>');
}

/* ===== Helpers: label UI ===== */
function collectAllLabels(){
  const s = new Set();
  Object.values(board.tasks).forEach(t=>{
    (t.labels||[]).forEach(l=> s.add(l.trim()));
  });
  return Array.from(s).filter(Boolean);
}
function renderLabelFilters(){
  labelFiltersEl.innerHTML = "";
  const labels = collectAllLabels();
  if(labels.length === 0){
    labelFiltersEl.innerHTML = `<span style="color:rgba(255,255,255,0.9);font-size:13px">none</span>`;
    return;
  }
  labels.forEach(l=>{
    const btn = document.createElement("button");
    btn.className = "btn subtle small";
    btn.textContent = l;
    btn.dataset.label = l;
    btn.onclick = ()=> {
      if(activeLabelFilters.has(l)) activeLabelFilters.delete(l); else activeLabelFilters.add(l);
      updateFilterUI();
      render();
    };
    labelFiltersEl.appendChild(btn);
  });
  updateFilterUI();
}
function updateFilterUI(){
  qsa("#labelFilters .btn").forEach(b=>{
    b.style.opacity = activeLabelFilters.size === 0 || activeLabelFilters.has(b.dataset.label) ? "1" : "0.45";
  });
}

/* Clear filters */
document.getElementById("clearFilters").addEventListener("click", ()=>{
  activeLabelFilters.clear(); updateFilterUI(); render();
});

/* ===== Render board ===== */
function render(){
  // FLIP prep
  const firstRects = {}; qsa(".card").forEach(el=> firstRects[el.dataset.id] = el.getBoundingClientRect());

  boardEl.innerHTML = "";
  board.columns.forEach((col, idx) => {
    const colEl = document.createElement("div");
    colEl.className = "column";
    colEl.dataset.col = col.id;
    colEl.style.width = (col.width || 300) + "px";

    // header
    const header = document.createElement("div");
    header.className = "column-header";
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <div class="col-icon">${col.icon || "📂"}</div>
        <div class="col-title">${escapeHtml(col.title)}</div>
      </div>
      <div class="col-stats">
        <div class="progress" aria-hidden="true"><div class="progress-bar" style="width:0%"></div></div>
        <div class="count" style="font-size:12px;color:var(--muted)"></div>
      </div>
    `;
    colEl.appendChild(header);

    // list
    const list = document.createElement("div"); list.className = "list"; list.dataset.col = col.id;

    // filter by active labels: if any filter active, only show tasks that have at least one active label
    const showFilterActive = activeLabelFilters.size > 0;

    col.taskIds.forEach(tid => {
      const t = board.tasks[tid]; if(!t) return;
      if(showFilterActive){
        const has = (t.labels||[]).some(l=> activeLabelFilters.has(l));
        if(!has) return;
      }

      const card = document.createElement("div");
      card.className = "card";
      card.draggable = true;
      card.dataset.id = tid;

      // labels markup
      const labelsHtml = (t.labels||[]).slice(0,5).map(label=>{
        // choose color deterministically
        const color = LABEL_COLORS[Math.abs(hashCode(label)) % LABEL_COLORS.length];
        return `<span class="label" data-color="${color}">${escapeHtml(label)}</span>`;
      }).join("");

      // due date helper
      let dueHtml = "";
      if(t.due){
        const d = new Date(t.due); if(!isNaN(d)){
          const today = new Date(); today.setHours(0,0,0,0);
          const dd = new Date(d); dd.setHours(0,0,0,0);
          const diff = dd - today;
          let hint="";
          if(diff < 0) hint=" (overdue)";
          else if(diff === 0) hint=" (today)";
          dueHtml = `<div class="due">${dd.toLocaleDateString()}${hint}</div>`;
        }
      }

      // content: title becomes inline-editable element
      card.innerHTML = `
        <div class="card-top">
          <div class="card-left">
            <div style="min-width:0">
              <div class="title-inline" data-id="${tid}">${escapeHtml(t.title)}</div>
              <div class="desc">${escapeHtml((t.desc||"").slice(0,120))}${(t.desc||"").length>120?"…":""}</div>
              <div class="labels">${labelsHtml}</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            ${dueHtml}
            <label style="font-size:12px;color:var(--muted)"><input class="done-checkbox" type="checkbox" ${t.done ? "checked" : ""}/> Done</label>
          </div>
        </div>
      `;

      // drag events
      card.addEventListener("dragstart", (ev)=>{
        ev.dataTransfer.setData("text/plain", tid);
        card.classList.add("dragging");
        card.dataset.startCol = col.id;
      });
      card.addEventListener("dragend", ()=> card.classList.remove("dragging"));

      // double-click to open modal
      card.addEventListener("dblclick", ()=> openEditTask(tid));

      // inline title edit: double-clicking title opens contenteditable
      const titleEl = card.querySelector(".title-inline");
      titleEl.addEventListener("dblclick", (e)=>{
        e.stopPropagation();
        titleEl.contentEditable = "true";
        titleEl.focus();
        // place caret at end
        const range = document.createRange();
        range.selectNodeContents(titleEl);
        range.collapse(false);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      });
      // save inline on blur or Enter
      titleEl.addEventListener("blur", ()=>{
        titleEl.contentEditable = "false";
        const newVal = titleEl.textContent.trim();
        if(newVal && newVal !== t.title){
          t.title = newVal; saveBoard(board); render();
        } else titleEl.textContent = t.title;
      });
      titleEl.addEventListener("keydown", (ev)=>{
        if(ev.key === "Enter"){ ev.preventDefault(); titleEl.blur(); }
        if(ev.key === "Escape"){ titleEl.textContent = t.title; titleEl.blur(); }
      });

      // done checkbox
      card.querySelector(".done-checkbox")?.addEventListener("change", (ev)=>{
        t.done = !!ev.target.checked; saveBoard(board); render();
      });

      list.appendChild(card);
    });

    // quick-add row
    const addWrap = document.createElement("div");
    addWrap.className = "add-col";
    addWrap.innerHTML = `<button class="btn small">＋ Add</button>`;
    addWrap.querySelector("button").addEventListener("click", ()=>{
      const title = prompt("Task title:");
      if(!title) return;
      const id = uid("t");
      board.tasks[id] = { id, title, desc:"", labels: [], due: null, done:false };
      col.taskIds.unshift(id);
      saveBoard(board); render(); showSnackbar("Task added");
    });

    colEl.appendChild(list);
    colEl.appendChild(addWrap);

    // drop handlers
    list.addEventListener("dragover", (e)=> {
      e.preventDefault();
      list.classList.add("drag-over");
      const dragging = document.querySelector(".dragging");
      const after = getDragAfterElement(list, e.clientY);
      if(dragging && after == null) list.appendChild(dragging);
      else if(dragging && after) list.insertBefore(dragging, after);
    });
    list.addEventListener("dragleave", ()=> list.classList.remove("drag-over"));
    list.addEventListener("drop", (e)=>{
      e.preventDefault();
      list.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      const fromCol = findColumnContainingTask(id);
      const toCol = col.id;
      if(!id || !fromCol) return;
      const currentChildren = [...list.querySelectorAll(".card")];
      const index = currentChildren.findIndex(ch => ch.dataset.id === id);
      const indexFrom = board.columns.find(c=>c.id===fromCol).taskIds.indexOf(id);
      moveTask(id, fromCol, toCol, index);
      saveBoard(board);
      undoStack.push({ type:"move", taskId: id, from: fromCol, to: toCol, indexFrom });
      showSnackbar("Task moved", true);
      render();
    });

    boardEl.appendChild(colEl);
    if(idx < board.columns.length - 1){
      const gutter = document.createElement("div");
      gutter.className = "gutter";
      gutter.addEventListener("pointerdown", startResize(col));
      boardEl.appendChild(gutter);
    }
  });

  // update progress bars
  board.columns.forEach(col=>{
    const colNode = boardEl.querySelector(`.column[data-col="${col.id}"]`);
    if(!colNode) return;
    const progressEl = colNode.querySelector(".progress-bar");
    const countEl = colNode.querySelector(".count");
    const total = col.taskIds.length || 0;
    const done = col.taskIds.filter(tid=> (board.tasks[tid] && board.tasks[tid].done)).length;
    const pct = total === 0 ? 0 : Math.round((done/total)*100);
    progressEl.style.width = pct + "%";
    countEl.textContent = `${done}/${total}`;
  });

  // FLIP animation
  requestAnimationFrame(()=>{
    qsa(".card").forEach(el=>{
      const id = el.dataset.id; if(!id) return;
      const first = firstRects[id]; if(!first) return;
      const last = el.getBoundingClientRect();
      const dx = first.left - last.left, dy = first.top - last.top;
      if(Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5){
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.transition = "transform 260ms cubic-bezier(.2,.8,.2,1)";
        requestAnimationFrame(()=> el.style.transform = "");
        el.addEventListener("transitionend", ()=> { el.style.transition = ""; }, { once:true });
      }
    });
  });

  // refresh label filters UI
  renderLabelFilters();
}

/* ===== Drag helpers ===== */
function getDragAfterElement(container, y){
  const elements = [...container.querySelectorAll(".card:not(.dragging)")];
  return elements.reduce((closest, child)=>{
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height/2;
    if(offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity }).element;
}
function findColumnContainingTask(taskId){
  const col = board.columns.find(c=> c.taskIds.includes(taskId));
  return col ? col.id : null;
}
function moveTask(taskId, fromColId, toColId, index=null){
  const from = board.columns.find(c=>c.id===fromColId);
  const to = board.columns.find(c=>c.id===toColId);
  if(!from || !to) return;
  from.taskIds = from.taskIds.filter(id => id !== taskId);
  if(index === null || index === -1) to.taskIds.push(taskId);
  else to.taskIds.splice(index, 0, taskId);
}

/* ===== Resize columns ===== */
function startResize(column){
  return function(e){
    e.preventDefault();
    const startX = e.clientX; const startW = column.width || 300;
    function onMove(ev){
      const dx = ev.clientX - startX; column.width = Math.max(200, startW + dx); render();
    }
    function onUp(){
      saveWidths(board.columns); saveBoard(board);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }
}

/* ===== Modal editing (labels, due, markdown) ===== */
let editingId = null;
function openEditTask(taskId){
  editingId = taskId; const t = board.tasks[taskId]; if(!t) return;
  modal.setAttribute("aria-hidden","false");
  qs("#taskTitle").value = t.title || "";
  qs("#taskDesc").value = t.desc || "";
  qs("#taskLabels").value = (t.labels||[]).join(", ");
  qs("#taskDue").value = t.due ? t.due.split("T")[0] : "";
  qs("#taskDone").checked = !!t.done;
  qs("#mdPreview").innerHTML = ""; qs("#mdPreview").hidden = true;
}
function closeModal(){ modal.setAttribute("aria-hidden","true"); editingId = null; }
qs("[data-close='true']", modal).addEventListener("click", closeModal);
modal.addEventListener("click", (e)=> { if(e.target.dataset.close === "true") closeModal(); });

qs("#togglePreview").addEventListener("click", ()=>{
  const preview = qs("#mdPreview"); if(!preview) return;
  if(!preview.hidden){ preview.hidden = true; return; }
  const md = qs("#taskDesc").value; preview.innerHTML = renderMarkdown(md); preview.hidden = false;
});

qs("#saveTask").addEventListener("click", ()=>{
  if(!editingId) return;
  const t = board.tasks[editingId];
  t.title = qs("#taskTitle").value.trim() || t.title;
  t.desc = qs("#taskDesc").value;
  t.labels = qs("#taskLabels").value.split(",").map(s=> s.trim()).filter(Boolean);
  const dueVal = qs("#taskDue").value; t.due = dueVal ? new Date(dueVal).toISOString() : null;
  t.done = !!qs("#taskDone").checked;
  saveBoard(board); closeModal(); render();
});
qs("#deleteTask").addEventListener("click", ()=>{
  if(!editingId) return; if(!confirm("Delete this task?")) return;
  delete board.tasks[editingId]; board.columns.forEach(c=> c.taskIds = c.taskIds.filter(id=>id!==editingId));
  saveBoard(board); closeModal(); render(); showSnackbar("Task deleted");
});

/* ===== Snackbar & Undo ===== */
let snackbarTimeout = null;
function showSnackbar(message="", withUndo=false){
  snackbar.innerHTML = `<span>${escapeHtml(message)}</span>`;
  if(withUndo){
    const btn = document.createElement("button"); btn.textContent = "Undo";
    btn.addEventListener("click", ()=>{
      const action = undoStack.pop();
      if(action && action.type==="move"){
        moveTask(action.taskId, action.to, action.from, action.indexFrom || 0);
        saveBoard(board); render(); showSnackbar("Reverted");
      }
      hideSnackbar();
    });
    snackbar.appendChild(btn);
  }
  snackbar.classList.add("show");
  clearTimeout(snackbarTimeout);
  snackbarTimeout = setTimeout(hideSnackbar, 6000);
}
function hideSnackbar(){ snackbar.classList.remove("show"); }

/* ===== Export / Import ===== */
document.getElementById("exportBtn").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `kanban-${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url);
});
document.getElementById("importBtn").addEventListener("click", ()=> fileInput.click());
fileInput.addEventListener("change", (e)=>{
  const f = e.target.files?.[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    try{
      const data = JSON.parse(ev.target.result);
      if(data && data.columns && data.tasks){ board = data; saveBoard(board); saveWidths(board.columns); render(); showSnackbar("Board imported"); }
      else showSnackbar("Invalid board JSON");
    }catch(err){ showSnackbar("Failed to import"); }
  };
  reader.readAsText(f);
});

/* ===== Global Add & shortcuts ===== */
document.getElementById("addTaskGlobal").addEventListener("click", ()=>{
  const title = prompt("Global task title:"); if(!title) return;
  const id = uid("t"); board.tasks[id] = { id, title, desc:"", labels:[], due:null, done:false };
  board.columns[0].taskIds.unshift(id); saveBoard(board); render(); showSnackbar("Task added");
});
boardEl.addEventListener("keydown", (e)=>{
  if(e.key.toLowerCase() === "n"){
    const focusedCol = document.activeElement?.closest?.(".column")?.dataset?.col;
    const col = board.columns.find(c=>c.id===focusedCol) || board.columns[0];
    const title = prompt(`New task in "${col.title}"`); if(!title) return;
    const id = uid("t"); board.tasks[id] = { id, title, desc:"", labels:[], due:null, done:false };
    col.taskIds.unshift(id); saveBoard(board); render(); showSnackbar("Task added");
  }
  if(e.key === "Escape"){ if(modal.getAttribute("aria-hidden") === "false") closeModal(); }
});

/* ===== Label filters render ===== */
function renderLabelFilters(){
  labelFiltersEl.innerHTML = "";
  const labels = collectAllLabels();
  if(labels.length === 0){ labelFiltersEl.innerHTML = `<span style="color:rgba(255,255,255,0.9);font-size:13px">none</span>`; return; }
  labels.forEach(l=>{
    const b = document.createElement("button"); b.className = "btn subtle small"; b.textContent = l; b.dataset.label = l;
    b.addEventListener("click", ()=> { activeLabelFilters.has(l) ? activeLabelFilters.delete(l) : activeLabelFilters.add(l); updateFilterUI(); render(); });
    labelFiltersEl.appendChild(b);
  });
  updateFilterUI();
}
function collectAllLabels(){
  const s = new Set(); Object.values(board.tasks).forEach(t=> (t.labels||[]).forEach(l=> s.add(l)));
  return Array.from(s).filter(Boolean);
}
function updateFilterUI(){
  qsa("#labelFilters .btn").forEach(b=>{
    b.style.opacity = activeLabelFilters.size === 0 || activeLabelFilters.has(b.dataset.label) ? "1" : "0.45";
  });
}

/* ===== Helpers ===== */
function hashCode(str){
  let h=0; for(let i=0;i<str.length;i++){ h = ((h<<5)-h)+str.charCodeAt(i); h |= 0; } return h;
}

/* ===== Init & periodic save ===== */
render();
setInterval(()=> saveBoard(board), 5000);
