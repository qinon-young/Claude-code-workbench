// ── Tab switching ────────────────────────────────────────────
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
  });
});

// ── File handling ────────────────────────────────────────────
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const btnStandardize = document.getElementById('btnStandardize');
const btnClearFiles = document.getElementById('btnClearFiles');
const standardizeStatus = document.getElementById('standardizeStatus');
const standardizeSpinner = document.getElementById('standardizeSpinner');

let selectedFiles = new DataTransfer();

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  addFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });

function addFiles(files) {
  for (const f of files) {
    let dup = false;
    for (const ex of selectedFiles.files) { if (ex.name === f.name && ex.size === f.size) { dup = true; break; } }
    if (dup) continue;
    selectedFiles.items.add(f);
  }
  renderFileList();
}

function renderFileList() {
  fileList.innerHTML = '';
  const files = selectedFiles.files;
  if (files.length === 0) {
    btnStandardize.disabled = true;
    btnClearFiles.disabled = true;
    return;
  }
  btnStandardize.disabled = false;
  btnClearFiles.disabled = false;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const div = document.createElement('div');
    div.className = 'file-item';
    const size = f.size < 1024 * 1024 ? (f.size / 1024).toFixed(1) + ' KB' : (f.size / (1024 * 1024)).toFixed(1) + ' MB';
    div.innerHTML = `
      <span class="name">📎 ${escapeHtml(f.name)}</span>
      <span class="size">${size}</span>
      <span class="remove" data-idx="${i}">&times;</span>
    `;
    fileList.appendChild(div);
  }
  document.querySelectorAll('.file-item .remove').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(el.dataset.idx);
      const dt = new DataTransfer();
      const files = selectedFiles.files;
      for (let j = 0; j < files.length; j++) { if (j !== idx) dt.items.add(files[j]); }
      selectedFiles = dt;
      renderFileList();
    });
  });
}

btnClearFiles.addEventListener('click', () => {
  selectedFiles = new DataTransfer();
  renderFileList();
});

// ── Standardize submit ──────────────────────────────────────
btnStandardize.addEventListener('click', async () => {
  if (selectedFiles.files.length === 0) return;

  btnStandardize.disabled = true;
  standardizeSpinner.style.display = 'inline-block';
  standardizeStatus.textContent = '正在上传并标准化…';
  standardizeStatus.className = 'status';
  clearPreview();

  const formData = new FormData();
  for (const f of selectedFiles.files) {
    formData.append('files', f);
  }

  try {
    const res = await fetch('/api/standardize', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.status === 'done') {
      standardizeStatus.textContent = `完成 — taskId: ${data.taskId}`;
      standardizeStatus.className = 'status success';
      showPreview(data.output, data.taskId);
    } else {
      standardizeStatus.textContent = data.error || '未知错误';
      standardizeStatus.className = 'status error';
      showError(data.error || '请求失败，服务端未返回具体错误信息', data.taskId);
    }
  } catch (err) {
    standardizeStatus.textContent = '网络错误: ' + err.message;
    standardizeStatus.className = 'status error';
    showError('网络连接失败：无法连接到工作台服务。<br><br>请检查：<br>1. 服务是否已启动（<code>npm start</code>）<br>2. 端口 ' + (location.port || '3100') + ' 是否被占用', null);
  } finally {
    btnStandardize.disabled = false;
    standardizeSpinner.style.display = 'none';
  }
});

// ── Prompt submit ────────────────────────────────────────────
const promptInput = document.getElementById('promptInput');
const btnPrompt = document.getElementById('btnPrompt');
const promptStatus = document.getElementById('promptStatus');
const promptSpinner = document.getElementById('promptSpinner');

promptInput.addEventListener('input', () => {
  btnPrompt.disabled = promptInput.value.trim().length === 0;
});

btnPrompt.addEventListener('click', async () => {
  const prompt = promptInput.value.trim();
  if (!prompt) return;

  btnPrompt.disabled = true;
  promptSpinner.style.display = 'inline-block';
  promptStatus.textContent = '正在执行…';
  promptStatus.className = 'status';
  clearPreview();

  try {
    const res = await fetch('/api/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    if (data.status === 'done') {
      promptStatus.textContent = `完成 — taskId: ${data.taskId}`;
      promptStatus.className = 'status success';
      showPreview(data.output, data.taskId);
    } else {
      promptStatus.textContent = data.error || '未知错误';
      promptStatus.className = 'status error';
      showError(data.error || '请求失败，服务端未返回具体错误信息', data.taskId);
    }
  } catch (err) {
    promptStatus.textContent = '网络错误: ' + err.message;
    promptStatus.className = 'status error';
    showError('网络连接失败：无法连接到工作台服务。<br><br>请检查：<br>1. 服务是否已启动（<code>npm start</code>）<br>2. 端口 ' + (location.port || '3100') + ' 是否被占用', null);
  } finally {
    btnPrompt.disabled = false;
    promptSpinner.style.display = 'none';
  }
});

// ── Preview ─────────────────────────────────────────────────
const previewEmpty = document.getElementById('previewEmpty');
const previewContent = document.getElementById('previewContent');
const previewLabel = document.getElementById('previewLabel');

function clearPreview() {
  previewEmpty.style.display = 'flex';
  previewEmpty.textContent = '等待任务执行…';
  previewContent.style.display = 'none';
  previewLabel.textContent = '';
}

function showPreview(markdown, taskId) {
  previewEmpty.style.display = 'none';
  previewContent.style.display = 'block';
  previewContent.className = 'preview-content';
  previewLabel.textContent = taskId ? `taskId: ${taskId}` : '';

  if (typeof marked === 'undefined') {
    previewContent.innerHTML = '<pre>' + escapeHtml(markdown) + '</pre>';
    return;
  }

  marked.setOptions?.({ breaks: true, gfm: true });
  const html = marked.parse(markdown);
  previewContent.innerHTML = html;
  previewContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showError(message, taskId) {
  previewEmpty.style.display = 'none';
  previewContent.style.display = 'block';
  previewContent.className = 'preview-content error-block';
  previewLabel.textContent = taskId ? `taskId: ${taskId}` : '';

  previewContent.innerHTML = `
    <div style="
      background: #fff5f5; border: 1px solid #feb2b2; border-left: 4px solid #e53e3e;
      padding: 16px 20px; border-radius: 8px; color: #c53030;
    ">
      <div style="font-weight:600; font-size:15px; margin-bottom:8px;">❌ 执行失败</div>
      <div style="font-size:14px; line-height:1.8;">${message}</div>
    </div>
  `;
  previewContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
