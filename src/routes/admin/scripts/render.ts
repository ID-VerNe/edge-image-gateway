export const RENDER = `
  function renderFileList(files) {
    const container = document.getElementById('file-container');
    if(!container) return;
    const filteredFiles = files.filter(f => f.name !== '.keep');
    
    container.className = viewMode === 'list' ? 'file-list-card' : 'file-grid';
    if (!filteredFiles.length) {
      container.innerHTML = '<div style="padding:4rem; text-align:center; color:var(--text-2);">Directory is empty</div>';
      return;
    }
    
    filteredFiles.sort((a,b) => (a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1)));

    if (viewMode === 'list') {
      let html = '<div class="file-row header"><div></div><div></div><div>Name</div><div>Size</div><div>Type</div></div>';
      filteredFiles.forEach(f => {
        const isDir = f.type === 'dir';
        html += \`
          <div class="file-row">
            <div><input type="checkbox" class="file-checkbox" onchange="toggleSelection('\${f.path}')" \${selectedFiles.has(f.path) ? 'checked' : ''}></div>
            <div style="font-size: 1.25rem; display: flex; align-items: center; justify-content: center;">\${isDir ? '📁' : '🖼️'}</div>
            <div class="truncate"><a class="file-name" onclick="\${isDir ? \`loadFiles('\${f.path}')\` : \`openLightbox('\${f.path}', '/\${f.path}')\`}">\${f.name}</a></div>
            <div style="color: var(--text-2);">\${isDir ? '-' : formatBytes(f.size)}</div>
            <div style="color: var(--text-2);">\${f.type}</div>
          </div>
        \`;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = filteredFiles.map(f => {
        const isDir = f.type === 'dir';
        return \`
          <div class="grid-item">
            <input type="checkbox" class="file-checkbox" style="position:absolute; top:0.75rem; left:0.75rem; z-index:10;" onchange="toggleSelection('\${f.path}')" \${selectedFiles.has(f.path) ? 'checked' : ''}>
            \${isDir 
              ? \`<div class="grid-preview" onclick="loadFiles('\${f.path}')">📁</div>\`
              : \`<img class="grid-preview" src="/\${f.path}?w=300&q=70" onclick="openLightbox('\${f.path}', '/\${f.path}')" loading="lazy">\`
            }
            <div class="grid-info">
              <div class="grid-name" title="\${f.name}">\${f.name}</div>
              <div class="grid-actions">
                \${isDir 
                  ? \`<button class="btn btn-mini" style="flex:1" onclick="loadFiles('\${f.path}')">Open</button>\`
                  : \`
                    <button class="btn btn-mini btn-secondary" style="flex:1" onclick="copyLink('\${f.path}')">Copy</button>
                    <button class="btn btn-mini" style="flex:1" onclick="showShareModal('\${f.path}')">Share</button>
                    \`
                }
                <button class="btn btn-mini btn-danger" onclick="deleteItem('\${f.path}', '\${isDir ? 'dir' : 'file'}')">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                </button>
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
    if(btn) {
      btn.innerHTML = viewMode === 'list' 
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg> Grid View'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg> List View';
    }
    loadFiles(currentPath);
  }
`;
