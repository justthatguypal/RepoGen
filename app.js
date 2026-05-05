// === State ===
const state = {
  token: '',
  user: null,
  files: [],          // { path, content (base64), size }
  visibility: 'public',
  repoName: '',
  repoDesc: '',
  initReadme: false
};

// === DOM Elements ===
const $ = id => document.getElementById(id);
const githubToken = $('githubToken');
const connectBtn = $('connectBtn');
const connectionStatus = $('connectionStatus');
const authSection = $('authSection');
const repoSection = $('repoSection');
const filesSection = $('filesSection');
const releaseSection = $('releaseSection');
const createSection = $('createSection');
const dropzone = $('dropzone');
const fileInput = $('fileInput');
const folderInput = $('folderInput');
const fileTree = $('fileTree');
const fileListContainer = $('fileListContainer');
const fileCount = $('fileCount');
const repoName = $('repoName');
const repoDescription = $('repoDescription');
const initReadmeCheckbox = $('initReadme');
const customReadme = $('customReadme');
const readmeEditorContainer = $('readmeEditorContainer');
const createReleaseCheckbox = $('createRelease');
const releaseFields = $('releaseFields');
const releaseTag = $('releaseTag');
const releaseTitle = $('releaseTitle');
const releaseNotes = $('releaseNotes');
const progressOverlay = $('progressOverlay');
const successOverlay = $('successOverlay');

// === GitHub API ===
async function ghFetch(endpoint, options = {}) {
  let res;
  try {
    res = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${state.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {})
      }
    });
  } catch (networkErr) {
    throw new Error('Network error — check your internet connection');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Build a detailed error message
    let msg = err.message || `GitHub API error (${res.status})`;
    if (err.errors && err.errors.length) {
      msg += ': ' + err.errors.map(e => e.message || e.code || JSON.stringify(e)).join(', ');
    }
    if (res.status === 401) msg = 'Bad credentials — your token is invalid or expired. Generate a new one.';
    if (res.status === 403) msg = 'Permission denied — make sure your token has the "repo" scope.';
    if (res.status === 422 && msg.toLowerCase().includes('already exists')) msg = 'A repository with this name already exists on your account. Pick a different name.';
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

// === Toast ===
function toast(message, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  $('toastContainer').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; setTimeout(() => t.remove(), 300); }, 4000);
}

// === Auth ===
connectBtn.addEventListener('click', async () => {
  const token = githubToken.value.trim();
  if (!token) { toast('Please enter your token', 'error'); return; }
  connectBtn.classList.add('loading');
  connectBtn.disabled = true;
  try {
    state.token = token;
    state.user = await ghFetch('/user');
    $('userAvatar').src = state.user.avatar_url;
    $('userName').textContent = state.user.name || state.user.login;
    $('userLogin').textContent = `@${state.user.login}`;
    connectionStatus.classList.add('connected');
    connectionStatus.querySelector('.status-text').textContent = `@${state.user.login}`;
    repoSection.classList.remove('hidden');
    filesSection.classList.remove('hidden');
    releaseSection.classList.remove('hidden');
    createSection.classList.remove('hidden');
    toast(`Connected as ${state.user.login}`, 'success');
  } catch (e) {
    toast(`Auth failed: ${e.message}`, 'error');
    state.token = '';
  } finally {
    connectBtn.classList.remove('loading');
    connectBtn.disabled = false;
  }
});

// Token visibility toggle
$('toggleTokenVisibility').addEventListener('click', () => {
  githubToken.type = githubToken.type === 'password' ? 'text' : 'password';
});

// === Visibility Toggle ===
$('togglePublic').addEventListener('click', () => { state.visibility = 'public'; $('togglePublic').classList.add('active'); $('togglePrivate').classList.remove('active'); });
$('togglePrivate').addEventListener('click', () => { state.visibility = 'private'; $('togglePrivate').classList.add('active'); $('togglePublic').classList.remove('active'); });

// === File Handling ===
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = { js: '📄', ts: '📘', py: '🐍', html: '🌐', css: '🎨', json: '📋', md: '📝', txt: '📃', png: '🖼️', jpg: '🖼️', svg: '🖼️', gif: '🖼️' };
  return icons[ext] || '📎';
}

async function addFiles(fileList) {
  const promises = Array.from(fileList).map(async file => {
    const path = file.webkitRelativePath || file.name;
    if (state.files.some(f => f.path === path)) return;
    const content = await readFileAsBase64(file);
    state.files.push({ path, content, size: file.size });
  });
  await Promise.all(promises);
  renderFileList();
}

