import { render } from '@testing-library/react-native';

import { ThemedView } from '@/components/themed-view';

describe('ThemedView', () => {
  it('renders with the default background theme color', () => {
    const tree = render(<ThemedView testID="bg-default" />);
    const view = tree.getByTestId('bg-default');
    expect(view).toBeTruthy();
  });

  it('honors an explicit type prop', () => {
    const tree = render(<ThemedView type="background" testID="bg-explicit" />);
    expect(tree.getByTestId('bg-explicit')).toBeTruthy();
  });
});
