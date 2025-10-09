export function attachDragHandlers(root, state, onChange){
  // Column reordering: columns are draggable
  root.addEventListener('dragstart', (e)=>{
    const target = e.target.closest('.column');
    if(target && target.dataset.col){
      e.dataTransfer.setData('text/col', target.dataset.col);
      target.classList.add('col-dragging');
    }
    const card = e.target.closest('.card');
    if(card && card.dataset.id){
      e.dataTransfer.setData('text/task', card.dataset.id);
      card.classList.add('dragging');
    }
  });
  root.addEventListener('dragend', (e)=>{
    qsa(root, '.col-dragging').forEach(el=>el.classList.remove('col-dragging'));
    qsa(root, '.dragging').forEach(el=>el.classList.remove('dragging'));
  });

  // Column drop target for reordering
  root.addEventListener('dragover', (e)=>{
    e.preventDefault();
    const col = e.target.closest('.column');
    if(!col) return;
    col.classList.add('drag-over-col');
  });
  root.addEventListener('dragleave', (e)=>{
    const col = e.target.closest('.column');
    if(col) col.classList.remove('drag-over-col');
  });

  root.addEventListener('drop', (e)=>{
    e.preventDefault();
    const colEl = e.target.closest('.column');
    if(!colEl) return;
    const colId = colEl.dataset.col;
    const taskId = e.dataTransfer.getData('text/task');
    const draggedColId = e.dataTransfer.getData('text/col');
    if(taskId){
      // move task into this column at end
      moveTask(state, taskId, colId);
      onChange();
    } else if(draggedColId){
      reorderColumns(state, draggedColId, colId);
      onChange();
    }
    colEl.classList.remove('drag-over-col');
  });

  function moveTask(state, taskId, toColId){
    const fromCol = state.columns.find(c=> c.taskIds.includes(taskId));
    if(!fromCol) return;
    fromCol.taskIds = fromCol.taskIds.filter(id=> id !== taskId);
    const toCol = state.columns.find(c=> c.id === toColId);
    toCol.taskIds.push(taskId);
  }
  function reorderColumns(state, fromId, toId){
    const fromIdx = state.columns.findIndex(c=>c.id===fromId);
    const toIdx = state.columns.findIndex(c=>c.id===toId);
    if(fromIdx < 0 || toIdx < 0) return;
    const [col] = state.columns.splice(fromIdx,1);
    state.columns.splice(toIdx,0,col);
  }

  // helper find all selectors inside root
  function qsa(root, sel){ return Array.from(root.querySelectorAll(sel)); }
}
