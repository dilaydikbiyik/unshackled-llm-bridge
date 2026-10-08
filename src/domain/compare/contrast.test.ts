import { describe, expect, it } from 'vitest';
import { contrastAnswers } from './contrast';

describe('contrastAnswers', () => {
  it('finds the point every answer makes', () => {
    const result = contrastAnswers([
      { platform: 'chatgpt', content: 'Postgres is the safer default for a small SaaS product.' },
      { platform: 'claude', content: 'For a small SaaS product, Postgres is the safer default.' },
      { platform: 'gemini', content: 'The safer default for a small SaaS product is Postgres.' },
    ]);

    expect(result.agreed).toHaveLength(1);
    expect(result.agreed[0]).toContain('Postgres');
    expect(result.contrasts.every((c) => c.unique.length === 0)).toBe(true);
  });

  it('surfaces the claim only one of them makes — where one is probably wrong', () => {
    const result = contrastAnswers([
      {
        platform: 'chatgpt',
        content:
          'Postgres is the safer default for a small SaaS product.\nIt handles JSON columns well.',
      },
      {
        platform: 'claude',
        content:
          'Postgres is the safer default for a small SaaS product.\nMySQL replication is simpler to operate at scale.',
      },
    ]);

    const chatgpt = result.contrasts.find((c) => c.platform === 'chatgpt');
    const claude = result.contrasts.find((c) => c.platform === 'claude');

    expect(chatgpt?.unique.join(' ')).toContain('JSON columns');
    expect(claude?.unique.join(' ')).toContain('replication');
    expect(result.agreed.join(' ')).toContain('Postgres');
  });

  it('reports how much of what was said is common ground', () => {
    const agreeing = contrastAnswers([
      { platform: 'chatgpt', content: 'Index the foreign key column before you measure anything.' },
      { platform: 'claude', content: 'Before measuring anything, index the foreign key column.' },
    ]);
    const diverging = contrastAnswers([
      { platform: 'chatgpt', content: 'Index the foreign key column before you measure anything.' },
      { platform: 'claude', content: 'Rewrite the query as a lateral join and drop the subquery.' },
    ]);

    expect(agreeing.agreement).toBe(1);
    expect(diverging.agreement).toBe(0);
  });

  it('ignores filler, which otherwise reads as agreement', () => {
    // "Sure!" in three answers is not consensus about anything.
    const result = contrastAnswers([
      { platform: 'chatgpt', content: 'Sure!\nUse a connection pool sized to your worker count.' },
      { platform: 'claude', content: 'Of course.\nSize the connection pool to the worker count.' },
    ]);

    expect(result.agreed).toHaveLength(1);
    expect(result.agreed.join(' ')).toContain('connection pool');
  });

  it('does not compare code blocks as prose', () => {
    const result = contrastAnswers([
      { platform: 'chatgpt', content: '```sql\nSELECT 1 FROM users WHERE id = 2;\n```' },
      { platform: 'claude', content: '```sql\nSELECT 1 FROM users WHERE id = 2;\n```' },
    ]);

    expect(result.agreed).toEqual([]);
  });

  it('says nothing useful about a single answer, rather than inventing agreement', () => {
    const result = contrastAnswers([
      { platform: 'chatgpt', content: 'Postgres is the safer default for a small SaaS product.' },
    ]);

    expect(result.agreed).toEqual([]);
    expect(result.agreement).toBe(0);
  });

  it('ignores an answer that has not arrived yet', () => {
    const result = contrastAnswers([
      { platform: 'chatgpt', content: 'Postgres is the safer default for a small SaaS product.' },
      { platform: 'claude', content: '' },
    ]);

    expect(result.contrasts.map((c) => c.platform)).toEqual(['chatgpt']);
  });
});
