/**
 * The pro suites that read the migrations as text find them by name, not by digits (supabase/tests/pro/migrationFiles.ts),
 * because the release renames the eight files to a later run of versions (documentation/design/pro-accounts.md 3.1 and
 * 11.1, P3) and migrationVersions.test.ts is the one test that is meant to need nothing else after that. This checks the
 * resolver, copies the folder under new versions to prove a rename changes nothing, and fails if a pro suite ever
 * writes a working version into its own source again.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  MIGRATIONS_DIR, PRO_MIGRATIONS, proComesBefore, proFile, proMigrationFiles, proPosition, readPro, readProAll,
} from '../supabase/tests/pro/migrationFiles';

describe('the pro migration resolver', () => {
  it('finds the eight files of the repository, in the order they are applied', () => {
    const files = proMigrationFiles();
    expect(files).toHaveLength(8);
    expect(files.map(f => f.replace(/^\d{14}_pro_/, '').replace(/\.sql$/, ''))).toEqual([...PRO_MIGRATIONS]);
    expect([...files].sort()).toEqual(files);
    expect(new Set(files.map(f => f.slice(0, 14))).size).toBe(8);                    // no two share a version
  });

  it('knows a file by its name and its place', () => {
    for (const [i, name] of PRO_MIGRATIONS.entries()) {
      expect(proPosition(name)).toBe(i);
      expect(proFile(name)).toMatch(new RegExp(`^\\d{14}_pro_${name}\\.sql$`));
      expect(readPro(name).length).toBeGreaterThan(100);
    }
    expect(proComesBefore('foundation', 'moderation')).toBe(true);
    expect(proComesBefore('moderation', 'foundation')).toBe(false);
    expect(readProAll(['foundation', 'upkeep'])).toBe(`${readPro('foundation')}\n${readPro('upkeep')}`);
  });

  it('says so when a file is missing or there are two', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pro-migrations-'));
    try {
      fs.writeFileSync(path.join(dir, '20270101000000_pro_foundation.sql'), '-- one');
      expect(() => proFile('upkeep', dir)).toThrow(/found 0/);
      fs.writeFileSync(path.join(dir, '20270101000001_pro_foundation.sql'), '-- two');
      expect(() => proFile('foundation', dir)).toThrow(/found 2/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is not moved by the release rename: the same eight files under later versions resolve the same way', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pro-migrations-'));
    try {
      const v = 20270301120000;
      proMigrationFiles().forEach((f, i) => {
        fs.writeFileSync(path.join(dir, `${v + i}_${f.replace(/^\d{14}_/, '')}`), fs.readFileSync(path.join(MIGRATIONS_DIR, f)));
      });
      fs.writeFileSync(path.join(dir, '20261021000000_item_images.sql'), '-- not a pro file');
      expect(proMigrationFiles(dir)).toHaveLength(8);
      for (const name of PRO_MIGRATIONS) {
        expect(proFile(name, dir)).toBe(`${v + PRO_MIGRATIONS.indexOf(name)}_pro_${name}.sql`);
        expect(readPro(name, dir)).toBe(readPro(name));
        expect(proPosition(name, dir)).toBe(proPosition(name));
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the pro suites that read the migrations', () => {
  const SUITES = ['proFoundationMigration', 'proSharingWorkMigration', 'proModerationMigration', 'proRulesInStepWithSql', 'proServiceInStepWithSql'];

  it('name no working version: after the release rename they still find their files', () => {
    for (const suite of SUITES) {
      const text = fs.readFileSync(path.join(__dirname, `${suite}.test.ts`), 'utf8');
      expect([suite, text.match(/\d{14}_pro_\w+\.sql/g)]).toEqual([suite, null]);
      expect([suite, text.includes('migrationFiles')]).toEqual([suite, true]);
    }
  });

  it('are not the only ones: the API script and its test already match the pro files by their names', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'pro-api-checks.mjs'), 'utf8');
    const apiTest = fs.readFileSync(path.join(__dirname, 'proApiChecksInStepWithService.test.ts'), 'utf8');
    expect(script).toMatch(/\\d\{14\}_pro_/);
    expect(apiTest).toMatch(/\\d\{14\}_pro_/);
    expect(script).not.toMatch(/\d{14}_pro_\w+\.sql/);
    expect(apiTest).not.toMatch(/\d{14}_pro_\w+\.sql/);
  });
});
