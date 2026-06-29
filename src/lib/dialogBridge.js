/**
 * Module-level bridge so window.confirm can be patched to the custom dialog.
 * Avoid naming hook results `confirm` — that collides with window.confirm in Firefox.
 */
let confirmImpl = null;
let promptImpl = null;

export function registerDialogImpl(confirm, prompt) {
  confirmImpl = confirm;
  promptImpl = prompt;
}

export function unregisterDialogImpl() {
  confirmImpl = null;
  promptImpl = null;
}

export function getConfirmImpl() {
  return confirmImpl;
}

export function getPromptImpl() {
  return promptImpl;
}
