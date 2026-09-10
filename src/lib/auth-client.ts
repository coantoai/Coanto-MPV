import { supabase } from '@/integrations/supabase/client';

export type ClientAuthSession = {
  accessToken: string;
  userId?: string;
};

export type AuthResult = {
  session: ClientAuthSession | null;
  message?: string;
};

/**
 * Browser auth boundary for COANTO.
 *
 * Core UI must depend on this module rather than a vendor SDK directly.
 * Today the implementation is Supabase-backed. Moving auth to InsForge
 * therefore becomes an adapter change instead of an application rewrite.
 */
export const clientAuth = {
  async getSession(): Promise<ClientAuthSession | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (!session) return null;
    return {
      accessToken: session.access_token,
      userId: session.user?.id,
    };
  },

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    return {
      session: data.session
        ? { accessToken: data.session.access_token, userId: data.session.user?.id }
        : null,
    };
  },

  async signUp(email: string, password: string, redirectTo?: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    });
    if (error) throw error;
    return {
      session: data.session
        ? { accessToken: data.session.access_token, userId: data.session.user?.id }
        : null,
      message: data.session ? undefined : 'verification-required',
    };
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
