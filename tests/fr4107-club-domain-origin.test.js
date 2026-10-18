'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  mintChecksummedUserId,
} = require('../shared/identity/madeiraUserId');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { pagePartsAclubs } = require('../parts-gateway/src/pageParts');
const { handlePartsGateway } = require('../parts-gateway/src/handler');
const {
  requireHostFromOrigin,
  resolveClubDomainFromOrigin,
  encodeWixFilesusrLabel,
  decodeWixFilesusrLabelNaive,
  isEmbedFrameHost,
  hostFromOriginHeader,
} = require('../parts-gateway/src/originHost');
const {
  EMBED_HOST_PATTERNS,
  matchEmbedPatternId,
} = require('../parts-gateway/src/embedHostPatterns');
const { hostMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const {
  buildPartsUrl,
  resolveParentOrigin,
} = require('../widget/a-search-widget');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ROOT = path.join(__dirname, '..');
const WIX_FRAME = 'https://www-mymodelflyingclub-co-uk.filesusr.com';
const CLUB = 'www.mymodelflyingclub.co.uk';

function mintFixed(bytes) {
  return () =>
    mintChecksummedUserId({
      randomBytes: () => Buffer.from(bytes),
    });
}

describe('FR #4107 embed host patterns', () => {
  it('lists filesusr.com and matches Wix frame hosts', () => {
    assert.ok(EMBED_HOST_PATTERNS.length >= 1);
    assert.equal(matchEmbedPatternId('www-mymodelflyingclub-co-uk.filesusr.com'), 'wix-filesusr');
    assert.equal(isEmbedFrameHost('www-mymodelflyingclub-co-uk.filesusr.com'), true);
    assert.equal(isEmbedFrameHost(CLUB), false);
    assert.equal(isEmbedFrameHost('shop.example.com'), false);
  });
});

describe('FR #4107 Wix filesusr encode/decode', () => {
  it('encode replaces dots with hyphens (vendor docs + live sample)', () => {
    assert.equal(encodeWixFilesusrLabel(CLUB), 'www-mymodelflyingclub-co-uk');
    assert.equal(encodeWixFilesusrLabel('www.example.com'), 'www-example-com');
  });

  it('naive decode is inverse for domains without literal hyphens', () => {
    assert.equal(
      decodeWixFilesusrLabelNaive('www-mymodelflyingclub-co-uk'),
      CLUB,
    );
    assert.equal(decodeWixFilesusrLabelNaive('www-example-com'), 'www.example.com');
  });

  it('literal hyphens in club domain are lossy: parent Origin required', () => {
    // my-club.example.com encodes to my-club-example-com; naive decode is wrong
    const hyphenClub = 'my-club.example.com';
    const label = encodeWixFilesusrLabel(hyphenClub);
    assert.equal(label, 'my-club-example-com');
    assert.equal(decodeWixFilesusrLabelNaive(label), 'my.club.example.com');
    assert.notEqual(decodeWixFilesusrLabelNaive(label), hyphenClub);
  });
});

describe('FR #4107 resolve club domain from Origin', () => {
  it('Wix frame Origin alone resolves to club domain', () => {
    assert.deepEqual(requireHostFromOrigin(WIX_FRAME), {
      ok: true,
      host: CLUB,
    });
  });

  it('consistent X-Parent-Origin wins (literal hyphen club)', () => {
    const hyphenClub = 'my-club.example.com';
    const frame = 'https://' + encodeWixFilesusrLabel(hyphenClub) + '.filesusr.com';
    assert.deepEqual(
      resolveClubDomainFromOrigin({
        origin: frame,
        parentOrigin: 'https://' + hyphenClub,
      }),
      { ok: true, host: hyphenClub },
    );
  });

  it('inconsistent parent Origin => club_domain_unresolved', () => {
    assert.deepEqual(
      resolveClubDomainFromOrigin({
        origin: WIX_FRAME,
        parentOrigin: 'https://other.example.com',
      }),
      { ok: false, code: 'club_domain_unresolved' },
    );
  });

  it('malformed / undecodable filesusr label => club_domain_unresolved', () => {
    assert.deepEqual(requireHostFromOrigin('https://sandbox.filesusr.com'), {
      ok: false,
      code: 'club_domain_unresolved',
    });
    assert.deepEqual(requireHostFromOrigin('https://filesusr.com'), {
      ok: false,
      code: 'club_domain_unresolved',
    });
  });

  it('normal club Origin unchanged', () => {
    assert.deepEqual(requireHostFromOrigin('https://Shop.Example.com'), {
      ok: true,
      host: 'shop.example.com',
    });
  });

  it('missing Origin still origin_required', () => {
    assert.deepEqual(requireHostFromOrigin(undefined), {
      ok: false,
      code: 'origin_required',
    });
  });

  it('parent that is itself an embed host is refused', () => {
    assert.deepEqual(
      resolveClubDomainFromOrigin({
        origin: WIX_FRAME,
        parentOrigin: 'https://evil.filesusr.com',
      }),
      { ok: false, code: 'club_domain_unresolved' },
    );
  });
});

describe('FR #4107 pageParts + handler: club folder, never embed folder', () => {
  it('Wix frame Origin creates club-domain host folder (not filesusr)', async () => {
    const s3 = createMemoryS3();
    const page = await pagePartsAclubs({
      origin: WIX_FRAME,
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
      mint: mintFixed([4, 1, 0, 7, 4, 1, 0]),
    });
    assert.equal(page.init, 0);
    assert.ok(s3.objects.has(hostMarkerKey(CLUB)));
    assert.equal(
      s3.objects.has(hostMarkerKey('www-mymodelflyingclub-co-uk.filesusr.com')),
      false,
    );
  });

  it('ambiguous embed returns 400 and creates nothing', async () => {
    const s3 = createMemoryS3();
    const queue = { messages: [], sendMessage: async (m) => { queue.messages.push(m); } };
    const res = await handlePartsGateway(
      {
        queryStringParameters: { widgetGuid: GUID },
        headers: {
          origin: 'https://sandbox.filesusr.com',
        },
      },
      {
        ...s3,
        sendMessage: queue.sendMessage,
        folderEventsQueueUrl: 'https://sqs.example/q.fifo',
        mint: mintFixed([9, 9, 9, 9, 9, 9, 9]),
      },
    );
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error, 'club_domain_unresolved');
    assert.equal(s3.objects.size, 0);
    assert.equal(queue.messages.length, 0);
  });

  it('inconsistent parent creates nothing', async () => {
    const s3 = createMemoryS3();
    const res = await handlePartsGateway(
      {
        queryStringParameters: { widgetGuid: GUID, host: 'evil.example.com' },
        headers: {
          origin: WIX_FRAME,
          'x-parent-origin': 'https://evil.example.com',
        },
      },
      {
        ...s3,
        mint: mintFixed([1, 2, 3, 4, 5, 6, 7]),
      },
    );
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error, 'club_domain_unresolved');
    assert.equal(s3.objects.size, 0);
  });

  it('?host= still ignored; Wix Origin wins', async () => {
    const s3 = createMemoryS3();
    const res = await handlePartsGateway(
      {
        queryStringParameters: {
          widgetGuid: GUID,
          host: 'spoof.example.com',
        },
        headers: { origin: WIX_FRAME },
      },
      {
        ...s3,
        mint: mintFixed([2, 2, 2, 2, 2, 2, 2]),
      },
    );
    assert.equal(res.statusCode, 200);
    assert.ok(s3.objects.has(hostMarkerKey(CLUB)));
    assert.equal(s3.objects.has(hostMarkerKey('spoof.example.com')), false);
    assert.equal(
      s3.objects.has(hostMarkerKey('www-mymodelflyingclub-co-uk.filesusr.com')),
      false,
    );
  });

  it('embed-pattern guard: resolved host is never an embed frame', () => {
    const r = requireHostFromOrigin(WIX_FRAME);
    assert.equal(r.ok, true);
    assert.equal(isEmbedFrameHost(r.host), false);
  });

  it('normal Origin still creates that host folder', async () => {
    const s3 = createMemoryS3();
    await pagePartsAclubs({
      origin: 'https://club.example.com',
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      mint: mintFixed([3, 3, 3, 3, 3, 3, 3]),
    });
    assert.ok(s3.objects.has(hostMarkerKey('club.example.com')));
  });
});

