import { fireEvent, render, screen } from '@testing-library/react-native';

import { FilterChip } from '@/components/filter-chip';

describe('FilterChip', () => {
  it('renders the label', () => {
    render(<FilterChip active={false} label="Vegetarian" onPress={jest.fn()} />);

    expect(screen.getByText('Vegetarian')).toBeOnTheScreen();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<FilterChip active={false} label="Vegetarian" testID="filter-chip" onPress={onPress} />);

    fireEvent.press(screen.getByTestId('filter-chip'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reflects active state as selected', () => {
    render(<FilterChip active label="Vegetarian" testID="filter-chip" onPress={jest.fn()} />);

    expect(screen.getByTestId('filter-chip').props.accessibilityState).toEqual({ selected: true });
  });
});
