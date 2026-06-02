export const EVENTS = `
  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    // Focus search with /
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      const search = document.getElementById('file-search');
      if (search) search.focus();
    }
    
    // Close modal/lightbox with Escape
    if (e.key === 'Escape') {
      closeLightbox();
      hideAddRepoModal();
      hideEditRepoModal();
      hideAddTokenModal();
      hideMoveModal();
      hideNewFolderModal();
      hideBatchRenameModal();
      hideShareModal();
    }

    // Delete selected with Del
    if (e.key === 'Delete' && selectedFiles.size > 0 && document.activeElement.tagName !== 'INPUT') {
      bulkDelete();
    }

    // Paste upload support
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      // Handled by paste event
    }
  });

  document.addEventListener('paste', async e => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    const files = [];
    for (const item of items) {
      if (item.kind === 'file') {
        files.push(item.getAsFile());
      }
    }
    if (files.length > 0) {
      await handleUpload(files);
    }
  });

  async function handleUpload(files) {
    if (!files.length) return;
    
    showLoader('Uploading...');
    showProgress(true);
    
    for(let i=0; i < files.length; i++) {
      const f = files[i];
      updateProgress((i / files.length) * 100, \`Uploading \${i+1}/\${files.length}: \${f.name}\`);
      
      const fd = new FormData(); 
      fd.append('file', f); 
      fd.append('targetDir', currentPath);
      
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/admin/api/upload');
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const filePercent = (e.loaded / e.total) * 100;
              const overallPercent = ((i + (e.loaded / e.total)) / files.length) * 100;
              updateProgress(overallPercent, \`Uploading \${i+1}/\${files.length}: \${f.name} (\${Math.round(filePercent)}%)\`);
            }
          };
          xhr.onload = () => xhr.status < 400 ? resolve() : reject();
          xhr.onerror = reject;
          xhr.send(fd);
        });
      } catch(e) { console.error('Upload failed for', f.name); }
    }
    
    fi.value = '';
    showProgress(false);
    hideLoader(); 
    loadFiles(currentPath);
    if (typeof loadStats === 'function') loadStats();
  }

  // Drag and drop support
  const dropzone = document.getElementById('dropzone');
  if (dropzone) {
    document.addEventListener('dragover', e => {
      e.preventDefault();
      if (e.dataTransfer.types.includes('Files')) {
        dropzone.style.display = 'flex';
      }
    });
    document.addEventListener('dragleave', e => {
      e.preventDefault();
      if (e.target === dropzone) dropzone.style.display = 'none';
    });
    document.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.style.display = 'none';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleUpload(Array.from(e.dataTransfer.files));
      }
    });
  }

  if (fi) {
    fi.addEventListener('change', () => handleUpload(Array.from(fi.files)));
  }

  // Initial call
  init();
`;
