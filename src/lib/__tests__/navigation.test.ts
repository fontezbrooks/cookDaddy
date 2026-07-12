import { goBackOr } from '@/lib/navigation';

type RouterArg = Parameters<typeof goBackOr>[0];

function makeRouter(canGoBack: boolean) {
  return {
    router: {
      canGoBack: jest.fn().mockReturnValue(canGoBack),
      back: jest.fn(),
      replace: jest.fn(),
    },
  };
}

describe('goBackOr', () => {
  it('pops when the stack has history', () => {
    const { router } = makeRouter(true);

    goBackOr(router as unknown as RouterArg, '/settings');

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('replaces with the fallback when a deep link mounted the screen first (nothing to pop)', () => {
    const { router } = makeRouter(false);

    goBackOr(router as unknown as RouterArg, '/settings');

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/settings');
  });
});
