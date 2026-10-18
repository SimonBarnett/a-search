'use strict';

/**
 * MRB #1896 docs/hostile: FR-221 self-config embed snippet.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { buildEmbedSnippet } = require('../shared/widgets/snippet');
const { resolvePlacement } = require('../shared/widgets/placement');

describe('MRB #1896 hostile FR-221 self-config snippet', () => {
  it('Decision LOCKED; snippet has no host; runtime uses location.host', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-221.md'), 'utf8');
    assert.match(fr, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr, /location\.host/);
    assert.match(fr, /data-widget-guid/);

    const guid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const snip = buildEmbedSnippet({ widgetGuid: guid, layout: 'horizontal' });
    assert.match(snip, /data-widget-guid=/);
    assert.match(snip, /data-mode=/);
    assert.doesNotMatch(snip, /data-host=/);
    assert.doesNotMatch(snip, /[?&]host=/);

    const placement = resolvePlacement({
      location: { host: 'club.example', pathname: '/page' },
      element: {
        getAttribute: (n) =>
          n === 'data-widget-guid' ? guid : n === 'data-mode' ? 'vertical' : null,
      },
    });
    assert.equal(placement.host, 'club.example');
    assert.equal(placement.widgetGuid, guid);
    assert.equal(placement.layout, 'vertical');
    assert.equal(placement.pathname, '/page');

    assert.ok(
      fs.existsSync(path.join(ROOT, 'docs', 'components-piece-embed.md')),
    );
    assert.ok(fs.existsSync(path.join(ROOT, 'widget', 'a-search-widget.js')));
  });
});
