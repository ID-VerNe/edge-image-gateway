export const NAVIGATION = `
  let allFiles = [];

  async function init() {
    const btn = document.getElementById('toggle-view-btn');
    if (btn) {
      btn.innerHTML = viewMode === 'list' 
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg> Grid View'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg> List View';
    }
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
      if(elSize) elSize.innerText = formatBytes(data.totalSizeBytes);
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
        const usagePercent = Math.min(100, (repo.sizeBytes / repo.capacityLimitBytes) * 100);
        const progressColor = usagePercent > 90 ? 'var(--danger)' : (usagePercent > 70 ? 'var(--warning)' : 'var(--success)');
        
        return \`
          <div class="stat-card" style="position:relative; \${isCurrentWrite ? 'border-color: var(--primary);' : ''}">
            \${isCurrentWrite ? '<div style="position:absolute; top:0; right:1.5rem; background:var(--primary); color:#fff; font-size:0.65rem; padding:2px 8px; border-radius:0 0 6px 6px; font-weight:700; text-transform:uppercase;">Active Write Target</div>' : ''}
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:1.25rem;">
              <div>
                <div style="font-size:1.125rem; font-weight:700; letter-spacing:-0.01em; margin-bottom:0.25rem;">\${repo.id}</div>
                <div style="font-size:0.8125rem; color:var(--text-2);">\${repo.owner}/\${repo.name} • \${repo.branch}</div>
              </div>
              <div style="display:flex; gap:0.5rem;">
                <button class="btn btn-mini" onclick="syncRepo('\${repo.id}')">Sync</button>
                \${!isCurrentWrite ? \`<button class="btn btn-mini" onclick="setWriteRepo('\${repo.id}')">Set Active</button>\` : ''}
                \${!isFallback ? \`
                  <button class="btn btn-mini" onclick='showEditRepoModal(\${JSON.stringify(repo)})'>Edit</button>
                  <button class="btn btn-mini btn-danger" onclick="deleteRepo('\${repo.id}')">Delete</button>
                \` : ''}
              </div>
            </div>
            
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:0.5rem; font-weight:600;">
              <span style="color:var(--text-2);">Usage: \${formatBytes(repo.sizeBytes)} / \${formatBytes(repo.capacityLimitBytes)}</span>
              <span style="color:\${progressColor}">\${usagePercent.toFixed(1)}%</span>
            </div>
            <div class="progress-bg">
              <div class="progress-fill" style="width:\${usagePercent}%; background:\${progressColor}"></div>
            </div>
            
            <div style="margin-top:1rem; display:flex; align-items:center; gap:0.5rem; font-size:0.75rem; font-weight:600; color:var(--text-2);">
              <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:\${repo.status === 'active' ? 'var(--success)' : 'var(--danger)'}; \${repo.status === 'active' ? 'box-shadow: 0 0 8px var(--success);' : ''}"></span>
              \${repo.status.toUpperCase()}
            </div>
          </div>
        \`;
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
    if(container) container.innerHTML = '<div style="padding:4rem; text-align:center; color:var(--text-2);">Loading storage...</div>';
    try {
      const r = await fetch('/admin/api/files?prefix=' + encodeURIComponent(currentPath));
      const data = await r.json();
      allFiles = data.files || [];
      renderFileList(allFiles);
      renderSidebarTree(allFiles);
    } catch (e) { if(container) container.innerHTML = '<div style="padding:4rem; text-align:center; color:var(--danger);">Failed to load storage</div>'; }
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
    
    let html = \`
      <div class="tree-item root \${!currentPath ? 'active' : ''}" onclick="loadFiles('')">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        All Files
      </div>
    \`;
    
    let build = '';
    pathParts.forEach((p, i) => {
      build += (i === 0 ? '' : '/') + p;
      html += \`
        <div class="tree-item active" style="padding-left: \${((i+1) * 1.5)}rem" onclick="loadFiles('\${build}')">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          \${p}
        </div>
      \`;
    });

    folders.forEach(f => {
      html += \`
        <div class="tree-item" style="padding-left: \${((pathParts.length + 1) * 1.5)}rem" onclick="loadFiles('\${f.path}')">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          \${f.name}
        </div>
      \`;
    });

    treeContainer.innerHTML = html;
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
        list.innerHTML = '<tr><td colspan="5" style="padding:4rem; text-align:center; color:var(--text-2);">No activity recorded.</td></tr>';
        return;
      }

      list.innerHTML = logs.map(log => {
        let details = '';
        for (const k in log) {
          if (!['ts', 'user', 'action', 'ip'].includes(k)) {
            let val = log[k];
            if (k.toLowerCase().includes('size')) {
              val = formatBytes(parseInt(val, 10));
            }
            details += \`<div style="display:inline-block; margin-right:0.75rem;"><span style="color:var(--text-2); font-size:0.7rem; font-weight:600;">\${k.toUpperCase()}</span> <span style="font-weight:500;">\${val}</span></div>\`;
          }
        }
        
        let actionBadge = 'badge-primary';
        if (log.action.includes('delete')) actionBadge = 'badge-danger';
        if (log.action.includes('upload') || log.action.includes('create')) actionBadge = 'badge-success';
        if (log.action.includes('sync') || log.action.includes('edit')) actionBadge = 'badge-warning';

        return \`
          <tr>
            <td style="white-space:nowrap; color:var(--text-2);">\${new Date(log.ts).toLocaleString()}</td>
            <td style="font-weight:600; color:var(--primary);">\${log.user}</td>
            <td><span class="badge \${actionBadge}">\${log.action.toUpperCase()}</span></td>
            <td style="font-family:monospace; font-size:0.75rem; color:var(--text-2);">\${log.ip}</td>
            <td>\${details}</td>
          </tr>
        \`;
      }).join('');
    } catch (e) {
      list.innerHTML = '<tr><td colspan="5" style="padding:4rem; text-align:center; color:var(--danger);">Failed to retrieve audit logs.</td></tr>';
    }
  }
`;
