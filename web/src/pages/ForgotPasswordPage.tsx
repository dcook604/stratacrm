import { useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsPending(true);
    try {
      await authApi.forgotPassword(email);
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setError(msg);
    } finally {
      setIsPending(false);
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
          <h1 className="text-2xl font-bold text-white">Reset your password</h1>
          <p className="text-slate-400 text-sm mt-1">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-xl p-8">
          {success ? (
            <div className="text-center space-y-4">
              <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3">
                <p className="text-sm text-green-700">
                  If an account exists with that email, a reset link has been sent.
                </p>
              </div>
              <Link
                to="/login"
                className="text-sm text-blue-600 hover:text-blue-500 font-medium"
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="label">Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@spectrum4.ca"
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="btn-primary w-full justify-center py-2.5"
              >
                {isPending ? "Sending…" : "Send reset link"}
              </button>

              <div className="text-center">
                <Link
                  to="/login"
                  className="text-sm text-blue-600 hover:text-blue-500 font-medium"
                >
                  Return to sign in
                </Link>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          For access, contact your strata council administrator.
        </p>
      </div>
    </div>
  );
}
