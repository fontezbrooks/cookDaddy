import { fireEvent, render, screen } from '@testing-library/react-native';

import { SecondaryButton } from '@/components/secondary-button';

describe('SecondaryButton', () => {
  it('renders the title text', () => {
    render(<SecondaryButton title="Maybe later" onPress={jest.fn()} />);
    expect(screen.getByText('Maybe later')).toBeOnTheScreen();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<SecondaryButton title="Maybe later" testID="secondary-button" onPress={onPress} />);

    fireEvent.press(screen.getByTestId('secondary-button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    render(
      <SecondaryButton title="Maybe later" testID="secondary-button" disabled onPress={onPress} />,
    );

    fireEvent.press(screen.getByTestId('secondary-button'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('secondary-button').props.accessibilityState).toEqual({
      disabled: true,
    });
  });
});
