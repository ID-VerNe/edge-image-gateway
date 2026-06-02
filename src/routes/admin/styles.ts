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
  }

  * { box-sizing: border-box; }
  body { 
    margin: 0; 
    font-family: 'Inter', -apple-system, sans-serif; 
    background: #fff; 
    color: var(--kami-ink);
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    height: 64px;
    border-bottom: 1px solid var(--kami-border);
    background: #24292f;
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
    background: #fff;
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
    background: #fff;
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
  .tree-item.active { background: #fff; font-weight: 600; color: var(--kami-blue); }
  .tree-item i { font-size: 1rem; color: #636c76; width: 16px; text-align: center; font-style: normal; }
  .tree-nested { padding-left: 1.25rem; }
  .tree-item.folder::before { content: '📁'; font-size: 0.9rem; }
  .tree-item.folder.open::before { content: '📂'; }
  .tree-item.root::before { content: '🏠'; }

  main { flex: 1; display: flex; flex-direction: column; overflow-y: auto; background: #fff; }
  .toolbar {
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fff;
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
    color: #24292f;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .btn:hover { background: #ebedf0; }
  .btn-primary { background: #2da44e; color: #fff; border-color: rgba(27,31,36,0.15); }
  .btn-primary:hover { background: #2c974b; }
  .btn-danger { color: #cf222e; }
  .btn-danger:hover { background: #a40e26; color: #fff; }

  .content-area { padding: 0 1.5rem 2rem 1.5rem; }
  .file-list-card { border: 1px solid var(--kami-border); border-radius: 6px; overflow: hidden; }
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
  .file-row.header { background: var(--github-gray); font-weight: 600; color: #57606a; }
  .file-icon { color: #57606a; }
  .file-name { color: var(--kami-ink); cursor: pointer; text-decoration: none; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-name:hover { color: var(--kami-blue); text-decoration: underline; }
  .file-name.file { color: var(--kami-blue); }
  .file-meta { color: #57606a; }
  
  .file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
  .grid-item { border: 1px solid var(--kami-border); border-radius: 6px; overflow: hidden; display: flex; flex-direction: column; height: 215px; background: #fff; }
  .folder-grid-item:hover { border-color: var(--kami-blue); }
  .grid-preview { width: 100%; height: 160px; object-fit: contain; background: var(--github-gray); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 3rem; flex-shrink: 0; }
  .grid-info { padding: 0.5rem; border-top: 1px solid var(--kami-border); flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-height: 0; }
  .grid-name { font-size: 0.75rem; font-weight: 500; margin-bottom: 0.4rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--kami-blue); }
  .grid-actions { display: flex; gap: 0.5rem; }
  .btn-mini { padding: 1px 4px; min-width: 45px; justify-content: center; font-size: 0.75rem; }

  #toast { position: fixed; bottom: 2rem; right: 2rem; background: #24292f; color: #fff; padding: 0.75rem 1.25rem; border-radius: 6px; font-size: 0.8125rem; display: none; z-index: 1000; }
  .loading-overlay { position: fixed; inset: 0; background: rgba(255,255,255,0.7); display: none; flex-direction: column; align-items: center; justify-content: center; z-index: 200; }
  .progress-container { width: 300px; background: #eee; border-radius: 10px; height: 8px; margin-top: 1rem; overflow: hidden; display: none; }
  .progress-bar { height: 100%; background: var(--kami-blue); width: 0%; transition: width 0.2s; }
  .progress-text { font-size: 0.875rem; color: #57606a; margin-top: 0.5rem; }
  .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 300; }
  .modal-content { background: #fff; border-radius: 6px; padding: 1.5rem; width: 400px; }
  #dropzone { position: fixed; inset: 0; background: rgba(9, 105, 218, 0.1); border: 2px dashed var(--kami-blue); z-index: 500; display: none; align-items: center; justify-content: center; pointer-events: none; }
`;
