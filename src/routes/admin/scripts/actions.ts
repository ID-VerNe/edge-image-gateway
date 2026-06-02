export const ACTIONS = `
  async function fetchWithTOTP(url, options = {}) {
    let res = await fetch(url, options);
    if (res.status === 403) {
      const totp = prompt('Action requires TOTP verification. Please enter your 6-digit code:');
      if (totp) {
        if (options.method === 'DELETE') {
          const u = new URL(url, window.location.origin);
          u.searchParams.set('totp', totp);
          return await fetch(u.toString(), options);
        } else {
          const body = JSON.parse(options.body || '{}');
          body.totp = totp;
          const newOptions = { ...options, body: JSON.stringify(body) };
          return await fetch(url, newOptions);
        }
      }
    }
    return res;
  }

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
      await fetchWithTOTP('/admin/api/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      loadFiles(path);
    } catch(e) { alert('Failed to create folder'); }
    hideLoader();
    hideNewFolderModal();
    el.value = '';
  }

  async function deleteItem(p, type) {
    if(!confirm(\`Delete this \${type}? \${type === 'dir' ? '(All contents will be lost)' : ''}\`)) return;
    showLoader();
    try {
      await fetchWithTOTP('/admin/api/files/' + p + '?type=' + type, { method: 'DELETE' });
    } catch(e) {}
    hideLoader(); loadFiles(currentPath);
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
        await fetchWithTOTP('/admin/api/files/' + p, { method: 'DELETE' });
      } catch(e) {}
      i++;
    }
    showProgress(false);
    hideLoader();
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
        await fetchWithTOTP('/admin/api/files/' + p + '/move', { 
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
    loadFiles(currentPath);
  }

  function showAddRepoModal() { 
    const modal = document.getElementById('addRepoModal');
    if(modal) modal.style.display = 'flex'; 
  }
  function hideAddRepoModal() { 
    const modal = document.getElementById('addRepoModal');
    if(modal) modal.style.display = 'none'; 
  }
  
  async function addRepo() {
    const body = {
      id: document.getElementById('repoId').value,
      owner: document.getElementById('repoOwner').value,
      name: document.getElementById('repoName').value,
      branch: document.getElementById('repoBranch').value,
      tokenSecretName: document.getElementById('repoSecret').value
    };
    showLoader();
    try {
      await fetch('/admin/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      loadRepos();
      hideAddRepoModal();
    } catch(e) { alert('Failed to register repo'); }
    hideLoader();
  }

  async function purgeCache() {
    if(!confirm('Purge all edge cache?')) return;
    showLoader('Purging...');
    await fetch('/admin/api/cache/purge', { method: 'POST' });
    hideLoader();
    showToast('Cache purge requested');
  }

  function copyLink(p) {
    navigator.clipboard.writeText(window.location.origin + '/' + p);
    showToast('Copied');
  }
`;
