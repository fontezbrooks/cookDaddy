import { fireEvent, render, screen } from '@testing-library/react-native';

import { InviteShareCard } from '@/components/invite-share-card';

jest.mock('qrcode-generator', () =>
  jest.fn(() => ({
    addData: jest.fn(),
    make: jest.fn(),
    getModuleCount: () => 3,
    isDark: (row: number, col: number) => (row + col) % 2 === 0,
  })),
);

describe('InviteShareCard', () => {
  it('renders the formatted code, QR, and share action', () => {
    const onShare = jest.fn();

    render(<InviteShareCard code="A2FGH4K9" onShare={onShare} />);

    expect(screen.getByTestId('invite-share-code')).toHaveTextContent('A2FG-H4K9');
    expect(screen.getByTestId('invite-share-qr')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('invite-share-button'));

    expect(onShare).toHaveBeenCalledTimes(1);
  });
});
