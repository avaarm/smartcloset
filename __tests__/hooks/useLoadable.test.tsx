import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { useLoadable } from '../../src/hooks/useLoadable';

type Probe = ReturnType<typeof useLoadable<string[], void>>;

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const setup = async (load: () => Promise<string[]>) => {
  const probe = { current: null as unknown as Probe };
  const Harness = () => {
    probe.current = useLoadable(load, []);
    return null;
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Harness />);
  });
  return { probe, tree };
};

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('useLoadable', () => {
  it('is loading until the first load settles, then holds the data', async () => {
    const d = deferred<string[]>();
    const { probe } = await setup(() => d.promise);
    await act(async () => {
      probe.current.reload();
    });
    expect(probe.current.loading).toBe(true);
    expect(probe.current.hasLoaded).toBe(false);

    await act(async () => d.resolve(['a']));
    expect(probe.current.loading).toBe(false);
    expect(probe.current.hasLoaded).toBe(true);
    expect(probe.current.data).toEqual(['a']);
  });

  it('a failed first load is blocked (not an empty list), and a retry goes back to loading', async () => {
    const first = deferred<string[]>();
    const second = deferred<string[]>();
    const load = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { probe } = await setup(load);

    await act(async () => {
      probe.current.reload();
    });
    await act(async () => first.reject(new Error('offline')));
    expect(probe.current.blocked).toBe(true);
    expect(probe.current.loading).toBe(false);
    expect(probe.current.hasLoaded).toBe(false);

    await act(async () => {
      probe.current.reload();
    });
    expect(probe.current.blocked).toBe(false);
    expect(probe.current.loading).toBe(true);

    await act(async () => second.resolve(['x']));
    expect(probe.current.data).toEqual(['x']);
    expect(probe.current.failed).toBe(false);
  });

  it('a failed reload keeps the loaded data and only flags failed; success clears it', async () => {
    const load = jest
      .fn()
      .mockResolvedValueOnce(['a', 'b'])
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(['a', 'b', 'c']);
    const { probe } = await setup(load);

    await act(async () => {
      await probe.current.reload();
    });
    let ok = true;
    await act(async () => {
      ok = await probe.current.reload();
    });
    expect(ok).toBe(false);
    expect(probe.current.failed).toBe(true);
    expect(probe.current.blocked).toBe(false);
    expect(probe.current.loading).toBe(false);
    expect(probe.current.data).toEqual(['a', 'b']);

    await act(async () => {
      await probe.current.reload();
    });
    expect(probe.current.failed).toBe(false);
    expect(probe.current.data).toEqual(['a', 'b', 'c']);
  });

  it('only the most recent reload may write state', async () => {
    const slow = deferred<string[]>();
    const fast = deferred<string[]>();
    const load = jest.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { probe } = await setup(load);

    await act(async () => {
      probe.current.reload();
      probe.current.reload();
    });
    await act(async () => fast.resolve(['new']));
    await act(async () => slow.resolve(['old']));
    expect(probe.current.data).toEqual(['new']);
  });

  it('a stale failure does not flag the newer, successful load', async () => {
    const slow = deferred<string[]>();
    const fast = deferred<string[]>();
    const load = jest.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { probe } = await setup(load);

    await act(async () => {
      probe.current.reload();
      probe.current.reload();
    });
    await act(async () => fast.resolve(['new']));
    await act(async () => slow.reject(new Error('late failure')));
    expect(probe.current.failed).toBe(false);
    expect(probe.current.data).toEqual(['new']);
  });

  it('refresh() drives the pull-to-refresh spinner', async () => {
    const d = deferred<string[]>();
    const load = jest.fn().mockResolvedValueOnce(['a']).mockReturnValueOnce(d.promise);
    const { probe } = await setup(load);
    await act(async () => {
      await probe.current.reload();
    });

    await act(async () => {
      probe.current.refresh();
    });
    expect(probe.current.refreshing).toBe(true);
    await act(async () => d.resolve(['a', 'b']));
    expect(probe.current.refreshing).toBe(false);
    expect(probe.current.data).toEqual(['a', 'b']);
  });

  it('update() edits the loaded data in place', async () => {
    const { probe } = await setup(async () => ['a', 'b']);
    await act(async () => {
      await probe.current.reload();
    });
    await act(async () => probe.current.update(list => list.filter(x => x !== 'a')));
    expect(probe.current.data).toEqual(['b']);
  });

  it('passes its argument through to the loader', async () => {
    const load = jest.fn(async (force: boolean) => [String(force)]);
    const probe = { current: null as any };
    const Harness = () => {
      probe.current = useLoadable(load, [] as string[]);
      return null;
    };
    await act(async () => {
      renderer.create(<Harness />);
    });
    await act(async () => {
      await probe.current.reload(true);
    });
    expect(load).toHaveBeenCalledWith(true);
    expect(probe.current.data).toEqual(['true']);
  });
});
