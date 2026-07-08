import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

// Foreground notifications still surface a banner/list while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const SCHEME = 'cookdaddy://';
const ALLOWED_PREFIXES = ['cookbook/', 'session/', 'home'];

// Pure: map a tapped notification's data payload to an in-app route path, or
// null when it isn't a recognized deep link. Prefers the explicit deep_link
// URL; falls back to type + ids (DESIGN §9.3).
export function resolveDeepLinkPath(
  data: Record<string, unknown> | null | undefined,
): string | null {
  if (!data) return null;

  const link = typeof data.deep_link === 'string' ? data.deep_link : null;
  if (link && link.startsWith(SCHEME)) {
    const rest = link.slice(SCHEME.length); // 'cookbook/<id>' | 'session/<id>' | 'home'
    if (ALLOWED_PREFIXES.some((p) => rest === p || rest.startsWith(p))) {
      return `/${rest}`;
    }
    return null;
  }

  const type = typeof data.type === 'string' ? data.type : null;
  if (type === 'match' && typeof data.match_id === 'string') return `/cookbook/${data.match_id}`;
  if (type === 'session_invited' && typeof data.session_id === 'string') {
    return `/session/${data.session_id}`;
  }
  if (type === 'pod_joined') return '/home';
  return null;
}

// Navigates to the deep-linked screen on a notification tap (warm) and on the
// notification that cold-started the app. No-op when the payload isn't a
// recognized deep link.
export function usePushDeepLink(): void {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const handle = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification?.request?.content?.data as
        Record<string, unknown> | undefined;
      const path = resolveDeepLinkPath(data);
      if (path) router.push(path as never);
    };

    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (mounted) handle(r);
    });
    const sub = Notifications.addNotificationResponseReceivedListener((r) => handle(r));

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [router]);
}
