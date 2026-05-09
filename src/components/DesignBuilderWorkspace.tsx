"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  BarChart3,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Loader2,
  Play,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import OptimizationDashboard from "@/components/OptimizationDashboard";
import ReportEditor from "@/components/ReportEditor";
import ReportGenerationStepper from "@/components/ReportGenerationStepper";
import ReportViewer from "@/components/ReportViewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { parseSimulationCsvFile, type SimulationCsvPreviewRow } from "@/lib/designbuilder/simulationCsvParser";
import {
  projectInsertSchema,
  scenarioInsertSchema,
  type Project,
  type ProjectInsert,
  type Scenario,
  type SimulationDataInsert,
} from "@/lib/designbuilder/workspaceTypes";
import { buildScenarioSummary } from "@/services/designbuilderScenarioSummary";
import type { OptimizationComparisonResult } from "@/services/optimizationService";
import { REPORT_SECTION_DEFINITIONS, type ReportSectionRecord } from "@/types/report";

type WizardStep = "project" | "upload" | "preview" | "reports" | "comparison";
type UploadState = "idle" | "parsing" | "done" | "error";
type ReportRunStatus = "idle" | "generating" | "completed" | "failed";

const seedProjects: Project[] = [
  {
    id: "26a0d40d-476e-4d5f-bc5d-b390edc9a1b1",
    user_id: "f0fdaf64-a8aa-45e8-b4f2-85f4d7321f17",
    name: "Istanbul Ofis Kabugu",
    location: "Istanbul",
    climate_data: { degreeDays: 1543, climateZone: "3A" },
    created_at: new Date("2026-05-01T09:00:00.000Z"),
  },
];

const STORAGE_KEYS = {
  projects: "designbuilder-workspace-projects",
  scenarios: "designbuilder-workspace-scenarios",
  synced: "designbuilder-workspace-synced-scenarios",
  rows: "designbuilder-workspace-scenario-rows",
  selectedProjectId: "designbuilder-workspace-selected-project",
  reportGroups: "designbuilder-workspace-report-groups",
  reportStatuses: "designbuilder-workspace-report-statuses",
} as const;

const stepDefinitions: Array<{ key: WizardStep; label: string; detail: string }> = [
  { key: "project", label: "1. Proje", detail: "Proje sec veya olustur" },
  { key: "upload", label: "2. Dosyalar", detail: "CSV dosyalarini yukle" },
  { key: "preview", label: "3. Onizleme", detail: "Grafik ve veri kontrolu" },
  { key: "reports", label: "4. Raporlama", detail: "Dosya dosya bolumlu rapor" },
  { key: "comparison", label: "5. Karsilastirma", detail: "Tamamlanan raporlardan karar" },
];

const numberFmt = (value: number | null | undefined, maximumFractionDigits = 2) =>
  value === null || value === undefined ? "-" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits }).format(value);

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const readStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const normalizeRemoteError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("521") || normalized.includes("web server is down") || normalized.includes("<!doctype html")) {
    return "Supabase gecici olarak erisilemiyor. Senaryo yerel olarak saklandi; servis tekrar geldiginde yeniden senkronlayabilirsin.";
  }
  return message;
};

