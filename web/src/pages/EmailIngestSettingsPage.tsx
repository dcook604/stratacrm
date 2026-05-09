import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail, CheckCircle, XCircle, RefreshCw, Loader2,
  Eye, EyeOff, ChevronDown, ChevronUp, AlertCircle,
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

function ApiKeyInput({
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
        <Badge ok={configured} label={configured ? "Configured" : "Not set"} />
      </div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={configured ? "Enter new key to replace…" : (placeholder ?? "sk-…")}
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

  // URL params from OAuth callback
  const searchParams = new URLSearchParams(window.location.search);
  const oauthConnected = searchParams.get("connected") === "1";
  const oauthError = searchParams.get("error");

  useEffect(() => {
    if (oauthConnected) {
      showToast("Gmail connected successfully!", "success");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (oauthError) {
      showToast(`Gmail connection failed: ${oauthError}`, "error");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const { data: config, isLoading } = useQuery({
    queryKey: ["email-ingest-config"],
    queryFn: emailIngestApi.getConfig,
  });

  // Local form state
  const [aiProvider, setAiProvider] = useState<"anthropic" | "deepseek">("anthropic");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [pollInterval, setPollInterval] = useState(10);
  const [enabled, setEnabled] = useState(false);
  const [credentialsJson, setCredentialsJson] = useState("");
  const [showCredentials, setShowCredentials] = useState(false);

  useEffect(() => {
    if (config) {
      setAiProvider(config.ai_provider);
      setPollInterval(config.gmail_poll_interval_minutes);
      setEnabled(config.enabled);
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
    mutationFn: emailIngestApi.disconnectGmail,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-ingest-config"] });
      showToast("Gmail disconnected", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const pollMutation = useMutation({
    mutationFn: emailIngestApi.triggerPoll,
    onSuccess: () => showToast("Poll started in background", "success"),
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const oauthMutation = useMutation({
    mutationFn: emailIngestApi.startOAuth,
    onSuccess: ({ auth_url }) => { window.location.href = auth_url; },
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

  function savePollingSettings() {
    updateMutation.mutate({
      enabled,
      gmail_poll_interval_minutes: pollInterval,
    });
  }

  function saveCredentials() {
    if (!credentialsJson.trim()) return;
    updateMutation.mutate({ gmail_credentials_json: credentialsJson.trim() });
    setCredentialsJson("");
    setShowCredentials(false);
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
            Automatically create issues from emails sent to a Gmail inbox.
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
            {config.last_poll_stats && (
              <p className="text-xs text-slate-500">
                {config.last_poll_stats.created} created · {config.last_poll_stats.skipped} skipped · {config.last_poll_stats.errors} errors
              </p>
            )}
          </div>
          <button
            onClick={() => pollMutation.mutate()}
            disabled={pollMutation.isPending || !config.has_gmail_token}
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
        <FieldRow
          label="Provider"
          hint="Used to parse email content into structured issues."
        >
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
            <ApiKeyInput
              configured={config.has_anthropic_key}
              value={anthropicKey}
              onChange={setAnthropicKey}
              placeholder="sk-ant-…"
            />
          </FieldRow>
        )}

        {aiProvider === "deepseek" && (
          <FieldRow label="DeepSeek API Key">
            <ApiKeyInput
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

      {/* Gmail Connection */}
      <Section title="Gmail Connection">
        <FieldRow
          label="Connection status"
        >
          {config.gmail_connected_email ? (
            <div className="flex items-center gap-3 flex-wrap">
              <Badge ok label={config.gmail_connected_email} />
              <button
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <Badge ok={false} label="Not connected" />
          )}
        </FieldRow>

        <FieldRow
          label="Client secrets JSON"
          hint={
            config.has_gmail_credentials
              ? "Credentials saved. Re-paste to replace."
              : "Paste the contents of client_secrets.json from Google Cloud Console."
          }
        >
          <div className="space-y-2">
            <button
              onClick={() => setShowCredentials(!showCredentials)}
              className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:underline"
            >
              {showCredentials ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {config.has_gmail_credentials ? "Replace credentials JSON" : "Paste credentials JSON"}
            </button>
            {showCredentials && (
              <div className="space-y-2">
                <textarea
                  rows={6}
                  value={credentialsJson}
                  onChange={(e) => setCredentialsJson(e.target.value)}
                  placeholder='{"web": {"client_id": "...", "client_secret": "...", ...}}'
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono
                    focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveCredentials}
                    disabled={!credentialsJson.trim() || updateMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-white
                      hover:bg-slate-900 disabled:opacity-40 transition-colors"
                  >
                    Save Credentials
                  </button>
                  <button
                    onClick={() => { setCredentialsJson(""); setShowCredentials(false); }}
                    className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </FieldRow>

        <FieldRow label="Authorize Gmail">
          <div className="space-y-2">
            <button
              onClick={() => oauthMutation.mutate()}
              disabled={oauthMutation.isPending || !config.has_gmail_credentials}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                border border-slate-300 bg-white text-slate-700 hover:bg-slate-50
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {oauthMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Mail className="w-4 h-4" />}
              {config.gmail_connected_email ? "Re-authorize Gmail" : "Authorize Gmail"}
            </button>
            {!config.has_gmail_credentials && (
              <p className="text-xs text-amber-600">
                Save your client_secrets.json above before authorizing.
              </p>
            )}
            <p className="text-xs text-slate-400">
              Register <code className="bg-slate-100 px-1 py-0.5 rounded">
                {window.location.origin}/api/email-ingest/oauth/callback
              </code> as an authorized redirect URI in Google Cloud Console.
            </p>
          </div>
        </FieldRow>
      </Section>

      {/* Polling Settings */}
      <Section title="Polling Settings">
        <FieldRow
          label="Poll interval"
          hint="How often (in minutes) to check for new emails."
        >
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={1440}
              value={pollInterval}
              onChange={(e) => setPollInterval(Math.max(1, Number(e.target.value)))}
              className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-500">minutes</span>
          </div>
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
          {enabled && !config.has_gmail_token && (
            <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Gmail must be connected before polling can run.
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
          <li>Go to <span className="font-medium">Google Cloud Console</span> → create a project → enable the Gmail API.</li>
          <li>Under <span className="font-medium">Credentials</span>, create an <span className="font-medium">OAuth 2.0 Client ID</span> (Web application type).</li>
          <li>Add <code className="bg-blue-100 px-1 rounded text-xs">
            {window.location.origin}/api/email-ingest/oauth/callback
          </code> as an authorized redirect URI.</li>
          <li>Download the JSON and paste it in the <span className="font-medium">Client secrets JSON</span> field above.</li>
          <li>Choose an AI provider and enter its API key.</li>
          <li>Click <span className="font-medium">Authorize Gmail</span> and complete the consent screen.</li>
          <li>Enable polling and save — <span className="font-medium">all unread emails</span> arriving in that inbox will automatically become issues.</li>
        </ol>
      </div>
    </div>
  );
}
