/**
 * Match overlay contract (P6d, MATCH-UX §3 + §10).
 *
 *   • Renders match copy + recipe title + image,
 *   • "Cook this!" CTA fires onPrimary with the match payload,
 *   • "Keep swiping" CTA fires onClose,
 *   • Auto-closes at 2.5s (hard cap, MATCH-UX §14),
 *   • Reduced-motion branch swaps animations for a crossfade testID,
 *   • Accessibility: container has an a11y label that screen readers can
 *     announce per MATCH-UX §10.
 *
 * Skia confetti, expo-haptics, expo-audio, ken-burns, and the variant
 * copy (first-of-session / first-ever / streak / speedy / last-card) are
 * deferred to P8 polish. This test pins down the *structural* contract.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import { MatchOverlay, type MatchOverlayPayload } from '../match-overlay';

const mockUseReducedMotion = jest.fn();
jest.mock('@/lib/use-reduced-motion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

const mockHapticsImpactLight = jest.fn();
const mockHapticsImpactHeavy = jest.fn();
jest.mock('@/lib/haptics', () => ({
  haptics: {
    impactLight: () => mockHapticsImpactLight(),
    impactHeavy: () => mockHapticsImpactHeavy(),
    selection: jest.fn(),
    notificationSuccess: jest.fn(),
  },
}));

const PAYLOAD: MatchOverlayPayload = {
  matchId: 'm-1',
  recipeId: 'r-1',
  recipeTitle: 'Cacio e Pepe',
  recipeImageUrl: 'https://example/img.jpg',
};

describe('MatchOverlay', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReset().mockReturnValue(false);
    mockHapticsImpactLight.mockReset();
    mockHapticsImpactHeavy.mockReset();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the recipe title and the celebratory copy', () => {
    render(<MatchOverlay payload={PAYLOAD} onClose={jest.fn()} />);
    expect(screen.getByTestId('match-overlay')).toBeOnTheScreen();
    // Curly apostrophe in the source — regex tolerates either.
    expect(screen.getByTestId('match-overlay')).toHaveTextContent(/it[’']?s a match/i);
    expect(screen.getByTestId('match-overlay')).toHaveTextContent(/Cacio e Pepe/);
  });

  it('Cook this CTA invokes onPrimary with the payload', () => {
    const onPrimary = jest.fn();
    render(<MatchOverlay payload={PAYLOAD} onClose={jest.fn()} onPrimary={onPrimary} />);
    fireEvent.press(screen.getByTestId('match-overlay-primary'));
    expect(onPrimary).toHaveBeenCalledWith(PAYLOAD);
  });

  it('Keep swiping CTA invokes onClose', () => {
    const onClose = jest.fn();
    render(<MatchOverlay payload={PAYLOAD} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('match-overlay-secondary'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-closes after the 2.5s hard cap', () => {
    const onClose = jest.fn();
    render(<MatchOverlay payload={PAYLOAD} onClose={onClose} />);
    jest.advanceTimersByTime(2500);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the reduced-motion variant when the hook reports reduce-motion on', () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<MatchOverlay payload={PAYLOAD} onClose={jest.fn()} />);
    expect(screen.getByTestId('match-overlay-reduced-motion')).toBeOnTheScreen();
  });

  it('exposes an accessibility label announcing the match', () => {
    render(<MatchOverlay payload={PAYLOAD} onClose={jest.fn()} />);
    const overlay = screen.getByTestId('match-overlay');
    expect(overlay.props.accessibilityLabel).toMatch(/match.*Cacio e Pepe/i);
  });

  it('fires the MATCH-UX §5 haptic pattern on mount (light at t=0/280ms, heavy at reveal)', () => {
    render(<MatchOverlay payload={PAYLOAD} onClose={jest.fn()} />);
    // Soft impact at t=0 (mount).
    expect(mockHapticsImpactLight).toHaveBeenCalledTimes(1);

    // Heartbeat double-tap at t=280ms.
    jest.advanceTimersByTime(280);
    expect(mockHapticsImpactLight).toHaveBeenCalledTimes(2);

    // Heavy payoff hit at t=750ms (reveal).
    jest.advanceTimersByTime(750 - 280);
    expect(mockHapticsImpactHeavy).toHaveBeenCalledTimes(1);
  });

  it('skips the haptic pattern entirely in the reduced-motion variant', () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<MatchOverlay payload={PAYLOAD} onClose={jest.fn()} />);
    jest.advanceTimersByTime(2500);
    expect(mockHapticsImpactLight).not.toHaveBeenCalled();
    expect(mockHapticsImpactHeavy).not.toHaveBeenCalled();
  });
});
