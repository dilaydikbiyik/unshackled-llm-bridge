import tseslint from 'typescript-eslint';

/**
 * Architecture is enforced here, not just described in the README.
 *
 * Dependencies point inward only:
 *
 *   views ─┐
 *          ├─→ controllers ─→ adapters ─→ data ─→ shared ─→ domain
 *          └──────────────────────────────────────────────────↗
 *
 *   domain   pure entities and rules. Imports nothing at all.
 *   shared   cross-boundary contracts every layer speaks. Imports domain only.
 *   data     persistence, remote config, external APIs. Never imports upward.
 *   adapters the only code allowed to touch platform DOM.
 *   controllers  orchestration. May reach anywhere below it.
 *   views    rendering. Receives capabilities by injection; never calls a
 *            controller or touches persistence directly.
 *
 * A violation fails `npm run lint`, which fails CI. If a rule below is in your
 * way, the design is probably wrong — argue the design, don't delete the rule.
 */
const boundary = (layer, forbidden, why) => ({
  files: [`src/${layer}/**/*.ts`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: forbidden.map((pattern) => ({
          group: [`${pattern}/*`, pattern],
          message: why,
        })),
      },
    ],
  },
});

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  boundary(
    'domain',
    ['@shared', '@data', '@adapters', '@controllers', '@views'],
    'domain is the innermost layer and imports nothing outside itself. If it needs a value from elsewhere, pass it as an argument.',
  ),

  boundary(
    'shared',
    ['@data', '@adapters', '@controllers', '@views'],
    'shared is a contract layer imported by everyone; importing upward creates a cycle. It may import @domain (the innermost layer) and nothing else.',
  ),

  boundary(
    'data',
    ['@adapters', '@controllers', '@views'],
    'data is infrastructure: it may import @domain and @shared only. Orchestration belongs in a controller.',
  ),

  boundary(
    'adapters',
    ['@controllers', '@views'],
    'adapters are a service layer: they translate platform DOM into the normalized format and nothing else.',
  ),

  boundary(
    'views',
    ['@controllers', '@data'],
    'views render and collect input. Take behaviour as an injected callback typed by a @domain contract, and let a controller supply it.',
  ),

  // HTML safety is structural: markup reaches the DOM only through setHtml(),
  // which accepts only SafeHtml built by the escaping `html` tag.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/views/html.ts', 'src/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
          message: 'Insert markup with setHtml(target, html`…`) from @views/html, which escapes by construction.',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: 'Insert markup with setHtml(target, html`…`) from @views/html, which escapes by construction.',
        },
      ],
    },
  },

  { ignores: ['dist/**', 'node_modules/**', 'e2e/**', 'playwright-report/**', 'test-results/**'] },
);
