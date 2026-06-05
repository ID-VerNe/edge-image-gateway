export const CSS = `
  :root {
    /* Design Tokens - Vercel/Linear Aesthetic */
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
    
    /* Legacy / Compatibility Mapping */
    --kami-ink: var(--text-1);
    --kami-ink-muted: var(--text-2);
    --kami-blue: var(--primary);
    --kami-border: var(--border);
    --github-gray: #F1F5F9;
    --header-bg: #0F172A;
    --card-bg: var(--surface);
    --overlay-bg: rgba(15, 23, 42, 0.4);
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
      --header-bg: #000000;
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
  }

  /* Header Styles */
  header {
    height: var(--header-height);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-1);
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

  /* Sidebar Styles */
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
    padding: 0.75rem;
  }

  /* Main Area Styles */
  main { flex: 1; display: flex; flex-direction: column; overflow-y: auto; background: var(--bg); }
  
  .toolbar {
    padding: 1.25rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg);
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .breadcrumbs { display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; }
  .breadcrumb-item { color: var(--text-2); cursor: pointer; transition: color 0.2s; }
  .breadcrumb-item:hover { color: var(--primary); }
  .breadcrumb-item.current { color: var(--text-1); font-weight: 600; cursor: default; }
  .breadcrumb-sep { color: var(--border); }
  
  .search-box { position: relative; }
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
  .search-icon { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-2); font-size: 0.875rem; }

  /* Button Styles */
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
  }
  .btn:hover { background: var(--bg); border-color: var(--text-2); }
  .btn:active { transform: scale(0.96); }
  
  .btn-primary { 
    background: var(--primary); 
    color: #fff; 
    border-color: var(--primary); 
  }
  .btn-primary:hover { background: var(--primary-h); border-color: var(--primary-h); }
  
  .btn-danger { color: var(--danger); border-color: var(--danger); background: transparent; }
  .btn-danger:hover { background: #FEF2F2; }
  @media (prefers-color-scheme: dark) {
    .btn-danger:hover { background: rgba(220, 38, 38, 0.1); }
  }

  .btn-mini { padding: 0.25rem 0.5rem; font-size: 0.75rem; font-weight: 500; border-radius: 4px; }

  /* Content Area */
  .content-area { padding: 0 1.5rem 2.5rem 1.5rem; }
  
  /* File List / Grid View */
  .file-list-card { 
    border: 1px solid var(--border); 
    border-radius: var(--radius); 
    overflow: hidden; 
    background: var(--surface); 
    box-shadow: var(--shadow-sm);
  }
  
  .file-row {
    display: grid;
    grid-template-columns: 48px 1fr 120px 100px 140px;
    align-items: center;
    padding: 0.875rem 1.25rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.875rem;
    transition: background 0.2s;
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

  /* Grid View */
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
    group;
  }
  .grid-item:hover { 
    transform: translateY(-4px); 
    box-shadow: var(--shadow-md); 
    border-color: var(--primary);
  }
  
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
  
  .grid-info { padding: 1rem; flex: 1; display: flex; flex-direction: column; gap: 0.75rem; }
  .grid-name { 
    font-size: 0.875rem; 
    font-weight: 600; 
    color: var(--text-1); 
    white-space: nowrap; 
    overflow: hidden; 
    text-overflow: ellipsis; 
    display: block; 
  }
  
  .grid-actions { 
    display: flex; 
    gap: 0.5rem; 
    opacity: 0; 
    transition: opacity 0.2s; 
  }
  .grid-item:hover .grid-actions { opacity: 1; }

  /* Dashboard / Stats */
  #stats-dashboard { margin-bottom: 2rem; }
  .stat-card {
    padding: 1.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
  }
  .stat-label { font-size: 0.75rem; font-weight: 600; color: var(--text-2); text-transform: uppercase; margin-bottom: 0.5rem; }
  .stat-value { font-size: 1.875rem; font-weight: 800; color: var(--text-1); letter-spacing: -0.025em; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; }
  th { 
    background: var(--bg); 
    padding: 0.75rem 1rem; 
    text-align: left; 
    font-size: 0.75rem; 
    font-weight: 600; 
    text-transform: uppercase; 
    color: var(--text-2);
    border-bottom: 1px solid var(--border);
  }
  td { padding: 1rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:hover { background: var(--bg); }
  tr:nth-child(even) { background: rgba(241, 245, 249, 0.4); }

  /* Badges */
  .badge {
    padding: 0.25rem 0.625rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .badge-success { background: #DCFCE7; color: #166534; }
  .badge-primary { background: #DBEAFE; color: #1E40AF; }
  .badge-danger { background: #FEE2E2; color: #991B1B; }
  .badge-warning { background: #FEF3C7; color: #92400E; }
  
  /* Progress Bars */
  .progress-bg { height: 0.5rem; width: 100%; background: var(--bg); border-radius: 9999px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 9999px; transition: width 0.3s; }

  /* Modals */
  .modal { position: fixed; inset: 0; background: var(--overlay-bg); display: none; align-items: center; justify-content: center; z-index: 300; backdrop-filter: blur(4px); }
  .modal-content { 
    background: var(--surface); 
    border-radius: var(--radius); 
    padding: 2rem; 
    width: 440px; 
    border: 1px solid var(--border); 
    box-shadow: var(--shadow-md);
  }

  /* Toast */
  #toast { 
    position: fixed; 
    bottom: 2rem; 
    right: 2rem; 
    background: var(--text-1); 
    color: var(--surface); 
    padding: 0.75rem 1.25rem; 
    border-radius: var(--radius-sm); 
    font-size: 0.875rem; 
    font-weight: 500;
    display: none; 
    z-index: 1000; 
    box-shadow: var(--shadow-md);
  }

  /* Lightbox */
  #lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 1000; display: none; flex-direction: column; }
  .lightbox-header { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 1.5rem; color: #fff; }
  .lightbox-sidebar { width: 360px; background: #0F172A; border-left: 1px solid #1E293B; padding: 2rem; color: #F8FAFC; overflow-y: auto; }
  
  /* Utilities */
  .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .flex { display: flex; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .gap-2 { gap: 0.5rem; }
  .mt-4 { margin-top: 1rem; }
`;
