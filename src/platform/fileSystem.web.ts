/**
 * fileSystem — web implementation using fetch + FileReader.
 * Vite picks this over `.native.ts` when building for the browser.
 */

export const readImageAsBase64 = async (uri: string): Promise<string> => {
  if (uri.startsWith('data:')) {
    const idx = uri.indexOf(',');
    return idx >= 0 ? uri.substring(idx + 1) : uri;
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status})`);
  }
  const blob = await response.blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected FileReader result type'));
        return;
      }
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.substring(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};
