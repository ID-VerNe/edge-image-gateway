export const PARTIALS = {
  header: (userEmail: string) => `
    <header>
      <div class="logo">Edge Image Gateway</div>
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
        <div class="tree-item" id="nav-trash" onclick="switchView('trash')">🗑️ Recycle Bin</div>
        <div class="tree-item" id="nav-audit" onclick="switchView('audit')">📜 Audit Logs</div>
        <div class="tree-item" id="nav-tokens" onclick="switchView('tokens')">🔑 API Tokens</div>
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
          <button class="btn" onclick="showBatchRenameModal()">Batch Rename</button>
          <button class="btn" onclick="clearSelection()">Cancel</button>
        </div>
      </div>
      <div class="toolbar">
        <div style="display:flex; align-items:center;">
          <div class="breadcrumbs" id="breadcrumbs"></div>
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input type="text" class="search-input" id="file-search" placeholder="Search files ( / )" oninput="filterFiles(this.value)">
          </div>
        </div>
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
  mainTrash: `
    <main id="main-trash" style="display: none;">
      <div class="toolbar">
        <div class="breadcrumbs"><span class="breadcrumb-item current">Recycle Bin</span></div>
        <div class="actions">
          <button class="btn btn-danger" onclick="emptyTrash()">Empty Trash</button>
          <button class="btn" onclick="loadTrash()">Refresh</button>
        </div>
      </div>
      <div class="content-area">
         <p style="font-size:0.875rem; color:#57606a; margin-bottom:1rem;">Deleted items are kept for 30 days before permanent removal.</p>
         <div id="trash-container" class="file-list-card"></div>
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
  mainTokens: `
    <main id="main-tokens" style="display: none;">
      <div class="toolbar">
        <div class="breadcrumbs"><span class="breadcrumb-item current">API Tokens (for PicGo / External)</span></div>
        <div class="actions">
          <button class="btn btn-primary" onclick="showAddTokenModal()">Generate New Token</button>
        </div>
      </div>
      <div class="content-area">
         <p style="font-size:0.875rem; color:#57606a; margin-bottom:2rem;">Use these tokens to authenticate external tools like PicGo. <br>Endpoint: <code>/admin/api/upload</code> | Header: <code>Authorization: Bearer &lt;token&gt;</code></p>
         <div id="token-list" class="file-list-card"></div>
      </div>
    </main>
  `,
  mainAudit: `
    <main id="main-audit" style="display: none;">
      <div class="toolbar">
        <div class="breadcrumbs"><span class="breadcrumb-item current">Operational Audit Logs</span></div>
        <div class="actions">
          <button class="btn btn-primary" onclick="loadAuditLogs()">Refresh</button>
        </div>
      </div>
      <div class="content-area">
         <p style="font-size:0.875rem; color:#57606a; margin-bottom:1rem;">Retaining activity logs for 90 days. Showing last 50 events.</p>
         <div class="file-list-card" style="padding:0; overflow:hidden;">
            <table style="width:100%; border-collapse:collapse; font-size:0.875rem;">
              <thead style="background:var(--github-gray); border-bottom:1px solid var(--kami-border);">
                <tr>
                  <th style="padding:0.75rem; text-align:left;">Time</th>
                  <th style="padding:0.75rem; text-align:left;">User</th>
                  <th style="padding:0.75rem; text-align:left;">Action</th>
                  <th style="padding:0.75rem; text-align:left;">IP</th>
                  <th style="padding:0.75rem; text-align:left;">Details</th>
                </tr>
              </thead>
              <tbody id="audit-log-list">
                <tr><td colspan="5" style="padding:2rem; text-align:center; color:#57606a;">Loading logs...</td></tr>
              </tbody>
            </table>
         </div>
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

    <div id="lightbox" onclick="closeLightbox()">
      <div class="lightbox-header">
        <div id="lightbox-filename" style="font-weight:600;">image.jpg</div>
        <button class="btn" style="background:transparent; border:none; color:#fff; font-size:1.5rem;" onclick="closeLightbox()">&times;</button>
      </div>
      <div style="display:flex; flex:1; min-height:0;">
        <div class="lightbox-content">
          <img id="lightbox-img" class="lightbox-img" src="" onclick="event.stopPropagation()">
        </div>
        <div class="lightbox-sidebar" onclick="event.stopPropagation()">
          <div class="exif-hint">✨ <b>Privacy Guard Active</b>: Metadata and EXIF data have been automatically stripped from this image.</div>
          
          <div class="copy-group">
            <label>Markdown</label>
            <input type="text" id="copy-markdown" readonly onclick="this.select(); document.execCommand('copy'); toast('Copied Markdown')">
          </div>
          <div class="copy-group">
            <label>Direct Link</label>
            <input type="text" id="copy-raw" readonly onclick="this.select(); document.execCommand('copy'); toast('Copied URL')">
          </div>
          <div class="copy-group">
            <label>HTML</label>
            <input type="text" id="copy-html" readonly onclick="this.select(); document.execCommand('copy'); toast('Copied HTML')">
          </div>
          <div class="copy-group">
            <label>BBCode</label>
            <input type="text" id="copy-bbcode" readonly onclick="this.select(); document.execCommand('copy'); toast('Copied BBCode')">
          </div>
          
          <hr style="border:0; border-top:1px solid #30363d; margin:1.5rem 0;">
          
          <div class="copy-group">
            <label>Signed URL (24h)</label>
            <div style="display:flex; gap:0.5rem;">
              <input type="text" id="copy-signed" readonly style="flex:1;">
              <button class="btn btn-mini" onclick="generateAndCopySigned()">Copy</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="modal" id="batchRenameModal">
      <div class="modal-content">
        <h3 style="margin-top:0">Batch Rename</h3>
        <p style="font-size:0.875rem; color:#57606a;">Replace text in selected filenames.</p>
        <div style="display:grid; gap:0.5rem; margin-bottom:1rem;">
          <input type="text" id="renameSearch" placeholder="Search for..." style="width:100%; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px;">
          <input type="text" id="renameReplace" placeholder="Replace with..." style="width:100%; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px;">
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <button class="btn" onclick="hideBatchRenameModal()">Cancel</button>
          <button class="btn btn-primary" onclick="applyBatchRename()">Rename All</button>
        </div>
      </div>
    </div>

    <div class="modal" id="addTokenModal">
      <div class="modal-content">
        <h3 style="margin-top:0">Generate API Token</h3>
        <input type="text" id="tokenName" placeholder="Token name (e.g. PicGo Laptop)" style="width:100%; padding:0.5rem; margin-bottom:1rem; border:1px solid var(--kami-border); border-radius:6px;">
        <div id="tokenDisplay" style="display:none; margin-bottom:1rem; padding:1rem; background:#fffbdd; border:1px solid #d0d7de; border-radius:6px; word-break:break-all; font-family:monospace; font-size:0.875rem;">
          <div style="font-weight:600; margin-bottom:0.5rem;">Copy this token now. You won't see it again!</div>
          <div id="tokenValue" style="color:var(--kami-blue); font-weight:600;"></div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <button class="btn" id="btnAddTokenCancel" onclick="hideAddTokenModal()">Cancel</button>
          <button class="btn btn-primary" id="btnGenerateToken" onclick="generateToken()">Generate</button>
        </div>
      </div>
    </div>

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

    <div class="modal" id="editRepoModal">
      <div class="modal-content" style="width:500px;">
        <h3 style="margin-top:0">Edit Repository</h3>
        <input type="hidden" id="editRepoOldId">
        <div style="display:grid; gap:1rem;">
          <div>
            <label style="font-size:0.75rem; color:#57606a;">Repo ID</label>
            <input type="text" id="editRepoId" style="width:100%; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px;">
          </div>
          <div>
            <label style="font-size:0.75rem; color:#57606a;">GitHub Owner</label>
            <input type="text" id="editRepoOwner" style="width:100%; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px;">
          </div>
          <div>
            <label style="font-size:0.75rem; color:#57606a;">GitHub Repo Name</label>
            <input type="text" id="editRepoName" style="width:100%; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px;">
          </div>
          <div>
            <label style="font-size:0.75rem; color:#57606a;">Branch</label>
            <input type="text" id="editRepoBranch" style="width:100%; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px;">
          </div>
          <div>
            <label style="font-size:0.75rem; color:#57606a;">Capacity (Bytes)</label>
            <input type="number" id="editRepoCapacity" style="width:100%; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px;">
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1.5rem;">
          <button class="btn" onclick="hideEditRepoModal()">Cancel</button>
          <button class="btn btn-primary" onclick="updateRepo()">Save Changes</button>
        </div>
      </div>
    </div>

    <div class="modal" id="shareModal">
      <div class="modal-content">
        <h3 style="margin-top:0">Generate Signed Link</h3>
        <input type="hidden" id="shareFilePath">
        <div style="margin-bottom:1rem;">
          <label style="display:block; font-size:0.875rem; margin-bottom:0.25rem;">Expiration</label>
          <select id="shareExpiry" style="width:100%; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px;">
            <option value="3600">1 Hour</option>
            <option value="86400" selected>24 Hours</option>
            <option value="604800">7 Days</option>
            <option value="2592000">30 Days</option>
          </select>
        </div>
        <div id="shareResult" style="display:none; margin-bottom:1rem;">
          <label style="display:block; font-size:0.875rem; margin-bottom:0.25rem;">Signed URL</label>
          <textarea id="shareUrl" readonly style="width:100%; height:80px; padding:0.5rem; border:1px solid var(--kami-border); border-radius:6px; font-size:0.75rem; background:var(--github-gray); resize:none;"></textarea>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <button class="btn" onclick="hideShareModal()">Close</button>
          <button class="btn btn-primary" id="btn-generate-share" onclick="generateShareLink()">Generate & Copy</button>
        </div>
      </div>
    </div>

    <input type="file" id="fileInput" style="display: none" multiple />
  `
};
