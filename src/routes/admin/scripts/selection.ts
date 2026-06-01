export const SELECTION = `
  function toggleSelection(path) {
    if (selectedFiles.has(path)) selectedFiles.delete(path);
    else selectedFiles.add(path);
    updateBulkToolbar();
  }

  function clearSelection() {
    selectedFiles.clear();
    document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = false);
    updateBulkToolbar();
  }

  function updateBulkToolbar() {
    const tb = document.getElementById('bulk-toolbar');
    if (!tb) return;
    if (selectedFiles.size > 0) {
      tb.style.display = 'flex';
      const count = document.getElementById('selected-count');
      if(count) count.innerText = \`\${selectedFiles.size} items selected\`;
    } else {
      tb.style.display = 'none';
    }
  }
`;