function renderFileList() {
  if (state.files.length === 0) {
    fileListContainer.classList.add('hidden');
    return;
  }
  fileListContainer.classList.remove('hidden');
  fileCount.textContent = `${state.files.length} file${state.files.length !== 1 ? 's' : ''}`;
  fileTree.innerHTML = state.files.map((f, i) => `
    <div class="file-item" data-index="${i}">
      <span class="file-icon">${getFileIcon(f.path)}</span>
      <span class="file-path" title="${f.path}">${f.path}</span>
      <span class="file-size">${formatSize(f.size)}</span>
      <button class="file-remove" data-index="${i}" title="Remove">✕</button>
    </div>
  `).join('');
}

// Drag & drop
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', async e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const items = e.dataTransfer.items;
  if (items) {
    const entries = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
    if (entries.length > 0) {
      const files = await readEntries(entries);
      await addFiles(files);
      return;
    }
  }
  await addFiles(e.dataTransfer.files);
});

async function readEntries(entries) {
  const files = [];
  for (const entry of entries) {
    if (entry.isFile) {
      const file = await new Promise(res => entry.file(res));
      Object.defineProperty(file, 'webkitRelativePath', { value: entry.fullPath.replace(/^\//, '') });
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const subEntries = await new Promise(res => reader.readEntries(res));
      const subFiles = await readEntries(subEntries);
      files.push(...subFiles);
    }
  }
  return files;
}

dropzone.addEventListener('click', e => { if (e.target.closest('.btn')) return; fileInput.click(); });
$('browseFilesBtn').addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
$('browseFolderBtn').addEventListener('click', e => { e.stopPropagation(); folderInput.click(); });
fileInput.addEventListener('change', () => addFiles(fileInput.files));
folderInput.addEventListener('change', () => addFiles(folderInput.files));
$('addMoreBtn').addEventListener('click', () => fileInput.click());
$('clearAllBtn').addEventListener('click', () => { state.files = []; renderFileList(); });
fileTree.addEventListener('click', e => {
  const btn = e.target.closest('.file-remove');
  if (btn) { state.files.splice(parseInt(btn.dataset.index), 1); renderFileList(); }
});

// === Checkbox Toggles ===
initReadmeCheckbox.addEventListener('change', (e) => {
  if (e.target.checked) readmeEditorContainer.classList.remove('hidden');
  else readmeEditorContainer.classList.add('hidden');
});

createReleaseCheckbox.addEventListener('change', (e) => {
  if (e.target.checked) releaseFields.classList.remove('hidden');
  else releaseFields.classList.add('hidden');
});

// === Create Repository ===
function logProgress(msg, type = '') {
  const log = $('progressLog');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type ? 'log-' + type : ''}`;
  entry.textContent = `> ${msg}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

$('createRepoBtn').addEventListener('click', async () => {
  const name = repoName.value.trim();
  if (!name) { toast('Enter a repository name', 'error'); repoName.focus(); return; }
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) { toast('Repo name can only contain letters, numbers, hyphens, dots, and underscores', 'error'); repoName.focus(); return; }
  if (state.files.length === 0) { toast('Add at least one file', 'error'); return; }
  state.initReadme = $('initReadme').checked;

  progressOverlay.classList.remove('hidden');
  $('progressLog').innerHTML = '';
  $('progressBar').style.width = '0%';

  try {
    // Step 1: Create repo
    $('progressTitle').textContent = 'Creating Repository...';
    $('progressDetail').textContent = `${state.user.login}/${name}`;
    logProgress(`Creating repository: ${name}`);
    $('progressBar').style.width = '10%';

    const repo = await ghFetch('/user/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: repoDescription.value.trim(),
        private: state.visibility === 'private',
        auto_init: true // Always auto-init to bypass GitHub's empty repo API restriction
      })
    });
    logProgress('Repository created', 'success');
    $('progressBar').style.width = '20%';

    // Wait a moment for GitHub to finish initializing the main branch
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Upload files via Trees API (batch commit)
    $('progressTitle').textContent = 'Uploading Files...';
    const total = state.files.length;

    // Create blobs for each file
    const blobs = [];
    for (let i = 0; i < total; i++) {
      const f = state.files[i];
      $('progressDetail').textContent = `${i + 1}/${total}: ${f.path}`;
      $('progressBar').style.width = `${20 + (i / total) * 60}%`;
      logProgress(`Uploading: ${f.path}`);

      const blob = await ghFetch(`/repos/${state.user.login}/${name}/git/blobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: f.content, encoding: 'base64' })
      });
      blobs.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    logProgress('All blobs created', 'success');
    $('progressBar').style.width = '82%';

    // Get base tree
    let baseTree = null;
    let parentSha = null;
    try {
      const ref = await ghFetch(`/repos/${state.user.login}/${name}/git/ref/heads/main`);
      parentSha = ref.object.sha;
      const commit = await ghFetch(`/repos/${state.user.login}/${name}/git/commits/${parentSha}`);
      baseTree = commit.tree.sha;
    } catch (e) {
      logProgress('Warning: Could not fetch base tree', 'error');
    }

    // If user didn't want a README, and didn't upload one, delete the auto-generated one
    // But if they provided a custom README, we ADD it instead
    if (state.initReadme) {
      const readmeVal = customReadme.value.trim();
      if (readmeVal) {
        // Base64 encode the custom readme string
        const encodedReadme = btoa(unescape(encodeURIComponent(readmeVal)));
        blobs.push({ path: 'README.md', mode: '100644', type: 'blob', content: readmeVal }); 
      }
    } else if (!state.files.some(f => f.path.toLowerCase() === 'readme.md')) {
      blobs.push({ path: 'README.md', mode: '100644', sha: null });
    }

    // Create tree
    $('progressDetail').textContent = 'Building file tree...';
    logProgress('Creating Git tree');
    const treePayload = { tree: blobs };
    if (baseTree) treePayload.base_tree = baseTree;

    const tree = await ghFetch(`/repos/${state.user.login}/${name}/git/trees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(treePayload)
    });
    $('progressBar').style.width = '90%';

    // Create commit
    $('progressDetail').textContent = 'Creating commit...';
    logProgress('Creating commit');
    const commitPayload = {
      message: '🚀 Initial commit via RepoForge',
      tree: tree.sha
    };
    if (parentSha) commitPayload.parents = [parentSha];

    const commit = await ghFetch(`/repos/${state.user.login}/${name}/git/commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commitPayload)
    });
    $('progressBar').style.width = '95%';

    // Update ref
    logProgress('Updating branch reference');
    await ghFetch(`/repos/${state.user.login}/${name}/git/refs/heads/main`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commit.sha, force: true })
    });

    // Create Release if selected
    if (createReleaseCheckbox.checked) {
      const tag = releaseTag.value.trim() || 'v1.0.0';
      const title = releaseTitle.value.trim() || 'Initial Release';
      $('progressDetail').textContent = `Publishing release ${tag}...`;
      logProgress(`Creating release ${tag}`);
      
      await ghFetch(`/repos/${state.user.login}/${name}/releases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag_name: tag,
          target_commitish: 'main',
          name: title,
          body: releaseNotes.value.trim(),
          draft: false,
          prerelease: false
        })
      });
      logProgress('Release published', 'success');
    }

    $('progressBar').style.width = '100%';
    logProgress('Done!', 'success');

    // Show success
    await new Promise(r => setTimeout(r, 600));
    progressOverlay.classList.add('hidden');
    $('successMessage').textContent = `${state.user.login}/${name} • ${total} file${total !== 1 ? 's' : ''} uploaded`;
    $('viewRepoLink').href = repo.html_url;
    successOverlay.classList.remove('hidden');

  } catch (e) {
    logProgress(`Error: ${e.message}`, 'error');
    $('progressTitle').textContent = 'Creation Failed';
    $('progressDetail').textContent = e.message;
    $('progressDetail').style.color = '#fca5a5';
    toast(`Failed: ${e.message}`, 'error');
    // Add a close button so user can read the error
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.className = 'btn btn-secondary';
    closeBtn.style.marginTop = '16px';
    closeBtn.addEventListener('click', () => {
      progressOverlay.classList.add('hidden');
      $('progressDetail').style.color = '';
      closeBtn.remove();
    });
    $('progressLog').parentElement.appendChild(closeBtn);
  }
});

// === Create Another ===
$('createAnotherBtn').addEventListener('click', () => {
  successOverlay.classList.add('hidden');
  repoName.value = '';
  repoDescription.value = '';
  customReadme.value = '';
  releaseTag.value = '';
  releaseTitle.value = '';
  releaseNotes.value = '';
  state.files = [];
  renderFileList();
  repoName.focus();
});

// === Enter key on token input ===
githubToken.addEventListener('keydown', e => { if (e.key === 'Enter') connectBtn.click(); });
