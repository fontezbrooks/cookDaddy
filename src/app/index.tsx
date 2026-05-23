// Root route — bounces into the (app) group, where the layout-level Clerk
// guard either renders /home or redirects to /(auth)/sign-in. Keeping this
// thin so we don't duplicate the auth guard.

import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/home" />;
}
