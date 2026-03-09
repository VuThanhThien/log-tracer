import { useState, useEffect, useRef } from "react";
import OpenAI from "openai";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  Trash2,
  Brain,
  Clock,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BorderBeam } from "@/components/BorderBeam";

type Status = "idle" | "extracting" | "analyzing" | "done" | "error";

interface Session {
  id: string;
  title: string;
  url: string;
  createdAt: number;
  logCount: number;
  thinking: string;
  text: string;
}

/** Extract service name from a Grafana Explore URL.
 *  Looks for kubernetes_container_name (or the first label) inside the
 *  Loki `expr` query stored in the `panes` search param.
 */
function extractServiceFromUrl(url: string): string {
  try {
    const panesParam = new URL(url).searchParams.get("panes");
    if (panesParam) {
      const panes = JSON.parse(decodeURIComponent(panesParam)) as Record<
        string,
        { queries?: Array<{ expr?: string }> }
      >;
      for (const pane of Object.values(panes)) {
        for (const query of pane.queries ?? []) {
          const expr = query.expr ?? "";
          // Prefer kubernetes_container_name
          const k8s = expr.match(/kubernetes_container_name[=~]["'`]([^"'`]+)["'`]/);
          if (k8s) return k8s[1];
          // Fall back to first label value in {label="value"} or {label=`value`}
          const generic = expr.match(/\{[^}]*?[\w_]+[=~]["'`]([^"'`]+)["'`]/);
          if (generic) return generic[1];
        }
      }
    }
  } catch { /* ignore parse errors */ }
  // Last resort: use the hostname
  try { return new URL(url).hostname; } catch { /* ignore */ }
  return "service";
}

const MAX_LOG_CHARS = 60000;
const MAX_SESSIONS = 20;
const STORAGE_KEY = "explainSessions";

const SYSTEM_PROMPT = `You are an expert SRE/DevOps engineer. Analyze the provided logs and:
1. Identify all errors, exceptions, and warnings
2. Determine root causes and contributing factors
3. Highlight patterns, anomalies, or repeated failures
4. Suggest concrete fixes or next debugging steps
5. Suggest other sevices need to trace logs to find the root causes

Be concise and structured. Use markdown with headers and bullet points.`;

const client = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY as string,
  dangerouslyAllowBrowser: true,
});

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ThinkingSection({
  thinking,
  isActive,
}: {
  thinking: string;
  isActive: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-amber-500/20 bg-amber-500/5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-300 transition-colors hover:bg-amber-500/10"
      >
        {isActive ? (
          <Loader2 className="size-3 shrink-0 animate-spin" />
        ) : (
          <Brain className="size-3 shrink-0" />
        )}
        <span className="flex-1 text-left font-medium">
          {isActive ? "Thinking…" : "View reasoning"}
        </span>
        {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="max-h-36 overflow-y-auto border-t border-amber-500/20 p-3">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-amber-200/60">
                {thinking || "…"}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      title="Copy to clipboard"
      className="text-zinc-500 transition-colors hover:text-zinc-300"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}

function ResultText({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-700/50 px-3 py-1.5">
        <span className="text-xs text-zinc-500">Analysis</span>
        {!isStreaming && text && <CopyButton text={text} />}
      </div>
      <div ref={ref} className="max-h-56 overflow-y-auto p-3">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">
          {text}
          {isStreaming && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-cyan-400 align-middle" />
          )}
        </pre>
      </div>
    </div>
  );
}

function SessionItem({
  session,
  onDelete,
}: {
  session: Session;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const preview = session.text.split("\n").find((l) => l.trim()) ?? "No content";

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
      {/* Header row */}
      <div className="flex items-start gap-1 px-3 pt-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
        >
          <span className="truncate text-xs font-semibold text-zinc-200">
            {session.title || "Log explain"}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-3 shrink-0 text-zinc-600" />
            <span className="shrink-0 text-xs text-zinc-500">{formatDate(session.createdAt)}</span>
            <span className="shrink-0 text-xs text-zinc-700">·</span>
            <span className="shrink-0 text-xs text-zinc-600">{session.logCount} lines</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          <button onClick={() => setOpen((o) => !o)} className="text-zinc-600">
            {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-zinc-600 transition-colors hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>

      {/* Preview line when collapsed */}
      {!open && (
        <p className="truncate px-3 py-1.5 text-xs text-zinc-600">{preview}</p>
      )}

      {/* Expanded body */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-zinc-800 p-3">
              {/* Source URL */}
              {session.url && (
                <a
                  href={session.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 truncate rounded bg-zinc-800 px-2 py-1.5 text-xs text-cyan-400 hover:text-cyan-300"
                  title={session.url}
                >
                  <svg className="size-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  <span className="truncate">{session.url}</span>
                </a>
              )}
              {/* Thinking toggle */}
              {session.thinking && (
                <div className="overflow-hidden rounded border border-amber-500/20 bg-amber-500/5">
                  <button
                    onClick={() => setShowThinking((o) => !o)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-amber-300 transition-colors hover:bg-amber-500/10"
                  >
                    <Brain className="size-3 shrink-0" />
                    <span className="flex-1 text-left">Reasoning</span>
                    {showThinking ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  </button>
                  <AnimatePresence>
                    {showThinking && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="max-h-32 overflow-y-auto border-t border-amber-500/20 p-2">
                          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-amber-200/50">
                            {session.thinking}
                          </pre>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {/* Analysis text */}
              <div className="overflow-hidden rounded border border-zinc-700/50">
                <div className="flex items-center justify-between border-b border-zinc-700/50 px-2 py-1">
                  <span className="text-xs text-zinc-600">Analysis</span>
                  <CopyButton text={session.text} />
                </div>
                <div className="max-h-56 overflow-y-auto p-2">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">
                    {session.text}
                  </pre>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const GRAFANA_HOST = import.meta.env.VITE_GRAFANA_HOST as string;

function isGrafanaExplorePage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === GRAFANA_HOST && u.pathname.startsWith("/explore");
  } catch {
    return false;
  }
}

export function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [thinking, setThinking] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [logCount, setLogCount] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isValidTab, setIsValidTab] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const savedRef = useRef<boolean>(false);
  // Keep latest values accessible in effects without adding them as deps
  const latestRef = useRef({ logCount, thinking, text, tabUrl: "", sessionTitle: "" });
  useEffect(() => { latestRef.current = { ...latestRef.current, logCount, thinking, text }; });

  // Check active tab URL on mount
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      setIsValidTab(isGrafanaExplorePage(tab?.url ?? ""));
    });
  }, []);

  // Load sessions on mount
  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      setSessions((result[STORAGE_KEY] as Session[]) ?? []);
    });
  }, []);

  // Auto-save when analysis finishes
  useEffect(() => {
    if (status !== "done") return;
    if (savedRef.current) return;
    savedRef.current = true;

    const { logCount: lc, thinking: th, text: tx, tabUrl, sessionTitle } = latestRef.current;
    if (!tx) return;

    const session: Session = {
      id: Date.now().toString(),
      title: sessionTitle,
      url: tabUrl,
      createdAt: Date.now(),
      logCount: lc,
      thinking: th,
      text: tx,
    };
    setSessions((prev) => {
      const updated = [session, ...prev].slice(0, MAX_SESSIONS);
      chrome.storage.local.set({ [STORAGE_KEY]: updated });
      return updated;
    });
  }, [status]);

  const deleteSession = (id: string) => {
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      chrome.storage.local.set({ [STORAGE_KEY]: updated });
      return updated;
    });
  };

  const clearAllSessions = () => {
    setSessions([]);
    chrome.storage.local.remove(STORAGE_KEY);
  };

  const explain = async () => {
    setStatus("extracting");
    setThinking("");
    setText("");
    setError("");
    setLogCount(0);
    savedRef.current = false;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab found.");

      const tabUrl = tab.url ?? "";
      const service = extractServiceFromUrl(tabUrl);
      const sessionTitle = `Log explain for ${service}`;
      latestRef.current.tabUrl = tabUrl;
      latestRef.current.sessionTitle = sessionTitle;

      let logs: string;
      const sendExtract = () =>
        chrome.tabs.sendMessage(tab.id!, { type: "EXTRACT_LOGS" }) as Promise<{
          ok: boolean;
          logs: string;
        }>;

      try {
        const result = await sendExtract();
        if (!result?.ok) throw new Error();
        logs = result.logs;
      } catch {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            files: ["content.js"],
          });
          const result = await sendExtract();
          if (!result?.ok) throw new Error();
          logs = result.logs;
        } catch {
          throw new Error("Could not inject into this page. Try refreshing the Grafana tab.");
        }
      }

      if (!logs || logs.length < 20) {
        throw new Error("No log content detected. Navigate to a Grafana logs panel first.");
      }

      const truncated =
        logs.length > MAX_LOG_CHARS
          ? logs.slice(0, MAX_LOG_CHARS) + "\n…[truncated]"
          : logs;

      setLogCount(truncated.split("\n").length);
      setStatus("analyzing");

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const stream = await client.chat.completions.create(
        {
          model: "gpt-4o",
          stream: true,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Source URL: ${latestRef.current.tabUrl}\n\nAnalyze these logs:\n\n${truncated}`,
            },
          ],
        },
        { signal: ctrl.signal }
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) setText((t) => t + delta);
      }

      setStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStatus("idle");
        return;
      }
      setError((err as Error).message);
      setStatus("error");
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setStatus("idle");
  };

  const isStreaming = status === "analyzing";

  return (
    <div className="w-[440px] bg-zinc-950 p-4 font-sans">
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap"
        rel="stylesheet"
      />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-3"
      >
        <Card className="relative overflow-hidden border-cyan-500/20">
          <BorderBeam size={120} color="rgba(34, 211, 238, 0.7)" />
          <CardHeader className="pb-2">
            <CardTitle className="text-cyan-400/95">Log Tracer</CardTitle>
            <CardDescription>
              {status === "idle"
                ? "Analyze logs from the current Grafana page."
                : status === "extracting"
                  ? "Reading logs from page…"
                  : status === "analyzing"
                    ? `Analyzing ${logCount > 0 ? `${logCount} log lines` : "logs"}…`
                    : status === "done"
                      ? "Analysis complete."
                      : "Something went wrong."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <AnimatePresence mode="wait">
              {/* ── Idle ── */}
              {status === "idle" && (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                  <Button className="w-full gap-2" size="lg" onClick={explain} disabled={!isValidTab}>
                    <Sparkles className="size-4" />
                    Explain
                  </Button>
                  {isValidTab === false && (
                    <p className="text-center text-xs text-zinc-500">
                      Open <span className="text-zinc-400">{GRAFANA_HOST}/explore</span> to use this extension.
                    </p>
                  )}
                </motion.div>
              )}

              {/* ── Extracting ── */}
              {status === "extracting" && (
                <motion.div
                  key="extracting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-2 py-4 text-cyan-400"
                >
                  <Loader2 className="size-5 animate-spin" />
                  <span className="text-sm">Extracting logs from page…</span>
                </motion.div>
              )}

              {/* ── Analyzing / Done ── */}
              {(status === "analyzing" || status === "done") && (
                <motion.div key="analysis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">

                  {/* Analyzing indicator */}
                  <AnimatePresence>
                    {isStreaming && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center gap-2 rounded-lg bg-cyan-500/10 px-3 py-2">
                          <span className="relative flex size-2 shrink-0">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                            <span className="relative inline-flex size-2 rounded-full bg-cyan-500" />
                          </span>
                          <span className="text-xs text-cyan-300">
                            Analyzing {logCount > 0 ? `${logCount} log lines` : "logs"}…
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {thinking.length > 0 && (
                    <ThinkingSection thinking={thinking} isActive={isStreaming} />
                  )}

                  {text.length > 0 ? (
                    <ResultText text={text} isStreaming={isStreaming} />
                  ) : (
                    isStreaming && (
                      <div className="flex items-center justify-center gap-2 py-3 text-zinc-500">
                        <Loader2 className="size-4 animate-spin" />
                        <span className="text-xs">Waiting for first token…</span>
                      </div>
                    )
                  )}

                  {status === "analyzing" ? (
                    <Button variant="outline" className="w-full gap-2" onClick={cancel}>
                      <X className="size-4" />
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      className="w-full gap-2"
                      onClick={() => {
                        setThinking("");
                        setText("");
                        setStatus("idle");
                      }}
                    >
                      <RefreshCw className="size-4" />
                      Analyze again
                    </Button>
                  )}
                </motion.div>
              )}

              {/* ── Error ── */}
              {status === "error" && (
                <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
                    {error}
                  </p>
                  <Button className="w-full" onClick={() => setStatus("idle")}>
                    Try again
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* ── Sessions list (shown in idle state) ── */}
        <AnimatePresence>
          {status === "idle" && sessions.length > 0 && (
            <motion.div
              key="sessions"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-zinc-400">Past analyses</span>
                <button
                  onClick={clearAllSessions}
                  className="text-xs text-zinc-600 transition-colors hover:text-zinc-400"
                >
                  Clear all
                </button>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
                {sessions.map((s) => (
                  <SessionItem key={s.id} session={s} onDelete={() => deleteSession(s.id)} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
