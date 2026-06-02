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
    if(!confirm(\`Move this \${type} to Recycle Bin?\`)) return;
    showLoader('Moving to Trash...');
    try {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const targetDir = \`.trash/\${today}\`;
      const res = await fetch('/admin/api/files/' + encodeURIComponent(p) + '/move', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDir })
      });
      if (!res.ok) throw new Error('Delete failed');
      showToast(\`Moved to Recycle Bin\`);
    } catch(e) { 
      alert('Delete failed: ' + e.message); 
    }
    hideLoader(); 
    loadFiles(currentPath);
  }

  async function bulkDelete() {
    if (selectedFiles.size === 0) return;
    if(!confirm(\`Move \${selectedFiles.size} items to Recycle Bin?\`)) return;
    showLoader('Moving to Trash...');
    showProgress(true);
    let i = 0;
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const targetDir = \`.trash/\${today}\`;
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

  async function generateAndCopySigned() {
    if(!currentLightboxPath) return;
    try {
      const res = await fetch('/admin/api/files/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentLightboxPath, expiry: 86400 })
      });
      const data = await res.json();
      if(data.url) {
        const input = document.getElementById('copy-signed');
        input.value = data.url;
        input.select();
        document.execCommand('copy');
        showToast('Signed URL Copied');
      }
    } catch(e) { alert('Failed to generate signed URL'); }
  }

  async function restoreFile(p) {
    showLoader('Restoring...');
    try {
      // Logic: move back from .trash/YYYYMMDD/path to path (strip .trash/YYYYMMDD/)
      const parts = p.split('/');
      const targetPath = parts.slice(2).join('/'); // Skip .trash and date
      const targetDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
      
      const res = await fetch('/admin/api/files/' + encodeURIComponent(p) + '/move', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDir })
      });
      if(!res.ok) throw new Error('Restore failed');
      showToast('Item restored');
      loadTrash();
    } catch(e) { alert(e.message); }
    hideLoader();
  }

  async function deleteFilePermanently(p) {
    if(!confirm('Delete permanently? This cannot be undone.')) return;
    showLoader('Deleting...');
    try {
      const res = await fetch('/admin/api/files/' + encodeURIComponent(p), { method: 'DELETE' });
      if(!res.ok) throw new Error('Delete failed');
      showToast('Deleted permanently');
      loadTrash();
    } catch(e) { alert(e.message); }
    hideLoader();
  }

  async function emptyTrash() {
     if(!confirm('Permanently delete all items in Recycle Bin?')) return;
     showLoader('Emptying Trash...');
     try {
       // We can just delete the .trash directory entries one by one or have a bulk API
       // For now, let's keep it simple and just do it turn by turn if needed, 
       // but ideally we need an API to purge a prefix.
       // We'll use the existing DELETE with a type=dir if supported.
       const res = await fetch('/admin/api/files/.trash?type=dir', { method: 'DELETE' });
       if(!res.ok) throw new Error('Emptying failed');
       showToast('Trash emptied');
       loadTrash();
     } catch(e) { alert(e.message); }
     hideLoader();
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
