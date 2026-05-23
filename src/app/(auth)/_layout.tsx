// Auth group layout — anything inside (auth)/ is reachable without a Clerk
// session. The (app)/_layout owns the inverse guard.

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
