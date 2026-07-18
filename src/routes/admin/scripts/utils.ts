export const UTILS = `
  // Escape a string for safe insertion into HTML text content
  function eHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // Escape a string for safe insertion into a URL path inside an HTML attribute
  function eUrl(str) {
    if (!str) return '';
    return encodeURI(str).replace(/'/g, '%27').replace(/"/g, '%22');
  }

  function showToast(m) {
    const t = document.getElementById('toast'); 
    if (!t) return;
    t.innerText = m; 
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 3000);
  }
  
  // Alias for legacy support
  const toast = showToast;

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
  
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  async function copyWithFeedback(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const oldText = btn.tagName === 'INPUT' ? btn.value : btn.innerText;
      const isInput = btn.tagName === 'INPUT';
      
      if (isInput) {
        toast('✓ Copied to clipboard');
      } else {
        btn.innerText = '✓ Copied';
        btn.style.color = '#10B981'; // Emerald-500
        setTimeout(() => {
          btn.innerText = oldText;
          btn.style.color = '';
        }, 1500);
      }
    } catch (err) {
      toast('Failed to copy');
    }
  }
`;

