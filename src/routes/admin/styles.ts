export const CSS = `
  :root {
    /* Design Tokens */
    --bg: #F8FAFC;
    --surface: #FFFFFF;
    --border: #E2E8F0;
    --text-1: #0F172A;
    --text-2: #64748B;
    --primary: #4F46E5;
    --primary-h: #4338CA;
    --danger: #DC2626;
    --danger-h: #B91C1C;
    --success: #16A34A;
    --warning: #F59E0B;
    --radius: 10px;
    --radius-sm: 6px;
    --shadow-sm: 0 1px 2px rgba(0,0,0,.04);
    --shadow-md: 0 4px 12px rgba(15,23,42,.08);
    --sidebar-width: 240px;
    --header-height: 64px;
    
    /* Legacy Mapping */
    --kami-ink: var(--text-1);
    --kami-ink-muted: var(--text-2);
    --kami-blue: var(--primary);
    --kami-border: var(--border);
    --github-gray: #F1F5F9;
    --header-bg: #0F172A;
    --card-bg: var(--surface);
    --overlay-bg: rgba(15, 23, 42, 0.6);
    --modal-bg: var(--surface);
    --body-bg: var(--bg);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0B0E14;
      --surface: #11141A;
      --border: #1F2937;
      --text-1: #F8FAFC;
      --text-2: #94A3B8;
      --primary: #6366F1;
      --primary-h: #818CF8;
      --github-gray: #1A1F26;
    }
  }

  * { box-sizing: border-box; }
  body { 
    margin: 0; 
    font-family: 'Inter', -apple-system, system-ui, sans-serif; 
    background: var(--bg); 
    color: var(--text-1);
    height: 100vh;
    display: flex;
    flex-direction: column;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }

  header {
    height: var(--header-height);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    flex-shrink: 0;
    z-index: 100;
  }
  .logo { 
    font-size: 1.125rem; 
    font-weight: 700; 
    letter-spacing: -0.025em;
    color: var(--text-1);
    cursor: pointer;
  }
  .user-info { 
    font-size: 0.8125rem; 
    color: var(--text-2);
    background: var(--bg);
    padding: 0.375rem 0.75rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }

  .app-container { display: flex; flex: 1; overflow: hidden; }

  aside {
    width: var(--sidebar-width);
    border-right: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 0.75rem;
  }
  .sidebar-header {
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-2);
    margin-bottom: 0.5rem;
  }
  .nav-group { margin-bottom: 1.5rem; }
  
  .tree-item {
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    display: flex;
    align-items: center; gap: 0.75rem;
    cursor: pointer;
    color: var(--text-2);
    border-radius: var(--radius-sm);
    transition: all 0.2s;
    margin-bottom: 2px;
  }
  .tree-item:hover { background: var(--bg); color: var(--text-1); }
  .tree-item.active { 
    background: #EEF2FF; 
    color: var(--primary); 
    font-weight: 600;
    border-left: 3px solid var(--primary);
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  @media (prefers-color-scheme: dark) {
    .tree-item.active { background: rgba(99, 102, 241, 0.1); }
  }

  .sidebar-footer {
    border-top: 1px solid var(--border);
    padding: 1rem;
    background: var(--surface);
    flex-shrink: 0;
  }

  main { flex: 1; display: flex; flex-direction: column; overflow-y: auto; background: var(--bg); }
  
  .toolbar {
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg);
    position: sticky;
    top: 0;
    z-index: 50;
    min-height: 72px;
  }
  .breadcrumbs { display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; flex: 1; }
  .breadcrumb-item { color: var(--text-2); cursor: pointer; transition: color 0.2s; }
  .breadcrumb-item:hover { color: var(--primary); }
  .breadcrumb-item.current { color: var(--text-1); font-weight: 600; cursor: default; }
  .breadcrumb-sep { color: var(--border); }
  
  .search-box { position: relative; margin: 0 1.5rem; }
  .search-input { 
    padding: 0.5rem 0.75rem 0.5rem 2.25rem; 
    border-radius: var(--radius-sm); 
    border: 1px solid var(--border); 
    background: var(--surface); 
    color: var(--text-1); 
    width: 240px; 
    font-size: 0.875rem;
    transition: all 0.2s;
  }
  .search-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
  .search-icon { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-2); font-size: 0.875rem; display: flex; }

  .actions { display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0; }
  .btn {
    padding: 0.5rem 1rem;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-1);
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s;
    box-shadow: var(--shadow-sm);
    white-space: nowrap;
  }
  .btn:hover { background: var(--bg); border-color: var(--text-2); }
  .btn:active { transform: scale(0.96); }
  
  .btn-primary { background: var(--primary); color: #fff; border-color: var(--primary); }
  .btn-primary:hover { background: var(--primary-h); border-color: var(--primary-h); }
  
  .btn-danger { color: var(--danger); border-color: var(--danger); background: transparent; }
  .btn-danger:hover { background: #FEF2F2; }

  .btn-mini { padding: 0.25rem 0.5rem; font-size: 0.75rem; font-weight: 500; border-radius: 4px; }

  .content-area { padding: 0 1.5rem 2.5rem 1.5rem; }
  
  .file-list-card { 
    border: 1px solid var(--border); 
    border-radius: var(--radius); 
    background: var(--surface); 
    box-shadow: var(--shadow-sm);
    width: 100%;
  }
  
  .file-row {
    display: grid;
    grid-template-columns: 48px 48px 1fr 120px 100px;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.875rem;
  }
  .file-row:last-child { border-bottom: none; }
  .file-row:hover { background: var(--bg); }
  .file-row.header { 
    background: var(--bg); 
    font-weight: 600; 
    color: var(--text-2); 
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
  }

  .file-name { color: var(--text-1); font-weight: 500; cursor: pointer; text-decoration: none; }
  .file-name:hover { color: var(--primary); text-decoration: underline; }

  .file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.25rem; }
  .grid-item { 
    border: 1px solid var(--border); 
    border-radius: var(--radius); 
    overflow: hidden; 
    display: flex; 
    flex-direction: column; 
    background: var(--surface); 
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: var(--shadow-sm);
    position: relative;
  }
  .grid-item:hover { transform: translateY(-4px); box-shadow: var(--shadow-md); border-color: var(--primary); }
  
  .grid-preview { 
    width: 100%; 
    aspect-ratio: 1/1; 
    object-fit: cover; 
    background: var(--bg); 
    cursor: pointer; 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    font-size: 2.5rem; 
    flex-shrink: 0; 
    transition: transform 0.5s;
  }
  .grid-item:hover .grid-preview { transform: scale(1.05); }
  
  .grid-info { padding: 1rem; flex: 1; display: flex; flex-direction: column; gap: 0.75rem; min-height: 0; }
  .grid-name { 
    font-size: 0.875rem; 
    font-weight: 600; 
    color: var(--text-1); 
    white-space: nowrap; 
    overflow: hidden; 
    text-overflow: ellipsis; 
    display: block; 
  }
  
  .grid-actions { display: flex; gap: 0.5rem; opacity: 0; transition: opacity 0.2s; }
  .grid-item:hover .grid-actions { opacity: 1; }

  .stat-card {
    padding: 1.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
  }
  .stat-label { font-size: 0.75rem; font-weight: 600; color: var(--text-2); text-transform: uppercase; margin-bottom: 0.5rem; }
  .stat-value { font-size: 1.875rem; font-weight: 800; color: var(--text-1); letter-spacing: -0.025em; }

  table { width: 100%; border-collapse: collapse; }
  th { background: var(--bg); padding: 0.75rem 1rem; text-align: left; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--text-2); border-bottom: 1px solid var(--border); }
  td { padding: 1rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:nth-child(even) { background: rgba(241, 245, 249, 0.4); }

  .badge { padding: 0.25rem 0.625rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
  .badge-success { background: #DCFCE7; color: #166534; }
  .badge-primary { background: #DBEAFE; color: #1E40AF; }
  .badge-danger { background: #FEE2E2; color: #991B1B; }
  .badge-warning { background: #FEF3C7; color: #92400E; }
  
  .progress-bg { height: 0.5rem; width: 100%; background: var(--bg); border-radius: 9999px; overflow: hidden; border: 1px solid var(--border); }
  .progress-fill { height: 100%; border-radius: 9999px; transition: width 0.3s; }

  .modal { position: fixed; inset: 0; background: var(--overlay-bg); display: none; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
  .modal-content { background: var(--surface); border-radius: var(--radius); padding: 2rem; width: 440px; border: 1px solid var(--border); box-shadow: var(--shadow-md); position: relative; }

  #toast { position: fixed; bottom: 2rem; right: 2rem; background: var(--text-1); color: var(--surface); padding: 0.75rem 1.25rem; border-radius: var(--radius-sm); font-size: 0.875rem; font-weight: 500; display: none; z-index: 2000; box-shadow: var(--shadow-md); }
  
  .loading-overlay { position: fixed; inset: 0; background: var(--overlay-bg); display: none; flex-direction: column; align-items: center; justify-content: center; z-index: 1500; backdrop-filter: blur(4px); }
  #dropzone { position: fixed; inset: 0; background: rgba(79, 70, 229, 0.1); border: 3px dashed var(--primary); z-index: 1600; display: none; align-items: center; justify-content: center; pointer-events: none; }
  #dropzone h2 { background: var(--surface); padding: 1.5rem 3rem; border-radius: var(--radius); box-shadow: var(--shadow-md); border: 1px solid var(--primary); color: var(--primary); }

  #lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 3000; display: none; flex-direction: column; }
  .lightbox-header { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 1.5rem; color: #fff; flex-shrink: 0; }
  .lightbox-content { flex: 1; display: flex; align-items: center; justify-content: center; padding: 2rem; min-height: 0; }
  .lightbox-img { max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 0 40px rgba(0,0,0,0.5); border-radius: 4px; }
  .lightbox-sidebar { width: 360px; background: #0F172A; border-left: 1px solid #1E293B; padding: 2rem; color: #F8FAFC; overflow-y: auto; flex-shrink: 0; }
  
  .copy-group { margin-bottom: 1.5rem; }
  .copy-group label { display: block; font-size: 0.75rem; color: #94A3B8; margin-bottom: 0.5rem; font-weight: 600; text-transform: uppercase; }
  .copy-group input { width: 100%; background: #1E293B; border: 1px solid #334155; border-radius: var(--radius-sm); padding: 0.625rem; color: #F8FAFC; font-size: 0.8125rem; font-family: monospace; transition: border-color 0.2s; }
  .copy-group input:focus { outline: none; border-color: var(--primary); }
  .exif-hint { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); color: #F59E0B; padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.75rem; margin-bottom: 1.5rem; }

  .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .flex { display: flex; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .gap-2 { gap: 0.5rem; }
  .mt-4 { margin-top: 1rem; }
`;
