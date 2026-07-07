import { fireEvent, render, screen } from '@testing-library/react-native';

import { SearchInput } from '@/components/search-input';

describe('SearchInput', () => {
  it('renders with the default placeholder', () => {
    render(<SearchInput value="" testID="recipe-search" onChangeText={jest.fn()} />);

    expect(screen.getByPlaceholderText('Search our recipes...')).toBeOnTheScreen();
  });

  it('calls onChangeText when text changes', () => {
    const onChangeText = jest.fn();
    render(<SearchInput value="" testID="recipe-search" onChangeText={onChangeText} />);

    fireEvent.changeText(screen.getByTestId('recipe-search'), 'pasta');

    expect(onChangeText).toHaveBeenCalledWith('pasta');
  });
});
