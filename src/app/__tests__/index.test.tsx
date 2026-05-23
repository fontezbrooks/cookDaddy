import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

describe('HomeScreen', () => {
  it('renders the cookDaddy title', () => {
    render(<HomeScreen />);
    expect(screen.getByTestId('app-title')).toHaveTextContent('cookDaddy');
  });

  it('renders the phase 0 placeholder copy', () => {
    render(<HomeScreen />);
    expect(screen.getByText(/Phase 0 — rails up/)).toBeOnTheScreen();
  });
});
