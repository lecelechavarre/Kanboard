export function initTheme(toggleButton){
  const key = 'kanban.pro.theme.v1';
  const saved = localStorage.getItem(key) || 'light';
  document.body.setAttribute('data-theme', saved);
  toggleButton.textContent = saved === 'dark' ? '☀️' : '🌙';
  toggleButton.addEventListener('click', ()=>{
    const cur = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', cur);
    localStorage.setItem(key, cur);
    toggleButton.textContent = cur === 'dark' ? '☀️' : '🌙';
  });
}
