/**
 * Finds the professional-accounts migrations by what they are called, not by their digits.
 *
 * `supabase db push` records a file under the digits before the first underscore, and the release recipe
 * (documentation/design/pro-accounts.md 3.1 and 11.1, P3) renames the eight pro files to a later run of versions
 * (`v` ... `v+7`) in one commit, verified by migrationVersions.test.ts alone. What identifies a file is the name after
 * the first underscore and its position in the list, so every Jest suite that reads these files as text asks this
 * module for them. A suite that wrote `20261023000100_pro_foundation.sql` would fail with ENOENT the day the files are
 * renamed; `proMigrationFiles.test.ts` fails if any suite does.
 *
 * Plain Node, no Jest: this file is a helper and holds no test.
 */
import fs from 'fs';
import path from 'path';

/** The eight pro migrations, in the order they are applied. */
export const PRO_MIGRATIONS = [
  'lockdown_legacy_tables', 'foundation', 'upkeep', 'profiles_invites', 'connections', 'sharing', 'work', 'moderation',
] as const;

export type ProMigration = (typeof PRO_MIGRATIONS)[number];

export const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

const PRO_FILE = new RegExp(`^(\\d{14})_pro_(${PRO_MIGRATIONS.join('|')})\\.sql$`);

/** The pro files of a folder, sorted the way `db push` applies them (by version). */
export const proMigrationFiles = (dir: string = MIGRATIONS_DIR): string[] =>
  fs.readdirSync(dir).filter(f => PRO_FILE.test(f)).sort();

/** The file name of one pro migration, whatever version it carries now. Throws unless exactly one file has that name. */
export const proFile = (name: ProMigration, dir: string = MIGRATIONS_DIR): string => {
  const found = proMigrationFiles(dir).filter(f => PRO_FILE.exec(f)![2] === name);
  if (found.length !== 1) {
    throw new Error(`expected exactly one pro migration called ${name} in ${dir}, found ${found.length}`);
  }
  return found[0];
};

/** Where a pro migration is, by name. */
export const proPath = (name: ProMigration, dir: string = MIGRATIONS_DIR): string => path.join(dir, proFile(name, dir));

/** Its text. */
export const readPro = (name: ProMigration, dir: string = MIGRATIONS_DIR): string => fs.readFileSync(proPath(name, dir), 'utf8');

/** The text of several, joined with a newline, in the order asked. */
export const readProAll = (names: readonly ProMigration[], dir: string = MIGRATIONS_DIR): string =>
  names.map(n => readPro(n, dir)).join('\n');

/** Where a pro migration stands among the eight (0 for the lockdown, 7 for the moderation file), whatever its version. */
export const proPosition = (name: ProMigration, dir: string = MIGRATIONS_DIR): number =>
  proMigrationFiles(dir).indexOf(proFile(name, dir));

/** True when the first is applied before the second. */
export const proComesBefore = (a: ProMigration, b: ProMigration, dir: string = MIGRATIONS_DIR): boolean =>
  proPosition(a, dir) < proPosition(b, dir);
