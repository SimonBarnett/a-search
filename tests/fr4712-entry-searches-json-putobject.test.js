'use strict';

/**
 * FR #4712: entry/POST /search AccessDenied on s3:PutObject for searches.json.
 * FR #4563 syncSearchesSearchid PutObjects host/guid/searches.json after fan-out,
 * but AgentSearchFanoutMarker only allowed search-fanout.json. Entry needs
 * PutObject (Get already via grantRead) on searches.json too.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');

describe('FR #4712 entry PutObject searches.json IAM', () => {
  it('AgentSearchFanoutMarker allows PutObject on searches.json as well as search-fanout.json', () => {
    const src = fs.readFileSync(STACK, 'utf8');
    const sid = src.indexOf("sid: 'AgentSearchFanoutMarker'");
    assert.ok(sid >= 0, 'AgentSearchFanoutMarker missing');
    const block = src.slice(sid, sid + 500);
    assert.match(block, /s3:PutObject/);
    assert.match(block, /s3:GetObject/);
    assert.match(
      block,
      /arn:aws:s3:::a-clubs\/\*\/\*\/search-fanout\.json/,
    );
    assert.match(
      block,
      /arn:aws:s3:::a-clubs\/\*\/\*\/searches\.json/,
      'FR #4712: entry must PutObject searches.json (syncSearchesSearchid)',
    );
  });

  it('agentSearch still syncs searches.json searchid after fan-out write', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'agentSearch.js'),
      'utf8',
    );
    assert.match(src, /async function syncSearchesSearchid/);
    assert.match(src, /searches\.json/);
    assert.match(src, /doc\.searchid/);
  });
});
