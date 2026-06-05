export const FILE_ACTIONS = `
  function showNewFolderModal() { 
    const modal = document.getElementById('newFolderModal');
    if(modal) modal.style.display = 'flex'; 
  }
  function hideNewFolderModal() { 
    const modal = document.getElementById('newFolderModal');
    if(modal) modal.style.display = 'none'; 
  }
  
  async function createNewFolder() {
    const el = document.getElementById('newFolderName');
    if(!el) return;
    const n = el.value;
    if(!n) return;
    const path = currentPath ? \`\${currentPath}/\${n}\` : n;
    showLoader();
    try {
      const res = await fetch('/admin/api/files/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if(!res.ok) throw new Error('Failed to create folder');
      loadFiles(path);
    } catch(e) { alert(e.message); }
    hideLoader();
    hideNewFolderModal();
    el.value = '';
  }

  async function deleteItem(p, type) {
    if(!confirm(\`Permanently delete this \${type}?\`)) return;
    showLoader('Deleting...');
    try {
      const url = '/admin/api/files/' + encodeURIComponent(p) + (type === 'dir' ? '?type=dir' : '');
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      showToast(\`Item deleted\`);
    } catch(e) { 
      alert('Delete failed: ' + e.message); 
    }
    hideLoader(); 
    loadFiles(currentPath);
  }

  async function bulkDelete() {
    if (selectedFiles.size === 0) return;
    if(!confirm(\`Permanently delete \${selectedFiles.size} items?\`)) return;
    showLoader('Deleting...');
    showProgress(true);
    let i = 0;
    for (const p of selectedFiles) {
      updateProgress((i / selectedFiles.size) * 100, \`Deleting \${i+1}/\${selectedFiles.size}\`);
      try {
        // We don't easily know the type here, but most bulk deletes are files.
        // If it's a folder, it might fail or we'd need to check the file list state.
        // For safety, let's assume it's a file unless it ends with a slash or we add logic.
        await fetch('/admin/api/files/' + encodeURIComponent(p), { method: 'DELETE' });
      } catch(e) {}
      i++;
    }
    showProgress(false);
    hideLoader();
    selectedFiles.clear();
    updateBulkToolbar();
    loadFiles(currentPath);
  }

  function showBatchRenameModal() {
    if (selectedFiles.size === 0) return;
    const modal = document.getElementById('batchRenameModal');
    if(modal) modal.style.display = 'flex';
  }
  function hideBatchRenameModal() {
    const modal = document.getElementById('batchRenameModal');
    if(modal) modal.style.display = 'none';
  }

  async function applyBatchRename() {
    const s = document.getElementById('renameSearch').value;
    const r = document.getElementById('renameReplace').value;
    if(!s && !r) return;
    
    hideBatchRenameModal();
    showLoader('Renaming...');
    showProgress(true);
    let i = 0;
    for (const p of selectedFiles) {
      updateProgress((i / selectedFiles.size) * 100, \`Renaming \${i+1}/\${selectedFiles.size}\`);
      const oldName = p.split('/').pop();
      const newName = oldName.replace(s, r);
      if (oldName !== newName) {
        try {
          const targetPath = p.substring(0, p.lastIndexOf('/') + 1) + newName;
          await fetch('/admin/api/files/mutate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              action: 'rename',
              path: p,
              newPath: targetPath
            })
          });
        } catch(e) {}
      }
      i++;
    }
    showProgress(false);
    hideLoader();
    selectedFiles.clear();
    updateBulkToolbar();
    loadFiles(currentPath);
  }

  // Lightbox functions
  function openLightbox(p, url) {
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    const filename = document.getElementById('lightbox-filename');
    
    if(!lb || !img || !filename) return;
    
    filename.innerText = p.split('/').pop();
    img.src = url;
    
    // Copy inputs
    const directUrl = window.location.origin + url;
    document.getElementById('copy-markdown').value = \`![\${filename.innerText}](\${directUrl})\`;
    document.getElementById('copy-raw').value = directUrl;
    document.getElementById('copy-html').value = \`<img src="\${directUrl}" alt="\${filename.innerText}">\`;
    document.getElementById('copy-bbcode').value = \`[img]\${directUrl}[/img]\`;
    document.getElementById('copy-signed').value = ''; // Clear until generated
    
    lb.style.display = 'flex';
    currentLightboxPath = p;
  }

  function closeLightbox() {
    const lb = document.getElementById('lightbox');
    if(lb) lb.style.display = 'none';
  }

  async function generateSignedUrlForLightbox() {
    if(!currentLightboxPath) return;
    const expiry = document.getElementById('copy-signed-expiry').value;
    const btn = event.target;
    btn.disabled = true;
    const oldText = btn.innerText;
    btn.innerText = '...';
    
    try {
      const res = await fetch('/admin/api/files/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentLightboxPath, expires: parseInt(expiry) })
      });
      const data = await res.json();
      if(data.url) {
        document.getElementById('copy-signed').value = data.url;
        document.getElementById('btn-copy-signed').disabled = false;
        showToast('Signed URL Generated');
      }
    } catch(e) { alert('Failed to generate signed URL'); }
    btn.disabled = false;
    btn.innerText = oldText;
  }

  function copySignedUrlFromLightbox() {
    const input = document.getElementById('copy-signed');
    if(!input.value) return;
    input.select();
    document.execCommand('copy');
    showToast('Signed URL Copied');
  }

  function showMoveModal() { 
    if (selectedFiles.size === 0) return;
    const modal = document.getElementById('moveModal');
    if(modal) modal.style.display = 'flex'; 
  }
  function hideMoveModal() { 
    const modal = document.getElementById('moveModal');
    if(modal) modal.style.display = 'none'; 
  }
  
  async function bulkMove() {
    const el = document.getElementById('moveTargetPath');
    if(!el) return;
    const targetDir = el.value;
    hideMoveModal();
    showLoader('Moving...');
    showProgress(true);
    let i = 0;
    for (const p of selectedFiles) {
      updateProgress((i / selectedFiles.size) * 100, \`Moving \${i+1}/\${selectedFiles.size}\`);
      try {
        await fetch('/admin/api/files/' + encodeURIComponent(p) + '/move', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetDir })
        });
      } catch(e) {}
      i++;
    }
    showProgress(false);
    hideLoader();
    el.value = '';
    selectedFiles.clear();
    updateBulkToolbar();
    loadFiles(currentPath);
  }
`;
