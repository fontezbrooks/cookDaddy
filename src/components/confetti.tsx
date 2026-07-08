// Skia-rendered confetti emitter (P8 Slice 2) per MATCH-UX §4.3.
//
// 60 particles spawn at a configured origin (±40px jitter) and fly with
// initial velocity 200–400 units/s upward, ±60° spread. Gravity is
// 600 units/s² downward; each particle has its own constant angular
// velocity. Lifetime is 1.8–2.2s with the final 400ms fading alpha to 0.
//
// Shape mix per spec: 50% circles / 30% squares / 20% hearts. Colors
// rotate through the three celebration hues from the design tokens.
//
// Renders nothing in reduced-motion — that gate lives in the caller
// (match-overlay) so this component stays pure-presentational.
//
// Skia primitives require a custom Expo dev client (Expo Go doesn't
// bundle the native module). The Jest mock stubs Canvas/Group/Circle/
// /Rect/Path/Path's d-string so the component is testable without the
// native side wired up.

import { useEffect, useMemo } from 'react';
import {
  Canvas,
  Circle,
  Group,
  Path,
  Rect,
  Skia,
  type SkPath,
  type Transforms3d,
} from '@shopify/react-native-skia';
import {
  Easing,
  type DerivedValue,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { DesignTokens } from '@/constants/design-tokens';

// MATCH-UX §4.3 spec values, hoisted so the test suite can assert against
// them and the values stay co-located with the math.
export const CONFETTI_PARTICLE_COUNT = 60;
export const CONFETTI_JITTER_PX = 40;
export const CONFETTI_VELOCITY_MIN = 200;
export const CONFETTI_VELOCITY_MAX = 400;
export const CONFETTI_SPREAD_DEG = 60;
export const CONFETTI_GRAVITY = 600;
export const CONFETTI_LIFETIME_MIN_S = 1.8;
export const CONFETTI_LIFETIME_MAX_S = 2.2;
export const CONFETTI_FADE_S = 0.4;

type Shape = 'circle' | 'square' | 'heart';

type ParticleSpec = {
  shape: Shape;
  size: number;
  color: string;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  omega: number; // rad/s
  lifetime: number; // s
};

type ConfettiProps = {
  // Origin in screen-local coordinates (center of the recipe card).
  originX: number;
  originY: number;
  // Total drawable area; Skia Canvas needs explicit width/height.
  width: number;
  height: number;
  // Override the default particle count (CONFETTI_PARTICLE_COUNT). The
  // variant catalog (P8 Slice 4 / MATCH-UX §7) bumps firstOfSession by
  // +20%; other variants leave this undefined and inherit the default.
  particleCount?: number;
};

const HEART_PATH =
  'M0,-10 C-10,-25 -30,-25 -30,-5 C-30,15 0,30 0,30 C0,30 30,15 30,-5 C30,-25 10,-25 0,-10 Z';
const COLORS = [
  DesignTokens.color.accent,
  DesignTokens.color.brandDeep.light,
  DesignTokens.color.poolTeal,
];

// Deterministic-ish RNG seeded by the count so the particle layout is
// stable per mount but varies across renders — keeps perceived motion
// alive without a real seedable PRNG.
function rng(): number {
  return Math.random();
}

function pickShape(roll: number): Shape {
  if (roll < 0.5) return 'circle';
  if (roll < 0.8) return 'square';
  return 'heart';
}

function buildParticles(originX: number, originY: number, count: number): ParticleSpec[] {
  const particles: ParticleSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    const speed = CONFETTI_VELOCITY_MIN + rng() * (CONFETTI_VELOCITY_MAX - CONFETTI_VELOCITY_MIN);
    // Angle measured from upward (-y). Spread is ±60° → angle in [-60°, +60°].
    const angleDeg = (rng() * 2 - 1) * CONFETTI_SPREAD_DEG;
    const angleRad = (angleDeg * Math.PI) / 180;
    const vx = speed * Math.sin(angleRad);
    const vy = -speed * Math.cos(angleRad); // upward = negative y
    const x0 = originX + (rng() * 2 - 1) * CONFETTI_JITTER_PX;
    const y0 = originY + (rng() * 2 - 1) * CONFETTI_JITTER_PX;
    // Angular velocity 0–360°/s mapped to radians.
    const omega = rng() * Math.PI * 2;
    const lifetime =
      CONFETTI_LIFETIME_MIN_S + rng() * (CONFETTI_LIFETIME_MAX_S - CONFETTI_LIFETIME_MIN_S);
    const shape = pickShape(rng());
    const size = 6 + rng() * 6; // 6-12 px
    const color = COLORS[i % COLORS.length] ?? COLORS[0]!;
    particles.push({ shape, size, color, x0, y0, vx, vy, omega, lifetime });
  }
  return particles;
}

