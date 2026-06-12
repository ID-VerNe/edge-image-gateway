export const PARTIALS = {
  header: (userEmail: string, appTitle: string) => {
    const userName = userEmail.split('@')[0];
    const userInitial = userName.charAt(0).toUpperCase();
    return `
      <header>
        <div class="logo" onclick="location.reload()">${appTitle}</div>
        <div class="user-capsule">
          <div class="user-avatar">${userInitial}</div>
          <div class="user-details">
            <div class="user-name">${userName}</div>
            <div class="user-email">${userEmail}</div>
          </div>
        </div>
      </header>
    `;
  },
  sidebar: (appTitle: string) => `
    <aside>
      <div class="sidebar-content">
        <div class="nav-group">
          <div class="sidebar-header">Storage</div>
          <div id="file-tree-sidebar">
            <div class="tree-item root active" onclick="loadFiles('')">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              All Files
            </div>
          </div>
        </div>

        <div class="nav-group">
          <div class="sidebar-header">System</div>
          <div class="tree-item" id="nav-audit" onclick="switchView('audit')">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            Audit Logs
          </div>
          <div class="tree-item" id="nav-tokens" onclick="switchView('tokens')">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            API Tokens
          </div>
          <div class="tree-item" id="nav-settings" onclick="switchView('repos')">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            Settings
          </div>
        </div>
      </div>
      <div class="sidebar-footer">
        <div style="font-size: 0.75rem; color: var(--text-2); text-align: center; font-weight: 500;">
          ${appTitle}
        </div>
      </div>
    </aside>
  `,
  mainFiles: `
    <main id="main-files">
      <div class="toolbar" id="bulk-toolbar" style="display: none; background: #fffbdd; border-bottom: 1px solid #d0d7de;">
        <div style="display: flex; align-items: center; gap: 1rem; font-weight: 600;">
          <span id="selected-count">0 items selected</span>
          <button class="btn btn-danger" onclick="bulkDelete()">Delete</button>
          <button class="btn" onclick="showMoveModal()">Move</button>
          <button class="btn" onclick="showBatchRenameModal()">Rename</button>
          <button class="btn btn-secondary" onclick="clearSelection()">Clear</button>
        </div>
      </div>
      <div class="toolbar">
        <div class="breadcrumbs" id="breadcrumbs"></div>
        <div class="search-box">
          <span class="search-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </span>
          <input type="text" class="search-input" id="file-search" placeholder="Search files..." oninput="filterFiles(this.value)">
        </div>
        <div class="actions">
          <button class="btn btn-secondary" onclick="selectAll()" title="Select All">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
            All
          </button>
          <button class="btn btn-secondary" onclick="selectNone()" title="Select None">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
            None
          </button>
          <button class="btn btn-secondary" onclick="selectInvert()" title="Invert Selection">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline><polyline points="7.5 19.79 7.5 14.6 3 12"></polyline><polyline points="21 12 16.5 14.6 16.5 19.79"></polyline><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            Invert
          </button>
          <button class="btn" onclick="toggleViewMode()" id="toggle-view-btn">
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
             Grid View
          </button>
          <button class="btn btn-primary" onclick="fi.click()">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add file
          </button>
          <button class="btn" onclick="showNewFolderModal()">New folder</button>
        </div>
      </div>
      <div class="content-area">
        <div id="file-container"></div>
      </div>
    </main>
  `,
  mainRepos: `
    <main id="main-repos" style="display: none;">
      <div class="toolbar">
        <div class="breadcrumbs"><span class="breadcrumb-item current">System Settings</span></div>
        <div class="actions">
          <button class="btn btn-primary" onclick="showAddRepoModal()">Register New Repo</button>
          <button class="btn" onclick="startBackfill()">Migrate to D1</button>
          <button class="btn" onclick="purgeCache()">Purge Edge Cache</button>
        </div>
      </div>
      <div class="content-area">
         <div id="stats-dashboard" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:1.5rem; margin-bottom:2.5rem;">
            <div class="stat-card stats-highlight">
              <div class="stats-icon icon-blue">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              </div>
              <div>
                <div class="stat-label">Total Repositories</div>
                <div class="stat-value" id="stat-repos">-</div>
              </div>
            </div>
            <div class="stat-card stats-highlight">
              <div class="stats-icon icon-indigo">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              </div>
              <div>
                <div class="stat-label">Total Images</div>
                <div class="stat-value" id="stat-files">-</div>
              </div>
            </div>
            <div class="stat-card stats-highlight">
              <div class="stats-icon icon-amber">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              </div>
              <div>
                <div class="stat-label">Total Storage Used</div>
                <div class="stat-value" id="stat-size">-</div>
              </div>
            </div>
         </div>

         <h3 style="margin-bottom: 1.5rem; letter-spacing: -0.01em;">Managed Repositories</h3>
         <div id="repo-settings-list" style="display: grid; gap: 1rem;"></div>
      </div>
    </main>
  `,
  mainTokens: `
    <main id="main-tokens" style="display: none;">
      <div class="toolbar">
        <div class="breadcrumbs"><span class="breadcrumb-item current">API Tokens</span></div>
        <div class="actions">
          <button class="btn btn-primary" onclick="showAddTokenModal()">Generate New Token</button>
        </div>
      </div>
      <div class="content-area">
         <div class="file-list-card" style="padding: 2rem; margin-bottom: 1.5rem; background: var(--github-gray);">
           <h4 style="margin-top:0">Authentication for PicGo / External Tools</h4>
           <p style="font-size:0.875rem; color:var(--text-2); margin-bottom:0;">Endpoint: <code>/admin/api/upload</code><br>Header: <code>Authorization: Bearer &lt;token&gt;</code></p>
         </div>
         <div id="token-list"></div>
      </div>
    </main>
  `,
  mainAudit: `
    <main id="main-audit" style="display: none;">
      <div class="toolbar">
        <div class="breadcrumbs"><span class="breadcrumb-item current">Audit Logs</span></div>
        <div class="actions">
          <button class="btn btn-primary" onclick="loadAuditLogs()">Refresh</button>
        </div>
      </div>
      <div class="content-area">
         <div class="file-list-card" style="padding:0; overflow:hidden;">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>IP Address</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody id="audit-log-list">
                <tr><td colspan="5" style="padding:4rem; text-align:center; color:var(--text-2);">Loading logs...</td></tr>
              </tbody>
            </table>
         </div>
      </div>
    </main>
  `,
  modals: `
    <div id="toast"></div>
    
    <div class="loading-overlay" id="global-loader">
      <div id="loader-status" style="font-weight: 600; color: #fff; margin-bottom: 1rem;">Processing...</div>
      <div class="progress-bg" id="upload-progress-container" style="width: 300px; display: none; background: rgba(255,255,255,0.1); border: none;">
        <div class="progress-fill" id="upload-progress-bar" style="background: var(--primary); height: 100%;"></div>
      </div>
      <div class="progress-text" id="upload-progress-text" style="color: rgba(255,255,255,0.7); font-size: 0.75rem; margin-top: 0.5rem;"></div>
    </div>
    
    <div id="dropzone">
      <div style="text-align: center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary); margin-bottom: 1rem;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        <h2>Drop files to upload</h2>
      </div>
    </div>

    <div id="lightbox" onclick="closeLightbox()">
      <div class="lightbox-header">
        <div id="lightbox-filename" style="font-weight:600; font-size: 1.125rem;">image.jpg</div>
        <button class="btn" style="background:transparent; border:none; color:#fff; cursor:pointer;" onclick="closeLightbox()">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div style="display:flex; flex:1; min-height:0;">
        <div class="lightbox-content">
          <img id="lightbox-img" class="lightbox-img" src="" onclick="event.stopPropagation()">
        </div>
        <div class="lightbox-sidebar" onclick="event.stopPropagation()">
          <div class="exif-hint">✨ <b>Privacy Guard</b>: Metadata stripped automatically.</div>
          
          <div class="copy-group">
            <label>Markdown</label>
            <div style="display:flex; gap:0.5rem;">
              <input type="text" id="copy-markdown" readonly onclick="this.select()">
              <button class="btn btn-mini" onclick="copyWithFeedback(document.getElementById('copy-markdown').value, this)">Copy</button>
            </div>
          </div>
          <div class="copy-group">
            <label>Direct Link</label>
            <div style="display:flex; gap:0.5rem;">
              <input type="text" id="copy-raw" readonly onclick="this.select()">
              <button class="btn btn-mini" onclick="copyWithFeedback(document.getElementById('copy-raw').value, this)">Copy</button>
            </div>
          </div>
          <div class="copy-group">
            <label>HTML</label>
            <div style="display:flex; gap:0.5rem;">
              <input type="text" id="copy-html" readonly onclick="this.select()">
              <button class="btn btn-mini" onclick="copyWithFeedback(document.getElementById('copy-html').value, this)">Copy</button>
            </div>
          </div>
          <div class="copy-group">
            <label>BBCode</label>
            <div style="display:flex; gap:0.5rem;">
              <input type="text" id="copy-bbcode" readonly onclick="this.select()">
              <button class="btn btn-mini" onclick="copyWithFeedback(document.getElementById('copy-bbcode').value, this)">Copy</button>
            </div>
          </div>
          
          <hr style="border:0; border-top:1px solid #1E293B; margin:2rem 0;">
          
          <div class="copy-group">
            <label>Signed URL (Temporary)</label>
            <div style="display:grid; gap:0.75rem;">
              <div style="display:flex; gap:0.5rem;">
                <select id="copy-signed-expiry" style="flex:1; padding:0.5rem; background:#0d1117; border:1px solid #30363d; border-radius:6px; color:#c9d1d9; font-size:0.8125rem;">
                  <option value="3600">1 Hour</option>
                  <option value="86400" selected>24 Hours</option>
                  <option value="604800">7 Days</option>
                </select>
                <button class="btn btn-mini btn-primary" onclick="generateSignedUrlForLightbox()">Generate</button>
              </div>
              <div style="display:flex; gap:0.5rem;">
                <input type="text" id="copy-signed" readonly placeholder="Link will appear here..." style="flex:1; font-size:0.75rem;">
                <button class="btn btn-mini" id="btn-copy-signed" onclick="copySignedUrlFromLightbox()" disabled>Copy</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="modal" id="batchRenameModal">
      <div class="modal-content">
        <h3>Batch Rename</h3>
        <p style="font-size:0.875rem; color:var(--text-2); margin-bottom:1.5rem;">Replace text in selected filenames.</p>
        <div style="display:grid; gap:1rem; margin-bottom:1.5rem;">
          <input type="text" id="renameSearch" placeholder="Search for..." style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
          <input type="text" id="renameReplace" placeholder="Replace with..." style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.75rem;">
          <button class="btn" onclick="hideBatchRenameModal()">Cancel</button>
          <button class="btn btn-primary" onclick="applyBatchRename()">Rename All</button>
        </div>
      </div>
    </div>

    <div class="modal" id="addTokenModal">
      <div class="modal-content" style="width:500px;">
        <h3>Generate API Token</h3>
        <div style="display:grid; gap:1.25rem;">
          <div>
            <label style="display:block; font-weight:600; font-size:0.875rem; margin-bottom:0.5rem;">Token Name</label>
            <input type="text" id="tokenName" placeholder="e.g. PicGo Desktop" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
          </div>
          <div>
            <label style="display:block; font-weight:600; font-size:0.875rem; margin-bottom:0.5rem;">Permissions</label>
            <div style="display: flex; gap: 1.5rem;">
              <label class="flex items-center gap-2"><input type="checkbox" id="scopeRead" value="read" checked> Read</label>
              <label class="flex items-center gap-2"><input type="checkbox" id="scopeWrite" value="write" checked> Write</label>
              <label class="flex items-center gap-2"><input type="checkbox" id="scopeDelete" value="delete"> Delete</label>
            </div>
          </div>
          <div>
            <label style="display:block; font-weight:600; font-size:0.875rem; margin-bottom:0.5rem;">Path Prefix (Optional)</label>
            <input type="text" id="tokenPathPrefix" placeholder="e.g. /photos/" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
          </div>
          <div>
            <label style="display:block; font-weight:600; font-size:0.875rem; margin-bottom:0.5rem;">Expiration</label>
            <select id="tokenExpires" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
              <option value="">Never expire</option>
              <option value="7">7 Days</option>
              <option value="30">30 Days</option>
              <option value="365">1 Year</option>
            </select>
          </div>
        </div>
        <div id="tokenDisplay" style="display:none; margin-top:1.5rem; padding:1.25rem; background:#fffbdd; border:1px solid #d0d7de; border-radius:var(--radius-sm); word-break:break-all;">
          <div style="font-weight:700; font-size:0.75rem; text-transform:uppercase; margin-bottom:0.5rem; color:#856404;">Save this token now!</div>
          <div id="tokenValue" style="color:var(--primary); font-weight:700; font-family:monospace; font-size:1rem;"></div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:2rem;">
          <button class="btn" id="btnAddTokenCancel" onclick="hideAddTokenModal()">Cancel</button>
          <button class="btn btn-primary" id="btnGenerateToken" onclick="generateToken()">Generate</button>
        </div>
      </div>
    </div>

    <div class="modal" id="newFolderModal">
      <div class="modal-content">
        <h3>New folder</h3>
        <input type="text" id="newFolderName" placeholder="Folder path..." style="width:100%; padding:0.75rem; margin-bottom:1.5rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
        <div style="display:flex; justify-content:flex-end; gap:0.75rem;">
          <button class="btn" onclick="hideNewFolderModal()">Cancel</button>
          <button class="btn btn-primary" onclick="createNewFolder()">Create</button>
        </div>
      </div>
    </div>

    <div class="modal" id="moveModal">
      <div class="modal-content">
        <h3>Move to folder</h3>
        <p style="font-size:0.875rem; color:var(--text-2); margin-bottom:1.5rem;">Enter target directory (e.g. 2026/travel).</p>
        <input type="text" id="moveTargetPath" placeholder="Target path..." style="width:100%; padding:0.75rem; margin-bottom:1.5rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
        <div style="display:flex; justify-content:flex-end; gap:0.75rem;">
          <button class="btn" onclick="hideMoveModal()">Cancel</button>
          <button class="btn btn-primary" onclick="bulkMove()">Move</button>
        </div>
      </div>
    </div>

    <div class="modal" id="addRepoModal">
      <div class="modal-content" style="width:520px;">
        <h3>Register Repository</h3>
        <div style="display:grid; gap:1rem; margin-top:1.5rem;">
          <input type="text" id="repoId" placeholder="Repo ID (e.g. v2)" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
          <input type="text" id="repoOwner" placeholder="GitHub Owner" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
          <input type="text" id="repoName" placeholder="GitHub Repo Name" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
          <input type="text" id="repoBranch" placeholder="Branch (default: main)" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
          <input type="text" id="repoSecret" placeholder="Token Secret Name (default: GITHUB_TOKEN)" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:2rem;">
          <button class="btn" onclick="hideAddRepoModal()">Cancel</button>
          <button class="btn btn-primary" onclick="addRepo()">Register</button>
        </div>
      </div>
    </div>

    <div class="modal" id="editRepoModal">
      <div class="modal-content" style="width:520px;">
        <h3>Edit Repository</h3>
        <input type="hidden" id="editRepoOldId">
        <div style="display:grid; gap:1.25rem;">
          <div>
            <label style="font-size:0.75rem; color:var(--text-2); font-weight:600; text-transform:uppercase; margin-bottom:0.5rem; display:block;">Repo ID</label>
            <input type="text" id="editRepoId" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
          </div>
          <div>
            <label style="font-size:0.75rem; color:var(--text-2); font-weight:600; text-transform:uppercase; margin-bottom:0.5rem; display:block;">GitHub Owner</label>
            <input type="text" id="editRepoOwner" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
          </div>
          <div>
            <label style="font-size:0.75rem; color:var(--text-2); font-weight:600; text-transform:uppercase; margin-bottom:0.5rem; display:block;">GitHub Repo Name</label>
            <input type="text" id="editRepoName" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
          </div>
          <div>
            <label style="font-size:0.75rem; color:var(--text-2); font-weight:600; text-transform:uppercase; margin-bottom:0.5rem; display:block;">Branch</label>
            <input type="text" id="editRepoBranch" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
          </div>
          <div>
            <label style="font-size:0.75rem; color:var(--text-2); font-weight:600; text-transform:uppercase; margin-bottom:0.5rem; display:block;">Capacity (Bytes)</label>
            <input type="number" id="editRepoCapacity" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:2rem;">
          <button class="btn" onclick="hideEditRepoModal()">Cancel</button>
          <button class="btn btn-primary" onclick="updateRepo()">Save Changes</button>
        </div>
      </div>
    </div>

    <div class="modal" id="shareModal">
      <div class="modal-content">
        <h3>Generate Signed Link</h3>
        <input type="hidden" id="shareFilePath">
        <div style="margin-bottom:1.5rem;">
          <label style="display:block; font-size:0.875rem; margin-bottom:0.5rem; font-weight:600;">Link Expiration</label>
          <select id="shareExpiry" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);">
            <option value="3600">1 Hour</option>
            <option value="86400" selected>24 Hours</option>
            <option value="604800">7 Days</option>
            <option value="2592000">30 Days</option>
          </select>
        </div>
        <div id="shareResult" style="display:none; margin-bottom:1.5rem;">
          <label style="display:block; font-size:0.875rem; margin-bottom:0.5rem; font-weight:600;">Signed URL</label>
          <textarea id="shareUrl" readonly style="width:100%; height:100px; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm); font-size:0.75rem; background:var(--bg); resize:none; font-family:monospace;"></textarea>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.75rem;">
          <button class="btn" onclick="hideShareModal()">Close</button>
          <button class="btn btn-primary" id="btn-generate-share" onclick="generateShareLink()">Generate & Copy</button>
        </div>
      </div>
    </div>

    <input type="file" id="fileInput" style="display: none" multiple />
  `
};
