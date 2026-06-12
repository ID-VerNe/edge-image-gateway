export const SELECTION = `
  function toggleSelection(path) {
    if (selectedFiles.has(path)) selectedFiles.delete(path);
    else selectedFiles.add(path);
    updateBulkToolbar();
  }

  function selectAll() {
    const checkboxes = document.querySelectorAll('.file-checkbox');
    checkboxes.forEach(cb => {
      cb.checked = true;
      const path = cb.getAttribute('onchange').match(/'([^']+)'/)[1];
      selectedFiles.add(path);
    });
    updateBulkToolbar();
  }

  function selectNone() {
    selectedFiles.clear();
    document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = false);
    updateBulkToolbar();
  }

  function selectInvert() {
    const checkboxes = document.querySelectorAll('.file-checkbox');
    checkboxes.forEach(cb => {
      const path = cb.getAttribute('onchange').match(/'([^']+)'/)[1];
      if (selectedFiles.has(path)) {
        selectedFiles.delete(path);
        cb.checked = false;
      } else {
        selectedFiles.add(path);
        cb.checked = true;
      }
    });
    updateBulkToolbar();
  }

  function clearSelection() {
    selectNone();
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
