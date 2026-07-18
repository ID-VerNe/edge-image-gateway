export const PROVIDER_ACTIONS = `
  // ============ Provider Management ============

  let providers = [];
  let currentWriteProviderId = null;

  async function loadProviders() {
    try {
      const r = await fetch('/admin/api/providers');
      const data = await r.json();
      providers = data.providers || [];
      currentWriteProviderId = data.currentWriteId || null;
      renderProviders();
    } catch(e) {
      const container = document.getElementById('provider-list');
      if(container) container.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--danger);">Failed to load providers</div>';
    }
  }

  function renderProviders() {
    const container = document.getElementById('provider-list');
    if(!container) return;

    if (!providers.length) {
      container.innerHTML = '<div style="padding:3rem; text-align:center; color:var(--text-2);">No storage providers configured. Click "Add Provider" to get started.</div>';
      return;
    }

    container.innerHTML = providers.map(p => {
      const isWrite = p.id === currentWriteProviderId;
      const usagePercent = Math.min(100, ((p.usedBytes || 0) / (p.capacityLimitBytes || 1)) * 100);
      const progressColor = usagePercent > 90 ? 'var(--danger)' : (usagePercent > 70 ? 'var(--warning)' : 'var(--success)');
      const typeIcon = p.type === 'github' ? '🐙' : (p.type === 's3' ? '☁️' : (p.type === 'googledrive' ? '📁' : '🧠'));

      return \`
        <div class="stat-card" style="position:relative; \${isWrite ? 'border-color: var(--primary);' : ''}">
          \${isWrite ? '<div style="position:absolute; top:0; right:1.5rem; background:var(--primary); color:#fff; font-size:0.65rem; padding:2px 8px; border-radius:0 0 6px 6px; font-weight:700; text-transform:uppercase;">Active Write</div>' : ''}
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:1.25rem;">
            <div>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <span style="font-size:1.5rem;">\${typeIcon}</span>
                <div>
                  <div style="font-size:1.125rem; font-weight:700; letter-spacing:-0.01em;">\${eHtml(p.name)}</div>
                  <div style="font-size:0.8125rem; color:var(--text-2);">\${eHtml(p.id)} • \${eHtml(p.type)}</div>
                </div>
              </div>
            </div>
            <div style="display:flex; gap:0.5rem;">
              \${!isWrite ? \`<button class="btn btn-mini" onclick="setWriteProvider('\${encodeURIComponent(p.id)}')">Set Active</button>\` : ''}
              <button class="btn btn-mini" onclick="showEditProviderModal('\${encodeURIComponent(JSON.stringify(p))}')">Edit</button>
              <button class="btn btn-mini btn-danger" onclick="deleteProvider('\${encodeURIComponent(p.id)}')">Delete</button>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:0.5rem; font-weight:600;">
            <span style="color:var(--text-2);">Usage: \${formatBytes(p.usedBytes || 0)} / \${formatBytes(p.capacityLimitBytes)}</span>
            <span style="color:\${progressColor}">\${usagePercent.toFixed(1)}%</span>
          </div>
          <div class="progress-bg">
            <div class="progress-fill" style="width:\${usagePercent}%; background:\${progressColor}"></div>
          </div>

          <div style="margin-top:1rem; display:flex; align-items:center; gap:0.5rem; font-size:0.75rem; font-weight:600; color:var(--text-2);">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:\${p.status === 'active' ? 'var(--success)' : 'var(--danger)'}; \${p.status === 'active' ? 'box-shadow: 0 0 8px var(--success);' : ''}"></span>
            \${(p.status || 'active').toUpperCase()}
          </div>
        </div>
      \`;
    }).join('');
  }

  function showAddProviderModal() {
    const modal = document.getElementById('addProviderModal');
    if(modal) {
      document.getElementById('providerId').value = '';
      document.getElementById('providerName').value = '';
      document.getElementById('providerType').value = 'github';
      document.getElementById('providerSettings').value = '';
      modal.style.display = 'flex';
      toggleProviderSettingsHint();
    }
  }

  function hideAddProviderModal() {
    const modal = document.getElementById('addProviderModal');
    if(modal) modal.style.display = 'none';
  }

  function toggleProviderSettingsHint() {
    const type = document.getElementById('providerType').value;
    const hint = document.getElementById('providerSettingsHint');
    const examples = {
      github: '{\\n  "owner": "your-org",\\n  "repo": "your-repo",\\n  "branch": "main",\\n  "tokenSecretName": "GITHUB_TOKEN"\\n}',
      s3: '{\\n  "bucket": "my-bucket",\\n  "region": "auto",\\n  "endpoint": "https://...",\\n  "accessKeyId": "AKID...",\\n  "secretAccessKey": "..."\\n}',
      googledrive: '{\\n  "folderId": "..."\\n}',
      memory: '{}'
    };
    if(hint) hint.textContent = 'Example: ' + (examples[type] || '{}');
  }

  async function addProvider() {
    const body = {
      id: document.getElementById('providerId').value,
      name: document.getElementById('providerName').value,
      type: document.getElementById('providerType').value,
      settings: {}
    };
    const settingsStr = document.getElementById('providerSettings').value;
    if (settingsStr) {
      try { body.settings = JSON.parse(settingsStr); } catch(e) { alert('Invalid JSON in settings'); return; }
    }

    if (!body.id || !body.name) { alert('Provider ID and Name are required'); return; }

    showLoader('Creating provider...');
    try {
      const res = await fetch('/admin/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create provider');

      await loadProviders();
      hideAddProviderModal();
      showToast('Provider created: ' + body.name);
    } catch(e) { alert(e.message); }
    hideLoader();
  }

  function showEditProviderModal(raw) {
    let p = raw;
    if (typeof raw === 'string') {
      try { p = JSON.parse(decodeURIComponent(raw)); } catch(e) {}
    }
    const modal = document.getElementById('editProviderModal');
    if(modal) {
      document.getElementById('editProviderId').value = p.id;
      document.getElementById('editProviderName').value = p.name;
      document.getElementById('editProviderType').value = p.type;
      document.getElementById('editProviderStatus').value = p.status || 'active';
      document.getElementById('editProviderCapacity').value = p.capacityLimitBytes || 5368709120;
      document.getElementById('editProviderSettings').value = JSON.stringify(p.settings || {}, null, 2);
      modal.style.display = 'flex';
    }
  }

  function hideEditProviderModal() {
    const modal = document.getElementById('editProviderModal');
    if(modal) modal.style.display = 'none';
  }

  async function updateProvider() {
    const id = document.getElementById('editProviderId').value;
    const body = {
      name: document.getElementById('editProviderName').value,
      type: document.getElementById('editProviderType').value,
      status: document.getElementById('editProviderStatus').value,
      capacityLimitBytes: parseInt(document.getElementById('editProviderCapacity').value),
      settings: {}
    };
    const settingsStr = document.getElementById('editProviderSettings').value;
    if (settingsStr) {
      try { body.settings = JSON.parse(settingsStr); } catch(e) { alert('Invalid JSON in settings'); return; }
    }

    showLoader('Updating provider...');
    try {
      const res = await fetch(\`/admin/api/providers/\${encodeURIComponent(id)}\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');

      await loadProviders();
      hideEditProviderModal();
      showToast('Provider updated');
    } catch(e) { alert(e.message); }
    hideLoader();
  }

  async function setWriteProvider(rawId) {
    let id = rawId;
    try { id = decodeURIComponent(rawId); } catch(e) {}
    showLoader('Switching write target...');
    try {
      const res = await fetch(\`/admin/api/providers/\${encodeURIComponent(id)}/route/write\`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to switch');
      currentWriteProviderId = data.currentWriteId;
      renderProviders();
      showToast('Write target switched to ' + id);
    } catch(e) { alert(e.message); }
    hideLoader();
  }

  async function deleteProvider(rawId) {
    let id = rawId;
    try { id = decodeURIComponent(rawId); } catch(e) {}
    const confirmText = prompt('Type the provider ID "' + id + '" to confirm deletion:');
    if (confirmText !== id) {
      if (confirmText !== null) alert('Confirmation failed. ID mismatch.');
      return;
    }
    showLoader('Deleting provider...');
    try {
      const res = await fetch(\`/admin/api/providers/\${encodeURIComponent(id)}\`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      await loadProviders();
      showToast('Provider deleted');
    } catch(e) { alert(e.message); }
    hideLoader();
  }
`;