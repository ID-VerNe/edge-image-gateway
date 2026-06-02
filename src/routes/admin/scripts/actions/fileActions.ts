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
    if(!confirm(\`Delete this \${type}? \${type === 'dir' ? '(All contents will be lost)' : ''}\`)) return;
    showLoader('Deleting...');
    try {
      const res = await fetch('/admin/api/files/' + encodeURIComponent(p) + '?type=' + type, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      showToast(\`Successfully deleted \${type}\`);
    } catch(e) { 
      alert('Delete failed: ' + e.message); 
    }
    hideLoader(); 
    loadFiles(currentPath);
  }

  async function bulkDelete() {
    if (selectedFiles.size === 0) return;
    if(!confirm(\`Delete \${selectedFiles.size} items?\`)) return;
    showLoader('Deleting...');
    showProgress(true);
    let i = 0;
    for (const p of selectedFiles) {
      updateProgress((i / selectedFiles.size) * 100, \`Deleting \${i+1}/\${selectedFiles.size}\`);
      try {
        const res = await fetch('/admin/api/files/' + encodeURIComponent(p), { method: 'DELETE' });
        if (!res.ok) {
           const data = await res.json();
           console.error('Delete failed for ' + p, data.error);
        }
      } catch(e) {
        console.error('Delete error for ' + p, e);
      }
      i++;
    }
    showProgress(false);
    hideLoader();
    selectedFiles.clear();
    updateBulkToolbar();
    loadFiles(currentPath);
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
