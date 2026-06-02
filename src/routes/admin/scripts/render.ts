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
          <div class="file-row" style="grid-template-columns: 20px 32px 3fr 1fr 1fr 160px;">
            <div><input type="checkbox" class="file-checkbox" onchange="toggleSelection('\${f.path}')" \${selectedFiles.has(f.path) ? 'checked' : ''}></div>
            <div class="file-icon">\${isDir ? '📁' : '🖼️'}</div>
            <div><a class="file-name \${!isDir ? 'file' : ''}" onclick="\${isDir ? \`loadFiles('\${f.path}')\` : \`window.open('/\${f.path}', '_blank')\`}">\${f.name}</a></div>
            <div class="file-meta">\${isDir ? '-' : (f.size/1024).toFixed(1) + 'KB'}</div>
            <div class="file-meta">\${f.type}</div>
            <div class="grid-actions">
              <button class="btn btn-mini" onclick="\${isDir ? \`loadFiles('\${f.path}')\` : \`copyLink('\${f.path}')\`}">\${isDir ? 'Open' : 'Copy'}</button>
              \${!isDir ? \`<button class="btn btn-mini" onclick="showShareModal('\${f.path}')">Share</button>\` : ''}
              <button class="btn btn-mini btn-danger" onclick="deleteItem('\${f.path}', '\${f.type}')">del</button>
            </div>
          </div>
        \`;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = filteredFiles.map(f => {
        const isDir = f.type === 'dir';
        return \`
          <div class="grid-item \${isDir ? 'folder-grid-item' : ''}" style="position:relative;">
            <input type="checkbox" class="file-checkbox" style="position:absolute; top:0.5rem; left:0.5rem; z-index:10;" onchange="toggleSelection('\${f.path}')" \${selectedFiles.has(f.path) ? 'checked' : ''}>
            \${isDir 
              ? \`<div class="grid-preview" onclick="loadFiles('\${f.path}')">📁</div>\`
              : \`<img class="grid-preview" src="/\${f.path}?w=300&q=70" onclick="window.open('/\${f.path}', '_blank')">\`
            }
            <div class="grid-info">
              <div class="grid-name">\${f.name}</div>
              <div class="grid-actions">
                \${isDir 
                  ? \`<button class="btn btn-mini" style="flex:1" onclick="loadFiles('\${f.path}')">Open</button>\`
                  : \`
                    <button class="btn btn-mini" style="flex:1" onclick="copyLink('\${f.path}')">Copy</button>
                    <button class="btn btn-mini" style="flex:1" onclick="showShareModal('\${f.path}')">Share</button>
                    \`
                }
                <button class="btn btn-mini btn-danger" onclick="deleteItem('\${f.path}', '\${isDir ? 'dir' : 'file'}')">🗑️</button>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }
  }

  function toggleViewMode() {
    viewMode = viewMode === 'list' ? 'grid' : 'list';
    localStorage.setItem('gateway_view_mode', viewMode);
    const btn = document.getElementById('toggle-view-btn');
    if(btn) btn.innerText = viewMode === 'list' ? 'Grid View' : 'List View';
    loadFiles(currentPath);
  }
`;