describe('FR #4107 widget parent Origin', () => {
  it('buildPartsUrl still omits ?host=', () => {
    const url = buildPartsUrl('https://api.example', {
      widgetGuid: GUID,
      offset: 0,
      n: 10,
    });
    assert.equal(url.includes('host='), false);
    assert.match(url, /widgetGuid=/);
  });

  it('resolveParentOrigin prefers ancestorOrigins then referrer', () => {
    assert.equal(
      resolveParentOrigin({
        location: { ancestorOrigins: ['https://www.mymodelflyingclub.co.uk'] },
      }),
      'https://www.mymodelflyingclub.co.uk',
    );
    assert.equal(
      resolveParentOrigin({
        location: { ancestorOrigins: [] },
        document: { referrer: 'https://www.mymodelflyingclub.co.uk/page' },
      }),
      'https://www.mymodelflyingclub.co.uk',
    );
  });

  it('fetchPartsPage sends X-Parent-Origin header', async () => {
    /** @type {{ url: string, init: object }[]} */
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ parts: [], init: 0, layout: 'horizontal' }),
      };
    };
    const { fetchPartsPage } = require('../widget/a-search-widget');
    await fetchPartsPage({
      fetch: fetchFn,
      apiBase: 'https://api.example',
      widgetGuid: GUID,
      parentOrigin: 'https://www.mymodelflyingclub.co.uk',
    });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].init.headers['X-Parent-Origin'],
      'https://www.mymodelflyingclub.co.uk',
    );
    assert.equal(String(calls[0].url).includes('host='), false);
  });
});

describe('FR #4107 docs', () => {
  it('gateway README covers club-domain resolution and X-Parent-Origin', () => {
    const readme = fs.readFileSync(
      path.join(ROOT, 'cdk', 'README-parts-gateway.md'),
      'utf8',
    );
    assert.match(readme, /filesusr\.com/);
    assert.match(readme, /club_domain_unresolved/);
    assert.match(readme, /X-Parent-Origin|x-parent-origin/i);
    assert.match(readme, /#4107|FR #4107/);
  });
});

describe('FR #4107 hostFromOriginHeader still parses', () => {
  it('parses https Origin', () => {
    assert.equal(hostFromOriginHeader(WIX_FRAME), 'www-mymodelflyingclub-co-uk.filesusr.com');
  });
});
