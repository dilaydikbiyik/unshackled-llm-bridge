import { t, type Lang } from '@shared/i18n';
import { updateSettings, type Persona, type Settings } from '@shared/settings';
import { el, escapeHtml, flash } from '../dom';

/**
 * Portable memory: a "who I am, how I want answers" profile the user can
 * attach to any fork package — platform-independent, stored locally.
 */
export function renderPersona(settings: Settings): string {
  const lang: Lang = settings.language;
  const active = settings.personas.find((p) => p.id === settings.activePersonaId);
  return `
    <section>
      <h2>${escapeHtml(t(lang, 'personaSection'))}</h2>
      <p class="hint">${escapeHtml(t(lang, 'personaHint'))}</p>
      <div class="field">
        <label for="persona-select">${escapeHtml(t(lang, 'personaActive'))}</label>
        <div class="row">
          <select id="persona-select">
            <option value="">—</option>
            ${settings.personas
              .map(
                (p) =>
                  `<option value="${p.id}" ${p.id === settings.activePersonaId ? 'selected' : ''}>
                     ${escapeHtml(p.name)}
                   </option>`,
              )
              .join('')}
          </select>
          <button id="persona-new">${escapeHtml(t(lang, 'personaNew'))}</button>
        </div>
      </div>
      <div class="field">
        <label for="persona-name">${escapeHtml(t(lang, 'personaName'))}</label>
        <input type="text" id="persona-name" value="${escapeHtml(active?.name ?? '')}" />
      </div>
      <div class="field">
        <textarea id="persona-text" placeholder="${escapeHtml(t(lang, 'personaText'))}">${escapeHtml(active?.text ?? '')}</textarea>
      </div>
      <div class="row end">
        ${active ? `<button id="persona-delete">${escapeHtml(t(lang, 'personaDelete'))}</button>` : ''}
        <button class="primary" id="persona-save">${escapeHtml(t(lang, 'personaSave'))}</button>
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

    const personas = [...settings.personas];
    const existing = personas.findIndex((p) => p.id === settings.activePersonaId);
    let activeId = settings.activePersonaId;
    if (existing >= 0) {
      personas[existing] = { ...personas[existing]!, name, text };
    } else {
      const created: Persona = { id: crypto.randomUUID(), name, text };
      personas.push(created);
      activeId = created.id;
    }
    void updateSettings({ personas, activePersonaId: activeId }).then(() => {
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
