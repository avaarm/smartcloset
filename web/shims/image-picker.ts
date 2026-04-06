/**
 * Web shim for react-native-image-picker.
 * Uses an <input type="file"> element under the hood.
 */

type ImagePickerResponse = {
  didCancel?: boolean;
  errorCode?: string;
  errorMessage?: string;
  assets?: Array<{
    uri: string;
    type?: string;
    fileName?: string;
    fileSize?: number;
    width?: number;
    height?: number;
  }>;
};

type Options = {
  mediaType?: string;
  includeBase64?: boolean;
  [key: string]: any;
};

const pickViaInput = (): Promise<ImagePickerResponse> =>
  new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ didCancel: true });
        return;
      }
      const uri = URL.createObjectURL(file);
      resolve({
        assets: [
          {
            uri,
            type: file.type,
            fileName: file.name,
            fileSize: file.size,
          },
        ],
      });
    };
    input.oncancel = () => resolve({ didCancel: true });
    input.click();
  });

export const launchImageLibrary = async (
  _options: Options,
  callback?: (response: ImagePickerResponse) => void,
): Promise<ImagePickerResponse> => {
  const result = await pickViaInput();
  callback?.(result);
  return result;
};

export const launchCamera = async (
  _options: Options,
  callback?: (response: ImagePickerResponse) => void,
): Promise<ImagePickerResponse> => {
  // Camera not available on web — fall back to file picker
  const result = await pickViaInput();
  callback?.(result);
  return result;
};

export default { launchImageLibrary, launchCamera };