export default function DesignBuilderWorkspace() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeStep, setActiveStep] = useState<WizardStep>("project");
  const [projects, setProjects] = useState<Project[]>(seedProjects);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioRowsById, setScenarioRowsById] = useState<Record<string, SimulationDataInsert[]>>({});
  const [syncedScenarioIds, setSyncedScenarioIds] = useState<Record<string, boolean>>({});
  const [reportGroupByScenarioId, setReportGroupByScenarioId] = useState<Record<string, string>>({});
  const [reportStatusByScenarioId, setReportStatusByScenarioId] = useState<Record<string, ReportRunStatus>>({});
  const [selectedProjectId, setSelectedProjectId] = useState(seedProjects[0]?.id ?? "");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectLocation, setNewProjectLocation] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [message, setMessage] = useState("Once proje sec, sonra DesignBuilder CSV dosyalarini yukle.");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<SimulationCsvPreviewRow[]>([]);
  const [selectedPreviewScenarioId, setSelectedPreviewScenarioId] = useState("");
  const [analysisLanguage, setAnalysisLanguage] = useState<"tr" | "en">("tr");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [activeReportGroupId, setActiveReportGroupId] = useState("");
  const [activeReportTitle, setActiveReportTitle] = useState("");
  const [reportScenarioId, setReportScenarioId] = useState("");
  const [reportSections, setReportSections] = useState<ReportSectionRecord[]>([]);
  const [reportError, setReportError] = useState("");
  const [workflowLog, setWorkflowLog] = useState<string[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationComparisonResult | null>(null);
  const [optimizationError, setOptimizationError] = useState("");
  const [isStorageReady, setIsStorageReady] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const projectScenarios = useMemo(
    () => scenarios.filter((scenario) => scenario.project_id === selectedProjectId),
    [scenarios, selectedProjectId]
  );

  const selectedPreviewScenario = useMemo(
    () => projectScenarios.find((scenario) => scenario.id === selectedPreviewScenarioId) ?? projectScenarios[0] ?? null,
    [projectScenarios, selectedPreviewScenarioId]
  );

  const selectedPreviewRows = useMemo(
    () => (selectedPreviewScenario ? scenarioRowsById[selectedPreviewScenario.id] ?? [] : []),
    [scenarioRowsById, selectedPreviewScenario]
  );

  const reportsReady = useMemo(
    () =>
      projectScenarios.length > 0 &&
      projectScenarios.every((scenario) => reportStatusByScenarioId[scenario.id] === "completed"),
    [projectScenarios, reportStatusByScenarioId]
  );

  const previewChartData = useMemo(() => {
    return selectedPreviewRows.slice(0, 60).map((row, index) => ({
      label: String(index + 1),
      heating: row.heating_load ?? 0,
      cooling: row.cooling_load ?? 0,
      temperature: row.air_temperature ?? 0,
      humidity: row.humidity ?? 0,
    }));
  }, [selectedPreviewRows]);

  const scenarioEnergyData = useMemo(
    () =>
      projectScenarios.map((scenario) => ({
        name: scenario.name,
        energy: Number((scenario.total_energy_consumption ?? 0).toFixed(2)),
        rows: scenarioRowsById[scenario.id]?.length ?? 0,
      })),
    [projectScenarios, scenarioRowsById]
  );

  useEffect(() => {
    const storedProjects = readStorage<Array<Omit<Project, "created_at"> & { created_at: string }>>(STORAGE_KEYS.projects, []);
    const storedScenarios = readStorage<Array<Omit<Scenario, "created_at"> & { created_at: string }>>(STORAGE_KEYS.scenarios, []);
    const storedRows = readStorage<Record<string, Array<Omit<SimulationDataInsert, "timestamp"> & { timestamp: string }>>>(
      STORAGE_KEYS.rows,
      {}
    );
    const storedSynced = readStorage<Record<string, boolean>>(STORAGE_KEYS.synced, {});
    const storedReportGroups = readStorage<Record<string, string>>(STORAGE_KEYS.reportGroups, {});
    const storedReportStatuses = readStorage<Record<string, ReportRunStatus>>(STORAGE_KEYS.reportStatuses, {});
    const storedSelectedProjectId = readStorage<string>(STORAGE_KEYS.selectedProjectId, seedProjects[0]?.id ?? "");

    if (storedProjects.length > 0) {
      setProjects(storedProjects.map((project) => ({ ...project, created_at: new Date(project.created_at) })));
    }
    if (storedScenarios.length > 0) {
      setScenarios(storedScenarios.map((scenario) => ({ ...scenario, created_at: new Date(scenario.created_at) })));
    }
    if (Object.keys(storedRows).length > 0) {
      setScenarioRowsById(
        Object.fromEntries(
          Object.entries(storedRows).map(([scenarioId, rows]) => [
            scenarioId,
            rows.map((row) => ({ ...row, timestamp: new Date(row.timestamp) })),
          ])
        )
      );
    }
    setSyncedScenarioIds(storedSynced);
    setReportGroupByScenarioId(storedReportGroups);
    setReportStatusByScenarioId(storedReportStatuses);
    if (storedSelectedProjectId) setSelectedProjectId(storedSelectedProjectId);
    setIsStorageReady(true);
  }, []);

  useEffect(() => {
    if (!isStorageReady || typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEYS.projects,
      JSON.stringify(projects.map((project) => ({ ...project, created_at: project.created_at.toISOString() })))
    );
  }, [isStorageReady, projects]);

  useEffect(() => {
    if (!isStorageReady || typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEYS.scenarios,
      JSON.stringify(scenarios.map((scenario) => ({ ...scenario, created_at: scenario.created_at.toISOString() })))
    );
  }, [isStorageReady, scenarios]);

  useEffect(() => {
    if (!isStorageReady || typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEYS.rows,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(scenarioRowsById).map(([scenarioId, rows]) => [
            scenarioId,
            rows.map((row) => ({
              ...row,
              timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
            })),
          ])
        )
      )
    );
  }, [isStorageReady, scenarioRowsById]);

  useEffect(() => {
    if (!isStorageReady || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.synced, JSON.stringify(syncedScenarioIds));
    window.localStorage.setItem(STORAGE_KEYS.reportGroups, JSON.stringify(reportGroupByScenarioId));
    window.localStorage.setItem(STORAGE_KEYS.reportStatuses, JSON.stringify(reportStatusByScenarioId));
    window.localStorage.setItem(STORAGE_KEYS.selectedProjectId, JSON.stringify(selectedProjectId));
  }, [isStorageReady, reportGroupByScenarioId, reportStatusByScenarioId, selectedProjectId, syncedScenarioIds]);

  useEffect(() => {
    if (!projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projects[0]?.id ?? "");
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (projectScenarios.length > 0 && !projectScenarios.some((scenario) => scenario.id === selectedPreviewScenarioId)) {
      setSelectedPreviewScenarioId(projectScenarios[0].id);
    }
  }, [projectScenarios, selectedPreviewScenarioId]);

  const appendLog = (line: string) => {
    setWorkflowLog((prev) => [`${new Date().toLocaleTimeString("tr-TR")} - ${line}`, ...prev].slice(0, 12));
  };

  const handleCreateProject = () => {
    const parsed: ProjectInsert = projectInsertSchema.parse({
      user_id: seedProjects[0]?.user_id ?? crypto.randomUUID(),
      name: newProjectName,
      location: newProjectLocation || null,
      climate_data: { source: "manual-entry" },
    });
    const created: Project = { id: crypto.randomUUID(), created_at: new Date(), ...parsed };
    setProjects((prev) => [created, ...prev]);
    setSelectedProjectId(created.id);
    setNewProjectName("");
    setNewProjectLocation("");
    setActiveStep("upload");
  };

  const removeScenario = (scenarioId: string) => {
    setScenarios((prev) => prev.filter((scenario) => scenario.id !== scenarioId));
    setScenarioRowsById((prev) => {
      const next = { ...prev };
      delete next[scenarioId];
      return next;
    });
    setSyncedScenarioIds((prev) => {
      const next = { ...prev };
      delete next[scenarioId];
      return next;
    });
    setReportGroupByScenarioId((prev) => {
      const next = { ...prev };
      delete next[scenarioId];
      return next;
    });
    setReportStatusByScenarioId((prev) => {
      const next = { ...prev };
      delete next[scenarioId];
      return next;
    });
  };

  const persistScenario = async (project: Project, scenario: Scenario, rows: SimulationDataInsert[]) => {
    const response = await fetch("/api/designbuilder/workspace/save-scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, scenario, rows }),
    });
    const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!response.ok || !payload.success) {
      throw new Error(normalizeRemoteError(payload.error ?? "Scenario DB'ye yazilamadi."));
    }
  };

  const ensureScenarioSynced = async (scenario: Scenario) => {
    if (syncedScenarioIds[scenario.id]) return;

    const project = projects.find((item) => item.id === scenario.project_id);
    const rows = scenarioRowsById[scenario.id];
    if (!project || !rows?.length) {
      throw new Error(`${scenario.name} icin yerel veri bulunamadi; dosyayi tekrar yukle.`);
    }

    appendLog(`${scenario.name} rapor oncesi Supabase'e tekrar senkronlanıyor.`);
    await persistScenario(project, scenario, rows);
    setSyncedScenarioIds((prev) => ({ ...prev, [scenario.id]: true }));
    appendLog(`${scenario.name} senkronu tamamlandi, rapora geciliyor.`);
  };

  const handleFile = async (file: File) => {
    if (!selectedProject) {
      setUploadState("error");
      setMessage("Once bir proje sec veya yeni proje olustur.");
      return;
    }

    const scenarioDraft = scenarioInsertSchema.parse({
      project_id: selectedProject.id,
      name: file.name.replace(/\.csv$/i, ""),
      u_values: {},
      total_energy_consumption: null,
      cost_estimate: null,
    });
    const scenarioId = crypto.randomUUID();
    const result = await parseSimulationCsvFile(file, {
      scenarioId,
      onProgress: setProgressValue,
      onPreviewRows: setPreviewRows,
    });
    const totalEnergyConsumption = result.rows.reduce((sum, row) => sum + (row.heating_load ?? 0) + (row.cooling_load ?? 0), 0);
    const scenario: Scenario = {
      id: scenarioId,
      created_at: new Date(),
      ...scenarioDraft,
      total_energy_consumption: totalEnergyConsumption,
    };

    setScenarios((prev) => [scenario, ...prev.filter((item) => item.name !== scenario.name)]);
    setScenarioRowsById((prev) => ({ ...prev, [scenarioId]: result.rows }));
    setSelectedPreviewScenarioId(scenarioId);
    setWarnings((prev) => [...prev, ...result.warnings.slice(0, 3)]);

    try {
      await persistScenario(selectedProject, scenario, result.rows);
      setSyncedScenarioIds((prev) => ({ ...prev, [scenarioId]: true }));
      appendLog(`${scenario.name} Supabase'e senkronlandi.`);
    } catch (error) {
      setWarnings((prev) => [
        ...prev,
        error instanceof Error ? `DB senkronu basarisiz: ${error.message}` : "DB senkronu basarisiz.",
      ]);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const csvFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(".csv"));
    if (csvFiles.length === 0) {
      setUploadState("error");
      setMessage("En az bir CSV dosyasi sec.");
      return;
    }

    setUploadState("parsing");
    setWarnings([]);
    setProgressValue(0);
    setMessage(`${csvFiles.length} dosya sirayla parse ediliyor.`);

    try {
      for (let index = 0; index < csvFiles.length; index += 1) {
        const file = csvFiles[index];
        setMessage(`${index + 1}/${csvFiles.length}: ${file.name} isleniyor.`);
        appendLog(`${file.name} parser adimina alindi.`);
        await handleFile(file);
      }
      setProgressValue(100);
      setUploadState("done");
      setActiveStep("preview");
      setMessage("Dosyalar yuklendi. Grafik onizleme ve veri kontrolu hazir.");
    } catch (error) {
      setUploadState("error");
      setMessage(error instanceof Error ? error.message : "CSV ayrisma sirasinda beklenmeyen hata.");
    }
  };

  const onInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    await handleFiles(files);
    event.target.value = "";
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files?.length) {
      await handleFiles(event.dataTransfer.files);
    }
  };

  const fetchReportSections = async (reportGroupId: string) => {
    const response = await fetch(`/api/reports?reportGroupId=${encodeURIComponent(reportGroupId)}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      sections?: ReportSectionRecord[];
      error?: string;
    };
    if (!response.ok || !payload.success || !Array.isArray(payload.sections)) {
      throw new Error(payload.error ?? "Rapor bolumleri okunamadi.");
    }
    return payload.sections;
  };

  const waitForReportCompletion = async (reportGroupId: string, scenarioId: string) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 300000) {
      const sections = await fetchReportSections(reportGroupId);
      setReportSections(sections);
      const allCompleted =
        sections.length === REPORT_SECTION_DEFINITIONS.length && sections.every((section) => section.status === "completed");
      const allFinished = sections.every((section) => section.status === "completed" || section.status === "failed");

      setReportStatusByScenarioId((prev) => ({
        ...prev,
        [scenarioId]: allCompleted ? "completed" : allFinished ? "failed" : "generating",
      }));

      if (allCompleted) return sections;
      if (allFinished) throw new Error("Rapor bolumlerinden biri basarisiz oldu.");
      await sleep(1500);
    }
    throw new Error("Rapor uretimi zaman asimina ugradi.");
  };

  const generateReportForScenario = async (scenario: Scenario) => {
    const reportGroupId = reportGroupByScenarioId[scenario.id] ?? crypto.randomUUID();
    setReportGroupByScenarioId((prev) => ({ ...prev, [scenario.id]: reportGroupId }));
    setReportStatusByScenarioId((prev) => ({ ...prev, [scenario.id]: "generating" }));
    setActiveReportGroupId(reportGroupId);
    setReportScenarioId(scenario.id);
    setReportSections([]);
    setReportError("");
    setActiveReportTitle(
      analysisLanguage === "tr"
        ? `${selectedProject?.name ?? "Project"} - ${scenario.name} Teknik Raporu`
        : `${selectedProject?.name ?? "Project"} - ${scenario.name} Technical Report`
    );
    appendLog(`${scenario.name} icin bolumlu rapor uretimi basladi.`);

    const response = await fetch("/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: scenario.id, reportGroupId, language: analysisLanguage }),
    });
    const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; reportTitle?: string };
    if (!response.ok || !payload.success) {
      setReportStatusByScenarioId((prev) => ({ ...prev, [scenario.id]: "failed" }));
      throw new Error(payload.error ?? "Rapor olusturulamadi.");
    }

    setActiveReportTitle(payload.reportTitle ?? activeReportTitle);
    const sections = await waitForReportCompletion(reportGroupId, scenario.id);
    appendLog(`${scenario.name} raporu tamamlandi.`);
    return { reportGroupId, sections };
  };

  const buildReportMarkdown = (sections: ReportSectionRecord[]) =>
    [...sections]
      .sort((a, b) => a.sectionOrder - b.sectionOrder)
      .filter((section) => section.status === "completed" && section.sectionContent.trim())
      .map((section) => `## ${section.sectionTitle}\n\n${section.sectionContent}`)
      .join("\n\n");

  const buildScenarioPayloads = async (scenarioIds: string[]) => {
    const payloads = [];
    for (const scenarioId of scenarioIds) {
      const scenario = scenarios.find((item) => item.id === scenarioId);
      const project = projects.find((item) => item.id === scenario?.project_id);
      const rows = scenarioRowsById[scenarioId];
      const reportGroupId = reportGroupByScenarioId[scenarioId];
      if (!scenario || !project || !rows?.length || !reportGroupId) continue;

      const sections = await fetchReportSections(reportGroupId);
      payloads.push({
        summary: buildScenarioSummary({
          scenario: {
            id: scenario.id,
            projectId: scenario.project_id,
            name: scenario.name,
            totalEnergyConsumption: scenario.total_energy_consumption,
            uValues: scenario.u_values ?? {},
            projectName: project.name,
            location: project.location ?? null,
          },
          rows: rows.map((row, index) => ({
            id: `${scenario.id}-${index}`,
            ...row,
            timestamp: row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp),
          })),
        }),
        costEstimate: scenario.cost_estimate,
        reportMarkdown: buildReportMarkdown(sections),
      });
    }
    return payloads;
  };

  const runComparison = async (scenarioIds: string[]) => {
    setIsOptimizing(true);
    setOptimizationError("");
    setOptimizationResult(null);
    appendLog("Karsilastirma raporu icin tamamlanmis raporlar okunuyor.");

    try {
      const scenarioPayloads = await buildScenarioPayloads(scenarioIds);
      if (scenarioPayloads.length < 2) {
        throw new Error("Karsilastirma icin en az iki tamamlanmis senaryo raporu gerekli.");
      }

      const response = await fetch("/api/optimize-scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioIds, language: analysisLanguage, scenarioPayloads }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        winner?: OptimizationComparisonResult["winner"];
        scenarios?: OptimizationComparisonResult["scenarios"];
        latexTable?: string;
        strategistSummary?: string;
        baselineScenarioId?: string;
        currency?: OptimizationComparisonResult["currency"];
      };

      if (
        !response.ok ||
        !payload.success ||
        !payload.winner ||
        !payload.scenarios ||
        !payload.latexTable ||
        !payload.strategistSummary ||
        !payload.baselineScenarioId ||
        !payload.currency
      ) {
        throw new Error(payload.error ?? "Karsilastirma raporu uretilemedi.");
      }

      setOptimizationResult({
        winner: payload.winner,
        scenarios: payload.scenarios,
        latexTable: payload.latexTable,
        strategistSummary: payload.strategistSummary,
        baselineScenarioId: payload.baselineScenarioId,
        currency: payload.currency,
      });
      appendLog("Karsilastirma raporu tamamlandi.");
      setActiveStep("comparison");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Karsilastirma raporu uretilemedi.";
      setOptimizationError(message);
      appendLog(`Karsilastirma raporu durdu: ${message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const runSequentialReportsAndComparison = async () => {
    if (projectScenarios.length === 0) {
      setReportError("Once en az bir dosya yukle.");
      return;
    }

    setIsGeneratingReport(true);
    setReportError("");
    setWorkflowLog([]);
    setActiveStep("reports");

    try {
      const scenarioIds: string[] = [];
      for (const scenario of [...projectScenarios].reverse()) {
        await ensureScenarioSynced(scenario);
        if (reportStatusByScenarioId[scenario.id] !== "completed") {
          await generateReportForScenario(scenario);
        }
        scenarioIds.push(scenario.id);
      }

      setIsGeneratingReport(false);
      if (scenarioIds.length >= 2) {
        await runComparison(scenarioIds);
      } else {
        appendLog("Tek senaryo raporu tamamlandi; karsilastirma icin ikinci dosya gerekli.");
      }
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Siralı raporlama akisi tamamlanamadi.");
      setIsGeneratingReport(false);
    }
  };

  const regenerateReportSection = async (sectionKey: ReportSectionRecord["sectionKey"]) => {
    if (!activeReportGroupId || !reportScenarioId) return;
    setReportError("");
    const response = await fetch("/api/reports/section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportGroupId: activeReportGroupId, scenarioId: reportScenarioId, sectionKey, language: analysisLanguage }),
    });
    const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!response.ok || !payload.success) {
      setReportError(payload.error ?? "Section regenerate edilemedi.");
      return;
    }
    const sections = await fetchReportSections(activeReportGroupId);
    setReportSections(sections);
  };

  const saveEditedSection = async (sectionKey: ReportSectionRecord["sectionKey"], sectionContent: string) => {
    if (!activeReportGroupId) return;
    const response = await fetch("/api/reports/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportGroupId: activeReportGroupId, sectionKey, sectionContent }),
    });
    const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!response.ok || !payload.success) {
      throw new Error(payload.error ?? "Section kaydedilemedi.");
    }
    setReportSections(await fetchReportSections(activeReportGroupId));
  };

  const completedReportCount = projectScenarios.filter((scenario) => reportStatusByScenarioId[scenario.id] === "completed").length;
  const canOpenStep = (step: WizardStep) => {
    if (step === "project") return true;
    if (step === "upload") return Boolean(selectedProject);
    if (step === "preview" || step === "reports") return projectScenarios.length > 0;
    return reportsReady && Boolean(optimizationResult);
  };

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-5">
          {stepDefinitions.map((step) => {
            const isActive = step.key === activeStep;
            const isDisabled = !canOpenStep(step.key);
            return (
              <button
                key={step.key}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (!isDisabled) setActiveStep(step.key);
                }}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  isActive
                    ? "border-emerald-400 bg-emerald-50"
                    : isDisabled
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 opacity-60"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                }`}
              >
                <p className="text-xs font-black text-slate-900">{step.label}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">{step.detail}</p>
              </button>
            );
          })}
        </div>
      </div>

      {activeStep === "project" ? (
        <Card className="border-cyan-100">
          <CardContent className="space-y-5">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-cyan-700" />
              <div>
                <p className="text-sm font-black text-slate-900">Proje Secimi</p>
                <p className="text-xs text-slate-500">Rapor ve optimizasyon dosyalari secili proje altinda toplanir.</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    setSelectedProjectId(project.id);
                    setActiveStep("upload");
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${
                    project.id === selectedProjectId ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-black text-slate-900">{project.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{project.location || "Konum girilmedi"}</p>
                  <p className="mt-3 text-[11px] text-slate-500">
                    Senaryo: {scenarios.filter((scenario) => scenario.project_id === project.id).length}
                  </p>
                </button>
              ))}
            </div>
            <div className="grid gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 md:grid-cols-[1fr_1fr_160px]">
              <Input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Yeni proje adi" />
              <Input value={newProjectLocation} onChange={(event) => setNewProjectLocation(event.target.value)} placeholder="Konum" />
              <Button type="button" onClick={handleCreateProject} disabled={!newProjectName.trim()} className="bg-cyan-700 hover:bg-cyan-600">
                Proje Olustur
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeStep === "upload" ? (
        <Card className="border-emerald-100">
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-emerald-700" />
                <div>
                  <p className="text-sm font-black text-slate-900">Dosya Yukleme</p>
                  <p className="text-xs text-slate-500">Bir veya birden cok DesignBuilder CSV dosyasi sec.</p>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => setActiveStep("preview")} disabled={projectScenarios.length === 0}>
                Onizlemeye Gec
              </Button>
            </div>

            <div
              onDrop={(event) => void onDrop(event)}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-[28px] border-2 border-dashed p-8 text-center transition ${
                isDragging ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-slate-50"
              }`}
            >
              <input ref={inputRef} type="file" multiple accept=".csv,text/csv" className="hidden" onChange={(event) => void onInputChange(event)} />
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
                {uploadState === "parsing" ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileSpreadsheet className="h-6 w-6" />}
              </div>
              <p className="mt-4 text-lg font-black text-slate-900">CSV dosyalarini buraya birak</p>
              <p className="mt-2 text-sm text-slate-600">
                {selectedProject
                  ? `${selectedProject.name} projesine 2'den fazla CSV dosyasi ayni anda eklenebilir.`
                  : "Once proje sec."}
              </p>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Parser ilerleme durumu</span>
                <span>%{progressValue}</span>
              </div>
              <Progress value={progressValue} />
              <p className="text-sm text-slate-700">{message}</p>
              {warnings.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {warnings.slice(0, 5).map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeStep === "preview" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="border-violet-100">
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-violet-700" />
                  <div>
                    <p className="text-sm font-black text-slate-900">Grafikli Onizleme</p>
                    <p className="text-xs text-slate-500">
                      Enerji grafigi yuklenen tum dosyalari karsilastirir; satir onizleme secili dosyayi gosterir.
                    </p>
                  </div>
                </div>
                <select
                  value={selectedPreviewScenario?.id ?? ""}
                  onChange={(event) => setSelectedPreviewScenarioId(event.target.value)}
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                >
                  {projectScenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Senaryo Enerji Dagilimi</p>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={scenarioEnergyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" stroke="#64748b" />
                        <YAxis stroke="#64748b" />
                        <Tooltip />
                        <Bar dataKey="energy" fill="#059669" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Ilk 60 Satir Trendi</p>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={previewChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" stroke="#64748b" />
                        <YAxis stroke="#64748b" />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="heating" stroke="#ef4444" fill="#fecaca" />
                        <Area type="monotone" dataKey="cooling" stroke="#2563eb" fill="#bfdbfe" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {projectScenarios.map((scenario) => (
                  <article key={scenario.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-black text-slate-900">{scenario.name}</p>
                        <p className="mt-1 text-xs text-slate-600">Satir: {scenarioRowsById[scenario.id]?.length ?? 0}</p>
                        <p className="mt-1 text-xs text-slate-600">Enerji: {numberFmt(scenario.total_energy_consumption)}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-600">
                          DB: {syncedScenarioIds[scenario.id] ? "Senkron" : "Rapor oncesi tekrar denenecek"}
                        </p>
                      </div>
                      <button type="button" onClick={() => removeScenario(scenario.id)} className="text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <Button
                type="button"
                className="bg-slate-900 hover:bg-slate-800"
                disabled={projectScenarios.length === 0 || isGeneratingReport || isOptimizing}
                onClick={() => void runSequentialReportsAndComparison()}
              >
                {isGeneratingReport || isOptimizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Raporlama Sistemini Calistir
              </Button>
            </CardContent>
          </Card>

          <Card className="border-violet-100">
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-violet-700" />
                <div>
                  <p className="text-sm font-black text-slate-900">Satir Onizleme</p>
                  <p className="text-xs text-slate-500">
                    {selectedPreviewScenario
                      ? `${selectedPreviewScenario.name} dosyasinin normalize ilk satirlari`
                      : "Secili dosyanin normalize ilk satirlari"}
                  </p>
                </div>
              </div>
              <div className="max-h-[520px] overflow-auto rounded-2xl border border-slate-200">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>#</TableHeaderCell>
                      <TableHeaderCell>Timestamp</TableHeaderCell>
                      <TableHeaderCell>Zone</TableHeaderCell>
                      <TableHeaderCell>Heating</TableHeaderCell>
                      <TableHeaderCell>Cooling</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedPreviewRows.slice(0, 12).map((row, index) => (
                      <TableRow key={`${row.scenario_id}-${index}`}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{new Date(row.timestamp).toLocaleString("tr-TR")}</TableCell>
                        <TableCell>{row.zone_name}</TableCell>
                        <TableCell>{numberFmt(row.heating_load)}</TableCell>
                        <TableCell>{numberFmt(row.cooling_load)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeStep === "reports" ? (
        <div className="space-y-5">
          <Card className="border-blue-100">
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-700" />
                  <div>
                    <p className="text-sm font-black text-slate-900">Siralı Raporlama</p>
                    <p className="text-xs text-slate-500">Her dosya kendi icinde bolum bolum raporlanir; sonra karsilastirma baslar.</p>
                  </div>
                </div>
                <Button type="button" onClick={() => void runSequentialReportsAndComparison()} disabled={isGeneratingReport || projectScenarios.length === 0}>
                  {isGeneratingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  Akisi Baslat
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {projectScenarios.map((scenario) => (
                  <article key={scenario.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-black text-slate-900">{scenario.name}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-600">
                      Durum: {reportStatusByScenarioId[scenario.id] ?? "idle"}
                    </p>
                  </article>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <p className="font-black text-slate-900">Akis Gunlugu</p>
                <div className="mt-2 space-y-1">
                  {workflowLog.length === 0 ? <p>Henuz akis baslatilmadi.</p> : workflowLog.map((line) => <p key={line}>{line}</p>)}
                </div>
              </div>
              {optimizationError ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {optimizationError}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {reportSections.length > 0 ? <ReportGenerationStepper sections={reportSections} isGenerating={isGeneratingReport} /> : null}
          {reportError ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{reportError}</p> : null}
          {reportSections.length > 0 ? (
            <div className="space-y-5">
              <ReportViewer reportTitle={activeReportTitle} sections={reportSections} onRegenerate={regenerateReportSection} onSaveEdit={saveEditedSection} />
              <div className="rounded-3xl border border-cyan-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-cyan-700" />
                  <p className="text-sm font-black text-slate-900">Muhendis Denetimi</p>
                </div>
                <ReportEditor
                  reportGroupId={activeReportGroupId}
                  language={analysisLanguage}
                  sections={reportSections}
                  onSectionsChanged={async () => {
                    if (activeReportGroupId) setReportSections(await fetchReportSections(activeReportGroupId));
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeStep === "comparison" ? (
        <div className="space-y-5">
          <Card className="border-emerald-100">
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900">Karsilastirma Raporu</p>
                  <p className="text-xs text-slate-500">
                    {reportsReady
                      ? "Tum senaryo raporlari tamamlandi; karsilastirma raporu rapor metinlerinden olusturulur."
                      : `${completedReportCount}/${projectScenarios.length} rapor tamamlandi.`}
                  </p>
                </div>
                <Button
                  type="button"
                  className="bg-emerald-600 hover:bg-emerald-500"
                  disabled={!reportsReady || isOptimizing || projectScenarios.length < 2}
                  onClick={() => void runComparison(projectScenarios.map((scenario) => scenario.id))}
                >
                  {isOptimizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart3 className="mr-2 h-4 w-4" />}
                  Karsilastirma Raporunu Uret
                </Button>
              </div>
              {optimizationError ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{optimizationError}</p> : null}
            </CardContent>
          </Card>
          {optimizationResult ? <OptimizationDashboard result={optimizationResult} /> : null}
        </div>
      ) : null}
    </section>
  );
}
