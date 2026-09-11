import { t, type Lang } from '@shared/i18n';
import { updateSettings, type Persona, type Settings } from '@shared/settings';
import { html, type SafeHtml } from '@views/html';
import { el, flash } from '../dom';

/**
 * Portable memory: a "who I am, how I want answers" profile the user can
 * attach to any fork package — platform-independent, stored locally.
 */
export function renderPersona(settings: Settings): SafeHtml {
  const lang: Lang = settings.language;
  const active = settings.personas.find((p) => p.id === settings.activePersonaId);
  return html`
    <section>
      <h2>${t(lang, 'personaSection')}</h2>
      <p class="hint">${t(lang, 'personaHint')}</p>
      <div class="field">
        <label for="persona-select">${t(lang, 'personaActive')}</label>
        <div class="row">
          <select id="persona-select">
            <option value="">—</option>
            ${settings.personas.map(
              (p) => html`<option value="${p.id}" ${p.id === settings.activePersonaId ? 'selected' : ''}>
                ${p.name}
              </option>`,
            )}
          </select>
          <button id="persona-new">${t(lang, 'personaNew')}</button>
        </div>
      </div>
      <div class="field">
        <label for="persona-name">${t(lang, 'personaName')}</label>
        <input type="text" id="persona-name" value="${active?.name ?? ''}" />
      </div>
      <div class="field">
        <textarea id="persona-text" placeholder="${t(lang, 'personaText')}">${active?.text ?? ''}</textarea>
      </div>
      <div class="row end">
        ${active && html`<button id="persona-delete">${t(lang, 'personaDelete')}</button>`}
        <button class="primary" id="persona-save">${t(lang, 'personaSave')}</button>
      </div>
    </section>
  `;
}

export function bindPersona(root: ParentNode, settings: Settings, onChanged: () => void): void {
  const lang = settings.language;

  el<HTMLSelectElement>(root, '#persona-select').addEventListener('change', (event) => {
    const id = (event.target as HTMLSelectElement).value || null;
    void updateSettings({ activePersonaId: id }).then(onChanged);
  });

  el<HTMLButtonElement>(root, '#persona-new').addEventListener('click', () => {
    void updateSettings({ activePersonaId: null }).then(onChanged);
  });

  const saveButton = el<HTMLButtonElement>(root, '#persona-save');
  saveButton.addEventListener('click', () => {
    const name = el<HTMLInputElement>(root, '#persona-name').value.trim();
    const text = el<HTMLTextAreaElement>(root, '#persona-text').value.trim();
    if (!name) return;
    const { personas, activePersonaId } = upsertPersona(settings, name, text);
    void updateSettings({ personas, activePersonaId }).then(() => {
      flash(saveButton, t(lang, 'settingsSaved'));
      onChanged();
    });
  });

  root.querySelector<HTMLButtonElement>('#persona-delete')?.addEventListener('click', () => {
    void updateSettings({
      personas: settings.personas.filter((p) => p.id !== settings.activePersonaId),
      activePersonaId: null,
    }).then(onChanged);
  });
}

/** Updates the active persona in place, or creates one and makes it active. */
export function upsertPersona(
  settings: Pick<Settings, 'personas' | 'activePersonaId'>,
  name: string,
  text: string,
  newId: () => string = () => crypto.randomUUID(),
): { personas: Persona[]; activePersonaId: string } {
  const index = settings.personas.findIndex((p) => p.id === settings.activePersonaId);
  if (index >= 0) {
    const personas = settings.personas.map((p, i) => (i === index ? { ...p, name, text } : p));
    return { personas, activePersonaId: settings.activePersonaId as string };
  }
  const created: Persona = { id: newId(), name, text };
  return { personas: [...settings.personas, created], activePersonaId: created.id };
}
