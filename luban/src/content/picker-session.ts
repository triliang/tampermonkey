import { startElementPicker, type PickerHandle } from './element-picker';

export interface PickerSession {
  getActive: () => PickerHandle | null;
  cancel: (notify?: boolean) => void;
  start: (onPick: (el: Element) => void, onCancel: () => void) => void;
}

export function createPickerSession(): PickerSession {
  let active: PickerHandle | null = null;
  let cancelled: (() => void) | null = null;
  return {
    getActive: () => active,
    cancel: (notify = false) => {
      const callback = active ? cancelled : null;
      active?.stop();
      active = null;
      cancelled = null;
      if (notify) callback?.();
    },
    start: (onPick, onCancel) => {
      active?.stop();
      cancelled = onCancel;
      active = startElementPicker(
        (el) => {
          active = null;
          cancelled = null;
          onPick(el);
        },
        () => {
          active = null;
          cancelled = null;
          onCancel();
        },
      );
    },
  };
}
