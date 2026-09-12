import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { clientAuth } from "@/lib/auth-client";

function AuthPage() {
  const nav = useNavigate();
  const [signup, setSignup] = useState(false);
  const [verify, setVerify] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function continueAfterAuth() {
    const response = await fetch('/api/business-context', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) return nav({ to: '/auth' });
    if (!response.ok) return nav({ to: '/' });
    const body = await response.json() as { completed?: boolean };
    return nav({ to: body.completed ? '/' : '/onboarding' });
  }

  useEffect(() => {
    void clientAuth.getSession().then((session) => {
      if (session) void continueAfterAuth();
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (verify) {
        await clientAuth.verifyEmail(email, otp);
        await continueAfterAuth();
        return;
      }
      if (signup) {
        const result = await clientAuth.signUp(email, password, `${window.location.origin}/auth`);
        if (!result.session) {
          setVerify(true);
          setPassword("");
          setError("أرسلنا رمز تحقق إلى بريدك. أدخل الرمز المكوّن من 6 أرقام.");
          return;
        }
      } else {
        await clientAuth.signIn(email, password);
      }
      await continueAfterAuth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إتمام العملية");
    } finally {
      setBusy(false);
    }
  }

  function openVerification() {
    setVerify(true);
    setSignup(false);
    setPassword("");
    setOtp("");
    setError("أدخل البريد الذي سجلت به ورمز التحقق الذي وصلك.");
  }

  return (
    <div dir="rtl" className="grid min-h-screen place-items-center bg-[#060910] p-4 text-white">
      <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-3xl border border-[#223148] bg-[#0d141f] p-6">
        <div className="text-xl font-black tracking-[3px] text-[#29d3bd]">COANTO</div>
        <h1 className="text-2xl font-black">{verify ? "تأكيد البريد الإلكتروني" : signup ? "إنشاء حساب" : "تسجيل الدخول"}</h1>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" className="w-full rounded-xl border border-white/10 bg-[#090e16] px-4 py-3" />
        {verify ? (
          <input type="text" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="رمز التحقق — 6 أرقام" className="w-full rounded-xl border border-white/10 bg-[#090e16] px-4 py-3 text-center text-xl tracking-[0.35em]" />
        ) : (
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة المرور" className="w-full rounded-xl border border-white/10 bg-[#090e16] px-4 py-3" />
        )}
        <button disabled={busy} className="w-full rounded-xl bg-[#29d3bd] py-3 font-black text-[#06100e]">{busy ? "جارٍ..." : verify ? "تأكيد الرمز" : signup ? "إنشاء الحساب" : "دخول"}</button>
        {error && <div className="rounded-xl border border-amber-300/30 p-3 text-xs text-amber-200">{error}</div>}
        {verify ? (
          <button type="button" onClick={() => { setVerify(false); setSignup(false); setOtp(""); setError(""); }} className="w-full text-xs text-[#91a2b8]">العودة إلى تسجيل الدخول</button>
        ) : (
          <>
            <button type="button" onClick={() => { setSignup(!signup); setError(""); }} className="w-full text-xs text-[#91a2b8]">{signup ? "لديك حساب؟ سجّل الدخول" : "ليس لديك حساب؟ أنشئ حسابًا"}</button>
            <button type="button" onClick={openVerification} className="w-full text-xs font-bold text-[#29d3bd]">عندي رمز تحقق</button>
          </>
        )}
      </form>
    </div>
  );
}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute("/auth")({ component: AuthPage });
