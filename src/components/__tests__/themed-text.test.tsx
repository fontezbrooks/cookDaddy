import { render, screen } from '@testing-library/react-native';

import { ThemedText } from '@/components/themed-text';

const variants = [
  'default',
  'title',
  'small',
  'smallBold',
  'subtitle',
  'link',
  'linkPrimary',
  'code',
] as const;

describe('ThemedText', () => {
  it.each(variants)('renders %s variant', (type) => {
    render(<ThemedText type={type}>hello</ThemedText>);
    expect(screen.getByText('hello')).toBeOnTheScreen();
  });

  it('respects themeColor override', () => {
    render(<ThemedText themeColor="textSecondary">muted</ThemedText>);
    expect(screen.getByText('muted')).toBeOnTheScreen();
  });
});
