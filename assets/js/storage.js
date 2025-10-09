import { uid, nowIso } from './utils.js';

const STORAGE_KEY = 'kanban.pro.full.v1';

const DEFAULT = {
  schemaVersion: 1,
  createdAt: nowIso(),
  columns: [
    { id: 'col-1', title: 'Backlog', width: 300, taskIds: [] },
    { id: 'col-2', title: 'In Progress', width: 320, taskIds: [] },
    { id: 'col-3', title: 'Done', width: 300, taskIds: [] }
  ],
  tasks: {},
  activity: []
};

export function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    if(!parsed.schemaVersion) parsed.schemaVersion = 1;
    return parsed;
  }catch(err){ console.error('load error', err); return DEFAULT; }
}

export function saveState(state){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(err){ console.error('save error', err); }
}

export function pushActivity(state, entry){
  const item = { id: uid('a'), ts: nowIso(), ...entry };
  state.activity.unshift(item);
  // cap to last 200
  if(state.activity.length > 200) state.activity.length = 200;
  saveState(state);
}
