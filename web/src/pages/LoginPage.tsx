import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLogin, useMe } from "../hooks/useAuth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [searchParams] = useSearchParams();
  const login = useLogin();
  const navigate = useNavigate();
  const { data } = useMe();

  // Show session expired message if redirected after expiry
  const sessionExpired = searchParams.get("expired") === "1";

  // Redirect if already logged in
  useEffect(() => {
    if (data?.user) navigate("/dashboard", { replace: true });
  }, [data, navigate]);

  const [dismissed, setDismissed] = useState(false);

  function validate(): boolean {
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) errs.email = "Email is required.";
    if (!password) errs.password = "Password is required.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    try {
      const res = await login.mutateAsync({ email, password });
      if (res.user.password_reset_required) {
        navigate("/change-password", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Spectrum 4 CRM</h1>
          <p className="text-slate-400 text-sm mt-1">Strata Plan BCS2611</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-xl p-8">
          {sessionExpired && !dismissed && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 mb-5 flex items-start gap-2">
              <p className="text-sm text-amber-800 flex-1">
                Your session has expired. Please sign in again.
              </p>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-amber-500 hover:text-amber-700 text-lg leading-none shrink-0"
                aria-label="Dismiss"
              >
                &times;
              </button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: undefined })); }}
                className={fieldErrors.email ? "input input-error" : "input"}
                placeholder="you@spectrum4.ca"
              />
              {fieldErrors.email && (
                <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: undefined })); }}
                className={fieldErrors.password ? "input input-error" : "input"}
                placeholder="••••••••••"
              />
              {fieldErrors.password && (
                <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>
              )}
              <div className="flex items-center justify-end mt-1">
                <Link
                  to="/forgot-password"
                  className="text-sm text-blue-600 hover:text-blue-500"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={login.isPending}
              className="btn-primary w-full justify-center py-2.5"
            >
              {login.isPending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          For access, contact your strata council administrator.
        </p>
      </div>
    </div>
  );
}
