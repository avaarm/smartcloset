/**
 * The scripts that run the professional-accounts scenarios (documentation/design/pro-accounts.md 9.2): the runner lists
 * every scenario, every scenario ends in a rollback, nothing commits but race.sh, and race.sh refuses any database that
 * is not local. The behaviour itself is checked by the scenarios; this checks that they are run, and run safely.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const scenarioDir = path.join(root, 'supabase', 'tests', 'pro');
const runnerPath = path.join(root, 'scripts', 'run-pro-sql-tests.sh');
const racePath = path.join(scenarioDir, 'race.sh');
const runner = fs.readFileSync(runnerPath, 'utf8');
const race = fs.readFileSync(racePath, 'utf8');
const sqlFiles = fs.readdirSync(scenarioDir).filter(f => f.endsWith('.sql'));
const read = (f: string) => fs.readFileSync(path.join(scenarioDir, f), 'utf8');

describe('pro SQL scripts', () => {
  it('are executable', () => {
    for (const f of [runnerPath, racePath]) {
      expect(() => fs.accessSync(f, fs.constants.X_OK)).not.toThrow();
    }
  });

  it('are run by the runner by default, every scenario there is, in the order of their numbers', () => {
    const scenarios = sqlFiles.filter(f => /^p\d+_/.test(f)).map(f => f.replace(/\.sql$/, '')).sort();
    const listed = runner.match(/scenarios=\((p\d[^)]*)\)/)![1].trim().split(/\s+/);
    expect(listed).toEqual(scenarios);
    expect(listed.map(s => Number(/^p(\d+)_/.exec(s)![1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(listed).toEqual(['p1_profile_invite_connect', 'p2_sharing', 'p3_work', 'p4_edges', 'p5_deletion', 'p6_moderation', 'p7_catalog', 'p8_legacy_lockdown']);
  });

  it('build every scenario as one transaction: begin, the lib, the fixtures, the scenario, and a tail that rolls back', () => {
    expect(runner).toContain('echo "begin;"');
    expect(runner).toContain('cat "$dir/00_lib.sql" "$dir/10_fixture_users.sql" "$dir/20_fixture_closets.sql" "$dir/$s.sql" "$dir/99_tail.sql"');
    const tail = read('99_tail.sql');
    expect(tail.trim().endsWith('rollback;')).toBe(true);
    expect(tail).toContain('raise exception');                                               // a failed check fails the run
    expect(tail).toContain('where not ok');
  });

  it('end every run in a rollback, and commit nowhere but in race.sh', () => {
    for (const f of sqlFiles) {
      expect([f, /^\s*((commit|begin|rollback)(\s+(work|transaction))?\s*;|start\s+transaction|savepoint\s+\w+|release\s+savepoint)/im.test(read(f))]).toEqual([f, f === '99_tail.sql']);
    }
    expect(read('99_tail.sql').match(/^\s*commit\b/gim)).toBeNull();
    expect(runner).not.toMatch(/echo\s+"?commit/i);
    expect(runner).not.toMatch(/^\s*commit\b/im);
    expect(race).toMatch(/^\s*commit;/m);                                                    // race.sh is the one that commits
  });

  it('never let a scenario touch a real project unless it is spelled out, and never commit there', () => {
    expect(runner).toContain('--linked');
    expect(runner).toContain('usage: scripts/run-pro-sql-tests.sh --scratch|--linked');
    const run = (...args: string[]) => spawnSync('bash', [runnerPath, ...args], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
    const none = run();
    expect(none.status).toBe(2);
    expect(none.stderr).toContain('usage');
    const unknown = run('--drop-everything');
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('unknown option');
    const buildOnly = run('--build-only');
    expect(buildOnly.status).toBe(2);                                                        // --build-only goes with --scratch
  });

  it('keep the scratch database private: a socket only, unless asked, and never over an existing directory', () => {
    expect(runner).toContain(`listen="''"`);
    expect(runner).toContain('PRO_SCRATCH_TCP');
    expect(runner).toContain('refusing to reuse');
    expect(runner).toContain('trust');
  });

  describe('race.sh, which commits its fixtures, only runs against a local database', () => {
    const run = (url?: string) => spawnSync('bash', [racePath], {
      env: url === undefined ? { PATH: process.env.PATH } : { PATH: process.env.PATH, PRO_TEST_DB_URL: url },
      encoding: 'utf8',
    });

    it('refuses a remote host, wherever "localhost" or "127.0.0.1" also appears in the text', () => {
      for (const url of [
        'postgresql://postgres:pw@db.invalid:5432/postgres',
        'postgresql://postgres:localhost@db.invalid/postgres',
        'postgresql://postgres:pw@db.invalid/127.0.0.1',
        'postgresql://postgres@db.invalid/postgres?application_name=127.0.0.1',
        'postgresql://postgres@localhost.invalid/postgres',
        'postgresql://postgres@127.0.0.1.invalid/postgres',
      ]) {
        const r = run(url);
        expect({ url, status: r.status, refused: /refusing to run/.test(r.stderr) }).toEqual({ url, status: 1, refused: true });
      }
    });

    it('refuses a URL that carries its own host, and anything that is not a URL', () => {
      for (const url of [
        'postgresql://postgres@127.0.0.1/postgres?host=db.invalid',
        'postgresql://postgres@127.0.0.1/postgres?sslmode=disable&hostaddr=10.0.0.5',
        'postgresql://postgres@127.0.0.1/postgres?service=live',
        'postgresql://postgres@127.0.0.1/postgres?%68ost=db.invalid',
        'postgresql://postgres@127.0.0.1/postgres?%73ervice=live',
        'postgresql://postgres@127.0.0.1/postgres?%68ostaddr=10.0.0.5',
        'postgresql://postgres@127.0.0.1:1,db.invalid:5432/postgres',
        'postgresql://postgres@127.0.0.1@db.invalid/postgres',
        'postgresql://postgres@127.0.0.1/postgres?sslmode=disable&options=-c%20search_path%3Dx',
        'host=db.invalid dbname=127.0.0.1',
      ]) {
        const r = run(url);
        expect({ url, status: r.status, refused: /refusing to run/.test(r.stderr) }).toEqual({ url, status: 1, refused: true });
      }
    });

    it('refuses to run without a URL', () => {
      const r = run();
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('PRO_TEST_DB_URL');
    });

    it('lets local addresses through its check (the check alone is run, nothing connects)', () => {
      const start = race.indexOf('case "$PRO_TEST_DB_URL" in postgres://*');
      const end = race.indexOf('unset PGHOSTADDR');
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      const guard = race.slice(start, end);
      for (const url of [
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        'postgresql://postgres:p%40ss@127.0.0.1:54322/postgres',
        'postgres://postgres@localhost/postgres?sslmode=disable',
        'postgresql://postgres@127.0.0.1:54322/postgres?sslmode=disable&connect_timeout=2',
        'postgresql://postgres@127.0.0.1:54322/postgres?application_name=ghost',
        'postgresql://postgres@[::1]:5432/postgres',
      ]) {
        const r = spawnSync('bash', ['-c', `set -eu\n${guard}\necho passed`], {
          env: { PATH: process.env.PATH, PRO_TEST_DB_URL: url }, encoding: 'utf8',
        });
        expect({ url, out: r.stdout.trim(), err: r.stderr.trim() }).toEqual({ url, out: 'passed', err: '' });
      }
    });

    it('checks the address before it runs anything against the database', () => {
      expect(race.indexOf('refusing to run')).toBeGreaterThan(-1);
      expect(race.indexOf('local_host=')).toBeLessThan(race.indexOf('psql "$PRO_TEST_DB_URL"'));
      expect(race.indexOf('local_host=')).toBeLessThan(race.indexOf('clean_db\n'));
    });
  });
});
