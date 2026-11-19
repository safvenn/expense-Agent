const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const htmlFiles = ['index.html', 'expenses.html', 'expense-assistant.html', 'expense-list.html'];
const cssSource = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');

test('all HTML entrypoints include viewport-fit=cover for mobile display notches', () => {
  for (const file of htmlFiles) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.match(
      content,
      /<meta\s+name=["']viewport["']\s+content=["'][^"']*viewport-fit=cover[^"']*["']>/i,
      `${file} must include viewport-fit=cover in its viewport meta tag`
    );
  }
});

test('all HTML entrypoints use consistent asset cache-busting queries', () => {
  for (const file of htmlFiles) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.match(content, /style\.css\?v=mic-1/, `${file} must reference style.css?v=mic-1`);
    assert.match(content, /app\.js\?v=mic-1/, `${file} must reference app.js?v=mic-1`);
  }
});

test('styles.css supports safe-area insets and progressive dynamic viewport units (vh then dvh)', () => {
  assert.match(
    cssSource,
    /env\(safe-area-inset-bottom/i,
    'styles.css must reference env(safe-area-inset-bottom) for mobile home indicators'
  );
  assert.match(
    cssSource,
    /100dvh/i,
    'styles.css must use 100dvh for dynamic mobile viewport height'
  );
  // Ensure dvh follows vh so modern browsers use dvh progressively
  assert.match(
    cssSource,
    /max-height:\s*calc\(100vh[^;]+;\s*max-height:\s*calc\(100dvh/i,
    'styles.css must declare vh fallback before dvh progressive enhancement'
  );
});

test('styles.css preserves safe-area insets on small screens (<= 380px)', () => {
  assert.match(
    cssSource,
    /max\(12px,\s*env\(safe-area-inset-left,\s*12px\)\)/i,
    'styles.css must clamp safe-area-inset-left in small screen media query'
  );
});

test('styles.css focus rings comply with WCAG 2.2 AA non-text contrast standard', () => {
  // Focus outline should use var(--green) with 4.5:1+ contrast against white
  assert.match(
    cssSource,
    /:focus-visible[^{]*\{[^}]*outline:\s*3px\s+solid\s+var\(--green\)/i,
    'styles.css must use high-contrast var(--green) for visible focus indicators'
  );
});

test('styles.css prevents iOS Safari auto-zoom on inputs and textareas on mobile', () => {
  const hasInputPrevention = /(?:input|textarea)[^{]*\{[^}]*font-size:\s*16px\s*!important/i.test(cssSource);
  assert.ok(
    hasInputPrevention,
    'styles.css must set input and textarea font-size to >= 16px on mobile to avoid iOS Safari zoom'
  );
});

test('styles.css enforces 44x44px touch targets for mobile interactive controls', () => {
  assert.match(cssSource, /\.mic-button\s*\{[^}]*min-height:\s*44px/i);
  assert.match(cssSource, /\.send-button\s*\{[^}]*min-height:\s*44px/i);
  assert.match(cssSource, /\.prompt-chip\s*\{[^}]*min-height:\s*44px/i);
  assert.match(cssSource, /\.chip-btn\s*\{[^}]*min-height:\s*44px/i);
  assert.match(cssSource, /\.auth-tab\s*\{[^}]*min-height:\s*44px/i);
});
