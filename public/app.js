// ── State ───────────────────────────────────────────────────
let workflows = [];
let activeWorkflowId = null;

// ── Init ────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch('/api/workflows');
    workflows = await res.json();
  } catch {
    document.getElementById('headerSub').textContent = '无法连接服务';
    return;
  }

  if (workflows.length === 0) {
    document.getElementById('headerSub').textContent = '无可用工作流';
    return;
  }

  document.getElementById('headerSub').textContent = workflows.map((w) => w.name).join(' · ');

  renderTabs();
  renderPanels();
  switchTab(workflows[0].id);
}

// ── Tabs ────────────────────────────────────────────────────
function renderTabs() {
  const bar = document.getElementById('tabBar');
  bar.innerHTML = '';
  workflows.forEach((wf) => {
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.dataset.id = wf.id;
    btn.textContent = `${wf.icon} ${wf.name}`;
    btn.addEventListener('click', () => switchTab(wf.id));
    bar.appendChild(btn);
  });
}

function switchTab(id) {
  activeWorkflowId = id;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.id === id));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.dataset.id === id));
}

// ── Panels ──────────────────────────────────────────────────
function renderPanels() {
  const container = document.getElementById('panelContainer');
  container.innerHTML = '';

  workflows.forEach((wf) => {
    const div = document.createElement('div');
    div.className = 'panel';
    div.dataset.id = wf.id;

    if (wf.type === 'upload') {
      div.innerHTML = buildUploadPanel(wf);
    } else if (wf.type === 'text') {
      div.innerHTML = buildTextPanel(wf);
    } else {
      div.innerHTML = `<p>不支持的工作流类型: ${wf.type}</p>`;
    }

    container.appendChild(div);
  });

  // Wire up events after DOM insertion
  workflows.forEach((wf) => {
    if (wf.type === 'upload') wireUploadPanel(wf);
    if (wf.type === 'text') wireTextPanel(wf);
  });
}

// ── Upload panel ────────────────────────────────────────────
function buildUploadPanel(wf) {
  const accept = wf.accept || '.txt,.md,.csv';
  return `
    <div class="drop-zone" id="dropZone-${wf.id}">
      <div class="icon">📂</div>
      <div class="hint">拖拽文件到此处，或 <strong>点击选择文件</strong></div>
      <div class="types">支持 ${accept} 等文本文件，可多选</div>
    </div>
    <input type="file" id="fileInput-${wf.id}" multiple accept="${accept}" style="display:none">
    <div class="file-list" id="fileList-${wf.id}"></div>
    <div class="actions">
      <button class="btn btn-primary" id="btnSubmit-${wf.id}" disabled>
        <span id="spinner-${wf.id}" style="display:none" class="spinner"></span>
        开始${wf.name}
      </button>
      <button class="btn btn-secondary" id="btnClear-${wf.id}" disabled>清空文件</button>
    </div>
    <div class="status" id="status-${wf.id}"></div>
  `;
}

function wireUploadPanel(wf) {
  const dropZone = document.getElementById(`dropZone-${wf.id}`);
  const fileInput = document.getElementById(`fileInput-${wf.id}`);
  const fileList = document.getElementById(`fileList-${wf.id}`);
  const btnSubmit = document.getElementById(`btnSubmit-${wf.id}`);
  const btnClear = document.getElementById(`btnClear-${wf.id}`);
  const statusEl = document.getElementById(`status-${wf.id}`);
  const spinner = document.getElementById(`spinner-${wf.id}`);

  let selectedFiles = new DataTransfer();

  function renderList() {
    fileList.innerHTML = '';
    const files = selectedFiles.files;
    btnSubmit.disabled = files.length === 0;
    btnClear.disabled = files.length === 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const div = document.createElement('div');
      div.className = 'file-item';
      const size = f.size < 1024 * 1024 ? (f.size / 1024).toFixed(1) + ' KB' : (f.size / (1024 * 1024)).toFixed(1) + ' MB';
      div.innerHTML = `<span class="name">📎 ${escapeHtml(f.name)}</span><span class="size">${size}</span><span class="remove" data-idx="${i}">&times;</span>`;
      fileList.appendChild(div);
    }
    document.querySelectorAll(`#fileList-${wf.id} .remove`).forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(el.dataset.idx);
        const dt = new DataTransfer();
        for (let j = 0; j < selectedFiles.files.length; j++) {
          if (j !== idx) dt.items.add(selectedFiles.files[j]);
        }
        selectedFiles = dt;
        renderList();
      });
    });
  }

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    for (const f of e.dataTransfer.files) {
      let dup = false;
      for (const ex of selectedFiles.files) { if (ex.name === f.name && ex.size === f.size) { dup = true; break; } }
      if (!dup) selectedFiles.items.add(f);
    }
    renderList();
  });
  fileInput.addEventListener('change', () => {
    for (const f of fileInput.files) selectedFiles.items.add(f);
    fileInput.value = '';
    renderList();
  });
  btnClear.addEventListener('click', () => { selectedFiles = new DataTransfer(); renderList(); });

  btnSubmit.addEventListener('click', async () => {
    if (selectedFiles.files.length === 0) return;
    btnSubmit.disabled = true;
    spinner.style.display = 'inline-block';
    statusEl.textContent = '正在上传并执行…';
    statusEl.className = 'status';
    clearPreview();

    const formData = new FormData();
    for (const f of selectedFiles.files) formData.append('files', f);

    try {
      const res = await fetch(`/api/workflow/${wf.id}`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.status === 'done') {
        statusEl.textContent = `完成 — ${data.taskId}`;
        statusEl.className = 'status success';
        showPreview(data.output, data.taskId);
      } else {
        statusEl.textContent = data.error || '未知错误';
        statusEl.className = 'status error';
        showWorkflowError(wf, data.error || '请求失败', data.taskId);
      }
    } catch (err) {
      statusEl.textContent = '网络错误: ' + err.message;
      statusEl.className = 'status error';
      showWorkflowError(wf, '网络连接失败。<br><br>请检查：<br>1. 服务是否已启动<br>2. 端口 ' + (location.port || '3100'), null);
    } finally {
      btnSubmit.disabled = false;
      spinner.style.display = 'none';
    }
  });
}

