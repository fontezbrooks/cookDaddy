// Verifies the Supabase client factory wires the Clerk token fetcher into the
// supabase-js `accessToken` option, so every REST + Realtime request bears the
// Clerk-issued JWT. The factory also surfaces missing-env errors loudly instead
// of silently producing a broken client.

import { createSupabaseClient, ensureSelfUserRow } from '@/lib/supabase';

const expoConstantsState: { extra: Record<string, unknown> } = {
  extra: {
    supabaseUrl: 'http://127.0.0.1:64321',
    supabaseAnonKey: 'anon-key-for-tests',
  },
};

jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return { expoConfig: { extra: expoConstantsState.extra } };
  },
}));

const mockedCreateClient = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  __esModule: true,
  createClient: (...args: unknown[]) => mockedCreateClient(...args),
}));

const originalEnv = process.env;

beforeEach(() => {
  mockedCreateClient.mockReset();
  mockedCreateClient.mockReturnValue({ from: jest.fn() });
  expoConstantsState.extra = {
    supabaseUrl: 'http://127.0.0.1:64321',
    supabaseAnonKey: 'anon-key-for-tests',
  };
  process.env = { ...originalEnv };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('createSupabaseClient', () => {
  it('passes url + anon key from expo Constants.extra to createClient', () => {
    createSupabaseClient(async () => 'jwt');
    expect(mockedCreateClient).toHaveBeenCalledTimes(1);
    const [url, anonKey] = mockedCreateClient.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:64321');
    expect(anonKey).toBe('anon-key-for-tests');
  });

  it('disables supabase session persistence (Clerk owns auth)', () => {
    createSupabaseClient(async () => 'jwt');
    const opts = mockedCreateClient.mock.calls[0]![2] as {
      auth: { persistSession: boolean; autoRefreshToken: boolean };
    };
    expect(opts.auth).toEqual({
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
  });

  it('wires accessToken to Clerk getToken with template=supabase', async () => {
    const getToken = jest.fn().mockResolvedValue('clerk-jwt-12345');
    createSupabaseClient(getToken);
    const opts = mockedCreateClient.mock.calls[0]![2] as {
      accessToken: () => Promise<string | null>;
    };
    const token = await opts.accessToken();
    expect(getToken).toHaveBeenCalledWith({ template: 'supabase' });
    expect(token).toBe('clerk-jwt-12345');
  });

  it('returns null (not undefined) when Clerk hands back null', async () => {
    const getToken = jest.fn().mockResolvedValue(null);
    createSupabaseClient(getToken);
    const opts = mockedCreateClient.mock.calls[0]![2] as {
      accessToken: () => Promise<string | null>;
    };
    expect(await opts.accessToken()).toBeNull();
  });

  it('throws when EXPO_PUBLIC_SUPABASE_URL is missing', () => {
    expoConstantsState.extra = {};
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(() => createSupabaseClient(async () => 'jwt')).toThrow(/SUPABASE_URL/);
  });

  it('throws when EXPO_PUBLIC_SUPABASE_ANON_KEY is missing', () => {
    expoConstantsState.extra = { supabaseUrl: 'http://127.0.0.1:64321' };
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => createSupabaseClient(async () => 'jwt')).toThrow(/SUPABASE_ANON_KEY/);
  });
});

describe('ensureSelfUserRow', () => {
  it('upserts the calling user identity with onConflict on id', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn().mockReturnValue({ upsert });
    const client = { from } as unknown as Parameters<typeof ensureSelfUserRow>[0];

    await ensureSelfUserRow(client, {
      id: 'user_alice',
      displayName: 'Alice',
      avatarUrl: 'https://img/alice.png',
    });

    expect(from).toHaveBeenCalledWith('users');
    expect(upsert).toHaveBeenCalledWith(
      { id: 'user_alice', display_name: 'Alice', avatar_url: 'https://img/alice.png' },
      { onConflict: 'id', ignoreDuplicates: false },
    );
  });

  it('throws when the upsert returns a supabase error', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: { message: 'rls denied' } });
    const from = jest.fn().mockReturnValue({ upsert });
    const client = { from } as unknown as Parameters<typeof ensureSelfUserRow>[0];

    await expect(ensureSelfUserRow(client, { id: 'user_x', displayName: 'X' })).rejects.toThrow(
      /rls denied/,
    );
  });
});
