export const STATE = `
  let currentPath = '';
  let viewMode = localStorage.getItem('gateway_view_mode') || 'list';
  let repos = [];
  let selectedFiles = new Set();
  const fi = document.getElementById('fileInput');
`;
