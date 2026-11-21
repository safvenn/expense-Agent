/* Response validation is shared by the browser and frontend regression tests. */
(function (root) {
  'use strict';
  function parseChatResponse(data) {
    // Some API deployments serialize the response object as a JSON string.
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { throw new Error('Expected a chat response object, received text.'); }
    }
    // Detach bridged/proxied values and boxed strings into ordinary JSON values.
    if (data && typeof data === 'object') data = JSON.parse(JSON.stringify(data));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected a chat response object.');

    // Normalize interrupt fields from backend variations (e.g. Toll_Request schema or legacy spellings)
    const permissions = data.allowed_decisions ?? data.allowed_decitions;
    const name = data.name ?? data.Tool_name ?? data.tool_name;
    const id = data.id ?? data.interrupt_id ?? data.intterupt_id;
    let args = data.args;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { /* keep args */ }
    }

    if (typeof name === 'string' && name.trim() &&
        args && typeof args === 'object' &&
        permissions && typeof permissions === 'object') {
      // Validate the actual values instead of relying on the array brand of
      // objects received through a browser bridge. Never invent permissions.
      const decisions = Object.values(permissions);
      if (decisions.length && decisions.every(value =>
          value === 'approve' || value === 'edit' || value === 'reject')) {
        return { pending: {
          id: id, name: name, args: args,
          description: data.description,
          allowed_decisions: [...new Set(decisions)]
        } };
      }
    }

    // Direct string content
    if (typeof data.content === 'string') return { text: data.content || 'The assistant returned an empty reply.' };

    // Array of blocks
    if (Array.isArray(data.content)) {
      const text = data.content.map(block => typeof block === 'string' ? block : (typeof block?.text === 'string' ? block.text : '')).filter(Boolean).join('\n');
      if (text) return { text };
    }

    // Nested object content (e.g. { content: { content: "..." } } or { content: { assistant_response: "..." } } or { content: { message: "..." } })
    if (data.content && typeof data.content === 'object') {
      const inner = data.content;
      if (typeof inner.content === 'string') return { text: inner.content || 'Action processed.' };
      if (typeof inner.assistant_response === 'string') return { text: inner.assistant_response };
      if (typeof inner.message === 'string') return { text: inner.message };
      if (typeof inner.text === 'string') return { text: inner.text };
      if (Array.isArray(inner.content)) {
        const text = inner.content.map(block => typeof block === 'string' ? block : (typeof block?.text === 'string' ? block.text : '')).filter(Boolean).join('\n');
        if (text) return { text };
      }
      if (Array.isArray(inner.assistant_response)) {
        const text = inner.assistant_response.map(block => typeof block === 'string' ? block : (typeof block?.text === 'string' ? block.text : '')).filter(Boolean).join('\n');
        if (text) return { text };
      }
    }

    // Top-level message, text, or assistant_response
    if (typeof data.message === 'string') return { text: data.message };
    if (typeof data.text === 'string') return { text: data.text };
    if (typeof data.assistant_response === 'string') return { text: data.assistant_response };

    // Status object fallback
    if (data.status === 'success' || data.success === true) {
      return { text: typeof data.message === 'string' ? data.message : 'Action processed successfully.' };
    }

    throw new Error('Unable to read response (parser 6). Fields: ' + (Object.keys(data).join(', ') || '(empty object)') + '. Types: name=' + typeof data.name + ', args=' + typeof data.args + ', decisions=' + typeof data.allowed_decisions + '; decisions value=' + JSON.stringify(data.allowed_decisions));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = parseChatResponse;
  else root.parseChatResponse = parseChatResponse;
})(globalThis);
