import { render, screen } from '@testing-library/react-native';

import { QrCode } from '@/components/qr-code';

jest.mock('qrcode-generator', () =>
  jest.fn(() => ({
    addData: jest.fn(),
    make: jest.fn(),
    getModuleCount: () => 3,
    isDark: (row: number, col: number) => (row + col) % 2 === 0,
  })),
);

describe('QrCode', () => {
  it('renders a QR code view', () => {
    render(<QrCode value="x" testID="qr" />);

    expect(screen.getByTestId('qr')).toBeOnTheScreen();
  });
});
