import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Play, RotateCcw, Download, Cpu, Zap } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JobStatus = "pending" | "running" | "completed" | "failed";
type OutputMode = "summary" | "per_policy" | "both";
type DeviceType = "cpu" | "cuda";

interface RunModelRequest {
  policy_file?: string;
  scenario_file?: string;
  output_mode: OutputMode;
  device: DeviceType;
  batch_size?: number;
  scenario_id?: number;
}

interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  elapsed_seconds?: number;
  progress?: string;
  error?: string;
}

interface ScenarioMetrics {
  scenario_id: number;
  ape?: number;
  pv_cf?: number;
  pv_prem?: number;
  pvcf_over_ape?: number;
  pvcf_over_pv_prem?: number;
  elapsed_seconds?: number;
}

interface OutputFile {
  filename: string;
  file_type: string;
  scenario_id?: number;
  size_bytes: number;
  download_url: string;
}

interface JobResultResponse {
  job_id: string;
  status: JobStatus;
  output_dir: string;
  scenarios: ScenarioMetrics[];
  output_files: OutputFile[];
  total_elapsed_seconds?: number;
  n_policies?: number;
}

interface AvailableFile {
  key: string;
  path: string;
  size_bytes: number;
}

// ---------------------------------------------------------------------------
// API client — points directly at the UL FastAPI backend
// ---------------------------------------------------------------------------

const ULP_BASE = (import.meta as any).env?.VITE_ULP_API_BASE ?? "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ULP_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