// ── Text panel ──────────────────────────────────────────────
function buildTextPanel(wf) {
  return `
    <div class="prompt-area">
      <textarea id="promptInput-${wf.id}" placeholder="输入任意提示词，将直接调用 Claude Code CLI 执行…&#10;&#10;示例：列出项目根目录下的所有 Java 工程"></textarea>
      <div class="actions">
        <button class="btn btn-primary" id="btnSubmit-${wf.id}" disabled>
          <span id="spinner-${wf.id}" style="display:none" class="spinner"></span>
          提交执行
        </button>
      </div>
    </div>
    <div class="status" id="status-${wf.id}"></div>
  `;
}

function wireTextPanel(wf) {
  const input = document.getElementById(`promptInput-${wf.id}`);
  const btnSubmit = document.getElementById(`btnSubmit-${wf.id}`);
  const statusEl = document.getElementById(`status-${wf.id}`);
  const spinner = document.getElementById(`spinner-${wf.id}`);

  input.addEventListener('input', () => { btnSubmit.disabled = input.value.trim().length === 0; });

  btnSubmit.addEventListener('click', async () => {
    const prompt = input.value.trim();
    if (!prompt) return;

    btnSubmit.disabled = true;
    spinner.style.display = 'inline-block';
    statusEl.textContent = '正在执行…';
    statusEl.className = 'status';
    clearPreview();

    try {
      const res = await fetch(`/api/workflow/${wf.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.status === 'done') {
        statusEl.textContent = `完成 — ${data.taskId}`;
        statusEl.className = 'status success';
        showPreview(data.output, data.taskId);
      } else {
        statusEl.textContent = data.error || '未知错误';
        statusEl.className = 'status error';
        showWorkflowError(wf, data.error || '请求失败', data.taskId);
      }
    } catch (err) {
      statusEl.textContent = '网络错误: ' + err.message;
      statusEl.className = 'status error';
      showWorkflowError(wf, '网络连接失败。请检查服务是否已启动。', null);
    } finally {
      btnSubmit.disabled = false;
      spinner.style.display = 'none';
    }
  });
}

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
  } else {
    marked.setOptions?.({ breaks: true, gfm: true });
    previewContent.innerHTML = marked.parse(markdown);
  }
  previewContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showWorkflowError(wf, message, taskId) {
  previewEmpty.style.display = 'none';
  previewContent.style.display = 'block';
  previewContent.className = 'preview-content';
  previewLabel.textContent = taskId ? `taskId: ${taskId}` : '';

  const stepInfo = wf.stepCount > 0
    ? `「${wf.name}」包含 ${wf.stepCount} 个步骤`
    : '「' + wf.name + '」';

  previewContent.innerHTML = `
    <div class="error-block">
      <div class="error-title">❌ 执行 Workflow ${stepInfo} 时出错</div>
      <div class="error-detail">${message}</div>
    </div>
  `;
  previewContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Boot ────────────────────────────────────────────────────
init();
