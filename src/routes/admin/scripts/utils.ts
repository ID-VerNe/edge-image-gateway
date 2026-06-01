export const UTILS = `
  function showToast(m) {
    const t = document.getElementById('toast'); 
    if (!t) return;
    t.innerText = m; 
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 3000);
  }

  function showLoader(m = 'Processing...') { 
    const el = document.getElementById('loader-status');
    if(el) el.innerText = m;
    const loader = document.getElementById('global-loader');
    if(loader) loader.style.display = 'flex'; 
  }

  function hideLoader() { 
    const loader = document.getElementById('global-loader');
    if(loader) loader.style.display = 'none'; 
  }
  
  function showProgress(show) {
    const container = document.getElementById('upload-progress-container');
    const text = document.getElementById('upload-progress-text');
    if(container) container.style.display = show ? 'block' : 'none';
    if(text) text.style.display = show ? 'block' : 'none';
  }
  
  function updateProgress(percent, text) {
    const bar = document.getElementById('upload-progress-bar');
    const txt = document.getElementById('upload-progress-text');
    if(bar) bar.style.width = percent + '%';
    if(txt) txt.innerText = text;
  }
`;
