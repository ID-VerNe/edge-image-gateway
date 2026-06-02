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

    showLoader('Generating token...');
    try {
      const res = await fetch('/admin/api/stats/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
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
    if(!confirm('Are you sure you want to revoke this token? External tools using it will stop working.')) return;
    showLoader('Revoking token...');
    try {
      const res = await fetch(\`/admin/api/stats/tokens/\${id}\`, { method: 'DELETE' });
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

    let html = '<div class="file-row header"><div>Name</div><div>Created At</div><div>Prefix</div><div>Action</div></div>';
    tokens.forEach(t => {
      html += \`
        <div class="file-row" style="grid-template-columns: 1fr 1fr 1fr 100px;">
          <div style="font-weight:600;">\${t.name}</div>
          <div class="file-meta">\${new Date(t.createdAt).toLocaleString()}</div>
          <div style="font-family:monospace; color:#57606a;">\${t.id.substring(0, 8)}...</div>
          <div>
            <button class="btn btn-mini btn-danger" onclick="deleteToken('\${t.id}')">Revoke</button>
          </div>
        </div>
      \`;
    });
    container.innerHTML = html;
  }
`;
