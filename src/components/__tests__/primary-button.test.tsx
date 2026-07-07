import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';

describe('PrimaryButton', () => {
  it('renders the title text', () => {
    render(<PrimaryButton title="Continue" onPress={jest.fn()} />);
    expect(screen.getByText('Continue')).toBeOnTheScreen();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<PrimaryButton title="Continue" testID="primary-button" onPress={onPress} />);

    fireEvent.press(screen.getByTestId('primary-button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    render(<PrimaryButton title="Continue" testID="primary-button" disabled onPress={onPress} />);

    fireEvent.press(screen.getByTestId('primary-button'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('forwards testID', () => {
    render(<PrimaryButton title="Continue" testID="primary-button" onPress={jest.fn()} />);
    expect(screen.getByTestId('primary-button')).toBeOnTheScreen();
  });

  it('renders an optional trailing icon', () => {
    render(
      <PrimaryButton
        title="Continue"
        trailingIcon={<Text testID="primary-button-icon">→</Text>}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByTestId('primary-button-icon')).toBeOnTheScreen();
  });
});
