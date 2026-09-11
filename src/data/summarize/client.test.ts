import { describe, expect, it, vi } from 'vitest';
import { summarizeTranscript } from './client';

/** A stand-in for api.anthropic.com: returns the given Messages API body. */
function api(content: unknown[], stopReason = 'end_turn') {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-4-5',
          content,
          stop_reason: stopReason,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  );
}

const base = { apiKey: 'sk-test', model: 'claude-haiku-4-5', transcript: 'user: hi\n\nassistant: hello' };

function sentBody(fetch: ReturnType<typeof api>): {
  model: string;
  system: string;
  messages: { content: string }[];
} {
  const init = fetch.mock.calls[0]?.[1];
  return JSON.parse(String(init?.body));
}

describe('summarizeTranscript', () => {
  it('returns the brief, joining text blocks', async () => {
    const fetch = api([
      { type: 'text', text: 'Goal: pick a DB.' },
      { type: 'text', text: 'Decided: Postgres.' },
    ]);
    await expect(summarizeTranscript({ ...base, language: 'en', fetch })).resolves.toBe(
      'Goal: pick a DB.\nDecided: Postgres.',
    );
  });

  it('sends the chosen model, the compression instructions, and the transcript', async () => {
    const fetch = api([{ type: 'text', text: 'brief' }]);
    await summarizeTranscript({ ...base, language: 'en', fetch });
    const body = sentBody(fetch);
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.system).toMatch(/Decisions already made/);
    expect(body.messages[0]?.content).toContain('<transcript>\nuser: hi');
  });

  it('asks for a Turkish brief when the UI is Turkish', async () => {
    const fetch = api([{ type: 'text', text: 'özet' }]);
    await summarizeTranscript({ ...base, language: 'tr', fetch });
    expect(sentBody(fetch).messages[0]?.content).toMatch(/Write the brief in Turkish/);
  });

  it('throws on a refusal instead of returning it as a summary', async () => {
    const fetch = api([], 'refusal');
    await expect(summarizeTranscript({ ...base, language: 'en', fetch })).rejects.toThrow(/declined/);
  });

  it('throws on an empty answer, so the caller falls back to a full transfer', async () => {
    const fetch = api([{ type: 'text', text: '   ' }]);
    await expect(summarizeTranscript({ ...base, language: 'en', fetch })).rejects.toThrow(/empty/);
  });
});
