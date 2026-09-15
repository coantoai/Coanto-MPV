import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { clientAuth } from "@/lib/auth-client";

type Mode = 'signin' | 'signup' | 'verify' | 'forgot' | 'reset';
const RETURN_TO_KEY = 'coanto:return-to';

function safeReturnTo(value: string | null | undefined) {
  const candidate = value?.trim() ?? '';
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return '';
  return candidate;
}

function requestedReturnTo() {
  if (typeof window === 'undefined') return '';
  return safeReturnTo(new URLSearchParams(window.location.search).get('next'));
}

function rememberedReturnTo() {
  if (typeof window === 'undefined') return '';
  return safeReturnTo(window.sessionStorage.getItem(RETURN_TO_KEY));
}

function rememberReturnTo(value: string) {
  if (typeof window === 'undefined') return;
  const safe = safeReturnTo(value);
  if (safe) window.sessionStorage.setItem(RETURN_TO_KEY, safe);
}

function consumeReturnTo() {
  if (typeof window === 'undefined') return '';
  const value = rememberedReturnTo();
  window.sessionStorage.removeItem(RETURN_TO_KEY);
  return value;
}

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function continueAfterAuth() {
    const requested = requestedReturnTo() || rememberedReturnTo();
    if (requested) rememberReturnTo(requested);

    const response = await fetch('/api/business-context', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) return nav({ to: '/auth' });
    if (!response.ok) {
      const fallback = consumeReturnTo();
      if (fallback && typeof window !== 'undefined') window.location.assign(fallback);
      else return nav({ to: '/' });
      return;
    }
    const body = await response.json() as { completed?: boolean };
    if (!body.completed) return nav({ to: '/onboarding' });

    const destination = consumeReturnTo();
    if (destination && typeof window !== 'undefined') {
      window.location.assign(destination);
      return;
    }
    return nav({ to: '/' });
  }

  useEffect(() => {
    const requested = requestedReturnTo();
    if (requested) rememberReturnTo(requested);
    void clientAuth.getSession().then((session) => {
      if (session) void continueAfterAuth();
    }).catch(() => undefined);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [nav]);

  function authCallbackUrl() {
    if (typeof window === 'undefined') return '/auth';
    const requested = requestedReturnTo() || rememberedReturnTo();
    const url = new URL('/auth', window.location.origin);
    if (requested) url.searchParams.set('next', requested);
    return url.toString();
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      if (mode === 'verify') { await clientAuth.verifyEmail(email, otp); await continueAfterAuth(); return; }
      if (mode === 'forgot') {
        await clientAuth.requestPasswordReset(email, authCallbackUrl());
        setOtp(''); setPassword(''); setMode('reset');
        setError('أرسلنا رمزًا إلى بريدك. أدخل الرمز واختر كلمة مرور جديدة.'); return;
      }
      if (mode === 'reset') {
        await clientAuth.resetPassword(email, otp, password);
        setMode('signin'); setOtp('');
        setError('تم تغيير كلمة المرور. سجّل الدخول الآن ليعرض Google حفظ كلمة المرور الجديدة.'); return;
      }
      if (mode === 'signup') {
        const result = await clientAuth.signUp(email, password, authCallbackUrl());
        if (!result.session) {
          setMode('verify'); setOtp('');
          setError('أرسلنا رمز التحقق إلى بريدك. أدخله هنا لتكمل.'); return;
        }
      } else { await clientAuth.signIn(email, password); }
      await continueAfterAuth();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر إتمام العملية"); }
    finally { setBusy(false); }
  }

  const title = mode === 'verify' ? 'تأكيد البريد' : mode === 'signup' ? 'إنشاء حساب' : mode === 'forgot' ? 'استعادة كلمة المرور' : mode === 'reset' ? 'اختر كلمة مرور جديدة' : 'تسجيل الدخول';
  const button = mode === 'verify' ? 'تأكيد الرمز' : mode === 'signup' ? 'إنشاء الحساب' : mode === 'forgot' ? 'إرسال الرمز' : mode === 'reset' ? 'تغيير كلمة المرور' : 'دخول';
  const showCode = mode === 'verify' || mode === 'reset';
  const showPassword = mode === 'signin' || mode === 'signup' || mode === 'reset';

  return (
    <div dir="rtl" className="grid min-h-screen place-items-center bg-[#060910] p-4 text-white">
      <form onSubmit={submit} autoComplete="on" className="w-full max-w-md space-y-3 rounded-3xl border border-[#223148] bg-[#0d141f] p-6">
        <div className="text-xl font-black tracking-[3px] text-[#29d3bd]">COANTO</div>
        <h1 className="text-2xl font-black">{title}</h1>
        <input name="username" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" readOnly={mode === 'verify' || mode === 'reset'} className="w-full rounded-xl border border-white/10 bg-[#090e16] px-4 py-3" />
        {showCode && <input name="one-time-code" type="text" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="الرمز — 6 أرقام" className="w-full rounded-xl border border-white/10 bg-[#090e16] px-4 py-3 text-center text-xl tracking-[0.35em]" />}
        {showPassword && <input name="password" type="password" required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'reset' ? 'كلمة المرور الجديدة' : 'كلمة المرور'} className="w-full rounded-xl border border-white/10 bg-[#090e16] px-4 py-3" />}
        <button disabled={busy} className="w-full rounded-xl bg-[#29d3bd] py-3 font-black text-[#06100e]">{busy ? "جارٍ..." : button}</button>
        {error && <div className="rounded-xl border border-amber-300/30 p-3 text-xs text-amber-200">{error}</div>}

        {mode === 'signin' && <>
          <button type="button" onClick={() => { setMode('forgot'); setPassword(''); setError(''); }} className="w-full text-xs font-bold text-[#29d3bd]">نسيت كلمة المرور؟</button>
          <button type="button" onClick={() => { setMode('signup'); setError(''); }} className="w-full text-xs text-[#91a2b8]">ليس لديك حساب؟ أنشئ حسابًا</button>
        </>}
        {mode === 'signup' && <button type="button" onClick={() => { setMode('signin'); setError(''); }} className="w-full text-xs text-[#91a2b8]">لديك حساب؟ سجّل الدخول</button>}
        {(mode === 'verify' || mode === 'forgot' || mode === 'reset') && <button type="button" onClick={() => { setMode('signin'); setOtp(''); setPassword(''); setError(''); }} className="w-full text-xs text-[#91a2b8]">العودة إلى تسجيل الدخول</button>}
      </form>
    </div>
  );
}

export const Route = createFileRoute("/auth")({ component: AuthPage });
