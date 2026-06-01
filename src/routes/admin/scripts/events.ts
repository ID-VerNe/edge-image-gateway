export const EVENTS = `
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
        fi.files = e.dataTransfer.files;
        fi.dispatchEvent(new Event('change'));
      }
    });
  }

  if (fi) {
    fi.addEventListener('change', async () => {
        const files = Array.from(fi.files);
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
      });
  }

  // Initial call
  init();
`;
