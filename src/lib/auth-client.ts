import { supabase } from '@/integrations/supabase/client';

export type ClientAuthSession = {
  accessToken: string;
  userId?: string;
};

export type AuthResult = {
  session: ClientAuthSession | null;
  message?: string;
};

function toSession(session: { access_token: string; user?: { id?: string } | null } | null): ClientAuthSession | null {
  if (!session) return null;
  const base: ClientAuthSession = { accessToken: session.access_token };
  const userId = session.user?.id;
  return userId ? { ...base, userId } : base;
}

/** Browser auth boundary for COANTO. */
export const clientAuth = {
  async getSession(): Promise<ClientAuthSession | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return toSession(data.session);
  },

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    return { session: toSession(data.session) };
  },

  async signUp(email: string, password: string, redirectTo?: string): Promise<AuthResult> {
    const credentials = redirectTo
      ? { email: email.trim(), password, options: { emailRedirectTo: redirectTo } }
      : { email: email.trim(), password };
    const { data, error } = await supabase.auth.signUp(credentials);
    if (error) throw error;
    const session = toSession(data.session);
    return session ? { session } : { session: null, message: 'verification-required' };
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
