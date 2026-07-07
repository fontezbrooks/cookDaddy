import { fireEvent, render, screen } from '@testing-library/react-native';

import { RecipeCard } from '@/components/recipe-card';

jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Image: (props: Record<string, unknown>) => React.createElement(View, props),
  };
});

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    LinearGradient: (props: Record<string, unknown>) => React.createElement(View, props),
  };
});

describe('RecipeCard', () => {
  it('renders the title and time label', () => {
    render(<RecipeCard title="Tomato pasta" timeLabel="25 min" />);

    expect(screen.getByText('Tomato pasta')).toBeOnTheScreen();
    expect(screen.getByText('25 min')).toBeOnTheScreen();
  });

  it('calls onPress when the card is pressed', () => {
    const onPress = jest.fn();
    render(<RecipeCard title="Tomato pasta" testID="recipe-card" onPress={onPress} />);

    fireEvent.press(screen.getByTestId('recipe-card'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleFavorite from the favorite control', () => {
    const onToggleFavorite = jest.fn();
    render(
      <RecipeCard
        favorite={false}
        title="Tomato pasta"
        testID="recipe-card"
        onToggleFavorite={onToggleFavorite}
      />,
    );

    fireEvent.press(screen.getByTestId('recipe-card-fav'));

    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
  });
});
