interface EditablePreset {
  id: string;
  name: string;
  kind: string;
  styles: Record<string, string>;
}

export function validatePresetStyles(styles: Record<string, string>, supports = CSS.supports): { styles: Record<string, string>; dropped: string[] } {
  const valid: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [property, raw] of Object.entries(styles)) {
    const value = raw.trim();
    const cssProperty = property.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
    if (value && supports(cssProperty, value)) valid[property] = value;
    else dropped.push(property);
  }
  return { styles: valid, dropped };
}

export async function persistPresetChange(id: string, edit?: { name: string; styles: Record<string, string> }, browser = globalThis.browser): Promise<void> {
  const key = 'dm_custom_presets';
  const data = await browser.storage.sync.get(key);
  const presets: EditablePreset[] = Array.isArray(data[key]) ? data[key] : [];
  if (!presets.some(preset => preset.id === id)) throw new Error('This preset no longer exists.');
  const next = edit
    ? presets.map(preset => preset.id === id ? { ...preset, name: edit.name, styles: edit.styles } : preset)
    : presets.filter(preset => preset.id !== id);
  await browser.storage.sync.set({ [key]: next });
}

export function openPresetDialog(
  preset: EditablePreset,
  mode: 'edit' | 'delete',
  trigger: HTMLElement,
  refresh: () => Promise<void>,
  toast: (kind: 'success' | 'error', message: string) => void,
  browser = globalThis.browser,
): void {
  if (document.querySelector('[data-dm-preset-dialog]')) return;
  const dialog = document.createElement('dialog');
  dialog.dataset.dmPresetDialog = '';
  dialog.setAttribute('aria-labelledby', 'dm-preset-dialog-title');
  dialog.style.cssText = 'width:min(340px,calc(100vw - 32px));max-height:80vh;box-sizing:border-box;overflow:auto;padding:16px;border:1px solid var(--dm-separator);border-radius:8px;background:var(--dm-bg,#fff);color:var(--dm-text,#222);font:inherit;font-size:12px;';
  const title = document.createElement('h2');
  title.id = 'dm-preset-dialog-title';
  title.textContent = mode === 'delete' ? 'Delete preset?' : 'Edit preset';
  title.style.cssText = 'font-size:14px;margin:0 0 12px;';
  dialog.append(title);
  const fields: HTMLInputElement[] = [];
  const field = (labelText: string, value: string): HTMLInputElement => {
    const label = document.createElement('label');
    label.style.cssText = 'display:block;margin:8px 0;';
    label.append(document.createTextNode(labelText));
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dm-input';
    input.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin-top:4px;';
    input.value = value;
    label.append(input);
    dialog.append(label);
    fields.push(input);
    return input;
  };
  let name: HTMLInputElement | undefined;
  const values = new Map<string, HTMLInputElement>();
  if (mode === 'edit') {
    const badge = document.createElement('span');
    badge.textContent = preset.kind + ' · Kind locked';
    badge.style.cssText = 'display:inline-block;border:1px solid var(--dm-separator);border-radius:999px;padding:2px 6px;';
    dialog.append(badge);
    name = field('Preset name', preset.name);
    for (const [property, value] of Object.entries(preset.styles)) values.set(property, field(property, value));
  } else {
    const description = document.createElement('p');
    description.id = 'dm-preset-dialog-description';
    description.textContent = `Delete “${preset.name}”? This cannot be undone. Applied styles will remain on the page.`;
    dialog.setAttribute('aria-describedby', description.id);
    dialog.append(description);
  }
  const errorMessage = document.createElement('p');
  errorMessage.setAttribute('role', 'alert');
  dialog.append(errorMessage);
  const reportError = (message: string) => {
    errorMessage.textContent = message;
    toast('error', message);
  };
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px;';
  const cancel = document.createElement('button');
  cancel.className = 'dm-defined-form-btn dm-defined-form-cancel';
  cancel.textContent = 'Cancel';
  cancel.onclick = () => dialog.close();
  const confirm = document.createElement('button');
  confirm.className = 'dm-defined-form-btn dm-defined-form-save';
  confirm.textContent = mode === 'delete' ? 'Delete' : 'Save';
  let busy = false;
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)'));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  dialog.addEventListener('cancel', event => {
    if (busy) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    const replacement = Array.from(document.querySelectorAll<HTMLElement>('[data-preset-id]')).find(
      element => element.dataset.presetId === preset.id && element.dataset.dmAction === trigger.dataset.dmAction,
    );
    const fallback = document.querySelector<HTMLElement>('[data-dm-action="add-preset-open"]:not(:disabled)')
      || document.querySelector<HTMLElement>('button:not(:disabled)');
    (trigger.isConnected ? trigger : replacement || fallback)?.focus();
  });
  confirm.onclick = async () => {
    if (busy) return;
    const trimmedName = name?.value.trim();
    if (mode === 'edit' && !trimmedName) {
      reportError('Give the preset a name.');
      name?.focus();
      return;
    }
    const validated = validatePresetStyles(Object.fromEntries(Array.from(values, ([property, input]) => [property, input.value])));
    busy = true;
    confirm.disabled = true;
    fields.forEach(input => { input.disabled = true; });
    // Keep a focusable control while storage is pending, without allowing dismissal.
    cancel.onclick = () => {};
    try {
      await persistPresetChange(preset.id, mode === 'edit' ? { name: trimmedName!, styles: validated.styles } : undefined, browser);
      await refresh();
      toast(validated.dropped.length ? 'error' : 'success', validated.dropped.length
        ? `Saved preset. Dropped invalid CSS: ${validated.dropped.join(', ')}.`
        : mode === 'edit' ? 'Preset updated.' : 'Preset deleted.');
      dialog.close();
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'Could not save preset changes.');
    } finally {
      busy = false;
      confirm.disabled = false;
      fields.forEach(input => { input.disabled = false; });
      cancel.onclick = () => dialog.close();
    }
  };
  actions.append(cancel, confirm);
  dialog.append(actions);
  document.body.append(dialog);
  dialog.showModal();
  (name || cancel).focus();
}
