import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { authApi } from "../lib/api";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // Redirect to login after successful reset
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => navigate("/login", { replace: true }), 3000);
      return () => clearTimeout(timer);
    }
  }, [success, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 10) {
      setError("Password must be at least 10 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsPending(true);
    try {
      await authApi.resetPassword(token!, newPassword);
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Reset failed";
      setError(msg);
    } finally {
      setIsPending(false);
    }
  }

  // No token in URL — show error state
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-xl shadow-xl p-8 text-center space-y-4">
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">
                Invalid reset link. This link may be missing the required token.
              </p>
            </div>
            <Link
              to="/forgot-password"
              className="text-sm text-blue-600 hover:text-blue-500 font-medium"
            >
              Request a new reset link
            </Link>
          </div>
        </div>
      </div>
    );
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
          <h1 className="text-2xl font-bold text-white">Set new password</h1>
          <p className="text-slate-400 text-sm mt-1">
            Choose a new password for your account.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-xl p-8">
          {success ? (
            <div className="text-center space-y-4">
              <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3">
                <p className="text-sm text-green-700">
                  Password has been reset successfully! Redirecting to sign in…
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
                <label htmlFor="new-password" className="label">New password</label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input"
                  placeholder="At least 10 characters"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="label">Confirm password</label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                  placeholder="Re-enter your new password"
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
                {isPending ? "Resetting…" : "Reset password"}
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
      </div>
    </div>
  );
}