// One progress shared value runs 0→1 over the maximum particle lifetime;
// each particle interpolates its own (t, pos, rotation, alpha) against
// the same clock. Lighter than 60 independent withTiming animations.
export function Confetti({ originX, originY, width, height, particleCount }: ConfettiProps) {
  const count = particleCount ?? CONFETTI_PARTICLE_COUNT;
  const particles = useMemo(
    () => buildParticles(originX, originY, count),
    [originX, originY, count],
  );
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: CONFETTI_LIFETIME_MAX_S * 1000,
      easing: Easing.linear,
    });
  }, [progress]);

  return (
    <Canvas style={{ width, height }} testID="match-overlay-confetti">
      {particles.map((p, i) => (
        <Particle key={i} spec={p} progress={progress} />
      ))}
    </Canvas>
  );
}

type ParticleProps = {
  spec: ParticleSpec;
  progress: ReturnType<typeof useSharedValue<number>>;
};

function Particle({ spec, progress }: ParticleProps) {
  const t = useDerivedValue(() => progress.value * CONFETTI_LIFETIME_MAX_S);
  const x = useDerivedValue(() => spec.x0 + spec.vx * t.value);
  const y = useDerivedValue(
    () => spec.y0 + spec.vy * t.value + 0.5 * CONFETTI_GRAVITY * t.value * t.value,
  );
  const rotation = useDerivedValue(() => spec.omega * t.value);
  // Alpha is 1 until (lifetime - 0.4s), then linearly fades to 0 at
  // (lifetime). After lifetime the particle is invisible.
  const opacity = useDerivedValue(() => {
    const remaining = spec.lifetime - t.value;
    if (remaining <= 0) return 0;
    if (remaining < CONFETTI_FADE_S) return remaining / CONFETTI_FADE_S;
    return 1;
  });

  const transform = useDerivedValue<Transforms3d>(() => [
    { translateX: x.value },
    { translateY: y.value },
    { rotate: rotation.value },
  ]);

  if (spec.shape === 'circle') {
    return (
      <Group transform={transform} opacity={opacity}>
        <Circle cx={0} cy={0} r={spec.size / 2} color={spec.color} />
      </Group>
    );
  }
  if (spec.shape === 'square') {
    return (
      <Group transform={transform} opacity={opacity}>
        <Rect
          x={-spec.size / 2}
          y={-spec.size / 2}
          width={spec.size}
          height={spec.size}
          color={spec.color}
        />
      </Group>
    );
  }
  return <HeartParticle spec={spec} transform={transform} opacity={opacity} />;
}

function HeartParticle({
  spec,
  transform,
  opacity,
}: {
  spec: ParticleSpec;
  transform: DerivedValue<Transforms3d>;
  opacity: DerivedValue<number>;
}) {
  // The heart path is authored on a ~60px box; scale down to particle
  // size. Built once per mount since the geometry is static.
  const heart: SkPath = useMemo(() => {
    const p = Skia.Path.MakeFromSVGString(HEART_PATH);
    if (!p) throw new Error('confetti: failed to parse heart path');
    const scale = spec.size / 60;
    p.transform(Skia.Matrix().scale(scale, scale));
    return p;
  }, [spec.size]);

  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={heart} color={spec.color} />
    </Group>
  );
}
