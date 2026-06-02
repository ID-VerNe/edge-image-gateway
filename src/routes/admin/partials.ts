export const PARTIALS = {
  header: (userEmail: string) => `
    <header>
      <div class="logo">Picbed Admin</div>
      <div class="user-info">User: <strong>${userEmail}</strong></div>
    </header>
  `,
  sidebar: `
    <aside>
      <div class="sidebar-content">
        <div class="sidebar-header">🛠 Navigation</div>
        <div id="file-tree-sidebar">
          <div class="tree-item root active" onclick="loadFiles('')">root</div>
        </div>
      </div>
      <div class="sidebar-footer">
        <div class="tree-item" id="nav-settings" onclick="switchView('repos')">⚙️ Settings</div>
      </div>
    </aside>
  `,
  mainFiles: `
    <main id="main-files">
      <div class="toolbar" id="bulk-toolbar" style="display: none; background: #fffbdd; border-bottom: 1px solid #d0d7de;">
        <div style="display: flex; align-items: center; gap: 1rem; font-weight: 600;">
          <span id="selected-count">0 items selected</span>
          <button class="btn btn-danger" onclick="bulkDelete()">Delete selected</button>
          <button class="btn" onclick="showMoveModal()">Move to...</button>
          <button class="btn" onclick="clearSelection()">Cancel</button>
        </div>
      </div>
      <div class="toolbar">
        <div class="breadcrumbs" id="breadcrumbs"></div>
        <div class="actions">
          <button class="btn" onclick="toggleViewMode()" id="toggle-view-btn">Grid View</button>
          <button class="btn btn-primary" onclick="fi.click()">Add file</button>
          <button class="btn" onclick="showNewFolderModal()">New folder</button>
        </div>
      </div>
      <div class="content-area">
        <div id="file-container" class="file-list-card"></div>
      </div>
    </main>
  `,
  mainRepos: `
    <main id="main-repos" style="display: none;">
      <div class="toolbar">
        <div class="breadcrumbs"><span class="breadcrumb-item current">System Settings & Registry</span></div>
        <div class="actions">
          <button class="btn btn-primary" onclick="showAddRepoModal()">Register New Repo</button>
          <button class="btn" onclick="purgeCache()">Purge Edge Cache</button>
        </div>
      </div>
      <div class="content-area">
         <div id="stats-dashboard" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:1.5rem; margin-bottom:2rem;">
            <div class="file-list-card" style="padding:1.5rem; background:var(--github-gray);">
              <div style="font-size:0.875rem; color:#57606a; margin-bottom:0.5rem;">Total Repositories</div>
              <div style="font-size:1.5rem; font-weight:600;" id="stat-repos">-</div>
            </div>
            <div class="file-list-card" style="padding:1.5rem; background:var(--github-gray);">
              <div style="font-size:0.875rem; color:#57606a; margin-bottom:0.5rem;">Total Images</div>
              <div style="font-size:1.5rem; font-weight:600;" id="stat-files">-</div>
            </div>
            <div class="file-list-card" style="padding:1.5rem; background:var(--github-gray);">
              <div style="font-size:0.875rem; color:#57606a; margin-bottom:0.5rem;">Total Storage Used</div>
              <div style="font-size:1.5rem; font-weight:600;" id="stat-size">-</div>
            </div>
         </div>

         <h3>Managed Repositories</h3>
         <div id="repo-settings-list"></div>
      </div>
    </main>
  `,
  modals: `
    <div id="toast"></div>
    <div class="loading-overlay" id="global-loader">
      <div id="loader-status">Processing...</div>
      <div class="progress-container" id="upload-progress-container">
        <div class="progress-bar" id="upload-progress-bar"></div>
      </div>
      <div class="progress-text" id="upload-progress-text"></div>
    </div>
    <div id="dropzone"><h2>Drop to upload</h2></div>

    <div class="modal" id="newFolderModal">
      <div class="modal-content">
        <h3 style="margin-top:0">New folder</h3>
        <input type="text" id="newFolderName" placeholder="Folder path..." style="width:100%; padding:0.5rem; margin-bottom:1rem; border:1px solid var(--kami-border); border-radius:6px;">
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <button class="btn" onclick="hideNewFolderModal()">Cancel</button>
          <button class="btn btn-primary" onclick="createNewFolder()">Create</button>
        </div>
      </div>
    </div>

    <div class="modal" id="moveModal">
      <div class="modal-content">
        <h3 style="margin-top:0">Move to folder</h3>
        <p style="font-size:0.875rem; color:#57606a;">Enter target directory (e.g. 2026/travel). Leave empty for root.</p>
        <input type="text" id="moveTargetPath" placeholder="Target path..." style="width:100%; padding:0.5rem; margin-bottom:1rem; border:1px solid var(--kami-border); border-radius:6px;">
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <button class="btn" onclick="hideMoveModal()">Cancel</button>
          <button class="btn btn-primary" onclick="bulkMove()">Move</button>
        </div>
      </div>
    </div>

    <div class="modal" id="addRepoModal">
      <div class="modal-content" style="width:500px;">
        <h3 style="margin-top:0">Register Repository</h3>
        <div style="display:grid; gap:1rem;">
          <input type="text" id="repoId" placeholder="Repo ID (e.g. v2)" style="width:100%; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px;">
          <input type="text" id="repoOwner" placeholder="GitHub Owner" style="width:100%; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px;">
          <input type="text" id="repoName" placeholder="GitHub Repo Name" style="width:100%; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px;">
          <input type="text" id="repoBranch" placeholder="Branch (default: main)" style="width:100%; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px;">
          <input type="text" id="repoSecret" placeholder="Token Secret Name (default: GITHUB_TOKEN)" style="width:100%; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px;">
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1.5rem;">
          <button class="btn" onclick="hideAddRepoModal()">Cancel</button>
          <button class="btn btn-primary" onclick="addRepo()">Register</button>
        </div>
      </div>
    </div>

    <input type="file" id="fileInput" style="display: none" multiple />
  `
};
