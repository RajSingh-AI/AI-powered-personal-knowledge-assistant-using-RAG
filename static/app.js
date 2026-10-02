(function () {
  "use strict";

  // ---- theme toggle (plain browser localStorage — real deployment, no restrictions) ----
  var themeBtn = document.getElementById('themeToggle');
  function currentTheme() {
    try { return localStorage.getItem('cp-theme') || 'auto'; } catch (e) { return 'auto'; }
  }
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  function nextTheme(t) { return t === 'auto' ? 'light' : (t === 'light' ? 'dark' : 'auto'); }
  var theme = currentTheme();
  applyTheme(theme);
  themeBtn.addEventListener('click', function () {
    theme = nextTheme(theme);
    applyTheme(theme);
    try { localStorage.setItem('cp-theme', theme); } catch (e) {}
  });

  var els = {
    entryTitle: document.getElementById('entryTitle'),
    entryContent: document.getElementById('entryContent'),
    addEntryBtn: document.getElementById('addEntryBtn'),
    addEntryNote: document.getElementById('addEntryNote'),
    entryList: document.getElementById('entryList'),
    libraryStatus: document.getElementById('libraryStatus'),
    entryCountLabel: document.getElementById('entryCountLabel'),
    transcript: document.getElementById('transcript'),
    welcome: document.getElementById('welcome'),
    welcomeSub: document.getElementById('welcomeSub'),
    askForm: document.getElementById('askForm'),
    askInput: document.getElementById('askInput'),
    askBtn: document.getElementById('askBtn'),
    askBanner: document.getElementById('askBanner'),
    modelSelect: document.getElementById('modelSelect')
  };

  var entries = [];
  var models = [];

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setBanner(el, text, warn) {
    el.innerHTML = text ? '<div class="banner' + (warn ? ' warn' : '') + '">' + escapeHtml(text) + '</div>' : '';
  }

  // ---------------------------------------------------------------
  // Library
  // ---------------------------------------------------------------
  function loadEntries() {
    return fetch('/api/documents').then(function (r) { return r.json(); }).then(function (docs) {
      entries = docs;
      renderLibrary();
    }).catch(function () {
      els.libraryStatus.textContent = 'Could not reach the server.';
    });
  }

  function renderLibrary() {
    els.entryCountLabel.textContent = entries.length + (entries.length === 1 ? ' entry' : ' entries');
    var chunkCount = entries.reduce(function (sum, e) { return sum + (e.chunks ? e.chunks.length : 0); }, 0);
    els.libraryStatus.textContent = entries.length
      ? 'Retrieval runs across ' + chunkCount + ' passages.'
      : 'Nothing here yet.';
    els.entryList.innerHTML = '';
    if (!entries.length) {
      var li = document.createElement('li');
      li.className = 'empty-note';
      li.textContent = 'Add your first entry above to start building your library.';
      els.entryList.appendChild(li);
    } else {
      entries.forEach(function (entry) {
        var li = document.createElement('li');
        li.className = 'entry-card';
        var wc = (entry.content || '').split(/\s+/).filter(Boolean).length;
        li.innerHTML =
          '<h3>' + escapeHtml(entry.title) + '</h3>' +
          '<p>' + escapeHtml(entry.content) + '</p>' +
          '<div class="meta">' + wc + ' words · ' + (entry.chunks ? entry.chunks.length : 0) +
          ' passage' + (entry.chunks && entry.chunks.length === 1 ? '' : 's') + '</div>' +
          '<button class="entry-delete" title="Remove entry" aria-label="Remove entry">×</button>';
        li.querySelector('.entry-delete').addEventListener('click', function () { removeEntry(entry.id); });
        els.entryList.appendChild(li);
      });
    }
    updateAskAvailability();
  }

  function addEntry() {
    var title = els.entryTitle.value.trim();
    var content = els.entryContent.value.trim();
    els.addEntryNote.textContent = '';
    if (!title || !content) {
      els.addEntryNote.textContent = 'Give the entry a title and some content.';
      return;
    }
    els.addEntryBtn.disabled = true;
    fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title, content: content })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'Failed to save.'); });
      return r.json();
    }).then(function () {
      els.entryTitle.value = '';
      els.entryContent.value = '';
      return loadEntries();
    }).catch(function (err) {
      els.addEntryNote.textContent = err.message;
    }).finally(function () {
      els.addEntryBtn.disabled = false;
    });
  }

  function removeEntry(id) {
    fetch('/api/documents/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function () { return loadEntries(); });
  }

  els.addEntryBtn.addEventListener('click', addEntry);

  // ---------------------------------------------------------------
  // Models
  // ---------------------------------------------------------------
  function loadModels() {
    return fetch('/api/models').then(function (r) { return r.json(); }).then(function (list) {
      models = list;
      els.modelSelect.innerHTML = models.map(function (m) {
        return '<option value="' + m.key + '"' + (m.configured ? '' : ' disabled') + '>' +
          escapeHtml(m.label) + (m.configured ? '' : ' (no API key)') + '</option>';
      }).join('');
      var anyConfigured = models.some(function (m) { return m.configured; });
      if (!anyConfigured) {
        setBanner(els.askBanner, 'No model is configured yet — add ANTHROPIC_API_KEY and/or GOOGLE_API_KEY to your .env file and restart the server.', true);
      }
      updateAskAvailability();
    }).catch(function () {
      setBanner(els.askBanner, 'Could not reach the server to list models.', true);
    });
  }

  function updateAskAvailability() {
    var anyConfigured = models.some(function (m) { return m.configured; });
    var canAsk = entries.length > 0 && anyConfigured;
    els.askBtn.disabled = !canAsk;
  }

  // ---------------------------------------------------------------
  // Ask
  // ---------------------------------------------------------------
  function autoGrow() {
    els.askInput.style.height = 'auto';
    els.askInput.style.height = Math.min(els.askInput.scrollHeight, 160) + 'px';
  }
  els.askInput.addEventListener('input', autoGrow);
  els.askInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      els.askForm.requestSubmit();
    }
  });

  function renderCiteMarkers(text) {
    return escapeHtml(text).replace(/\[(\d+)\]/g, '<span class="cite">[$1]</span>');
  }

  els.askForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var question = els.askInput.value.trim();
    var modelKey = els.modelSelect.value;
    if (!question) return;

    els.welcome.style.display = 'none';
    els.askInput.value = '';
    autoGrow();

    var modelLabel = (models.find(function (m) { return m.key === modelKey; }) || {}).label || modelKey;

    var turn = document.createElement('div');
    turn.className = 'turn';
    turn.innerHTML =
      '<div class="q-line">' + escapeHtml(question) + '<span class="model-tag">' + escapeHtml(modelLabel) + '</span></div>' +
      '<div class="a-block thinking">Thinking…</div>';
    els.transcript.appendChild(turn);
    els.transcript.scrollTop = els.transcript.scrollHeight;

    var aBlock = turn.querySelector('.a-block');
    els.askBtn.disabled = true;

    fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question, model: modelKey })
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data }; });
    }).then(function (res) {
      aBlock.classList.remove('thinking');
      if (!res.ok) {
        aBlock.textContent = '';
        var errLine = document.createElement('div');
        errLine.className = 'turn-error';
        errLine.textContent = res.data.error || 'Something went wrong.';
        turn.appendChild(errLine);
        return;
      }
      aBlock.innerHTML = renderCiteMarkers(res.data.answer);
      if (res.data.sources && res.data.sources.length) {
        var sources = document.createElement('div');
        sources.className = 'sources';
        sources.innerHTML = '<h4>Sources consulted</h4>' + res.data.sources.map(function (s) {
          return '<div class="source-item"><span class="source-num">[' + s.index + ']</span>' +
            '<span><span class="snippet-title">' + escapeHtml(s.title) + '</span> — ' +
            escapeHtml(s.snippet) + (s.snippet.length >= 220 ? '…' : '') + '</span></div>';
        }).join('');
        turn.appendChild(sources);
      }
      els.transcript.scrollTop = els.transcript.scrollHeight;
    }).catch(function () {
      aBlock.classList.remove('thinking');
      aBlock.textContent = '';
      var errLine = document.createElement('div');
      errLine.className = 'turn-error';
      errLine.textContent = 'Could not reach the server.';
      turn.appendChild(errLine);
    }).finally(function () {
      updateAskAvailability();
    });
  });

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  Promise.all([loadEntries(), loadModels()]).then(function () {
    els.welcomeSub.textContent = 'Your library is saved to a local database file on this server.';
  });
})();
