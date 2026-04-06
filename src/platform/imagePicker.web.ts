/**
 * imagePicker — web implementation using <input type="file">.
 *
 * Opens the browser file picker. Returns a blob: URI (the same shape the
 * native implementation returns) so downstream code doesn't branch.
 */

export type PickedImage = {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string;
  fileSize?: number;
  fileName?: string;
};

export const pickImageFromLibrary = (): Promise<PickedImage | null> => {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';

    let settled = false;
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        if (!settled) {
          settled = true;
          resolve(null);
        }
        return;
      }
      const uri = URL.createObjectURL(file);
      cleanup();
      if (!settled) {
        settled = true;
        resolve({
          uri,
          mimeType: file.type,
          fileSize: file.size,
          fileName: file.name,
        });
      }
    };

    // If the user dismisses the picker without picking, there is no reliable
    // cross-browser event. We attach a window focus listener as a best-effort
    // cancel signal.
    const onFocus = () => {
      setTimeout(() => {
        if (!settled && !input.files?.length) {
          settled = true;
          cleanup();
          resolve(null);
        }
      }, 400);
      window.removeEventListener('focus', onFocus);
    };
    window.addEventListener('focus', onFocus);

    document.body.appendChild(input);
    input.click();
  });
};
