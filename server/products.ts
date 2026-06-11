// ---------------------------------------------------------------------------
// Product registry
// ---------------------------------------------------------------------------
// A "product" is a sibling folder under PRODUCTS_DIR (e.g. C:\projects\UL).
// Each folder MAY contain a `fia.config.json` manifest describing how to run it
// and where its data / assumptions / results live. Anything omitted falls back
// to the UL convention (run_model.py + policy_data/ + param_tables/ + results/).
//
// Adding a new project = drop a folder in PRODUCTS_DIR and (optionally) a
// fia.config.json. No code changes required.
// ---------------------------------------------------------------------------

import fs from "fs";
import path from "path";

export const PRODUCTS_DIR =
  process.env.PRODUCTS_DIR ?? path.resolve(process.cwd(), "..");

// ---------------------------------------------------------------------------
// Normalized config shape (what the rest of the app consumes)
// ---------------------------------------------------------------------------

export interface RunConfig {
  script: string;                 // entry script, relative to product dir
  singleFlag: string | null;      // flag carrying the single-run id (e.g. --scenario-id)
  outputFlag: string | null;      // flag for an output dir passed from the request body
  deviceFlag: string | null;      // flag for --device passed from the request body
  modeFlag: string | null;        // flag for --mode passed from the request body
  monthsFlag: string | null;      // flag for projection months
  fixedArgs: [string, string][];  // always-passed [flag, valueRelativeToProductDir]
}

export interface DataConfig {
  kind: "list" | "external" | "none";
  dir: string;                    // relative dir (list) — files browsed in-app
  file: string | null;           // relative file (external) — opened via the OS
}

export interface AssumptionsConfig {
  kind: "csv-files" | "xlsx-sheets" | "none";
  dir: string | null;            // csv-files: relative dir of CSV/text tables
  file: string | null;          // xlsx-sheets: relative path of the workbook
}

export interface ResultsConfig {
  kind: "csv-summary" | "xlsx-tree" | "none";
  dir: string;                    // relative results dir
  files: string[];               // csv-summary: ordered [metrics, summary] file names
}

export interface UiConfig {
  months: boolean;
  monthsDefault: number;
  idLabel: string;
  idType: "number" | "text";
  idPlaceholder: string;
  runTypeLabels: { portfolio: string; single: string };
  runButton: string | null;       // override for the Run button label
}

export interface ProductConfig {
  id: string;
  label: string;
  run: RunConfig;
  data: DataConfig;
  assumptions: AssumptionsConfig;
  results: ResultsConfig;
  ui: UiConfig;
}

// ---------------------------------------------------------------------------
// Defaults (UL convention)
// ---------------------------------------------------------------------------

function defaults(id: string): ProductConfig {
  return {
    id,
    label: id,
    run: {
      script: "run_model.py",
      singleFlag: "--scenario-id",
      outputFlag: "--output-dir",
      deviceFlag: "--device",
      modeFlag: "--mode",
      monthsFlag: null,
      fixedArgs: [],
    },
    data: { kind: "list", dir: "policy_data", file: null },
    assumptions: { kind: "csv-files", dir: "param_tables", file: null },
    results: {
      kind: "csv-summary",
      dir: "results/test_1",
      files: ["scenario_metrics_summary.csv", "summary_scen1.csv"],
    },
    ui: {
      months: false,
      monthsDefault: 120,
      idLabel: "Scenario ID",
      idType: "number",
      idPlaceholder: "e.g. 1",
      runTypeLabels: { portfolio: "Portfolio (all scenarios)", single: "Single Scenario" },
      runButton: null,
    },
  };
}

// Shallow-merge a partial manifest over the defaults, section by section.
function normalize(id: string, raw: any): ProductConfig {
  const d = defaults(id);
  if (!raw || typeof raw !== "object") return d;
  return {
    id,
    label: typeof raw.label === "string" ? raw.label : d.label,
    run: { ...d.run, ...(raw.run ?? {}) },
    data: { ...d.data, ...(raw.data ?? {}) },
    assumptions: { ...d.assumptions, ...(raw.assumptions ?? {}) },
    results: { ...d.results, ...(raw.results ?? {}) },
    ui: {
      ...d.ui,
      ...(raw.ui ?? {}),
      runTypeLabels: { ...d.ui.runTypeLabels, ...(raw.ui?.runTypeLabels ?? {}) },
    },
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const APP_FOLDER = path.basename(process.cwd());

function loadManifest(id: string): ProductConfig {
  const file = path.join(PRODUCTS_DIR, id, "fia.config.json");
  try {
    if (fs.existsSync(file)) {
      return normalize(id, JSON.parse(fs.readFileSync(file, "utf-8")));
    }
  } catch (err) {
    console.error(`Invalid fia.config.json for product '${id}':`, err);
  }
  return defaults(id);
}

/** List every product folder under PRODUCTS_DIR with its normalized config. */
export function listProducts(): ProductConfig[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(PRODUCTS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && e.name !== APP_FOLDER && !e.name.startsWith("."))
    .map((e) => loadManifest(e.name));
}

/** Resolve a single product by id, or null if its folder doesn't exist. */
export function getProduct(id: string): ProductConfig | null {
  if (!isSafeProductId(id)) return null;
  const dir = path.join(PRODUCTS_DIR, id);
  if (!fs.existsSync(dir)) return null;
  return loadManifest(id);
}

/** Absolute path to a product's folder. */
export function productDir(id: string): string {
  return path.join(PRODUCTS_DIR, id);
}

/** Resolve a manifest-relative path to an absolute path inside the product folder. */
export function resolveInProduct(id: string, rel: string): string {
  return path.join(PRODUCTS_DIR, id, rel);
}

export function isSafeProductId(id: string): boolean {
  return typeof id === "string" && id.length > 0 && !/[/\\]/.test(id) && !id.includes("..");
}
