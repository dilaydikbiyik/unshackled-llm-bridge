#!/usr/bin/env node
/**
 * Prints a DevTools snippet that checks the current selector config against
 * whatever platform page it is pasted into. The config is embedded rather than
 * fetched, because the platforms' Content-Security-Policy blocks console fetches
 * to other origins.
 *
 *   npm run -s probe | pbcopy      # macOS
 *   npm run -s probe | xclip -sel c
 *
 * Then open ChatGPT, Claude or Gemini (logged in, on an existing conversation),
 * open DevTools → Console, paste, press Enter.
 *
 * The snippet reads match COUNTS only. It never reads, prints or sends message
 * text, so its output is safe to paste into a GitHub issue.
 */
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../config/selectors.json', import.meta.url)));

const probe = (cfg) => {
  const HOSTS = { 'chatgpt.com': 'chatgpt', 'claude.ai': 'claude', 'gemini.google.com': 'gemini' };
  const platform = Object.entries(HOSTS).find(
    ([host]) => location.hostname === host || location.hostname.endsWith(`.${host}`),
  )?.[1];
  if (!platform) return `Not a supported platform page: ${location.hostname}`;

  const count = (selector) => {
    try {
      return document.querySelectorAll(selector).length;
    } catch {
      return 'INVALID';
    }
  };

  // Absent in normal use (mirrors SITUATIONAL_TARGETS in src/adapters/base-adapter.ts).
  const situational = new Set(['sendButton', 'modelLabel', 'artifactCell']);
  const rows = [];
  for (const [target, candidates] of Object.entries(cfg.platforms[platform] ?? {})) {
    const counts = candidates.map(count);
    const winner = counts.findIndex((n) => typeof n === 'number' && n > 0);
    rows.push({
      target,
      status: winner >= 0 ? 'ok' : situational.has(target) ? 'absent (situational)' : 'BROKEN',
      matchedCandidate: winner >= 0 ? winner + 1 : '-',
      counts: counts.join(' / '),
    });
  }
  console.table(rows);

  // The resolve check cannot see a partial match — the failure mode that once
  // hid a broken Claude selector. Compare the two sides of the conversation.
  const containers = (cfg.platforms[platform].messageContainer ?? [])
    .map((s) => { try { return [...document.querySelectorAll(s)]; } catch { return []; } })
    .find((list) => list.length > 0) ?? [];
  const userSelectors = cfg.platforms[platform].userMessage ?? [];
  const isUser = (el) =>
    userSelectors.some((s) => { try { return el.matches(s); } catch { return false; } }) ||
    el.querySelector?.('[data-message-author-role="user"]') != null ||
    el.matches?.('[data-message-author-role="user"]');
  const users = containers.filter(isUser).length;
  const assistants = containers.length - users;
  const shapeOk = !((users >= 2 && assistants === 0) || (assistants >= 2 && users === 0));
  const summary =
    `[unshackled probe] ${platform} · config v${cfg.version} · turns: ${users} user / ${assistants} assistant · ` +
    (shapeOk ? 'shape ok' : 'SHAPE BROKEN — a message selector is only half matching');
  console.log(summary);
  // Also the snippet's value: DevTools always echoes the value of the last
  // expression, so the verdict shows even on a page that overrides console.*.
  const broken = rows.filter((r) => r.status === 'BROKEN').map((r) => r.target);
  return broken.length ? `${summary} · BROKEN: ${broken.join(', ')}` : summary;
};

process.stdout.write(`(${probe.toString()})(${JSON.stringify(config)});\n`);
