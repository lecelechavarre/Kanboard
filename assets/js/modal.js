import { escapeHtml, uid, formatShort } from './utils.js';
import { saveState, pushActivity } from './storage.js';

// Modal manager: create modal DOM when needed
export function initModal(modalRoot, state, onSave){
  // build modal structure
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('aria-hidden','true');
  modal.innerHTML = `
    <div class="modal-backdrop" data-close="true"></div>
    <div class="modal-sheet" role="document">
      <header style="display:flex;justify-content:space-between;align-items:center">
        <h3 id="mTitle">Edit Task</h3>
        <div><button class="btn subtle" data-close="true">Close</button></div>
      </header>
      <div style="padding:12px;display:flex;flex-direction:column;gap:8px">
        <label>Title <input id="mTitleInput" /></label>
        <label>Description <textarea id="mDesc"></textarea></label>
        <label>Labels (comma) <input id="mLabels" /></label>
        <label>Due date <input id="mDue" type="date" /></label>
        <div><label><input id="mDone" type="checkbox"/> Done</label></div>
        <div>
          <h4>Comments</h4>
          <div id="mCommentsList" style="max-height:160px;overflow:auto;border:1px solid #eee;padding:6px;border-radius:6px"></div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <input id="mCommentInput" placeholder="Write a comment..." style="flex:1" />
            <button id="mCommentAdd" class="btn primary">Add</button>
          </div>
        </div>
      </div>
      <footer style="display:flex;justify-content:space-between;padding:12px">
        <button id="mDelete" class="btn danger">Delete</button>
        <div style="display:flex;gap:8px"><button id="mSave" class="btn primary">Save</button></div>
      </footer>
    </div>
  `;
  modalRoot.appendChild(modal);

  const mTitleInput = modal.querySelector('#mTitleInput');
  const mDesc = modal.querySelector('#mDesc');
  const mLabels = modal.querySelector('#mLabels');
  const mDue = modal.querySelector('#mDue');
  const mDone = modal.querySelector('#mDone');
  const mCommentsList = modal.querySelector('#mCommentsList');
  const mCommentInput = modal.querySelector('#mCommentInput');
  const mCommentAdd = modal.querySelector('#mCommentAdd');
  const mSave = modal.querySelector('#mSave');
  const mDelete = modal.querySelector('#mDelete');

  let currentId = null;

  modal.addEventListener('click', (e)=> { if(e.target.dataset.close === 'true') close(); });

  function open(taskId){
    currentId = taskId;
    const t = state.tasks[taskId];
    if(!t) return;
    modal.setAttribute('aria-hidden','false');
    mTitleInput.value = t.title || '';
    mDesc.value = t.desc || '';
    mLabels.value = (t.labels||[]).join(', ');
    mDue.value = t.due ? t.due.split('T')[0] : '';
    mDone.checked = !!t.done;
    renderComments();
  }
  function close(){
    modal.setAttribute('aria-hidden','true');
    currentId = null;
  }
  function renderComments(){
    mCommentsList.innerHTML = '';
    const t = state.tasks[currentId];
    (t.comments || []).forEach(c=>{
      const el = document.createElement('div');
      el.style.padding = '6px 8px';
      el.style.borderBottom = '1px solid #f0f0f0';
      el.innerHTML = `<div style="font-size:12px;color:#666">${escapeHtml(c.text)}</div><div style="font-size:11px;color:#999">${formatShort(c.ts)} • ${escapeHtml(c.user)}</div>`;
      mCommentsList.appendChild(el);
    });
  }

  mCommentAdd.addEventListener('click', ()=>{
    const text = mCommentInput.value.trim(); if(!text) return;
    const t = state.tasks[currentId];
    t.comments = t.comments || [];
    const comment = { id: uid('c'), text, ts: new Date().toISOString(), user: 'Guest' };
    t.comments.push(comment);
    mCommentInput.value = '';
    renderComments();
    saveState(state);
    pushActivity(state, { type:'comment', taskId: currentId, text });
  });

  mSave.addEventListener('click', ()=>{
    const t = state.tasks[currentId];
    t.title = mTitleInput.value || t.title;
    t.desc = mDesc.value;
    t.labels = mLabels.value.split(',').map(s=>s.trim()).filter(Boolean);
    t.due = mDue.value ? new Date(mDue.value).toISOString() : null;
    t.done = !!mDone.checked;
    saveState(state);
    pushActivity(state, { type:'edit', taskId: currentId, text: 'Edited task' });
    if(typeof onSave === 'function') onSave();
    close();
  });

  mDelete.addEventListener('click', ()=>{
    if(!confirm('Delete this task?')) return;
    // remove task and references
    delete state.tasks[currentId];
    state.columns.forEach(c => c.taskIds = c.taskIds.filter(id => id !== currentId));
    saveState(state);
    pushActivity(state, { type:'delete', taskId: currentId, text: 'Deleted task' });
    if(typeof onSave === 'function') onSave();
    close();
  });

  return { open, close, el: modal };
}