const ulpApi = {
  availablePolicies: () => apiFetch<{ files: AvailableFile[] }>("/api/v1/available-policies"),
  availableScenarios: () => apiFetch<{ files: AvailableFile[] }>("/api/v1/available-scenarios"),
  runModel: (req: RunModelRequest) =>
    apiFetch<{ job_id: string; status: string }>("/api/v1/run-model", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  jobStatus: (jobId: string) => apiFetch<JobStatusResponse>(`/api/v1/job-status/${jobId}`),
  jobResult: (jobId: string) => apiFetch<JobResultResponse>(`/api/v1/results/${jobId}`),
  downloadUrl: (jobId: string, filename: string) =>
    `${ULP_BASE}/api/v1/results/${jobId}/download/${encodeURIComponent(filename)}`,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function formatLarge(n?: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

function formatRatio(n?: number | null): string {
  return n == null ? "—" : n.toFixed(4);
}

function statusVariant(s: JobStatus): "default" | "secondary" | "destructive" | "outline" {
  if (s === "completed") return "default";
  if (s === "failed") return "destructive";
  if (s === "running") return "secondary";
  return "outline";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RunForm({ onJobStarted }: { onJobStarted: (jobId: string) => void }) {
  const [policyFiles, setPolicyFiles] = useState<AvailableFile[]>([]);
  const [scenarioFiles, setScenarioFiles] = useState<AvailableFile[]>([]);
  const [policyFile, setPolicyFile] = useState("__default__");
  const [scenarioFile, setScenarioFile] = useState("__default__");
  const [outputMode, setOutputMode] = useState<OutputMode>("summary");
  const [device, setDevice] = useState<DeviceType>("cpu");
  const [batchSize, setBatchSize] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [backendDown, setBackendDown] = useState(false);

  useEffect(() => {
    ulpApi.availablePolicies()
      .then((r) => { setPolicyFiles(r.files); setBackendDown(false); })
      .catch(() => setBackendDown(true));
    ulpApi.availableScenarios()
      .then((r) => setScenarioFiles(r.files))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const req: RunModelRequest = { output_mode: outputMode, device };
    if (policyFile !== "__default__") req.policy_file = policyFile;
    if (scenarioFile !== "__default__") req.scenario_file = scenarioFile;
    if (batchSize) req.batch_size = parseInt(batchSize, 10);
    if (scenarioId) req.scenario_id = parseInt(scenarioId, 10);
    try {
      const data = await ulpApi.runModel(req);
      onJobStarted(data.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit. Is the UL backend running on port 8000?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {backendDown && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Cannot reach UL backend at <code className="font-mono">localhost:8000</code>. Start it with{" "}
          <code className="font-mono">python start_backend.py</code> in <code className="font-mono">C:\projects\UL</code>.
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Policy Dataset</Label>
          <Select value={policyFile} onValueChange={setPolicyFile} disabled={submitting}>
            <SelectTrigger>
              <SelectValue placeholder="Default from config.yaml" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">— default from config.yaml —</SelectItem>
              {policyFiles.map((f) => (
                <SelectItem key={f.key} value={f.path}>
                  {f.key} ({formatBytes(f.size_bytes)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Scenario File</Label>
          <Select value={scenarioFile} onValueChange={setScenarioFile} disabled={submitting}>
            <SelectTrigger>
              <SelectValue placeholder="Default from config.yaml" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">— default from config.yaml —</SelectItem>
              {scenarioFiles.map((f) => (
                <SelectItem key={f.key} value={f.path}>
                  {f.key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Output Mode</Label>
          <Select value={outputMode} onValueChange={(v) => setOutputMode(v as OutputMode)} disabled={submitting}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="summary">Summary</SelectItem>
              <SelectItem value="per_policy">Per Policy</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Compute Device</Label>
          <Select value={device} onValueChange={(v) => setDevice(v as DeviceType)} disabled={submitting}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cpu">
                <span className="flex items-center gap-2"><Cpu className="h-3.5 w-3.5" />CPU</span>
              </SelectItem>
              <SelectItem value="cuda">
                <span className="flex items-center gap-2"><Zap className="h-3.5 w-3.5" />GPU (CUDA)</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Batch Size</Label>
          <Input
            type="number"
            min={1}
            placeholder="default from config.yaml"
            value={batchSize}
            onChange={(e) => setBatchSize(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Scenario ID <span className="text-muted-foreground text-xs">(single run)</span></Label>
          <Input
            type="number"
            min={1}
            placeholder="all scenarios"
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>

      <Button type="submit" disabled={submitting} className="bg-green-600 hover:bg-green-700 text-white">
        {submitting ? (
          <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Submitting…</>
        ) : (
          <><Play className="h-4 w-4 mr-2" />Run Model</>
        )}
      </Button>
    </form>
  );
}

function JobStatusPanel({ jobId, onComplete }: { jobId: string; onComplete: (s: JobStatus) => void }) {
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await ulpApi.jobStatus(jobId);
        if (!cancelled) {
          setStatus(data);
          if (data.status === "completed" || data.status === "failed") {
            onComplete(data.status);
          } else {
            timerRef.current = setTimeout(poll, 2000);
          }
        }
      } catch {
        if (!cancelled) timerRef.current = setTimeout(poll, 4000);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId, onComplete]);

  if (!status) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="h-4 w-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
        Connecting to UL backend…
      </div>
    );
  }

  const elapsed =
    status.elapsed_seconds != null
      ? formatElapsed(status.elapsed_seconds)
      : status.started_at
      ? formatElapsed((Date.now() - new Date(status.started_at).getTime()) / 1000)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge variant={statusVariant(status.status)} className="capitalize">{status.status}</Badge>
        {(status.status === "pending" || status.status === "running") && (
          <div className="h-4 w-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
        )}
        {elapsed && <span className="text-sm text-muted-foreground">{elapsed}</span>}
      </div>
      {status.progress && <p className="text-sm text-muted-foreground">{status.progress}</p>}
      {status.status === "failed" && status.error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          <strong>Error:</strong> {status.error}
        </div>
      )}
      <p className="text-xs text-muted-foreground font-mono">Job ID: {status.job_id}</p>
    </div>
  );
}

function ResultsPanel({ jobId, onRunAgain }: { jobId: string; onRunAgain: () => void }) {
  const [result, setResult] = useState<JobResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    ulpApi.jobResult(jobId)
      .then(setResult)
      .catch(() => setError("Failed to load results."))
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="h-4 w-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
        Loading results…
      </div>
    );
  }
  if (error) {
    return <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>;
  }
  if (!result) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant={statusVariant(result.status)} className="capitalize">{result.status}</Badge>
          {result.total_elapsed_seconds != null && (
            <span className="text-sm text-muted-foreground">
              Completed in {result.total_elapsed_seconds.toFixed(2)}s
            </span>
          )}
          {result.n_policies != null && (
            <span className="text-sm text-muted-foreground">
              {result.n_policies.toLocaleString()} policies
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onRunAgain}>
          <RotateCcw className="h-3.5 w-3.5 mr-2" />New Run
        </Button>
      </div>

      {result.status === "failed" && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          The model run failed. Check backend logs for details.
        </div>
      )}

      {result.scenarios.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Scenario Metrics</h3>
          {result.scenarios.map((s) => (
            <Card key={s.scenario_id} className="bg-muted/30">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm text-muted-foreground font-medium">
                  Scenario {s.scenario_id}
                  {s.elapsed_seconds != null && (
                    <span className="ml-2 text-xs font-normal">({s.elapsed_seconds.toFixed(2)}s)</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: "APE", value: formatLarge(s.ape) },
                    { label: "PV Cashflow (t=0)", value: formatLarge(s.pv_cf) },
                    { label: "PV Premium Inc (t=0)", value: formatLarge(s.pv_prem) },
                    { label: "PV CF / APE", value: formatRatio(s.pvcf_over_ape) },
                    { label: "PV CF / PV Prem", value: formatRatio(s.pvcf_over_pv_prem) },
                  ].map((m) => (
                    <div key={m.label} className="rounded-md bg-background border px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{m.label}</p>
                      <p className="text-sm font-semibold font-mono">{m.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {result.output_files.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Output Files</h3>
          <div className="rounded-md border divide-y">
            {result.output_files.map((f) => (
              <div key={f.filename} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                <div className="min-w-0">
                  <span className="text-sm font-medium truncate block">{f.filename}</span>
                  <span className="text-xs text-muted-foreground">
                    {f.file_type}{f.scenario_id != null ? ` · scen ${f.scenario_id}` : ""} · {formatBytes(f.size_bytes)}
                  </span>
                </div>
                <a
                  href={ulpApi.downloadUrl(jobId, f.filename)}
                  download={f.filename}
                  className="ml-4 shrink-0"
                >
                  <Button variant="outline" size="sm">
                    <Download className="h-3.5 w-3.5 mr-1.5" />Download
                  </Button>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground font-mono">Output dir: {result.output_dir}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

type Phase = "idle" | "running" | "done";

export default function UlpEngineView() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [jobId, setJobId] = useState<string | null>(null);

  function handleJobStarted(id: string) {
    setJobId(id);
    setPhase("running");
  }

  const handleComplete = useCallback(() => {
    setPhase("done");
  }, []);

  function handleRunAgain() {
    setJobId(null);
    setPhase("idle");
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">ULP Actuarial Engine</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Universal Life Policy cashflow model — PyTorch GPU-accelerated
        </p>
      </div>

      <Separator />

      {phase === "idle" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configure Run</CardTitle>
          </CardHeader>
          <CardContent>
            <RunForm onJobStarted={handleJobStarted} />
          </CardContent>
        </Card>
      )}

      {phase === "running" && jobId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Job Running</CardTitle>
          </CardHeader>
          <CardContent>
            <JobStatusPanel jobId={jobId} onComplete={handleComplete} />
          </CardContent>
        </Card>
      )}

      {phase === "done" && jobId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Results</CardTitle>
          </CardHeader>
          <CardContent>
            <ResultsPanel jobId={jobId} onRunAgain={handleRunAgain} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
