export const CSS = `
  :root {
    --kami-parchment: #fdfdfb;
    --kami-parchment-dark: #f8f8f5;
    --kami-ink: #1e293b;
    --kami-ink-muted: #64748b;
    --kami-blue: #0969da;
    --kami-border: #d0d7de;
    --kami-shadow: 0 1px 3px rgba(0,0,0,0.05);
    --kami-radius: 6px;
    --github-gray: #f6f8fa;
    --header-bg: #24292f;
    --card-bg: #fff;
    --overlay-bg: rgba(255,255,255,0.7);
    --modal-bg: #fff;
    --body-bg: #fff;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --kami-ink: #c9d1d9;
      --kami-ink-muted: #8b949e;
      --kami-blue: #58a6ff;
      --kami-border: #30363d;
      --github-gray: #161b22;
      --header-bg: #010409;
      --card-bg: #0d1117;
      --overlay-bg: rgba(1,4,9,0.8);
      --modal-bg: #161b22;
      --body-bg: #010409;
    }
  }

  * { box-sizing: border-box; }
  body { 
    margin: 0; 
    font-family: 'Inter', -apple-system, sans-serif; 
    background: var(--body-bg); 
    color: var(--kami-ink);
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    height: 64px;
    border-bottom: 1px solid var(--kami-border);
    background: var(--header-bg);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    flex-shrink: 0;
    z-index: 100;
  }
  .logo { font-size: 1.125rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; cursor: pointer; color: #fff; text-decoration: none; }
  .user-info { font-size: 0.8125rem; color: #c9d1d9; }

  .app-container { display: flex; flex: 1; overflow: hidden; }

  aside {
    width: 280px;
    border-right: 1px solid var(--kami-border);
    background: var(--card-bg);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow-y: hidden;
  }
  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .sidebar-footer {
    border-top: 1px solid var(--kami-border);
    padding: 0.5rem 0;
    background: var(--card-bg);
  }
  .sidebar-header {
    padding: 1.5rem 1rem 0.5rem 1rem;
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--kami-ink);
    display: flex;
    align-items: center; gap: 0.5rem;
  }
  .tree-item {
    padding: 0.375rem 1rem;
    font-size: 0.875rem;
    display: flex;
    align-items: center; gap: 0.5rem;
    cursor: pointer;
    color: var(--kami-ink);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tree-item:hover { background: var(--github-gray); }
  .tree-item.active { background: var(--card-bg); font-weight: 600; color: var(--kami-blue); }
  .tree-item i { font-size: 1rem; color: #636c76; width: 16px; text-align: center; font-style: normal; }
  .tree-nested { padding-left: 1.25rem; }
  .tree-item.folder::before { content: '📁'; font-size: 0.9rem; }
  .tree-item.folder.open::before { content: '📂'; }
  .tree-item.root::before { content: '🏠'; }

  main { flex: 1; display: flex; flex-direction: column; overflow-y: auto; background: var(--body-bg); }
  .toolbar {
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--body-bg);
  }
  .breadcrumbs { display: flex; align-items: center; gap: 0.25rem; font-size: 1.125rem; font-weight: 400; }
  .breadcrumb-item { cursor: pointer; color: var(--kami-blue); }
  .breadcrumb-item:hover { text-decoration: underline; }
  .breadcrumb-item.current { color: var(--kami-ink); font-weight: 600; cursor: default; pointer-events: none; }
  .breadcrumb-sep { color: #57606a; margin: 0 0.125rem; }
  
  .actions { display: flex; gap: 0.5rem; align-items: center; }
  .btn {
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--kami-border);
    background: var(--github-gray);
    color: var(--kami-ink);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .btn:hover { opacity: 0.8; }
  .btn-primary { background: #2da44e; color: #fff; border-color: rgba(27,31,36,0.15); }
  .btn-primary:hover { background: #2c974b; }
  .btn-danger { color: #cf222e; }
  .btn-danger:hover { background: #a40e26; color: #fff; }

  .content-area { padding: 0 1.5rem 2rem 1.5rem; }
  .file-list-card { border: 1px solid var(--kami-border); border-radius: 6px; overflow: hidden; background: var(--card-bg); }
  .file-row {
    display: grid;
    grid-template-columns: 32px 3fr 1fr 1fr 120px;
    align-items: center;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--kami-border);
    font-size: 0.875rem;
  }
  .file-row:last-child { border-bottom: none; }
  .file-row:hover { background: var(--github-gray); }
  .file-row.header { background: var(--github-gray); font-weight: 600; color: var(--kami-ink-muted); }
  .file-icon { color: var(--kami-ink-muted); }
  .file-name { color: var(--kami-ink); cursor: pointer; text-decoration: none; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-name:hover { color: var(--kami-blue); text-decoration: underline; }
  .file-name.file { color: var(--kami-blue); }
  .file-meta { color: var(--kami-ink-muted); }
  
  .file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
  .grid-item { border: 1px solid var(--kami-border); border-radius: 6px; overflow: hidden; display: flex; flex-direction: column; height: 230px; background: var(--card-bg); }
  .folder-grid-item:hover { border-color: var(--kami-blue); }
  .grid-preview { width: 100%; height: 160px; object-fit: contain; background: var(--github-gray); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 3rem; flex-shrink: 0; }
  .grid-info { padding: 0.5rem; border-top: 1px solid var(--kami-border); flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-height: 0; }
  .grid-name { font-size: 0.75rem; font-weight: 500; margin-bottom: 0.4rem; color: var(--kami-blue); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
  .grid-actions { display: flex; gap: 0.5rem; }
  .btn-mini { padding: 1px 4px; min-width: 45px; justify-content: center; font-size: 0.75rem; }

  #toast { position: fixed; bottom: 2rem; right: 2rem; background: #24292f; color: #fff; padding: 0.75rem 1.25rem; border-radius: 6px; font-size: 0.8125rem; display: none; z-index: 1000; }
  .loading-overlay { position: fixed; inset: 0; background: var(--overlay-bg); display: none; flex-direction: column; align-items: center; justify-content: center; z-index: 200; }
  .progress-container { width: 300px; background: #eee; border-radius: 10px; height: 8px; margin-top: 1rem; overflow: hidden; display: none; }
  .progress-bar { height: 100%; background: var(--kami-blue); width: 0%; transition: width 0.2s; }
  .progress-text { font-size: 0.875rem; color: var(--kami-ink-muted); margin-top: 0.5rem; }
  .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 300; }
  .modal-content { background: var(--modal-bg); border-radius: 6px; padding: 1.5rem; width: 400px; border: 1px solid var(--kami-border); }
  #dropzone { position: fixed; inset: 0; background: rgba(9, 105, 218, 0.1); border: 2px dashed var(--kami-blue); z-index: 500; display: none; align-items: center; justify-content: center; pointer-events: none; }

  .search-box { position: relative; margin-left: 1rem; }
  .search-input { padding: 0.25rem 0.5rem 0.25rem 2rem; border-radius: 6px; border: 1px solid var(--kami-border); background: var(--github-gray); color: var(--kami-ink); width: 200px; font-size: 0.875rem; }
  .search-icon { position: absolute; left: 0.5rem; top: 50%; transform: translateY(-50%); color: var(--kami-ink-muted); pointer-events: none; }

  /* Lightbox Styles */
  #lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 1000; display: none; flex-direction: column; }
  .lightbox-header { height: 60px; display: flex; align-items: center; justify-content: space-between; padding: 0 1.5rem; color: #fff; }
  .lightbox-content { flex: 1; display: flex; align-items: center; justify-content: center; padding: 2rem; min-height: 0; }
  .lightbox-img { max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
  .lightbox-sidebar { width: 350px; background: #161b22; border-left: 1px solid #30363d; padding: 1.5rem; color: #c9d1d9; overflow-y: auto; }
  .copy-group { margin-bottom: 1.5rem; }
  .copy-group label { display: block; font-size: 0.75rem; color: #8b949e; margin-bottom: 0.5rem; }
  .copy-group input { width: 100%; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 0.5rem; color: #c9d1d9; font-size: 0.8125rem; font-family: monospace; margin-bottom: 0.25rem; }
  .exif-hint { background: rgba(255,243,191,0.1); border: 1px solid rgba(255,243,191,0.2); color: #e3b341; padding: 0.5rem; border-radius: 6px; font-size: 0.75rem; margin-bottom: 1rem; }
`;
