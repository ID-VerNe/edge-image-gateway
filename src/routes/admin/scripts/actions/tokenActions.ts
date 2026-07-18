export const TOKEN_ACTIONS = `
  function showAddTokenModal() {
    const modal = document.getElementById('addTokenModal');
    if(modal) {
      document.getElementById('tokenName').value = '';
      document.getElementById('tokenDisplay').style.display = 'none';
      document.getElementById('btnGenerateToken').style.display = 'block';
      document.getElementById('btnAddTokenCancel').innerText = 'Cancel';
      modal.style.display = 'flex';
    }
  }

  function hideAddTokenModal() {
    const modal = document.getElementById('addTokenModal');
    if(modal) modal.style.display = 'none';
  }

  async function generateToken() {
    const name = document.getElementById('tokenName').value;
    if(!name) return alert('Please enter a token name');

    const scopes = [];
    if(document.getElementById('scopeRead').checked) scopes.push('read');
    if(document.getElementById('scopeWrite').checked) scopes.push('write');
    if(document.getElementById('scopeDelete').checked) scopes.push('delete');

    const pathPrefix = document.getElementById('tokenPathPrefix').value.trim();
    const expiresInDays = document.getElementById('tokenExpires').value;

    showLoader('Generating token...');
    try {
      const res = await fetch('/admin/api/stats/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scopes, pathPrefix, expiresInDays })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || 'Failed to generate token');

      document.getElementById('tokenValue').innerText = data.token;
      document.getElementById('tokenDisplay').style.display = 'block';
      document.getElementById('btnGenerateToken').style.display = 'none';
      document.getElementById('btnAddTokenCancel').innerText = 'Close';
      
      loadTokens();
    } catch(e) { alert(e.message); }
    hideLoader();
  }

  async function deleteToken(id) {
    try { id = decodeURIComponent(id); } catch(e) {}
    if(!confirm('Are you sure you want to revoke this token? External tools using it will stop working.')) return;
    showLoader('Revoking token...');
    try {
      const res = await fetch(\`/admin/api/stats/tokens/\${encodeURIComponent(id)}\`, { method: 'DELETE' });
      if(!res.ok) throw new Error('Failed to revoke token');
      loadTokens();
      showToast('Token revoked');
    } catch(e) { alert(e.message); }
    hideLoader();
  }

  async function loadTokens() {
    try {
      const res = await fetch('/admin/api/stats/tokens');
      const tokens = await res.json();
      renderTokenList(tokens);
    } catch(e) {}
  }

  function renderTokenList(tokens) {
    const container = document.getElementById('token-list');
    if(!container) return;

    if(!tokens.length) {
      container.innerHTML = '<div style="padding:2rem; text-align:center; color:#57606a;">No active tokens</div>';
      return;
    }

    let html = '<div class="file-row header" style="grid-template-columns: 1.5fr 1.5fr 1fr 80px;"><div>Token Detail</div><div>Status</div><div>ID Prefix</div><div>Action</div></div>';
    tokens.forEach(t => {
      const scopesBadge = (t.permissions || ['read', 'write', 'delete']).map(s => \`<span style="background:#e1f0fa;color:#0969da;padding:2px 4px;border-radius:4px;font-size:0.7rem;margin-right:2px;">\${eHtml(s)}</span>\`).join('');
      const prefixText = t.pathPrefix ? \`<div style="color:#57606a;font-size:0.75rem;margin-top:2px;">Limit: <code>\${eHtml(t.pathPrefix)}</code></div>\` : '';
      const expiresText = t.expiresAt ? \`<div style="font-size:0.75rem;color:\${new Date(t.expiresAt).getTime() < Date.now() ? 'red' : '#57606a'}">Exp: \${new Date(t.expiresAt).toLocaleString()}</div>\` : '';
      const lastUsedText = t.lastUsedAt ? \`<div style="font-size:0.75rem;color:#57606a">Used: \${new Date(t.lastUsedAt).toLocaleString()}</div>\` : '';
      const eid = encodeURIComponent(t.id);

      html += \`
        <div class="file-row" style="grid-template-columns: 1.5fr 1.5fr 1fr 80px;">
          <div>
            <div style="font-weight:600; margin-bottom:0.25rem;">\${eHtml(t.name)}</div>
            <div>\${scopesBadge}</div>
            \${prefixText}
          </div>
          <div>
            <div class="file-meta">Created: \${new Date(t.createdAt).toLocaleString()}</div>
            \${expiresText}
            \${lastUsedText}
          </div>
          <div style="font-family:monospace; color:#57606a;">\${eHtml(t.id.substring(0, 8))}...</div>
          <div>
            <button class="btn btn-mini btn-danger" onclick="deleteToken('\${eid}')">Revoke</button>
          </div>
        </div>
      \`;
    });
    container.innerHTML = html;
  }
`;
