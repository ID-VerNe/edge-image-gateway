export const REPO_ACTIONS = `
  function showAddRepoModal() { 
    const modal = document.getElementById('addRepoModal');
    if(modal) {
      document.getElementById('repoOwner').value = window.DEFAULT_GITHUB_USER || '';
      document.getElementById('repoName').value = window.DEFAULT_GITHUB_REPO || '';
      document.getElementById('repoBranch').value = 'main';
      document.getElementById('repoSecret').value = 'GITHUB_TOKEN';
      modal.style.display = 'flex'; 
    }
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
      const res = await fetch('/admin/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || 'Failed to register repo');
      
      await loadRepos(data);
      await loadStats();
      hideAddRepoModal();
    } catch(e) { alert(e.message); }
    hideLoader();
  }

  async function setWriteRepo(repoId) {
    showLoader('Switching write target...');
    try {
      const res = await fetch('/admin/api/repos/route/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repoId })
      });
      const data = await res.json();
      await loadRepos(data);
      await loadFiles(''); 
      showToast('Write target switched to ' + repoId);
    } catch(e) { alert('Failed to switch write target'); }
    hideLoader();
  }

  function showEditRepoModal(repo) {
    const modal = document.getElementById('editRepoModal');
    if(modal) {
      document.getElementById('editRepoOldId').value = repo.id;
      document.getElementById('editRepoId').value = repo.id;
      document.getElementById('editRepoOwner').value = repo.owner;
      document.getElementById('editRepoName').value = repo.name;
      document.getElementById('editRepoBranch').value = repo.branch;
      document.getElementById('editRepoCapacity').value = repo.capacityLimitBytes;
      modal.style.display = 'flex';
    }
  }

  function hideEditRepoModal() {
    const modal = document.getElementById('editRepoModal');
    if(modal) modal.style.display = 'none';
  }

  async function updateRepo() {
    const oldId = document.getElementById('editRepoOldId').value;
    const body = {
      newId: document.getElementById('editRepoId').value,
      owner: document.getElementById('editRepoOwner').value,
      name: document.getElementById('editRepoName').value,
      branch: document.getElementById('editRepoBranch').value,
      capacityLimitBytes: parseInt(document.getElementById('editRepoCapacity').value)
    };
    showLoader('Updating repo...');
    try {
      const res = await fetch(\`/admin/api/repos/\${oldId}\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      
      await loadRepos(data);
      hideEditRepoModal();
      showToast('Repository updated');
    } catch(e) { alert(e.message); }
    hideLoader();
  }

  async function deleteRepo(id) {
    const confirmText = prompt('This will only delete the mapping in KV. The GitHub repository will NOT be touched. \\nType the repository ID "' + id + '" to confirm deletion:');
    if (confirmText !== id) {
      if (confirmText !== null) alert('Confirmation failed. ID mismatch.');
      return;
    }

    showLoader('Deleting mapping...');
    try {
      const res = await fetch(\`/admin/api/repos/\${id}\`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');

      await loadRepos(data);
      await loadStats();
      showToast('Repository mapping deleted');
    } catch(e) { alert(e.message); }
    hideLoader();
  }

  async function purgeCache() {
    if(!confirm('Purge all edge cache?')) return;
    showLoader('Purging...');
    await fetch('/admin/api/cache/purge', { method: 'POST' });
    hideLoader();
    showToast('Cache purge requested');
  }

  async function syncRepo(id) {
    showLoader('Syncing with GitHub...');
    try {
      const res = await fetch(\`/admin/api/repos/\${id}/sync\`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      
      await loadRepos(data);
      await loadStats();
      showToast(\`Synced: \${data.fileCount} files, \${(data.sizeBytes / (1024*1024)).toFixed(2)} MB\`);
    } catch(e) { alert(e.message); }
    hideLoader();
  }
`;
