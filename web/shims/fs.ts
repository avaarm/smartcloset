/**
 * Web shim for react-native-fs.
 * Only the methods actually used by the app are shimmed.
 */

export const DocumentDirectoryPath = '/documents';
export const CachesDirectoryPath = '/caches';

export const readFile = async (_path: string, _encoding?: string): Promise<string> => {
  console.warn('RNFS.readFile is not available on web');
  return '';
};

export const writeFile = async (_path: string, _contents: string, _encoding?: string): Promise<void> => {
  console.warn('RNFS.writeFile is not available on web');
};

export const exists = async (_path: string): Promise<boolean> => false;
export const mkdir = async (_path: string): Promise<void> => {};
export const unlink = async (_path: string): Promise<void> => {};
export const copyFile = async (_src: string, _dest: string): Promise<void> => {};

export default {
  DocumentDirectoryPath,
  CachesDirectoryPath,
  readFile,
  writeFile,
  exists,
  mkdir,
  unlink,
  copyFile,
};
