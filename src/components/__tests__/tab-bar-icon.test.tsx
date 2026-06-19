import { render } from '@testing-library/react-native';

import { TabBarIcon } from '@/components/tab-bar-icon';

const mockUseReducedMotion = jest.fn();
jest.mock('@/lib/use-reduced-motion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

describe('TabBarIcon', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReset().mockReturnValue(false);
  });

  it('renders focused without crashing', () => {
    const { toJSON } = render(<TabBarIcon name="home" focused color="#000" size={24} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders unfocused without crashing', () => {
    const { toJSON } = render(<TabBarIcon name="home" focused={false} color="#000" size={24} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with reduced motion enabled', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { toJSON } = render(<TabBarIcon name="home" focused color="#000" size={24} />);
    expect(toJSON()).toBeTruthy();
  });
});
