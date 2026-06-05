export const NAVIGATION = `
  let allFiles = [];

  async function init() {
    const btn = document.getElementById('toggle-view-btn');
    if (btn) btn.innerText = viewMode === 'list' ? 'Grid View' : 'List View';
    await loadRepos();
    await loadStats();
    await loadFiles(window.location.hash.replace('#', ''));
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

  async function loadRepos(data = null) {
    try {
      if (!data) {
        const r = await fetch('/admin/api/repos');
        data = await r.json();
      }
      
      repos = data.repos;
      const currentWriteId = data.currentWriteId;
      
      const list = document.getElementById('repo-settings-list');
      if(list) list.innerHTML = repos.map(repo => {
        const isCurrentWrite = repo.id === currentWriteId;
        const isFallback = repo.id === 'fallback';
        return '<div style="padding:1.5rem; border:1px solid ' + (isCurrentWrite ? 'var(--kami-blue)' : 'var(--kami-border)') + '; border-radius:6px; margin-bottom:1.5rem; background:var(--card-bg); position:relative;">' +
            (isCurrentWrite ? '<div style="position:absolute; top:0; right:1.5rem; background:var(--kami-blue); color:#fff; font-size:0.7rem; padding:2px 8px; border-radius:0 0 4px 4px; font-weight:600;">ACTIVE WRITE TARGET</div>' : '') +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">' +
              '<div style="font-size:1.1rem; font-weight:600;">' + repo.id + ' <span style="font-weight:400; color:var(--kami-ink-muted); font-size:0.9rem;">(' + repo.owner + '/' + repo.name + ')</span></div>' +
              '<div style="display:flex; gap:0.5rem; align-items:center;">' +
                (!isCurrentWrite ? '<button class="btn" style="font-size:0.75rem; padding:2px 8px;" onclick="setWriteRepo(\\'' + repo.id + '\\')">Set Active</button>' : '') +
                (!isFallback ? 
                  '<button class="btn" style="font-size:0.75rem; padding:2px 8px;" onclick=\\'showEditRepoModal(' + JSON.stringify(repo) + ')\\'>Edit</button>' +
                  '<button class="btn btn-danger" style="font-size:0.75rem; padding:2px 8px;" onclick="deleteRepo(\\'' + repo.id + '\\')">Delete</button>'
                 : '') +
                '<button class="btn" style="font-size:0.75rem; padding:2px 8px;" onclick="syncRepo(\\'' + repo.id + '\\')">Sync</button>' +
                '<div class="tree-item" style="padding:0; cursor:default;"><i style="color:' + (repo.status === 'active' ? '#2da44e' : '#cf222e') + '">●</i> ' + repo.status + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="font-size:0.875rem; color:var(--kami-ink-muted); margin-bottom:0.5rem;">Capacity: ' + (repo.sizeBytes / (1024*1024)).toFixed(1) + ' MB / ' + (repo.capacityLimitBytes / (1024*1024*1024)).toFixed(0) + ' GB</div>' +
            '<div class="progress-container" style="display:block; margin:0; background:var(--github-gray); height:10px;">' +
              '<div class="progress-bar" style="width:' + Math.min(100, (repo.sizeBytes / repo.capacityLimitBytes) * 100) + '%; background:' + ((repo.sizeBytes / repo.capacityLimitBytes) > 0.8 ? '#cf222e' : '#2da44e') + '"></div>' +
            '</div>' +
          '</div>';
      }).join('');
    } catch(e) {}
  }

  async function loadFiles(path = '') {
    currentPath = path.replace(/^\\/+|\\/+$/g, '');
    window.location.hash = currentPath;
    selectedFiles.clear();
    if (typeof updateBulkToolbar === 'function') updateBulkToolbar();
    renderBreadcrumbs();
    switchView('files');

    const container = document.getElementById('file-container');
    if(container) container.innerHTML = '<div style="padding:2rem; text-align:center;">Loading...</div>';
    try {
      const r = await fetch('/admin/api/files?prefix=' + encodeURIComponent(currentPath));
      const data = await r.json();
      allFiles = data.files || [];
      renderFileList(allFiles);
      renderSidebarTree(allFiles);
    } catch (e) { if(container) container.innerHTML = '<div style="padding:2rem;">Error loading files</div>'; }
  }

  function filterFiles(query) {
    if (!query) {
      renderFileList(allFiles);
      return;
    }
    const q = query.toLowerCase();
    const filtered = allFiles.filter(f => f.name.toLowerCase().includes(q));
    renderFileList(filtered);
  }

  function renderSidebarTree(currentFiles) {
    const treeContainer = document.getElementById('file-tree-sidebar');
    if (!treeContainer) return;

    const folders = currentFiles.filter(f => f.type === 'dir');
    const pathParts = currentPath ? currentPath.split('/') : [];
    
    let html = '<div class="tree-item root ' + (!currentPath ? 'active' : '') + '" onclick="loadFiles(\\'' + '\\')">root</div>';
    
    let build = '';
    pathParts.forEach((p, i) => {
      build += (i === 0 ? '' : '/') + p;
      html += '<div class="tree-item folder open active" style="padding-left: ' + ((i+1) * 1.25) + 'rem" onclick="loadFiles(\\'' + build + '\\')">' + p + '</div>';
    });

    folders.forEach(f => {
      html += '<div class="tree-item folder" style="padding-left: ' + ((pathParts.length + 1) * 1.25) + 'rem" onclick="loadFiles(\\'' + f.path + '\\')">' + f.name + '</div>';
    });

    treeContainer.innerHTML = html;
  }

  function renderBreadcrumbs() {
    const bc = document.getElementById('breadcrumbs');
    if(!bc) return;
    const parts = currentPath ? currentPath.split('/') : [];
    let html = '<span class="breadcrumb-item" onclick="loadFiles(\\'' + '\\')">root</span>';
    let build = '';
    parts.forEach((p, i) => {
      build += (i === 0 ? '' : '/') + p;
      html += '<span class="breadcrumb-sep">/</span>';
      html += '<span class="breadcrumb-item ' + (i === parts.length-1 ? 'current' : '') + '" onclick="loadFiles(\\'' + build + '\\')">' + p + '</span>';
    });
    bc.innerHTML = html;
  }

  function switchView(v) {
    document.querySelectorAll('main').forEach(m => m.style.display = 'none');
    const main = document.getElementById('main-' + v);
    if(main) main.style.display = 'flex';
    
    document.querySelectorAll('aside .tree-item').forEach(i => i.classList.remove('active'));
    if(v === 'repos') {
      const settingsNav = document.getElementById('nav-settings');
      if(settingsNav) settingsNav.classList.add('active');
    } else if(v === 'tokens') {
      const tokensNav = document.getElementById('nav-tokens');
      if(tokensNav) tokensNav.classList.add('active');
      if(typeof loadTokens === 'function') loadTokens();
    } else if(v === 'audit') {
      const auditNav = document.getElementById('nav-audit');
      if(auditNav) auditNav.classList.add('active');
      loadAuditLogs();
    } else if(v === 'files' && !currentPath) {
       const rootNav = document.querySelector('.tree-item.root');
       if(rootNav) rootNav.classList.add('active');
    }
  }

  async function loadAuditLogs() {
    const list = document.getElementById('audit-log-list');
    if(!list) return;
    try {
      const r = await fetch('/admin/api/audit');
      const data = await r.json();
      const logs = data.logs || [];
      
      if (logs.length === 0) {
        list.innerHTML = '<tr><td colspan="5" style="padding:2rem; text-align:center; color:var(--kami-ink-muted);">No audit logs found.</td></tr>';
        return;
      }

      list.innerHTML = logs.map(log => {
        let details = '';
        for (const k in log) {
          if (!['ts', 'user', 'action', 'ip'].includes(k)) {
            details += k + ': <b>' + log[k] + '</b> | ';
          }
        }
        return '<tr style="border-bottom:1px solid var(--kami-border);">' +
            '<td style="padding:0.75rem; white-space:nowrap;">' + new Date(log.ts).toLocaleString() + '</td>' +
            '<td style="padding:0.75rem; color:var(--kami-blue); font-weight:500;">' + log.user + '</td>' +
            '<td style="padding:0.75rem;"><span class="badge" style="background:rgba(88,166,255,0.1); color:var(--kami-blue); font-size:0.7rem; padding:2px 6px; border-radius:4px; font-weight:600;">' + log.action + '</span></td>' +
            '<td style="padding:0.75rem; font-family:monospace; font-size:0.75rem; color:var(--kami-ink-muted);">' + log.ip + '</td>' +
            '<td style="padding:0.75rem; font-size:0.75rem; color:var(--kami-ink-muted);">' + details + '</td>' +
          '</tr>';
      }).join('');
    } catch (e) {
      list.innerHTML = '<tr><td colspan="5" style="padding:2rem; text-align:center; color:#cf222e;">Failed to load logs.</td></tr>';
    }
  }
`;
