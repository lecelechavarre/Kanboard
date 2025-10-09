import { loadState, saveState, pushActivity } from './storage.js';
import { initUI } from './ui.js';
import { initTheme } from './themes.js';
import { uid } from './utils.js';

// boot
const state = loadState();

// create sample data if empty
if(Object.keys(state.tasks || {}).length === 0 && state.columns && state.columns.length){
  // sample tasks
  const t1 = uid('t'); const t2 = uid('t'); const t3 = uid('t');
  state.tasks[t1] = { id:t1, title:'Design landing', desc:'Make hero section', labels:['frontend'], createdAt:new Date().toISOString(), comments:[], due:null, done:false };
  state.tasks[t2] = { id:t2, title:'API endpoints', desc:'Define endpoints for auth', labels:['backend'], createdAt:new Date().toISOString(), comments:[], due:null, done:false };
  state.tasks[t3] = { id:t3, title:'Write tests ✅', desc:'Add unit tests', labels:['testing'], createdAt:new Date().toISOString(), comments:[], due:null, done:true };
  state.columns[0].taskIds.push(t1,t2); state.columns[1].taskIds.push(t3);
  saveState(state);
}

// init UI
const ui = initUI({ state, activeLabels: new Set() });

// register service worker
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/serviceWorker.js').catch(err=> console.warn('SW failed', err));
}

// notifications: provide toggle
const notifyBtn = document.getElementById('notifyToggle');
let notifyEnabled = localStorage.getItem('kanban.notify') === '1';
function updateNotifyUI(){ notifyBtn.textContent = notifyEnabled ? '🔔' : '🔕'; }
updateNotifyUI();
notifyBtn.addEventListener('click', async ()=>{
  if(!('Notification' in window)){ alert('Notifications not supported'); return; }
  if(Notification.permission === 'default'){ await Notification.requestPermission(); }
  if(Notification.permission !== 'granted'){ alert('Please enable notifications in browser settings'); return; }
  notifyEnabled = !notifyEnabled; localStorage.setItem('kanban.notify', notifyEnabled ? '1' : '0'); updateNotifyUI();
});

// simple due date poll every minute to notify tasks due today
setInterval(()=>{
  if(!notifyEnabled) return;
  const now = new Date(); const todayStr = now.toISOString().slice(0,10);
  Object.values(state.tasks || {}).forEach(t=>{
    if(t.due && t.due.slice(0,10) === todayStr && !t._notifiedToday){
      new Notification('Task due today', { body: t.title });
      t._notifiedToday = true; saveState(state);
      pushActivity(state, { type:'notify', text:`Notified due for ${t.title}` });
    }
  });
}, 60_000);

