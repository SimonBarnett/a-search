'use strict';

/**
 * FR #4701: load a-affiliates AGENTS.md then SKILLS.md then {provider}/AGENT.md
 * then {provider}/SKILLS.md. Missing AGENTS.md / provider AGENT.md => hard fail
 * before sign-in.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {{
 *   affiliatesRoot: string,
 *   provider: string,
 *   providerRoot?: string,
 *   readFileSync?: Function,
 *   existsSync?: Function,
 * }} opts
 * @returns {{
 *   ok: true,
 *   texts: { rootAgents: string, rootSkills: string, providerAgent: string, providerSkills: string },
 *   paths: object,
 * } | { ok: false, code: string, path: string }}
 */
function loadAffiliateAgentDocs(opts) {
  const read = opts.readFileSync || fs.readFileSync;
  const exists = opts.existsSync || fs.existsSync;
  const root = opts.affiliatesRoot;
  const provider = String(opts.provider || '').toLowerCase();
  const providerRoot =
    opts.providerRoot || path.join(root, provider);

  const paths = {
    rootAgents: path.join(root, 'AGENTS.md'),
    rootSkills: path.join(root, 'SKILLS.md'),
    providerAgent: path.join(providerRoot, 'AGENT.md'),
    providerSkills: path.join(providerRoot, 'SKILLS.md'),
  };

  if (!exists(paths.rootAgents)) {
    return { ok: false, code: 'missing_agents_md', path: paths.rootAgents };
  }
  if (!exists(paths.providerAgent)) {
    return {
      ok: false,
      code: 'missing_provider_agent_md',
      path: paths.providerAgent,
    };
  }

  const rootAgents = String(read(paths.rootAgents, 'utf8') || '');
  const providerAgent = String(read(paths.providerAgent, 'utf8') || '');
  if (!rootAgents.trim()) {
    return { ok: false, code: 'missing_agents_md', path: paths.rootAgents };
  }
  if (!providerAgent.trim()) {
    return {
      ok: false,
      code: 'missing_provider_agent_md',
      path: paths.providerAgent,
    };
  }

  const rootSkills = exists(paths.rootSkills)
    ? String(read(paths.rootSkills, 'utf8') || '')
    : '';
  const providerSkills = exists(paths.providerSkills)
    ? String(read(paths.providerSkills, 'utf8') || '')
    : '';

  return {
    ok: true,
    texts: { rootAgents, rootSkills, providerAgent, providerSkills },
    paths,
  };
}

/**
 * Parse application message character limit from provider AGENT.md.
 * Looks for ``message character limit: N`` or ``character limit **N**``.
 * @param {string} agentMd
 * @param {number} [fallback=500]
 */
function parseMessageCharLimit(agentMd, fallback = 500) {
  const text = String(agentMd || '');
  const m =
    text.match(/message\s+character\s+limit\s*[:=]\s*\*?\*?(\d+)/i) ||
    text.match(/character\s+limit\s*[:=]\s*\*?\*?(\d+)/i) ||
    text.match(/char(?:acter)?\s+limit[^0-9]{0,20}(\d+)/i);
  if (m) return Number(m[1]);
  return fallback;
}

module.exports = {
  loadAffiliateAgentDocs,
  parseMessageCharLimit,
};
