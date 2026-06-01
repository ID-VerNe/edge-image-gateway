export const NAVIGATION = `
  async function init() {
    const btn = document.getElementById('toggle-view-btn');
    if (btn) btn.innerText = viewMode === 'list' ? 'Grid View' : 'List View';
    await loadRepos();
    await loadStats();
    loadFiles(window.location.hash.replace('#', ''));
  }

  async function loadStats() {
    try {
      const r = await fetch('/admin/api/stats');
      const data = await r.json();
      const elRepos = document.getElementById('stat-repos');
      const elFiles = document.getElementById('stat-files');
      const elSize = document.getElementById('stat-size');
      if(elRepos) elRepos.innerText = data.repoCount;
      if(elFiles) elFiles.innerText = data.totalFiles;
      if(elSize) elSize.innerText = (data.totalSizeBytes / (1024*1024*1024)).toFixed(2) + ' GB';
    } catch(e) {}
  }

  async function loadRepos() {
    try {
      const r = await fetch('/admin/api/repos');
      const data = await r.json();
      repos = data.repos;
      const tree = document.getElementById('repo-tree');
      if(tree) tree.innerHTML = repos.map(repo => \`
        <div class="tree-item"><i>\${repo.status === 'active' ? '●' : '○'}</i> \${repo.id}</div>
      \`).join('');
      
      const list = document.getElementById('repo-settings-list');
      if(list) list.innerHTML = repos.map(repo => \`
        <div style="padding:1.5rem; border:1px solid var(--kami-border); border-radius:6px; margin-bottom:1.5rem; background:#fff;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <div style="font-size:1.1rem; font-weight:600;">\${repo.id} <span style="font-weight:400; color:#57606a; font-size:0.9rem;">(\${repo.owner}/\${repo.name})</span></div>
            <div class="tree-item" style="padding:0; cursor:default;"><i style="color:\${repo.status === 'active' ? '#2da44e' : '#cf222e'}">●</i> \${repo.status}</div>
          </div>
          <div style="font-size:0.875rem; color:#57606a; margin-bottom:0.5rem;">Capacity: \${(repo.sizeBytes / (1024*1024)).toFixed(1)} MB / \${(repo.capacityLimitBytes / (1024*1024*1024)).toFixed(0)} GB</div>
          <div class="progress-container" style="display:block; margin:0; background:#eee; height:10px;">
            <div class="progress-bar" style="width:\${Math.min(100, (repo.sizeBytes / repo.capacityLimitBytes) * 100)}%; background:\${(repo.sizeBytes / repo.capacityLimitBytes) > 0.8 ? '#cf222e' : '#2da44e'}"></div>
          </div>
        </div>
      \`).join('');
    } catch(e) {}
  }

  async function loadFiles(path = '') {
    currentPath = path.replace(/^\\/+|\\/+$/g, '');
    window.location.hash = currentPath;
    selectedFiles.clear();
    if (typeof updateBulkToolbar === 'function') updateBulkToolbar();
    renderBreadcrumbs();
    const container = document.getElementById('file-container');
    if(container) container.innerHTML = '<div style="padding:2rem; text-align:center;">Loading...</div>';
    try {
      const r = await fetch('/admin/api/files?prefix=' + encodeURIComponent(currentPath));
      const data = await r.json();
      renderFileList(data.files || []);
    } catch (e) { if(container) container.innerHTML = '<div style="padding:2rem;">Error loading files</div>'; }
  }

  function renderBreadcrumbs() {
    const bc = document.getElementById('breadcrumbs');
    if(!bc) return;
    const parts = currentPath ? currentPath.split('/') : [];
    let html = '<span class="breadcrumb-item" onclick="loadFiles(\\'\\')">root</span>';
    let build = '';
    parts.forEach((p, i) => {
      build += (i === 0 ? '' : '/') + p;
      html += '<span class="breadcrumb-sep">/</span>';
      html += \`<span class="breadcrumb-item \${i === parts.length-1 ? 'current' : ''}" onclick="loadFiles('\${build}')">\${p}</span>\`;
    });
    bc.innerHTML = html;
  }

  function switchView(v) {
    document.querySelectorAll('main').forEach(m => m.style.display = 'none');
    const main = document.getElementById('main-' + v);
    if(main) main.style.display = 'flex';
    document.querySelectorAll('aside .tree-item').forEach(i => i.classList.remove('active'));
    // Sidebar sync
    if(v === 'files') {
        const item = document.querySelector('aside .tree-item:nth-child(4)');
        if(item) item.classList.add('active');
    }
    if(v === 'repos') {
        const item = document.querySelector('aside .tree-item:nth-child(5)');
        if(item) item.classList.add('active');
    }
  }
`;
