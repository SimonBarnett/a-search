'use strict';

/**
 * FR #4931: shared defaultage resolver + runDaily uses lastdownload clock;
 * refreshdays retired from the affiliates path.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseDefaultAge,
  resolveDefaultAge,
  isDueByLastDownload,
  NeedsDefaultAgeError,
} = require('../shared/defaultAge');
const { runDaily } = require('../affiliates/src/runDaily');
const { PROVIDER_KEYS, AFFILIATE_KEYS } = require('../shared/affiliates/metadata');
const feedFormat = require('../shared/affiliates/feedFormat');

const NOW = new Date('2026-10-25T12:00:00.000Z');

describe('FR #4931 shared defaultAge', () => {
  it('parseDefaultAge accepts only positive integers', () => {
    assert.equal(parseDefaultAge('6'), 6);
    assert.equal(parseDefaultAge(' 7 '), 7);
    assert.equal(parseDefaultAge('0'), null);
    assert.equal(parseDefaultAge('-1'), null);
    assert.equal(parseDefaultAge('7.5'), null);
    assert.equal(parseDefaultAge('abc'), null);
    assert.equal(parseDefaultAge(''), null);
    assert.equal(parseDefaultAge(undefined), null);
  });

  it('merchant tier wins over provider and root', () => {
    assert.equal(
      resolveDefaultAge({
        affiliateMeta: { defaultage: '3' },
        providerMeta: { defaultage: '5' },
        rootMeta: { defaultage: '9' },
      }),
      3,
    );
  });

  it('provider wins when merchant invalid or missing', () => {
    assert.equal(
      resolveDefaultAge({
        affiliateMeta: { defaultage: '0' },
        providerMeta: { defaultage: '5' },
        rootMeta: { defaultage: '9' },
      }),
      5,
    );
    assert.equal(
      resolveDefaultAge({
        affiliateMeta: {},
        providerMeta: { defaultage: '4' },
        rootMeta: { defaultage: '9' },
      }),
      4,
    );
  });

  it('root wins when merchant and provider missing/invalid', () => {
    assert.equal(
      resolveDefaultAge({
        affiliateMeta: { defaultage: 'nope' },
        providerMeta: { defaultage: '-2' },
        rootMeta: { defaultage: '6' },
      }),
      6,
    );
  });

  it('throws needs_defaultage when nothing set', () => {
    assert.throws(
      () =>
        resolveDefaultAge({
          affiliateMeta: {},
          providerMeta: {},
          rootMeta: {},
        }),
      (err) => err && err.code === 'needs_defaultage',
    );
    assert.throws(
      () => resolveDefaultAge({}),
      NeedsDefaultAgeError,
    );
  });

  it('isDueByLastDownload: empty or unparseable lastdownload is due', () => {
    assert.equal(isDueByLastDownload({}, NOW, 6), true);
    assert.equal(isDueByLastDownload({ lastdownload: '' }, NOW, 6), true);
    assert.equal(
      isDueByLastDownload({ lastdownload: 'not-a-date' }, NOW, 6),
      true,
    );
  });

  it('isDueByLastDownload: age in UTC days vs defaultage', () => {
    assert.equal(
      isDueByLastDownload(
        { lastdownload: '2026-10-20T12:00:00.000Z' },
        NOW,
        6,
      ),
      false,
    );
    assert.equal(
      isDueByLastDownload(
        { lastdownload: '2026-10-19T12:00:00.000Z' },
        NOW,
        6,
      ),
      true,
    );
    // lastok alone must not keep it fresh (FR #4931 clock is lastdownload).
    assert.equal(
      isDueByLastDownload(
        {
          lastok: '2026-10-24T12:00:00.000Z',
          lastdownload: '2026-10-01T12:00:00.000Z',
        },
        NOW,
        6,
      ),
      true,
    );
  });
});

describe('FR #4931 refreshdays retired from affiliates path', () => {
  it('feedFormat no longer exports refreshDaysFromMeta / needsRefresh', () => {
    assert.equal(typeof feedFormat.refreshDaysFromMeta, 'undefined');
    assert.equal(typeof feedFormat.needsRefresh, 'undefined');
  });

  it('PROVIDER_KEYS lists defaultage and not refreshdays', () => {
    assert.ok(PROVIDER_KEYS.includes('defaultage'));
    assert.ok(!PROVIDER_KEYS.includes('refreshdays'));
    assert.ok(AFFILIATE_KEYS.includes('defaultage'));
    assert.ok(AFFILIATE_KEYS.includes('lastdownload'));
  });

  it('docs and stack comment mention defaultage not refreshdays schedule', () => {
    const doc = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'a-affiliates.md'),
      'utf8',
    );
    assert.match(doc, /defaultage/i);
    assert.match(doc, /lastdownload/);
    assert.match(doc, /_root\//);
    assert.doesNotMatch(doc, /Days before re-download \(default `7`\)/);
    const stack = fs.readFileSync(
      path.join(__dirname, '..', 'cdk', 'lib', 'affiliates-stack.js'),
      'utf8',
    );
    assert.match(stack, /defaultage/i);
    assert.doesNotMatch(stack, /fresher than refreshdays/);
  });

  it('affiliates path source does not read refreshdays for schedule', () => {
    const roots = [
      path.join(__dirname, '..', 'affiliates', 'src', 'runDaily.js'),
      path.join(__dirname, '..', 'shared', 'affiliates', 'feedFormat.js'),
      path.join(__dirname, '..', 'shared', 'affiliates', 'metadata.js'),
    ];
    for (const f of roots) {
      const src = fs.readFileSync(f, 'utf8');
      assert.doesNotMatch(
        src,
        /refreshDaysFromMeta|needsRefresh\s*\(|m\.refreshdays|refreshdaysFromMeta/,
      );
    }
  });
});

describe('FR #4931 runDaily wiring', () => {
  /** @type {Map<string, { Metadata: Record<string, string> }>} */
  let objects;

  function memoryS3() {
    return {
      listObjectsV2: async ({ Prefix, Delimiter }) => {
        const keys = [...objects.keys()];
        if (!Prefix && Delimiter === '/') {
          const prefixes = new Set();
          const contents = [];
          for (const k of keys) {
            const m = /^([^/]+)\/$/.exec(k);
            if (m) {
              prefixes.add(m[1] + '/');
              contents.push({ Key: k });
            }
          }
          return {
            CommonPrefixes: [...prefixes].map((p) => ({ Prefix: p })),
            Contents: contents,
            IsTruncated: false,
          };
        }
        if (Prefix && Delimiter === '/') {
          const re = new RegExp(
            `^${Prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^/]+)/$`,
          );
          const prefixes = [];
          const contents = [];
          for (const k of keys) {
            const m = re.exec(k);
            if (m) {
              prefixes.push({ Prefix: k });
              contents.push({ Key: k });
            }
          }
          return {
            CommonPrefixes: prefixes,
            Contents: contents,
            IsTruncated: false,
          };
        }
        return { CommonPrefixes: [], Contents: [], IsTruncated: false };
      },
      headObject: async ({ Key }) => {
        const o = objects.get(Key);
        if (!o) {
          const err = new Error('NoSuchKey');
          err.name = 'NotFound';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return { Metadata: { ...o.Metadata } };
      },
    };
  }

  beforeEach(() => {
    objects = new Map();
  });

  it('skips _root as a provider and uses root defaultage', async () => {
    objects.set('_root/', { Metadata: { defaultage: '6' } });
    objects.set('awin/', { Metadata: { enabled: '1', name: 'Awin' } });
    objects.set('awin/mid1/', {
      Metadata: {
        enabled: '1',
        affiliateid: 'mid1',
        lastdownload: '2026-10-24T12:00:00.000Z',
      },
    });
    const downloads = [];
    const summary = await runDaily({
      s3: memoryS3(),
      bucket: 'a-affiliates',
      now: NOW,
      log: () => {},
      downloadOne: async (args) => {
        downloads.push(args);
        return { ok: true, status: 'ok', provider: args.provider, affiliateId: args.affiliateId };
      },
    });
    assert.equal(downloads.length, 0);
    assert.equal(summary.skippedFresh, 1);
    assert.ok(!summary.results.some((r) => r.provider === '_root'));
  });

  it('merchant defaultage=1 makes yesterday due; provider ignored', async () => {
    objects.set('_root/', { Metadata: { defaultage: '30' } });
    objects.set('awin/', { Metadata: { enabled: '1', defaultage: '30' } });
    objects.set('awin/mid1/', {
      Metadata: {
        enabled: '1',
        defaultage: '1',
        lastdownload: '2026-10-24T12:00:00.000Z',
      },
    });
    const downloads = [];
    await runDaily({
      s3: memoryS3(),
      bucket: 'a-affiliates',
      now: NOW,
      log: () => {},
      downloadOne: async (args) => {
        downloads.push(args.affiliateId);
        return { ok: true, status: 'ok', provider: 'awin', affiliateId: args.affiliateId };
      },
    });
    assert.deepEqual(downloads, ['mid1']);
  });

  it('fails with needs_defaultage when no tier set', async () => {
    objects.set('awin/', { Metadata: { enabled: '1' } });
    objects.set('awin/mid1/', {
      Metadata: { enabled: '1', lastdownload: '' },
    });
    await assert.rejects(
      () =>
        runDaily({
          s3: memoryS3(),
          bucket: 'a-affiliates',
          now: NOW,
          log: () => {},
          downloadOne: async () => ({ ok: true, status: 'ok' }),
        }),
      (err) => err && err.code === 'needs_defaultage',
    );
  });

  it('empty lastdownload is due when defaultage present', async () => {
    objects.set('_root/', { Metadata: { defaultage: '6' } });
    objects.set('awin/', { Metadata: { enabled: '1' } });
    objects.set('awin/mid1/', {
      Metadata: { enabled: '1', lastdownload: '' },
    });
    const downloads = [];
    await runDaily({
      s3: memoryS3(),
      bucket: 'a-affiliates',
      now: NOW,
      log: () => {},
      downloadOne: async (args) => {
        downloads.push(args.affiliateId);
        return { ok: true, status: 'ok', provider: 'awin', affiliateId: 'mid1' };
      },
    });
    assert.deepEqual(downloads, ['mid1']);
  });
});
