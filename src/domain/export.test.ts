import { describe, expect, it } from 'vitest';
import { createConversation, type BridgeConversation } from './conversation/schema';
import { conversationToMarkdown, exportFilename } from './export';

function sample(overrides: Partial<BridgeConversation> = {}): BridgeConversation {
  return createConversation({
    id: 'claude-abc123',
    sourcePlatform: 'claude',
    model: 'Claude Opus',
    title: 'Refactor Plan',
    createdAt: '2026-09-10T08:00:00.000Z',
    messages: [
      { role: 'user', content: 'Split the models folder?', index: 0, attachmentRefs: [] },
      { role: 'assistant', content: 'Yes — domain vs data.', index: 1, attachmentRefs: [] },
    ],
    attachments: [],
    ...overrides,
  });
}

describe('markdown export', () => {
  it('produces a self-contained document with provenance', () => {
    const md = conversationToMarkdown(sample());
    expect(md).toMatch(/^# Refactor Plan/);
    expect(md).toContain('- Source: Claude (Claude Opus)');
    expect(md).toContain('- Created: 2026-09-10T08:00:00.000Z');
  });

  it('labels turns by speaker, naming the platform rather than a generic "assistant"', () => {
    const md = conversationToMarkdown(sample());
    expect(md).toContain('## User\n\nSplit the models folder?');
    expect(md).toContain('## Claude\n\nYes — domain vs data.');
  });

  it('omits the model suffix when the model is unknown', () => {
    const { model: _omit, ...rest } = sample();
    const md = conversationToMarkdown(createConversation(rest));
    expect(md).toContain('- Source: Claude\n');
  });

  it('falls back to a generic heading for an untitled conversation', () => {
    const { title: _omit, ...rest } = sample();
    expect(conversationToMarkdown(createConversation(rest))).toMatch(/^# Conversation/);
  });
});

describe('export filenames', () => {
  it('slugifies the title and picks the extension from the format', () => {
    expect(exportFilename(sample(), 'markdown')).toBe('refactor-plan.md');
    expect(exportFilename(sample(), 'json')).toBe('refactor-plan.json');
  });

  it('keeps non-Latin letters instead of stripping them to nothing', () => {
    // A Turkish title must not collapse to an empty slug.
    expect(exportFilename(sample({ title: 'Düğün Planı' }), 'markdown')).toBe('düğün-planı.md');
  });

  it('strips characters that are unsafe in filenames', () => {
    expect(exportFilename(sample({ title: '../../etc/passwd' }), 'json')).toBe('etc-passwd.json');
  });

  it('never produces an empty name', () => {
    expect(exportFilename(sample({ title: '!!!' }), 'json')).toBe('conversation.json');
  });

  it('bounds the length so a pasted paragraph cannot become a filename', () => {
    const name = exportFilename(sample({ title: 'word '.repeat(60) }), 'markdown');
    expect(name.length).toBeLessThanOrEqual(63);
  });
});
