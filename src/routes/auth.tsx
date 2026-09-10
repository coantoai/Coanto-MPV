import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FormEvent, useEffect, useState } from "react";
import { clientAuth } from "@/lib/auth-client";

function AuthPage() {
  const nav = useNavigate();
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void clientAuth
      .getSession()
      .then((session) => {
        if (session) void nav({ to: "/" });
      })
      .catch(() => undefined);
  }, [nav]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (signup) {
        const result = await clientAuth.signUp(
          email,
          password,
          `${window.location.origin}/`,
        );
        if (!result.session) {
          setError("تم إنشاء الحساب. تحقق من بريدك ثم سجّل الدخول.");
          return;
        }
      } else {
        await clientAuth.signIn(email, password);
      }
      await nav({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إتمام العملية");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir="rtl" className="grid min-h-screen place-items-center bg-[#060910] p-4 text-white">
      <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-3xl border border-[#223148] bg-[#0d141f] p-6">
        <div className="text-xl font-black tracking-[3px] text-[#29d3bd]">COANTO</div>
        <h1 className="text-2xl font-black">{signup ? "إنشاء حساب" : "تسجيل الدخول"}</h1>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" className="w-full rounded-xl border border-white/10 bg-[#090e16] px-4 py-3" />
        <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة المرور" className="w-full rounded-xl border border-white/10 bg-[#090e16] px-4 py-3" />
        <button disabled={busy} className="w-full rounded-xl bg-[#29d3bd] py-3 font-black text-[#06100e]">{busy ? "جارٍ..." : signup ? "إنشاء الحساب" : "دخول"}</button>
        {error && <div className="rounded-xl border border-amber-300/30 p-3 text-xs text-amber-200">{error}</div>}
        <button type="button" onClick={() => setSignup(!signup)} className="w-full text-xs text-[#91a2b8]">{signup ? "لديك حساب؟ سجّل الدخول" : "ليس لديك حساب؟ أنشئ حسابًا"}</button>
      </form>
    </div>
  );
}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute("/auth")({ component: AuthPage });
