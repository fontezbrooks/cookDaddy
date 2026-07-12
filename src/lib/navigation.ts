import { type Href, useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

// Deep links can mount a child screen as the first entry of its stack (e.g.
// Home → /settings/profile), leaving router.back() with nothing to pop and
// stranding the tab (docs/POD-READ-PATH/README.md FR-5). Pop when possible,
// otherwise land on the given fallback.
export function goBackOr(router: Router, fallback: Href): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
