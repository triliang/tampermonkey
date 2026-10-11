import { startElementPicker, type PickerHandle } from './element-picker';

export interface PickerSession {
  getActive: () => PickerHandle | null;
  cancel: () => void;
  start: (onPick: (el: Element) => void, onCancel: () => void) => void;
}

export function createPickerSession(): PickerSession {
  let active: PickerHandle | null = null;
  return {
    getActive: () => active,
    cancel: () => {
      active?.stop();
      active = null;
    },
    start: (onPick, onCancel) => {
      active?.stop();
      active = startElementPicker(
        (el) => {
          active = null;
          onPick(el);
        },
        () => {
          active = null;
          onCancel();
        },
      );
    },
  };
}
