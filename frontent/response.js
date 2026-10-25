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
    // The running API also uses the legacy spelling allowed_decitions.
    const permissions = data.allowed_decisions ?? data.allowed_decitions;
    if (typeof data.name === 'string' && data.name.trim() &&
        data.args && typeof data.args === 'object' &&
        permissions && typeof permissions === 'object') {
      // Validate the actual values instead of relying on the array brand of
      // objects received through a browser bridge. Never invent permissions.
      const decisions = Object.values(permissions);
      if (decisions.length && decisions.every(value =>
          value === 'approve' || value === 'edit' || value === 'reject')) {
        return { pending: {
          id: data.id, name: data.name, args: data.args,
          description: data.description,
          allowed_decisions: [...new Set(decisions)]
        } };
      }
    }
    if (typeof data.content === 'string') return { text: data.content || 'The assistant returned an empty reply.' };
    if (Array.isArray(data.content)) {
      const text = data.content.map(block => typeof block === 'string' ? block : (typeof block?.text === 'string' ? block.text : '')).filter(Boolean).join('\n');
      if (text) return { text };
    }
    throw new Error('Unable to read response (parser 6). Fields: ' + (Object.keys(data).join(', ') || '(empty object)') + '. Types: name=' + typeof data.name + ', args=' + typeof data.args + ', decisions=' + typeof data.allowed_decisions + '; decisions value=' + JSON.stringify(data.allowed_decisions));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = parseChatResponse;
  else root.parseChatResponse = parseChatResponse;
})(globalThis);
