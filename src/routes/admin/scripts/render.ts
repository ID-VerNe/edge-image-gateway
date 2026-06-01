export const RENDER = `
  function renderFileList(files) {
    const container = document.getElementById('file-container');
    if(!container) return;
    const filteredFiles = files.filter(f => f.name !== '.keep');
    
    container.className = viewMode === 'list' ? 'file-list-card' : 'file-grid';
    if (!filteredFiles.length) {
      container.innerHTML = '<div style="padding:3rem; text-align:center; color:#57606a;">Directory is empty</div>';
      return;
    }
    
    filteredFiles.sort((a,b) => (a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1)));

    if (viewMode === 'list') {
      let html = '<div class="file-row header"><div style="width:20px;"></div><div></div><div>Name</div><div>Size</div><div>Type</div><div>Action</div></div>';
      filteredFiles.forEach(f => {
        const isDir = f.type === 'dir';
        html += \`
          <div class="file-row" style="grid-template-columns: 20px 32px 3fr 1fr 1fr 120px;">
            <div><input type="checkbox" class="file-checkbox" onchange="toggleSelection('\${f.path}')" \${selectedFiles.has(f.path) ? 'checked' : ''}></div>
            <div class="file-icon">\${isDir ? '📁' : '🖼️'}</div>
            <div><a class="file-name \${!isDir ? 'file' : ''}" onclick="\${isDir ? \`loadFiles('\${f.path}')\` : \`window.open('/\${f.path}', '_blank')\`}">\${f.name}</a></div>
            <div class="file-meta">\${isDir ? '-' : (f.size/1024).toFixed(1) + 'KB'}</div>
            <div class="file-meta">\${f.type}</div>
            <div style="display:flex; gap:0.5rem;">
              <button class="btn" style="padding:1px 4px" onclick="copyLink('\${f.path}')">\${isDir ? 'open' : 'link'}</button>
              <button class="btn btn-danger" style="padding:1px 4px" onclick="deleteItem('\${f.path}', '\${f.type}')">del</button>
            </div>
          </div>
        \`;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = filteredFiles.map(f => {
        const isDir = f.type === 'dir';
        if (isDir) {
          return \`
            <div class="grid-item folder-grid-item" style="position:relative; display:flex; flex-direction:column; justify-content:center; align-items:center; height:200px; background:var(--github-gray); cursor:pointer;">
              <input type="checkbox" class="file-checkbox" style="position:absolute; top:0.5rem; left:0.5rem; z-index:10;" onchange="toggleSelection('\${f.path}')" \${selectedFiles.has(f.path) ? 'checked' : ''}>
              <div onclick="loadFiles('\${f.path}')" style="display:flex; flex-direction:column; align-items:center; width:100%;">
                <div style="font-size:3rem;">📁</div>
                <div style="font-size:0.875rem; font-weight:500; margin-top:0.5rem; padding:0 0.5rem; text-align:center; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${f.name}</div>
              </div>
            </div>
          \`;
        }
        return \`
          <div class="grid-item" style="position:relative;">
            <input type="checkbox" class="file-checkbox" style="position:absolute; top:0.5rem; left:0.5rem; z-index:10;" onchange="toggleSelection('\${f.path}')" \${selectedFiles.has(f.path) ? 'checked' : ''}>
            <img class="grid-preview" src="/\${f.path}?w=300&q=70" onclick="window.open('/\${f.path}', '_blank')">
            <div class="grid-info">
              <div class="grid-name">\${f.name}</div>
              <div style="display:flex; gap:0.5rem">
                <button class="btn" style="flex:1; font-size:0.7rem; padding:2px" onclick="copyLink('\${f.path}')">Copy</button>
                <button class="btn btn-danger" style="font-size:0.7rem; padding:2px" onclick="deleteItem('\${f.path}', 'file')">🗑️</button>
              </div>
            </div>
          </div>
          \`;
      }).join('');
    }
  }

  function toggleViewMode() {
    viewMode = viewMode === 'list' ? 'grid' : 'list';
    localStorage.setItem('picbed_view_mode', viewMode);
    const btn = document.getElementById('toggle-view-btn');
    if(btn) btn.innerText = viewMode === 'list' ? 'Grid View' : 'List View';
    loadFiles(currentPath);
  }
`;
