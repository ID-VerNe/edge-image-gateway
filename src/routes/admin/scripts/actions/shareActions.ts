export const SHARE_ACTIONS = `
  function copyLink(p) {
    let path = p;
    try { path = decodeURIComponent(p); } catch(e) {}
    navigator.clipboard.writeText(window.location.origin + '/' + path);
    showToast('Copied');
  }

  function showShareModal(path) {
    try { path = decodeURIComponent(path); } catch(e) {}
    const modal = document.getElementById('shareModal');
    if(!modal) return;
    document.getElementById('shareFilePath').value = path;
    document.getElementById('shareResult').style.display = 'none';
    document.getElementById('btn-generate-share').innerText = 'Generate & Copy';
    modal.style.display = 'flex';
  }

  function hideShareModal() {
    const modal = document.getElementById('shareModal');
    if(modal) modal.style.display = 'none';
  }

  async function generateShareLink() {
    const path = document.getElementById('shareFilePath').value;
    const expires = parseInt(document.getElementById('shareExpiry').value);
    const btn = document.getElementById('btn-generate-share');
    
    showLoader('Generating signature...');
    try {
      const res = await fetch('/admin/api/files/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, expires })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || 'Failed to sign');

      const urlArea = document.getElementById('shareUrl');
      urlArea.value = data.url;
      document.getElementById('shareResult').style.display = 'block';
      
      await navigator.clipboard.writeText(data.url);
      showToast('Signed URL copied to clipboard');
      btn.innerText = 'Copy Again';
    } catch(e) { alert(e.message); }
    hideLoader();
  }
`;
