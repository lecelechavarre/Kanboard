export function uid(prefix='id'){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
export function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function nowIso(){ return new Date().toISOString(); }
export function formatShort(dtIso){
  if(!dtIso) return '';
  const d = new Date(dtIso);
  return d.toLocaleString();
}
export function hashCode(str){ let h=0; for(let i=0;i<str.length;i++){ h = ((h<<5)-h)+str.charCodeAt(i); h |= 0;} return h; }
