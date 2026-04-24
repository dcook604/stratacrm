import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, type User } from "../lib/api";
import { useMeUser } from "../hooks/useAuth";
import { Shield, UserPlus, Key, RotateCcw, AlertTriangle, X, Check, Eye, EyeOff } from "lucide-react";

// ---------------------------------------------------------------------------
// Add User Modal
// ---------------------------------------------------------------------------

function AddUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("council_member");
  const [tempPassword, setTempPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: { email: string; full_name: string; role: string; temporary_password: string }) =>
      authApi.createUser(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  function generatePassword() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let pwd = "";
    for (let i = 0; i < 16; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setTempPassword(pwd);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (tempPassword.length < 10) {
      setError("Temporary password must be at least 10 characters.");
      return;
    }

    createMutation.mutate({
      email,
      full_name: fullName,
      role,
      temporary_password: tempPassword,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Add User</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label htmlFor="add-email" className="label">Email address</label>
            <input
              id="add-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="user@spectrum4.ca"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="add-name" className="label">Full name</label>
            <input
              id="add-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input"
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label htmlFor="add-role" className="label">Role</label>
            <select
              id="add-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="input"
            >
              <option value="admin">Admin</option>
              <option value="council_member">Council Member</option>
              <option value="property_manager">Property Manager</option>
              <option value="auditor">Auditor</option>
            </select>
          </div>

          <div>
            <label htmlFor="add-temp-password" className="label">Temporary password</label>
            <div className="relative">
              <input
                id="add-temp-password"
                type={showPassword ? "text" : "password"}
                required
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                className="input pr-20"
                placeholder="At least 10 characters"
              />
              <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                  title={showPassword ? "Hide" : "Show"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={generatePassword}
                  className="p-1 text-blue-600 hover:text-blue-700 text-xs font-medium whitespace-nowrap"
                  title="Generate random password"
                >
                  Generate
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn-primary"
            >
              {createMutation.isPending ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit User Modal
// ---------------------------------------------------------------------------

function EditUserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const qc = useQueryClient();
  const currentUser = useMeUser();
  const [email, setEmail] = useState(user.email);
  const [fullName, setFullName] = useState(user.full_name);
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (body: { email?: string; full_name?: string; role?: string; is_active?: boolean }) =>
      authApi.updateUser(user.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const body: { email?: string; full_name?: string; role?: string; is_active?: boolean } = {};
    if (email !== user.email) body.email = email;
    if (fullName !== user.full_name) body.full_name = fullName;
    if (role !== user.role) body.role = role;
    if (isActive !== user.is_active) body.is_active = isActive;

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    updateMutation.mutate(body);
  }

  const isSelf = currentUser?.id === user.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Edit User</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label htmlFor="edit-email" className="label">Email address</label>
            <input
              id="edit-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label htmlFor="edit-name" className="label">Full name</label>
            <input
              id="edit-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label htmlFor="edit-role" className="label">Role</label>
            <select
              id="edit-role"
              value={role}
              onChange={(e) => setRole(e.target.value as User["role"])}
              className="input"
            >
              <option value="admin">Admin</option>
              <option value="council_member">Council Member</option>
              <option value="property_manager">Property Manager</option>
              <option value="auditor">Auditor</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isSelf}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            </label>
            <div>
              <p className="text-sm font-medium text-slate-900">Active</p>
              {isSelf && (
                <p className="text-xs text-slate-500">You cannot deactivate your own account</p>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="btn-primary"
            >
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reset Password Modal
// ---------------------------------------------------------------------------

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const qc = useQueryClient();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isTemp, setIsTemp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      isTemp
        ? authApi.adminAssignTempPassword(id, password)
        : authApi.adminResetPassword(id, password),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setSuccess(data.detail);
    },
    onError: (err: Error) => setError(err.message),
  });

  function generatePassword() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let pwd = "";
    for (let i = 0; i < 16; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pwd);
    setConfirmPassword(pwd);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    resetMutation.mutate({ id: user.id, password: newPassword });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            {isTemp ? "Assign Temporary Password" : "Reset Password"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3">
            <p className="text-sm text-blue-700">
              <strong>{user.full_name}</strong> {"<"}{user.email}{">"}
            </p>
          </div>

          {success ? (
            <div className="space-y-4">
              <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3">
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-green-700">{success}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={onClose} className="btn-primary">Done</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isTemp}
                    onChange={(e) => setIsTemp(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500" />
                </label>
                <div>
                  <p className="text-sm font-medium text-slate-900">Require password change on next login</p>
                  <p className="text-xs text-slate-500">
                    {isTemp
                      ? "User will be prompted to set a new password after signing in."
                      : "Password will be set directly without requiring a change."}
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="reset-password" className="label">New password</label>
                <div className="relative">
                  <input
                    id="reset-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input pr-20"
                    placeholder="At least 10 characters"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={generatePassword}
                      className="p-1 text-blue-600 hover:text-blue-700 text-xs font-medium whitespace-nowrap"
                    >
                      Generate
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="reset-confirm" className="label">Confirm password</label>
                <input
                  id="reset-confirm"
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                  placeholder="Re-enter the password"
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                <button
                  type="submit"
                  disabled={resetMutation.isPending}
                  className="btn-primary"
                >
                  {resetMutation.isPending ? "Saving…" : isTemp ? "Assign temporary password" : "Reset password"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

const ROLE_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  admin: { bg: "bg-purple-100", text: "text-purple-700", label: "Admin" },
  council_member: { bg: "bg-blue-100", text: "text-blue-700", label: "Council" },
  property_manager: { bg: "bg-green-100", text: "text-green-700", label: "Property Mgr" },
  auditor: { bg: "bg-slate-100", text: "text-slate-700", label: "Auditor" },
};

function RoleBadge({ role }: { role: string }) {
  const b = ROLE_BADGES[role] ?? ROLE_BADGES.auditor;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${b.bg} ${b.text}`}>
      {b.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main User Management Page
// ---------------------------------------------------------------------------

export default function UserManagementPage() {
  const currentUser = useMeUser();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: authApi.listUsers,
  });

  const users = data?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage user accounts, roles, and passwords
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          Add user
        </button>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading users…</div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 inline-block">
              <p className="text-sm text-red-700">Failed to load users: {error.message}</p>
            </div>
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last login</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {u.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{u.full_name}</p>
                          {u.password_reset_required && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                              <AlertTriangle className="w-3 h-3" />
                              Password change required
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-4 py-3">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditUser(u)}
                          className="btn-secondary text-xs px-2.5 py-1.5"
                          title="Edit user details"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setResetPwdUser(u)}
                          className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1"
                          title="Reset or assign temporary password"
                        >
                          <Key className="w-3 h-3" />
                          Password
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && <AddUserModal onClose={() => setShowAddModal(false)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} />}
      {resetPwdUser && <ResetPasswordModal user={resetPwdUser} onClose={() => setResetPwdUser(null)} />}
    </div>
  );
}
