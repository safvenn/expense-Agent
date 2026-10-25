/* Vanilla JavaScript adapter for the existing FastAPI routes. */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
  const read = (key, fallback) => { try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* In-memory operation remains available. */ } };

  const AUTH_KEY = 'expense-auth';
  function readAuth() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || null; }
    catch { return null; }
  }
  function persistAuth(value) {
    try {
      if (value) localStorage.setItem(AUTH_KEY, JSON.stringify(value));
      else localStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(AUTH_KEY);
    } catch { /* Keep the current session usable if storage is unavailable. */ }
  }
  let auth = readAuth();
  const defaultBase = /^https?:$/.test(window.location.protocol) ? window.location.origin : 'http://localhost:8000';
  let base = read('expense-api', defaultBase);
  let state = read('expense-chat', null);
  const fresh = () => ({ thread: 'web-' + crypto.randomUUID(), messages: [], pending: null, uncertain: false });
  if (!state || !Array.isArray(state.messages) || !state.thread) state = fresh();
  let busy = false;
  let historyVersion = 0;
  let historyNotice = "";
  const persist = () => save('expense-chat', state);

  function saveAuth(value) {
    if (auth?.access_token !== value?.access_token) {
      historyVersion++;
      state = fresh();
      persist();
      renderChat();
    }
    auth = value;
    persistAuth(value);
    updateAuthUI();
  }

  function clearAuth() {
    historyVersion++;
    state = fresh();
    persist();
    renderChat();
    auth = null;
    persistAuth(null);
    updateAuthUI();
  }

  function node(tag, text, className) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (className) n.className = className;
    return n;
  }

  async function api(path, options = {}) {
    let headers = { ...options.headers };
    if (auth && auth.access_token) {
      headers['Authorization'] = `Bearer ${auth.access_token}`;
    }

    let response;
    try {
      response = await fetch(base + path, { ...options, headers, signal: AbortSignal.timeout(120000) });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error('The API did not respond within 2 minutes. The action may still be running.');
      }
      throw new Error('The browser could not read the response from ' + base + path.split('?')[0] + '. This can mean a connection failure or a server error without CORS headers. Check the backend terminal for the request error.');
    }

    // Attempt token refresh on 401 if refresh_token is present
    if (response.status === 401 && auth && auth.refresh_token && !options._isRetry) {
      let refreshed = false;
      try {
        const refreshRes = await fetch(`${base}/refresh?token=${encodeURIComponent(auth.refresh_token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData.access_token) {
            auth.access_token = refreshData.access_token;
            saveAuth(auth);
            headers['Authorization'] = `Bearer ${auth.access_token}`;
            refreshed = true;
          }
        }
      } catch {
        /* Refresh failed, proceed to handle 401 */
      }
      if (refreshed) return api(path, { ...options, headers, _isRetry: true });
    }

    if (response.status === 401) {
      openAuthModal('Please sign in to continue.');
      const error = new Error('Authentication required (HTTP 401). Please sign in.');
      error.status = 401;
      throw error;
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.detail) detail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      } catch { /* use status code */ }
      const error = new Error(`API request failed (HTTP ${response.status}): ${detail}`);
      error.status = response.status;
      throw error;
    }

    try {
      return JSON.parse(await response.text());
    } catch {
      throw new Error('The API returned an invalid JSON response.');
    }
  }

  function markdownToHtml(raw) {
    if (!raw) return '';
    const codeBlocks = [];
    let text = String(raw).replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const idx = codeBlocks.length;
      codeBlocks.push('<pre class="code-block"><code class="language-' + (lang || 'text') + '">' + escaped + '</code></pre>');
      return '__CODE_BLOCK_' + idx + '__';
    });

    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const inlineCodes = [];
    text = text.replace(/`([^`]+)`/g, (_, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push('<code class="inline-code">' + code + '</code>');
      return '__INLINE_CODE_' + idx + '__';
    });

    const lines = text.split('\n');
    const output = [];
    let inTable = false;
    let tableHeader = null;
    let tableRows = [];
    let inList = false;
    let listType = null;

    function flushList() {
      if (inList) {
        output.push('</' + listType + '>');
        inList = false;
        listType = null;
      }
    }

    function flushTable() {
      if (inTable) {
        let html = '<div class="table-responsive"><table class="md-table">';
        if (tableHeader) {
          html += '<thead><tr>' + tableHeader.map(c => '<th>' + formatInline(c.trim()) + '</th>').join('') + '</tr></thead>';
        }
        if (tableRows.length) {
          html += '<tbody>';
          for (const row of tableRows) {
            html += '<tr>' + row.map(c => '<td>' + formatInline(c.trim()) + '</td>').join('') + '</tr>';
          }
          html += '</tbody>';
        }
        html += '</table></div>';
        output.push(html);
        inTable = false;
        tableHeader = null;
        tableRows = [];
      }
    }

    function formatInline(str) {
      return str
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
        .replace(/_([^_\n]+?)_/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('|') && line.endsWith('|')) {
        flushList();
        const cells = line.slice(1, -1).split('|');
        if (!inTable) {
          const next = lines[i + 1] ? lines[i + 1].trim() : '';
          if (next && next.startsWith('|') && next.includes('---')) {
            inTable = true;
            tableHeader = cells;
            i++;
            continue;
          }
        } else {
          tableRows.push(cells);
          continue;
        }
      } else {
        flushTable();
      }

      if (line.startsWith('__CODE_BLOCK_') && line.endsWith('__')) {
        flushList();
        output.push(line);
        continue;
      }

      if (/^###\s+(.*)/.test(line)) {
        flushList();
        output.push('<h3>' + formatInline(line.replace(/^###\s+/, '')) + '</h3>');
        continue;
      }
      if (/^##\s+(.*)/.test(line)) {
        flushList();
        output.push('<h2>' + formatInline(line.replace(/^##\s+/, '')) + '</h2>');
        continue;
      }
      if (/^#\s+(.*)/.test(line)) {
        flushList();
        output.push('<h1>' + formatInline(line.replace(/^#\s+/, '')) + '</h1>');
        continue;
      }

      if (/^>\s+(.*)/.test(line)) {
        flushList();
        output.push('<blockquote>' + formatInline(line.replace(/^>\s+/, '')) + '</blockquote>');
        continue;
      }

      const ulMatch = line.match(/^[-*]\s+(.*)/);
      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          flushList();
          inList = true;
          listType = 'ul';
          output.push('<ul>');
        }
        output.push('<li>' + formatInline(ulMatch[1]) + '</li>');
        continue;
      }

      const olMatch = line.match(/^\d+\.\s+(.*)/);
      if (olMatch) {
        if (!inList || listType !== 'ol') {
          flushList();
          inList = true;
          listType = 'ol';
          output.push('<ol>');
        }
        output.push('<li>' + formatInline(olMatch[1]) + '</li>');
        continue;
      }

      flushList();

      if (line === '') {
        continue;
      }

      output.push('<p>' + formatInline(line) + '</p>');
    }
    flushList();
    flushTable();

    let res = output.join('\n');
    res = res.replace(/__INLINE_CODE_(\d+)__/g, (_, idx) => inlineCodes[idx]);
    res = res.replace(/__CODE_BLOCK_(\d+)__/g, (_, idx) => codeBlocks[idx]);
    return res;
  }

  function accept(data) {
    const result = parseChatResponse(data);
    state.pending = result.pending || null;
    if (result.text) {
      const users = state.messages.filter(message => message.role === 'user');
      const user = users[users.length - 1];
      state.messages.push({ role: 'assistant', text: result.text, afterUser: user ? {
        id: user.id, text: user.text,
        occurrence: users.filter(message => message.text === user.text).length - 1
      } : null });
    }
    state.diagnostic = null;
    state.uncertain = false;
    persist();
  }

  // Recover only a confirmed interrupt response from the same configured API.
  // This re-renders saved data; it never repeats a request or approves a tool.
  if (state.uncertain && state.diagnostic?.api === base && state.diagnostic.response) {
    try {
      const recovered = parseChatResponse(state.diagnostic.response);
      if (recovered.pending) {
        state.pending = recovered.pending;
        state.uncertain = false;
        state.diagnostic = null;
        state.messages.push({ role: 'assistant', text: 'Your pending approval has been recovered. Review the action below to continue. The expense has not been resent.' });
        persist();
      }
    } catch { /* Preserve the diagnostic and lock for genuinely unknown outcomes. */ }
  }

  function renderChat() {
    const host = $('#conversation');
    if (!host) return;
    host.replaceChildren();
    if (!state.messages.length) {
      const hero = node('div', undefined, 'chat-hero');
      const icon = node('div', '✦', 'hero-icon');
      const title = node('h2', 'How can I assist with your expenses today?');
      const desc = node('p', 'Track daily spending, categorize purchases, review your totals, or ask for budget insights using natural language.');
      const promptList = node('div', undefined, 'quick-prompts');
      const prompts = [
        'Added ₹350 for lunch with team',
        'Show my total expenses for this month',
        'Bought groceries for ₹1,200',
        'What is my top spending category?'
      ];
      for (const prompt of prompts) {
        const chip = node('button', prompt, 'prompt-chip');
        chip.type = 'button';
        chip.addEventListener('click', () => {
          const input = $('#message');
          if (input) {
            input.value = prompt;
            input.focus();
            autoResizeTextarea(input);
          }
        });
        promptList.append(chip);
      }
      hero.append(icon, title, desc, promptList);
      host.append(hero);
    }
    for (const message of state.messages) {
      if (message.role === 'tool') {
        const activity = node('div', undefined, 'tool-activity');
        activity.append(node('small', message.text));
        host.append(activity);
        continue;
      }
      const item = node('article', undefined, 'message ' + (message.role === 'user' ? 'user-message' : 'assistant-message'));
      if (message.role === 'assistant') {
        item.append(node('div', '✦', 'assistant-avatar'));
      }
      const body = node('div', undefined, message.role === 'user' ? 'bubble' : 'message-content');
      body.append(node('strong', message.role === 'user' ? 'You' : 'Expense assistant', 'assistant-name'));
      if (message.role === 'user') {
        body.append(node('p', message.text, 'message-text'));
      } else {
        const mdEl = node('div', undefined, 'message-text markdown-body');
        mdEl.innerHTML = markdownToHtml(message.text);
        body.append(mdEl);
      }
      item.append(body);
      host.append(item);
    }
    if (busy) {
      const thinkingItem = node('article', undefined, 'message assistant-message thinking-item');
      thinkingItem.append(node('div', '✦', 'assistant-avatar'));
      const body = node('div', undefined, 'message-content');
      body.append(node('strong', 'Expense assistant', 'assistant-name'));
      const indicator = node('div', undefined, 'typing-indicator');
      indicator.append(
        node('span', undefined, 'typing-dot'),
        node('span', undefined, 'typing-dot'),
        node('span', undefined, 'typing-dot')
      );
      body.append(indicator);
      thinkingItem.append(body);
      host.append(thinkingItem);
    }
    if (state.diagnostic) {
      const diagnostic = node('details', undefined, 'response-diagnostic');
      diagnostic.append(node('summary', 'Response details'), node('pre', JSON.stringify(state.diagnostic, null, 2)));
      host.append(diagnostic);
    }
    if (state.pending) {
      const p = state.pending;
      const card = node('section', undefined, 'approval-card');
      const heading = node('div', undefined, 'approval-header');
      const title = node('div');
      title.append(node('h2', 'Tool approval required'), node('p', p.description || 'The agent is waiting for your decision.'));
      heading.append(title);
      heading.append(node('span', 'Waiting', 'status waiting'));
      card.append(heading);

      const details = node('dl', undefined, 'expense-details');
      for (const [key, value] of Object.entries(p.args || {})) {
        const row = node('div');
        const isAmount = key.toLowerCase().includes('amount') || key.toLowerCase().includes('ammount');
        const displayValue = isAmount && typeof value === 'number' ? money(value) : (typeof value === 'object' ? JSON.stringify(value) : String(value));
        row.append(node('dt', key), node('dd', displayValue, isAmount ? 'amount' : undefined));
        details.append(row);
      }
      card.append(details);

      const tool = node('details', undefined, 'tool-details');
      tool.append(node('summary', 'View tool details'), node('pre', JSON.stringify({ name: p.name, args: p.args }, null, 2)));
      card.append(tool);

      card.append(node('p', 'Your API applies this decision to pending actions. Submit one expense at a time to review each individually.', 'batch-notice'));

      const actions = node('div', undefined, 'approval-actions');

      // Approval Button
      if (p.allowed_decisions.includes('approve')) {
        const approveBtn = node('button', '✓ Approve all pending actions', 'button primary');
        approveBtn.type = 'button';
        approveBtn.disabled = busy || state.uncertain;
        approveBtn.addEventListener('click', () => decide(true));
        actions.append(approveBtn);
      }

      // Rejection Section with Message input
      if (p.allowed_decisions.includes('reject')) {
        const rejectSec = node('div', undefined, 'rejection-section');
        const rejectHead = node('div', undefined, 'rejection-header');
        rejectHead.textContent = 'Reject with feedback to assistant:';
        rejectSec.append(rejectHead);

        const rejectInput = document.createElement('textarea');
        rejectInput.className = 'rejection-textarea';
        rejectInput.rows = 2;
        rejectInput.placeholder = "Tell the assistant why (e.g. 'Amount is wrong, it was ₹150', 'Cancel this expense')...";
        rejectInput.disabled = busy || state.uncertain;
        rejectSec.append(rejectInput);

        const chips = node('div', undefined, 'rejection-chips');
        const presets = [
          ['Wrong amount', 'Amount is incorrect, please adjust.'],
          ['Cancel expense', 'Cancel this expense, do not record it.'],
          ['Wrong category', 'The expense category is incorrect.'],
          ['Duplicate', 'This expense has already been recorded.']
        ];
        for (const [label, text] of presets) {
          const chip = node('button', label, 'chip-btn');
          chip.type = 'button';
          chip.disabled = busy || state.uncertain;
          chip.addEventListener('click', () => {
            rejectInput.value = text;
            rejectInput.focus();
          });
          chips.append(chip);
        }
        rejectSec.append(chips);

        const rejectActs = node('div', undefined, 'rejection-actions');
        const rejectBtn = node('button', '✕ Reject action with message', 'button secondary danger');
        rejectBtn.type = 'button';
        rejectBtn.disabled = busy || state.uncertain;
        rejectBtn.addEventListener('click', () => {
          decide(false, rejectInput.value);
        });
        rejectActs.append(rejectBtn);
        rejectSec.append(rejectActs);

        actions.append(rejectSec);
      }

      card.append(actions);
      host.append(card);
    }

    if ($('#message')) $('#message').disabled = busy || !!state.pending || state.uncertain;
    if ($('.send-button')) $('.send-button').disabled = busy || !!state.pending || state.uncertain;
    if ($('#chat-status')) {
      $('#chat-status').textContent = busy
        ? 'Waiting for the assistant…'
        : state.uncertain
        ? 'Request outcome unknown. Check Expenses before retrying. Nothing will be retried automatically.'
        : state.pending
        ? 'Review the pending action to continue.'
        : 'Enter to send · Shift + Enter for a new line';
    }
    if (historyNotice && $('#chat-status')) $('#chat-status').textContent += ' · ' + historyNotice;
    if ($('#connection-form button')) $('#connection-form button').disabled = busy;

    requestAnimationFrame(() => {
      host.scrollTop = host.scrollHeight;
    });
  }

  function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }

  async function mutate(path, options) {
    historyVersion++;
    busy = true;
    state.uncertain = true;
    state.diagnostic = null;
    persist();
    renderChat();
    try {
      const data = await api(path, options);
      state.diagnostic = { endpoint: path.split('?')[0], api: base, response: data };
      accept(data);
      renderChat();
    } catch (error) {
      if (state.diagnostic) state.diagnostic.error = String(error.message);
      const rejectedBeforeExecution = [401, 403, 422].includes(error.status);
      if (rejectedBeforeExecution) state.uncertain = false;
      state.messages.push({
        role: 'assistant',
        text: error.message + (rejectedBeforeExecution ? ' The request was rejected before execution.' : ' The request may already have been processed. Check your expenses before trying again.')
      });
      persist();
    } finally {
      await loadMessages();
      busy = false;
      renderChat();
    }
  }

  async function decide(approve, rejectionMessage = '') {
    if (busy || !state.pending || state.uncertain) return;
    const message = approve ? null : (rejectionMessage.trim() || 'User denied this action. Do not retry.');
    await mutate('/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: state.thread,
        interrupt_id: state.pending.id,
        approve: Boolean(approve),
        ...(approve ? {} : { message: message })
      })
    });
  }

  if ($('#chat-form')) {
    $('#chat-form').addEventListener('submit', async event => {
      event.preventDefault();
      const prompt = $('#message').value.trim();
      if (!prompt || busy || state.pending || state.uncertain) return;
      state.messages.push({ role: 'user', text: prompt });
      $('#message').value = '';
      autoResizeTextarea($('#message'));
      await mutate('/chat?' + new URLSearchParams({ prompt }), { method: 'POST' });
    });
    $('#message').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        $('#chat-form').requestSubmit();
      }
    });
    $('#message').addEventListener('input', () => {
      autoResizeTextarea($('#message'));
    });
    renderChat();
  }

  async function loadExpenses() {
    if (!$('#expense-rows')) return;
    if (!auth?.access_token) {
      $('#expense-rows').replaceChildren();
      $('#expense-stats').replaceChildren();
      $('#expense-count').textContent = '—';
      $('#expense-total').textContent = '—';
      $('#expense-footer').textContent = 'Sign in to view your expenses';
      $('#expenses-status').textContent = 'Sign in to see your recorded spending.';
      return;
    }
    if ($('#refresh-expenses')) $('#refresh-expenses').disabled = true;
    $('#expenses-status').textContent = 'Loading expenses…';
    try {
      const expenses = await api('/expenses');
      if (!Array.isArray(expenses)) throw new Error('The API did not return an expense list.');
      const rows = expenses.map(item => {
        const amount = Number(item.ammount ?? item.amount);
        if (!Number.isFinite(amount)) throw new Error('An expense contains an invalid amount.');
        return { ...item, amount };
      });
      const total = rows.reduce((sum, item) => sum + item.amount, 0);
      const categories = new Map();
      rows.forEach(item => {
        const category = String(item.category || 'Other');
        categories.set(category, (categories.get(category) || 0) + item.amount);
      });
      const top = [...categories.entries()].sort((a, b) => b[1] - a[1])[0];
      $('#expense-stats').replaceChildren();
      for (const [title, value, caption] of [
        ['Total spending', money(total), `Across ${rows.length} expenses`],
        ['Top category', top ? top[0] : '—', top ? money(top[1]) : 'No expenses yet'],
        ['Average expense', money(rows.length ? total / rows.length : 0), 'Per transaction']
      ]) {
        const card = node('article', undefined, 'stat-card');
        card.append(node('p', title), node('strong', value), node('small', caption));
        $('#expense-stats').append(card);
      }
      $('#expense-rows').replaceChildren();
      for (const item of rows) {
        const row = node('tr');
        let formattedDate = '—';
        if (item.date) {
          try {
            const d = new Date(item.date);
            if (!isNaN(d.getTime())) {
              formattedDate = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            }
          } catch { /* use fallback */ }
        } else if (item.id) {
          formattedDate = '#' + item.id;
        }
        row.append(
          node('td', String(item.title || 'Untitled expense')),
          node('td', String(item.category || 'Other')),
          node('td', formattedDate, 'date-cell'),
          node('td', money(item.amount), 'numeric')
        );
        $('#expense-rows').append(row);
      }
      $('#expense-count').textContent = rows.length;
      $('#expense-total').textContent = money(total);
      $('#expense-footer').textContent = `${rows.length} expenses · All recorded spending`;
      $('#expenses-status').textContent = rows.length ? 'Updated from your backend database.' : 'No expenses yet. Add your first expense in Chat.';
    } catch (error) {
      $('#expense-stats').replaceChildren();
      $('#expense-rows').replaceChildren();
      $('#expense-count').textContent = '—';
      $('#expense-total').textContent = '—';
      $('#expense-footer').textContent = 'Expenses unavailable';
      $('#expenses-status').textContent = error.message + ' Use Refresh or Sign In to try again.';
    } finally {
      if ($('#refresh-expenses')) $('#refresh-expenses').disabled = false;
    }
  }

  async function checkConnection() {
    try {
      await api('/Health');
      if ($('.preview-badge')) $('.preview-badge').textContent = 'API connected';
      if ($('#connection-status')) $('#connection-status').textContent = 'Connected to ' + base;
    } catch (error) {
      if ($('.preview-badge')) $('.preview-badge').textContent = 'API unavailable';
      if ($('#connection-status')) $('#connection-status').textContent = error.message;
    }
  }

  /* ---------------- Message History Loader ---------------- */
  async function loadMessages() {
    if (!$('#conversation') || !auth?.access_token) return;
    const version = ++historyVersion;
    const targetState = state;
    const targetBase = base;
    const current = () => version === historyVersion && state === targetState && base === targetBase && !!auth?.access_token;
    historyNotice = 'Loading chat history…';
    try {
      const records = [];
      const pageSize = 100;
      for (let offset = 0; ; offset += pageSize) {
        const data = await api('/messages?' + new URLSearchParams({ limit: pageSize, offset }));
        if (!current()) return;
        if (!data || !Array.isArray(data.messages)) throw new Error('Invalid message history response.');
        records.push(...data.messages);
        if (data.messages.length < pageSize) break;
      }
      const seen = new Set();
      const history = records.slice().reverse().filter(message => {
        if (message.id == null) return true;
        if (seen.has(message.id)) return false;
        seen.add(message.id); return true;
      }).filter(message => ['user', 'human', 'assistant', 'ai', 'tool'].includes(message.role))
        .map(message => {
          if (message.role === 'tool') {
            let tool = message.content;
            if (typeof tool === 'string') {
              try { tool = JSON.parse(tool); } catch { tool = null; }
            }
            const requests = Array.isArray(tool?.action_requests) ? tool.action_requests : [];
            const names = requests.map(action => action?.name).filter(name => typeof name === 'string' && name.trim());
            const name = tool?.name || message.name;
            const text = names.length ? 'Tool requested: ' + names.join(', ')
              : typeof name === 'string' && name.trim() ? 'Tool: ' + name : '';
            return { id: message.id, role: 'tool', text, date: message.date };
          }
          const role = ['user', 'human'].includes(message.role) ? 'user' : 'assistant';
          let content = message.content;
          if (typeof content === 'string') {
            try {
              const decoded = JSON.parse(content);
              const field = role === 'user' ? 'user_prompt' : 'assistant_response';
              if (decoded && typeof decoded === 'object' &&
                  (Object.prototype.hasOwnProperty.call(decoded, field) || Object.prototype.hasOwnProperty.call(decoded, 'content'))) content = decoded;
            } catch { /* Ordinary text is displayed unchanged. */ }
          }
          if (content && typeof content === 'object' && !Array.isArray(content)) {
            content = content[role === 'user' ? 'user_prompt' : 'assistant_response'] ?? content.content;
          }
          const text = typeof content === 'string' ? content : Array.isArray(content)
            ? content.map(block => typeof block === 'string' ? block :
                (typeof block?.text === 'string' ? block.text : '')).filter(Boolean).join('\n') : '';
          return { id: message.id, role, text, date: message.date };
        }).filter(message => message.text.trim());
      // Keep unsaved current replies/errors without duplicating persisted messages.
      const counts = new Map();
      const displayText = message => {
        try {
          const decoded = JSON.parse(message.text);
          const value = decoded?.[message.role === 'user' ? 'user_prompt' : 'assistant_response'] ?? decoded?.content;
          if (typeof value === 'string') return value;
        } catch { /* Plain text. */ }
        return message.text;
      };
      const key = message => JSON.stringify([message.role, displayText(message)]);
      history.forEach(message => counts.set(key(message), (counts.get(key(message)) || 0) + 1));
      const unsaved = state.messages.filter(message => {
        const count = counts.get(key(message)) || 0;
        if (count) { counts.set(key(message), count - 1); return false; }
        return message.id == null;
      });
      const merged = history.slice();
      for (const original of unsaved) {
        const message = { ...original, text: displayText(original) };
        if (message.role !== 'assistant') { merged.push(message); continue; }
        let userIndex = -1;
        if (message.afterUser) {
          const anchor = message.afterUser;
          if (anchor.id != null) userIndex = merged.findIndex(item => item.role === 'user' && item.id === anchor.id);
          if (userIndex < 0) {
            let occurrence = 0;
            userIndex = merged.findIndex(item => item.role === 'user' && item.text === anchor.text && occurrence++ === anchor.occurrence);
          }
        } else {
          // Older cached approval replies have no anchor. Pair them in their
          // recorded order with tool-request turns that have no assistant reply.
          userIndex = merged.findIndex((item, index) => {
            if (item.role !== 'user') return false;
            const next = merged.findIndex((later, laterIndex) => laterIndex > index && later.role === 'user');
            const turn = merged.slice(index + 1, next < 0 ? merged.length : next);
            return turn.some(entry => entry.role === 'tool') && !turn.some(entry => entry.role === 'assistant');
          });
        }
        if (userIndex < 0) { merged.push(message); continue; }
        const user = merged[userIndex];
        message.afterUser = { id: user.id, text: user.text,
          occurrence: merged.slice(0, userIndex).filter(item => item.role === 'user' && item.text === user.text).length };
        const nextUser = merged.findIndex((item, index) => index > userIndex && item.role === 'user');
        merged.splice(nextUser < 0 ? merged.length : nextUser, 0, message);
      }
      state.messages = merged;
      // History cannot tell us whether an interrupted tool has been approved.
      // Preserve pending, uncertain, and diagnostic state exactly as it is.
      historyNotice = '';
      persist();
      renderChat();
    } catch (error) {
      if (!current()) return;
      historyNotice = 'Chat history could not be refreshed. ' + error.message;
      renderChat();
    }
  }

  /* ---------------- Authentication Modal & UI ---------------- */
  let authPending = false;
  let authReturnFocus;
  function extractError(data, fallback = 'Operation failed') {
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail)) return data.detail.map(item => item.msg).join('; ');
    return data?.message || fallback;
  }
  async function authRequest(path, body) {
    const res = await fetch(base + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30000)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(extractError(data, 'Unable to continue. Please try again.'));
    return data;
  }
  async function performLogin(email, password, displayName = email) {
    const data = await authRequest('/login', { email, password });
    if (typeof data.access_token !== 'string' || !data.access_token.trim()) throw new Error('Sign-in returned no session. Please try again.');
    saveAuth({ access_token: data.access_token, refresh_token: data.refresh_token,
      username: data.user?.username || displayName, email: data.user?.email || email });
  }
  function buildAuthModal() {
    const modal = node('div', undefined, 'auth-modal-backdrop');
    modal.id = 'auth-modal'; modal.hidden = true;
    modal.innerHTML = `
      <section class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" aria-describedby="auth-description" tabindex="-1">
        <div class="auth-card-header">
          <div><span class="auth-eyebrow">YOUR MONEY, IN VIEW</span><h2 id="auth-modal-title">Welcome back.</h2><p id="auth-description">A little clarity for your everyday spending.</p></div>
          <button type="button" class="button secondary small close-modal" aria-label="Close sign-in">✕</button>
        </div>
        <div class="auth-tabs" aria-label="Account access">
          <button type="button" class="auth-tab active" data-tab="login" aria-pressed="true">Sign in</button>
          <button type="button" class="auth-tab" data-tab="signup" aria-pressed="false">Create account</button>
        </div>
        <div class="auth-body">
          <p id="auth-error" class="auth-error" role="alert" hidden></p>
          <form id="auth-login-form" class="auth-form">
            <label>Email address<input type="email" id="login-email" autocomplete="username" required placeholder="you@example.com"></label>
            <label>Password<input type="password" id="login-password" autocomplete="current-password" required placeholder="Enter your password"></label>
            <button type="submit" class="button primary">Sign in →</button>
          </form>
          <form id="auth-signup-form" class="auth-form" hidden>
            <label>Your name<input id="signup-username" autocomplete="nickname" required placeholder="How should we call you?"></label>
            <label>Email address<input type="email" id="signup-email" autocomplete="email" required placeholder="you@example.com"></label>
            <label>Password<input type="password" id="signup-password" autocomplete="new-password" required placeholder="Create a password"></label>
            <button type="submit" class="button primary">Create account →</button>
          </form>
          <p class="auth-footnote">Your expenses. Your own space.</p>
        </div>
      </section>`;
    document.body.append(modal);
    modal.querySelectorAll('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
      modal.querySelectorAll('.auth-tab').forEach(t => { t.classList.toggle('active', t === tab); t.setAttribute('aria-pressed', String(t === tab)); });
      const signup = tab.dataset.tab === 'signup';
      $('#auth-login-form').hidden = signup; $('#auth-signup-form').hidden = !signup;
      $('#auth-modal-title').textContent = signup ? 'Make room for clarity.' : 'Welcome back.';
      $('#auth-error').hidden = true;
      modal.querySelector('form:not([hidden]) input').focus();
    }));
    modal.querySelector('.close-modal').addEventListener('click', closeAuthModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeAuthModal(); });
    modal.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAuthModal();
      if (e.key !== 'Tab') return;
      const items = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled)')].filter(el => el.getClientRects().length);
      if (!items.length) { e.preventDefault(); return; }
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0].focus(); }
    });
    for (const mode of ['login', 'signup']) {
      $('#auth-' + mode + '-form').addEventListener('submit', async e => {
        e.preventDefault(); if (authPending) return;
        const form = e.currentTarget, error = $('#auth-error');
        const email = $('#' + mode + '-email').value.trim();
        const password = $('#' + mode + '-password').value;
        const username = mode === 'signup' ? $('#signup-username').value.trim() : email;
        error.hidden = true;
        if (!username) { error.textContent = 'Enter your name.'; error.hidden = false; return; }
        authPending = true; let created = false, success = false;
        const submit = form.querySelector('[type=submit]'), label = submit.textContent;
        submit.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
        modal.setAttribute('aria-busy', 'true');
        modal.querySelectorAll('button, input').forEach(el => el.disabled = true);
        modal.querySelector('.auth-card').focus();
        try {
          if (mode === 'signup') { await authRequest('/signup', { username, email, password }); created = true; }
          await performLogin(email, password, username); success = true;
        } catch (err) {
          error.textContent = (created ? 'Account created. Sign in to continue. ' : '') + (err.name === 'TimeoutError' ? 'The server took too long to respond.' : err.message);
          error.hidden = false;
        } finally {
          authPending = false; modal.removeAttribute('aria-busy');
          modal.querySelectorAll('button, input').forEach(el => el.disabled = false);
          submit.textContent = label;
        }
        if (success) { form.reset(); closeAuthModal(); loadExpenses(); loadMessages(); }
        else if (created) {
          modal.querySelector('[data-tab=login]').click();
          $('#login-email').value = email;
          error.hidden = false;
        } else form.querySelector('input').focus();
      });
    }
  }
  function openAuthModal(notice) {
    const modal = $('#auth-modal');
    if (!modal.hidden) return;
    authReturnFocus = document.activeElement;
    $('#auth-error').textContent = notice || ''; $('#auth-error').hidden = !notice;
    modal.hidden = false; document.body.classList.add('auth-open');
    modal.querySelector('form:not([hidden]) input').focus();
  }
  function closeAuthModal() {
    if (authPending) return;
    $('#auth-modal').hidden = true; document.body.classList.remove('auth-open');
    $('#auth-modal').querySelectorAll('input[type=password]').forEach(input => input.value = '');
    authReturnFocus?.focus();
  }
  function updateAuthUI() {
    const bar = $('#topbar-auth');
    if (bar) {
      bar.replaceChildren();
      const button = node('button', auth?.access_token ? 'Sign out' : 'Sign in', 'button primary small');
      button.type = 'button';
      button.addEventListener('click', () => {
        if (auth?.access_token) { clearAuth(); loadExpenses(); } else openAuthModal();
      });
      bar.append(button);
    }
    const profile = $('.profile');
    if (profile) {
      profile.hidden = !auth?.access_token;
      profile.querySelector('strong').textContent = auth?.username || auth?.email || '';
      profile.querySelector('small').textContent = auth?.email || '';
      profile.querySelector('.avatar').textContent = (auth?.username || auth?.email || '').slice(0, 1).toUpperCase();
    }
  }
  if ($('#api-url')) {
    $('#api-url').value = base;
    $('#connection-form').addEventListener('submit', async event => {
      event.preventDefault(); if (busy || authPending) return;
      let url;
      try {
        url = new URL($('#api-url').value.trim());
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
      } catch { $('#connection-status').textContent = 'Enter a valid HTTP or HTTPS backend URL.'; return; }
      const next = url.href.replace(/\/$/, '');
      if (next !== base) {
        if ((state.messages.length || state.pending) && !confirm('Changing the API resets the current chat. Continue?')) return;
        clearAuth(); base = next; save('expense-api', base);
      }
      await checkConnection(); await loadExpenses(); await loadMessages();
    });
  }
  if ($('#refresh-expenses')) $('#refresh-expenses').addEventListener('click', loadExpenses);
  window.addEventListener('pageshow', event => { if (event.persisted) { loadExpenses(); loadMessages(); } });
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage || (event.key !== AUTH_KEY && event.key !== null)) return;
    const next = readAuth();
    const sameSession = auth?.refresh_token && auth.refresh_token === next?.refresh_token;
    auth = next;
    if (!sameSession) {
      historyVersion++;
      state = fresh();
      persist();
      renderChat();
    }
    updateAuthUI();
    if (!sameSession) { loadExpenses(); loadMessages(); }
  });
  buildAuthModal(); updateAuthUI(); checkConnection(); loadExpenses(); loadMessages();
})();
