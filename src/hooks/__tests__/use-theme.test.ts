import { renderHook } from '@testing-library/react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: jest.fn(),
}));

const mockedUseColorScheme = useColorScheme as jest.Mock;

describe('useTheme', () => {
  it('returns the light palette when scheme is light', () => {
    mockedUseColorScheme.mockReturnValue('light');
    const { result } = renderHook(() => useTheme());
    expect(result.current).toEqual(Colors.light);
  });

  it('returns the dark palette when scheme is dark', () => {
    mockedUseColorScheme.mockReturnValue('dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current).toEqual(Colors.dark);
  });

  it('falls back to light when scheme is unspecified', () => {
    mockedUseColorScheme.mockReturnValue('unspecified');
    const { result } = renderHook(() => useTheme());
    expect(result.current).toEqual(Colors.light);
  });
});
