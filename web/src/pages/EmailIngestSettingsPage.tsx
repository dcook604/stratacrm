import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail, CheckCircle, XCircle, RefreshCw, Loader2,
  Eye, EyeOff, AlertCircle, Wifi, WifiOff, ChevronDown, ChevronUp,
} from "lucide-react";
import { emailIngestApi, type EmailIngestConfigUpdate } from "../lib/api";
import { useToast as useToastCtx } from "../lib/toast";
import { fmtDatetime } from "../lib/dates";
import { useMe } from "../hooks/useAuth";

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
      ${ok ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"}`}>
      {ok ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function PasswordInput({
  configured,
  value,
  onChange,
  placeholder,
}: {
  configured: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Badge ok={configured} label={configured ? "Saved" : "Not set"} />
      </div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={configured ? "Enter new password to replace…" : (placeholder ?? "")}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-9 text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function EmailIngestSettingsPage() {
  const { data: meData } = useMe();
  const isAdmin = meData?.user?.role === "admin";
  const qc = useQueryClient();
  const { addToast } = useToastCtx();
  const showToast = (msg: string, type: "success" | "error") => addToast(type, msg);

  const { data: config, isLoading } = useQuery({
    queryKey: ["email-ingest-config"],
    queryFn: emailIngestApi.getConfig,
  });

  // AI form state
  const [aiProvider, setAiProvider] = useState<"anthropic" | "deepseek">("anthropic");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");

  // IMAP form state
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("");
  const [imapUsername, setImapUsername] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [imapUseSsl, setImapUseSsl] = useState(true);
  const [imapMailbox, setImapMailbox] = useState("INBOX");

  // Polling form state
  const [pollInterval, setPollInterval] = useState(10);
  const [enabled, setEnabled] = useState(false);
  const [allowedSenders, setAllowedSenders] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (config) {
      setAiProvider(config.ai_provider);
      setPollInterval(config.poll_interval_minutes);
      setEnabled(config.enabled);
      setImapHost(config.imap_host ?? "");
      setImapPort(config.imap_port ? String(config.imap_port) : "");
      setImapUsername(config.imap_username ?? "");
      setImapUseSsl(config.imap_use_ssl);
      setImapMailbox(config.imap_mailbox || "INBOX");
      setAllowedSenders(config.allowed_senders ?? "");
    }
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: (body: EmailIngestConfigUpdate) => emailIngestApi.updateConfig(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-ingest-config"] });
      showToast("Settings saved", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const disconnectMutation = useMutation({
    mutationFn: emailIngestApi.disconnectImap,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-ingest-config"] });
      showToast("IMAP disconnected", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const testMutation = useMutation({
    mutationFn: emailIngestApi.testConnection,
    onSuccess: (result) => {
      if (result.ok) {
        showToast("Connection successful!", "success");
      } else {
        showToast(`Connection failed: ${result.error}`, "error");
      }
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const pollMutation = useMutation({
    mutationFn: emailIngestApi.triggerPoll,
    onSuccess: () => showToast("Poll started in background", "success"),
    onError: (err: Error) => showToast(err.message, "error"),
  });

  function saveAiSettings() {
    const body: EmailIngestConfigUpdate = { ai_provider: aiProvider };
    if (anthropicKey) body.anthropic_api_key = anthropicKey;
    if (deepseekKey) body.deepseek_api_key = deepseekKey;
    updateMutation.mutate(body);
    setAnthropicKey("");
    setDeepseekKey("");
  }

  function saveImapSettings() {
    const body: EmailIngestConfigUpdate = {
      imap_host: imapHost || undefined,
      imap_port: imapPort ? Number(imapPort) : undefined,
      imap_username: imapUsername || undefined,
      imap_use_ssl: imapUseSsl,
      imap_mailbox: imapMailbox || "INBOX",
    };
    if (imapPassword) body.imap_password = imapPassword;
    updateMutation.mutate(body);
    setImapPassword("");
  }

  function savePollingSettings() {
    updateMutation.mutate({
      enabled,
      poll_interval_minutes: pollInterval,
      allowed_senders: allowedSenders.trim() || undefined,
    });
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-slate-500">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p>Admin access required.</p>
      </div>
    );
  }

  if (isLoading || !config) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const stats = config.last_poll_stats;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
          <Mail className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Email Ingest</h1>
          <p className="text-sm text-slate-500">
            Automatically create issues from emails received in an IMAP mailbox.
          </p>
        </div>
        <div className="ml-auto">
          <Badge ok={config.enabled} label={config.enabled ? "Active" : "Disabled"} />
        </div>
      </div>

      {/* Status card */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Last poll</p>
            <p className="text-sm text-slate-800 font-medium">
              {config.last_polled_at ? fmtDatetime(config.last_polled_at) : "Never"}
            </p>
            {stats && (
              <div className="space-y-1">
                <p className="text-xs text-slate-500">
                  {stats.created} created
                  {stats.appended > 0 && ` · ${stats.appended} appended to existing`}
                  {stats.pending > 0 && ` · ${stats.pending} pending assignment`}
                  {" · "}{stats.skipped} skipped
                  {(stats.filtered ?? 0) > 0 && ` · ${stats.filtered} filtered`}
                  {stats.errors > 0 && (
                    <button
                      onClick={() => setShowErrors((x) => !x)}
                      className="ml-1 inline-flex items-center gap-0.5 text-red-600 font-medium hover:underline"
                    >
                      · {stats.errors} error{stats.errors !== 1 ? "s" : ""}
                      {showErrors ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  )}
                </p>
                {showErrors && stats.error_details && stats.error_details.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {stats.error_details.map((e, i) => (
                      <div key={i} className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs">
                        {e.from && <p className="text-slate-500 font-medium">From: {e.from}</p>}
                        {e.subject && <p className="text-slate-500">Subject: {e.subject}</p>}
                        <p className="text-red-700 mt-0.5 font-mono break-all">{e.error}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => pollMutation.mutate()}
            disabled={pollMutation.isPending || !config.imap_configured}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
              bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors"
          >
            {pollMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
            Poll Now
          </button>
        </div>
      </div>

      {/* AI Provider */}
      <Section title="AI Provider">
        <FieldRow label="Provider" hint="Used to parse email content into structured issues.">
          <div className="flex gap-2">
            {(["anthropic", "deepseek"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setAiProvider(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors
                  ${aiProvider === p
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-300 hover:border-blue-400"
                  }`}
              >
                {p === "anthropic" ? "Anthropic Claude" : "DeepSeek"}
              </button>
            ))}
          </div>
        </FieldRow>

        {aiProvider === "anthropic" && (
          <FieldRow label="Anthropic API Key">
            <PasswordInput
              configured={config.has_anthropic_key}
              value={anthropicKey}
              onChange={setAnthropicKey}
              placeholder="sk-ant-…"
            />
          </FieldRow>
        )}

        {aiProvider === "deepseek" && (
          <FieldRow label="DeepSeek API Key">
            <PasswordInput
              configured={config.has_deepseek_key}
              value={deepseekKey}
              onChange={setDeepseekKey}
              placeholder="sk-…"
            />
          </FieldRow>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={saveAiSettings}
            disabled={updateMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white
              hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {updateMutation.isPending ? "Saving…" : "Save AI Settings"}
          </button>
        </div>
      </Section>

      {/* IMAP Connection */}
      <Section title="IMAP Mailbox">
        <FieldRow label="Connection status">
          <div className="flex items-center gap-3 flex-wrap">
            {config.imap_configured ? (
              <>
                <Badge ok label={config.imap_username ?? "Connected"} />
                <button
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <Badge ok={false} label="Not configured" />
            )}
          </div>
        </FieldRow>

        <FieldRow label="IMAP Host" hint="e.g. mail.yourdomain.ca or imap.gmail.com">
          <input
            type="text"
            className="input"
            value={imapHost}
            onChange={(e) => setImapHost(e.target.value)}
            placeholder="imap.gmail.com"
          />
        </FieldRow>

        <FieldRow label="Port &amp; Security">
          <div className="flex items-center gap-3">
            <input
              type="number"
              className="input w-28"
              value={imapPort}
              onChange={(e) => setImapPort(e.target.value)}
              placeholder={imapUseSsl ? "993" : "143"}
            />
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={imapUseSsl}
                onChange={(e) => {
                  setImapUseSsl(e.target.checked);
                  if (!imapPort) setImapPort(e.target.checked ? "993" : "143");
                }}
              />
              Use SSL/TLS
            </label>
          </div>
        </FieldRow>

        <FieldRow label="Username" hint="Usually the full email address">
          <input
            type="email"
            className="input"
            value={imapUsername}
            onChange={(e) => setImapUsername(e.target.value)}
            placeholder="issues@yourdomain.ca"
          />
        </FieldRow>

        <FieldRow
          label="Password"
          hint="For Gmail, use an App Password (Account → Security → App Passwords)"
        >
          <PasswordInput
            configured={config.has_imap_password}
            value={imapPassword}
            onChange={setImapPassword}
            placeholder="App password or account password"
          />
        </FieldRow>

        <FieldRow label="Mailbox" hint='Folder to watch. Usually "INBOX".'>
          <input
            type="text"
            className="input w-48"
            value={imapMailbox}
            onChange={(e) => setImapMailbox(e.target.value)}
            placeholder="INBOX"
          />
        </FieldRow>

        <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
          <button
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending || !config.imap_configured}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
              border border-slate-300 bg-white text-slate-700 hover:bg-slate-50
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {testMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : testMutation.data?.ok
                ? <Wifi className="w-4 h-4 text-green-600" />
                : <WifiOff className="w-4 h-4" />}
            Test Connection
          </button>
          <button
            onClick={saveImapSettings}
            disabled={updateMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white
              hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {updateMutation.isPending ? "Saving…" : "Save IMAP Settings"}
          </button>
        </div>
      </Section>

      {/* Polling Settings */}
      <Section title="Polling Settings">
        <FieldRow label="Poll interval" hint="How often (in minutes) to check for new emails.">
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={1440}
              value={pollInterval}
              onChange={(e) => setPollInterval(Math.max(1, Number(e.target.value)))}
              className="input w-28"
            />
            <span className="text-sm text-slate-500">minutes</span>
          </div>
        </FieldRow>

        <FieldRow
          label="Sender allowlist"
          hint="Only process emails from these addresses or domains. Leave blank to accept all senders."
        >
          <textarea
            rows={3}
            value={allowedSenders}
            onChange={(e) => setAllowedSenders(e.target.value)}
            placeholder={"resident@example.com, @spectrum4.ca, gmail.com"}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          <p className="mt-1 text-xs text-slate-400">
            Comma-separated. Use <code className="bg-slate-100 px-1 rounded">@domain.com</code> to
            match any address at a domain, or a bare email for an exact match. Filtered messages are
            marked as read and counted in poll stats.
          </p>
        </FieldRow>

        <FieldRow label="Enable automatic polling">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <div className={`w-10 h-6 rounded-full transition-colors
                ${enabled ? "bg-blue-600" : "bg-slate-200"}`} />
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow
                transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`} />
            </div>
            <span className="text-sm text-slate-700">
              {enabled ? "Polling enabled" : "Polling disabled"}
            </span>
          </label>
          {enabled && !config.imap_configured && (
            <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Configure IMAP credentials before enabling.
            </p>
          )}
        </FieldRow>

        <div className="flex justify-end pt-1">
          <button
            onClick={savePollingSettings}
            disabled={updateMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white
              hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {updateMutation.isPending ? "Saving…" : "Save Polling Settings"}
          </button>
        </div>
      </Section>

      {/* Setup guide */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-6 py-5">
        <h3 className="text-sm font-semibold text-blue-900 mb-3">Setup guide</h3>
        <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
          <li>Create a dedicated email address for inbound issues (e.g. <span className="font-medium">issues@yourdomain.ca</span>).</li>
          <li>
            <span className="font-medium">Gmail users:</span> enable IMAP in Gmail Settings → Forwarding and POP/IMAP,
            then generate an <span className="font-medium">App Password</span> under Google Account → Security → 2-Step Verification → App Passwords.
            Use <code className="bg-blue-100 px-1 rounded text-xs">imap.gmail.com</code> port <code className="bg-blue-100 px-1 rounded text-xs">993</code> with SSL.
          </li>
          <li>
            <span className="font-medium">cPanel / custom domain:</span> use your mail server host (e.g. <code className="bg-blue-100 px-1 rounded text-xs">mail.yourdomain.ca</code>),
            port <code className="bg-blue-100 px-1 rounded text-xs">993</code> (SSL) or <code className="bg-blue-100 px-1 rounded text-xs">143</code> (plain), and your account credentials.
          </li>
          <li>Choose an AI provider and enter its API key — it extracts structured data from each email.</li>
          <li>Save IMAP settings, click <span className="font-medium">Test Connection</span> to verify, then enable polling.</li>
          <li>
            Emails mentioning a unit that can't be matched automatically will appear as
            <span className="font-medium"> Pending Assignment</span> in the Issues list, ready for a staff member to assign.
          </li>
        </ol>
      </div>
    </div>
  );
}
