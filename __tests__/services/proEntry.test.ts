import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resetProEntry, setProEntry, takeProEntry } from '../../src/services/proEntry';

beforeEach(() => {
  resetProEntry();
  (AsyncStorage.setItem as jest.Mock).mockClear?.();
});

describe('the first-run intent', () => {
  it('is empty until something sets it', () => {
    expect(takeProEntry()).toBeNull();
  });

  it.each(['stylist', 'client'] as const)('is taken once: %s', intent => {
    setProEntry(intent);
    expect(takeProEntry()).toBe(intent);
    expect(takeProEntry()).toBeNull();
  });

  it('keeps the latest choice', () => {
    setProEntry('stylist');
    setProEntry('client');
    expect(takeProEntry()).toBe('client');
  });

  it('is cleared by a reset (sign-out, account deletion)', () => {
    setProEntry('stylist');
    resetProEntry();
    expect(takeProEntry()).toBeNull();
  });

  it('ignores anything that is not a role, so a stale value can never open a sheet', () => {
    setProEntry('stylist');
    (setProEntry as any)('user');
    (setProEntry as any)(undefined);
    expect(takeProEntry()).toBe('stylist');
    (setProEntry as any)('admin');
    expect(takeProEntry()).toBeNull();
  });

  it('writes nothing to the device, and the module does not mention storage', () => {
    setProEntry('client');
    takeProEntry();
    resetProEntry();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/proEntry.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"\w])\/\/.*$/gm, '$1');
    expect(source).not.toMatch(/AsyncStorage|localStorage|import /);
  });
});
