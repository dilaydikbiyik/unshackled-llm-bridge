import { BUILT_IN_PLATFORM_IDS, platformLabel } from '@domain/platforms';
import { t, type Lang } from '@shared/i18n';
import { isAddableHost, matchPatternFor } from '@shared/sites';
import { updateSettings, type CustomSiteSetting, type Settings } from '@shared/settings';
import { html, type SafeHtml } from '@views/html';
import { el } from '../dom';

/**
 * Where the extension stops being a three-platform tool.
 *
 * A site added here is read by the generic adapter, which needs no selectors,
 * so any chat UI can be bridged. Each one needs its own host permission,
 * granted by the user in Chrome's own prompt and revocable from this list —
 * the extension never asks for access to the web.
 */
export interface SitesPorts {
  /** The host of the tab the user is looking at, offered as the obvious thing to add. */
  currentHost: () => Promise<string | null>;
  /** Chrome's permission prompt. Must run inside the click, or Chrome refuses it. */
  requestOrigin: (pattern: string) => Promise<boolean>;
  removeOrigin: (pattern: string) => Promise<boolean>;
}

export function renderSites(settings: Settings): SafeHtml {
  const lang: Lang = settings.language;
  return html`
    <section>
      <h2>${t(lang, 'sitesSection')}</h2>
      <p class="hint">${t(lang, 'sitesHint')}</p>

      <ul class="site-list">
        ${BUILT_IN_PLATFORM_IDS.map(
          (id) => html`<li><span>${platformLabel(id)}</span> <span class="muted">${t(lang, 'sitesBuiltIn')}</span></li>`,
        )}
        ${settings.customSites.map(
          (site) => html`<li>
            <span>${site.label || site.host}</span>
            <span class="muted">${site.host}</span>
            <button class="site-remove" data-host="${site.host}">${t(lang, 'sitesRemove')}</button>
          </li>`,
        )}
      </ul>

      <div class="field">
        <label for="site-host">${t(lang, 'sitesAddLabel')}</label>
        <div class="row">
          <input type="text" id="site-host" placeholder="perplexity.ai" />
          <button class="primary" id="site-add">${t(lang, 'sitesAdd')}</button>
        </div>
        <span class="hint" id="site-status"></span>
      </div>
    </section>
  `;
}

export function bindSites(
  root: ParentNode,
  settings: Settings,
  ports: SitesPorts,
  onChanged: () => void,
): void {
  const lang = settings.language;
  const input = el<HTMLInputElement>(root, '#site-host');
  const status = el<HTMLElement>(root, '#site-status');

  // Offer the site the user is already on; typing a host is the fallback. A
  // failure here must not escape: nothing depends on it, and an unhandled
  // rejection in a side panel is invisible until it takes something else down.
  void ports
    .currentHost()
    .then((host) => {
      if (host && !input.value && isAddableHost(host) && !hasSite(settings, host)) {
        input.value = host;
      }
    })
    .catch(() => undefined);

  el<HTMLButtonElement>(root, '#site-add').addEventListener('click', () => {
    const host = normalizeHost(input.value);
    if (!isAddableHost(host)) {
      status.textContent = t(lang, 'sitesInvalidHost');
      return;
    }
    if (hasSite(settings, host)) {
      status.textContent = t(lang, 'sitesAlreadyAdded');
      return;
    }

    // Requested inside the click: Chrome rejects a permission prompt that is
    // not the direct result of a user gesture.
    void ports.requestOrigin(matchPatternFor(host)).then((granted) => {
      if (!granted) {
        status.textContent = t(lang, 'sitesDenied');
        return;
      }
      const next: CustomSiteSetting[] = [...settings.customSites, { host, label: host }];
      void updateSettings({ customSites: next }).then(() => {
        input.value = '';
        status.textContent = '';
        onChanged();
      });
    });
  });

  root.querySelectorAll<HTMLButtonElement>('.site-remove').forEach((button) => {
    button.addEventListener('click', () => {
      const host = button.dataset['host'];
      if (!host) return;
      // The permission goes with the site: removing it here should not leave
      // the extension holding access the user can no longer see.
      void ports.removeOrigin(matchPatternFor(host)).then(() => {
        void updateSettings({
          customSites: settings.customSites.filter((site) => site.host !== host),
        }).then(onChanged);
      });
    });
  });
}

/** Accepts what a user would paste: a bare host, or a URL they copied. */
export function normalizeHost(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  const withoutScheme = trimmed.replace(/^[a-z][\w+.-]*:\/\//, '');
  return withoutScheme.split('/')[0]?.split('?')[0]?.split('#')[0] ?? '';
}

function hasSite(settings: Settings, host: string): boolean {
  return settings.customSites.some((site) => site.host === host);
}
