import { escapeHtml, uid, formatShort, hashCode } from './utils.js';
import { loadState, saveState, pushActivity } from './storage.js';
import { initModal } from './modal.js';
import { attachDragHandlers } from './dragdrop.js';
import { initTheme } from './themes.js';

// this module renders board UI, handles column management, filtering, sorting, activity drawer
export function initUI(opts){
  const state = opts.state;
  const root = document.getElementById('boardRoot');
  const modalRoot = document.getElementById('modalRoot');
  const snackbar = document.getElementById('snackbar');

  const modal = initModal(modalRoot, state, ()=>{
    render();
  });

  // theme
  initTheme(document.getElementById('themeToggle'));

  // attach drag handlers for columns + tasks
  attachDragHandlers(root, state, ()=>{
    saveState(state);
    pushActivity(state, { type:'move', text: 'Task moved' });
    render();
  });

  // wiring top controls
  document.getElementById('addColumnBtn').addEventListener('click', ()=>{
    const title = prompt('Column title:'); if(!title) return;
    const id = uid('col');
    state.columns.push({ id, title, width: 300, taskIds: [] });
    saveState(state);
    pushActivity(state, { type:'column:add', text: `Added column "${title}"` });
    render();
  });

  document.getElementById('addTaskGlobal').addEventListener('click', ()=>{
    const title = prompt('Task title:'); if(!title) return;
    const id = uid('t');
    state.tasks[id] = { id, title, desc:'', labels:[], due:null, createdAt: new Date().toISOString(), comments:[], done:false };
    state.columns[0].taskIds.unshift(id);
    saveState(state);
    pushActivity(state, { type:'task:add', taskId:id, text:`Added "${title}"` });
    render();
  });

  // sort & search
  const sortSelect = document.getElementById('sortSelect');
  const searchInput = document.getElementById('searchInput');
  sortSelect.addEventListener('change', ()=> render());
  searchInput.addEventListener('input', ()=> render());

  // activity drawer
  const activityDrawer = document.getElementById('activityDrawer');
  document.getElementById('openActivity').addEventListener('click', ()=> {
    activityDrawer.classList.add('open'); activityDrawer.setAttribute('aria-hidden','false'); renderActivity();
  });
  document.getElementById('closeActivity').addEventListener('click', ()=> { activityDrawer.classList.remove('open'); activityDrawer.setAttribute('aria-hidden','true'); });
  document.getElementById('clearActivity').addEventListener('click', ()=> {
    if(!confirm('Clear activity log?')) return;
    state.activity = []; saveState(state); renderActivity();
  });

  // import / export
  document.getElementById('exportBtn').addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `kanban-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  });
  document.getElementById('importBtn').addEventListener('click', ()=> document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', (e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try{
        const data = JSON.parse(ev.target.result);
        if(data && data.columns && data.tasks){
          // overwrite
          Object.assign(state, data);
          saveState(state);
          showSnack('Board imported');
          render();
        } else showSnack('Invalid JSON');
      }catch(err){ showSnack('Import failed'); }
    };
    r.readAsText(f);
  });

  // label filters
  function collectLabels(){
    const s = new Set();
    Object.values(state.tasks).forEach(t => (t.labels || []).forEach(l => s.add(l)));
    return Array.from(s).filter(Boolean);
  }
  function renderLabelFilters(){
    const container = document.getElementById('labelFilters');
    container.innerHTML = '';
    const labels = collectLabels();
    if(labels.length === 0){ container.innerHTML = `<div style="color:#fff;padding:6px;font-size:13px">labels</div>`; return; }
    labels.forEach(l => {
      const b = document.createElement('button'); b.className = 'btn subtle small'; b.textContent = l;
      b.onclick = ()=> { // toggle filter
        if(opts.activeLabels.has(l)) opts.activeLabels.delete(l); else opts.activeLabels.add(l);
        render();
      };
      if(opts.activeLabels.has(l)) b.style.opacity = '1'; else b.style.opacity = '0.6';
      container.appendChild(b);
    });
  }

  // render functions
  function render(){
    renderLabelFilters();
    root.innerHTML = '';
    const q = searchInput.value.trim().toLowerCase();
    const sortBy = sortSelect.value;

    // render each column (columns are in state.columns order)
    state.columns.forEach((col, idx) => {
      const colEl = document.createElement('div'); colEl.className = 'column'; colEl.dataset.col = col.id; colEl.style.width = (col.width || 300) + 'px';
      // header with rename/delete
      const header = document.createElement('div'); header.className = 'column-header';
      const titleWrap = document.createElement('div'); titleWrap.className = 'col-title';
      const titleEl = document.createElement('div'); titleEl.textContent = col.title; titleEl.style.fontWeight = '700';
      titleEl.addEventListener('dblclick', ()=> {
        const nv = prompt('Rename column', col.title); if(nv){ col.title = nv; saveState(state); pushActivity(state, { type:'column:rename', text:`Renamed column to ${nv}` }); render(); }
      });
      titleWrap.appendChild(titleEl);
      const actions = document.createElement('div'); actions.className = 'column-actions';
      const addBtn = document.createElement('button'); addBtn.className = 'btn subtle small'; addBtn.textContent = '+';
      addBtn.title = 'Add task to column';
      addBtn.addEventListener('click', ()=>{
        const title = prompt('Task title:'); if(!title) return;
        const id = uid('t'); state.tasks[id] = { id, title, desc:'', labels:[], createdAt: new Date().toISOString(), comments:[], done:false };
        col.taskIds.unshift(id); saveState(state); pushActivity(state, { type:'task:add', taskId:id, text:`Added "${title}"` }); render();
      });
      const delBtn = document.createElement('button'); delBtn.className = 'btn subtle small'; delBtn.textContent = '⋯';
      delBtn.title = 'Column menu';
      delBtn.addEventListener('click', ()=>{
        const c = prompt('Type "delete" to remove this column or enter new title to rename', col.title);
        if(c === 'delete'){
          if(!confirm('Delete column and move its tasks to first column?')) return;
          // move tasks to first column (if any)
          const first = state.columns[0].id === col.id ? state.columns[1] : state.columns[0];
          if(first) { first.taskIds = first.taskIds.concat(col.taskIds); }
          state.columns = state.columns.filter(cc => cc.id !== col.id);
          saveState(state); pushActivity(state, { type:'column:delete', text:`Deleted column ${col.title}` }); render();
        } else if(c && c !== col.title){
          col.title = c; saveState(state); pushActivity(state, { type:'column:rename', text:`Renamed column to ${c}` }); render();
        }
      });

      actions.appendChild(addBtn); actions.appendChild(delBtn);
      header.appendChild(titleWrap); header.appendChild(actions);
      colEl.appendChild(header);

      // list (with basic virtualization: show up to 50 tasks and a show more button)
      const list = document.createElement('div'); list.className = 'list'; list.dataset.col = col.id;
      // prepare tasks in correct order and with sorting & filtering
      let tasks = col.taskIds.map(id => state.tasks[id]).filter(Boolean);

      // filter by active labels
      if(opts.activeLabels.size > 0){
        tasks = tasks.filter(t => (t.labels || []).some(l => opts.activeLabels.has(l)));
      }
      // search filter
      if(q) tasks = tasks.filter(t => (t.title + ' ' + (t.desc||'')).toLowerCase().includes(q));

      // sorting
      if(sortBy === 'due'){
        tasks.sort((a,b)=>{
          if(!a.due) return 1; if(!b.due) return -1;
          return new Date(a.due) - new Date(b.due);
        });
      } else if(sortBy === 'created'){
        tasks.sort((a,b)=> new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      }

      // render up to limit; if more, show "show more"
      const limit = 50;
      const toShow = tasks.slice(0, limit);
      toShow.forEach(t => {
        const card = renderTaskCard(t, state, modal);
        list.appendChild(card);
      });
      if(tasks.length > limit){
        const more = document.createElement('button'); more.className = 'btn subtle'; more.textContent = `Show ${tasks.length - limit} more`;
        more.addEventListener('click', ()=> {
          list.innerHTML = '';
          tasks.forEach(t => list.appendChild(renderTaskCard(t, state, modal)));
        });
        list.appendChild(more);
      }

      colEl.appendChild(list);

      // footer: progress
      const footer = document.createElement('div'); footer.style.padding = '8px';
      const total = col.taskIds.length;
      const done = col.taskIds.filter(id => state.tasks[id] && state.tasks[id].done).length;
      const pct = total === 0 ? 0 : Math.round((done/total)*100);
      footer.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:8px;background:#f0f0ff;border-radius:999px;overflow:hidden"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--primary),#4ad0a9)"></div></div><div style="min-width:36px;text-align:right;font-size:12px;color:var(--muted)">${pct}%</div></div>`;
      colEl.appendChild(footer);

      root.appendChild(colEl);
      // gutter
      if(idx < state.columns.length - 1){
        const g = document.createElement('div'); g.className = 'gutter'; root.appendChild(g);
      }
    });

    renderLabelFilters();
  }

  function renderTaskCard(t, state, modal){
    const card = document.createElement('div'); card.className = 'card'; card.draggable = true; card.dataset.id = t.id;
    // labels markup using deterministic color
    const labelsHtml = (t.labels || []).map(l => {
      const color = ['gray','red','orange','green','blue'][Math.abs(hashCode(l)) % 5];
      return `<span class="label ${color}">${escapeHtml(l)}</span>`;
    }).join(' ');
    const due = t.due ? `<div style="font-size:12px;color:var(--muted)">${new Date(t.due).toLocaleDateString()}</div>` : '';
    card.innerHTML = `<div><strong>${escapeHtml(t.title)}</strong></div><div style="font-size:13px;color:var(--muted)">${escapeHtml((t.desc||'').slice(0,120))}</div><div style="display:flex;gap:8px;margin-top:8px;align-items:center"><div class="labels">${labelsHtml}</div>${due}</div>`;
    // events
    card.addEventListener('dblclick', ()=> modal.open(t.id));
    // inline title edit: dblclick on title area
    card.querySelector('strong').addEventListener('dblclick', (e)=>{
      e.stopPropagation();
      const el = e.target; el.contentEditable = 'true'; el.focus();
      const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      el.addEventListener('blur', ()=> { el.contentEditable = 'false'; if(el.textContent.trim() && el.textContent.trim() !== t.title){ t.title = el.textContent.trim(); saveState(state); pushActivity(state, { type:'edit', taskId:t.id, text:'Renamed' }); render(); } else el.textContent = t.title; }, { once:true });
    });
    return card;
  }

  function showSnack(msg){ snackbar.textContent = msg; snackbar.classList.add('show'); setTimeout(()=> snackbar.classList.remove('show'), 3500); }

  function renderActivity(){
    const list = document.getElementById('activityList'); list.innerHTML = '';
    state.activity.forEach(a=>{
      const el = document.createElement('div'); el.style.padding = '10px'; el.style.borderBottom = '1px solid #f0f0f0';
      el.innerHTML = `<div style="font-size:13px">${escapeHtml(a.text)}</div><div style="font-size:12px;color:var(--muted)">${formatShort(a.ts)}</div>`;
      list.appendChild(el);
    });
  }

  // helpers
  function hashCode(str){ let h=0; for(let i=0;i<str.length;i++){ h = ((h<<5)-h)+str.charCodeAt(i); h |= 0; } return h; }

  // initial render
  render();

  // expose some functions
  return { render, showSnack, renderActivity };
}
