"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Bot, Database, FileSpreadsheet, FileText, FolderKanban, Loader2, Trash2, UploadCloud } from "lucide-react";

import AiStatusTerminal from "@/components/AiStatusTerminal";
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

const seedProjects: Project[] = [
  {
    id: "26a0d40d-476e-4d5f-bc5d-b390edc9a1b1",
    user_id: "f0fdaf64-a8aa-45e8-b4f2-85f4d7321f17",
    name: "Istanbul Ofis Kabugu",
    location: "Istanbul",
    climate_data: { degreeDays: 1543, climateZone: "3A" },
    created_at: new Date("2026-05-01T09:00:00.000Z"),
  },
  {
    id: "e19d59c7-efb4-4af2-bf57-cda5f5b2c4dd",
    user_id: "f0fdaf64-a8aa-45e8-b4f2-85f4d7321f17",
    name: "Ankara Endustri Tesisi",
    location: "Ankara",
    climate_data: { degreeDays: 2210, climateZone: "4B" },
    created_at: new Date("2026-04-24T10:30:00.000Z"),
  },
];

const seedScenarios: Scenario[] = [
  {
    id: "32b1604e-f8b0-47b6-b5b0-63a1b7af0b32",
    project_id: "26a0d40d-476e-4d5f-bc5d-b390edc9a1b1",
    name: "Cephe Senaryosu A",
    u_values: { wall: 0.42, roof: 0.21, glazing: 1.4 },
    total_energy_consumption: 24210,
    cost_estimate: 185000,
    created_at: new Date("2026-05-02T11:00:00.000Z"),
  },
];

type UploadState = "idle" | "parsing" | "done" | "error";
type ReportRunStatus = "idle" | "generating" | "completed" | "failed";
type TerminalTrace = {
  stage: "preprocess" | "analyst" | "auditor" | "reporter" | "completed";
  message: string;
};

const STORAGE_KEYS = {
  projects: "designbuilder-workspace-projects",
  scenarios: "designbuilder-workspace-scenarios",
  synced: "designbuilder-workspace-synced-scenarios",
  rows: "designbuilder-workspace-scenario-rows",
  selectedProjectId: "designbuilder-workspace-selected-project",
} as const;

const numberFmt = (value: number | null | undefined, maximumFractionDigits = 2) =>
  value === null || value === undefined ? "-" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits }).format(value);

const normalizeRemoteError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("521") || normalized.includes("web server is down") || normalized.includes("<!doctype html")) {
    return "Supabase gecici olarak erisilemiyor. Senaryo yerel olarak saklandi; servis tekrar geldiginde yeniden senkronlayabiliriz.";
  }
  return message;
};

const readStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export default function DesignBuilderWorkspace() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [projects, setProjects] = useState<Project[]>(seedProjects);
  const [scenarios, setScenarios] = useState<Scenario[]>(seedScenarios);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(seedProjects[0]?.id ?? "");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectLocation, setNewProjectLocation] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progressValue, setProgressValue] = useState(0);
  const [message, setMessage] = useState("CSV yukleyerek SimulationData veri akisini hazirla.");
  const [previewRows, setPreviewRows] = useState<SimulationCsvPreviewRow[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [syncedScenarioIds, setSyncedScenarioIds] = useState<Record<string, boolean>>({});
  const [terminalTrace, setTerminalTrace] = useState<TerminalTrace[]>([]);
  const [analysisReport, setAnalysisReport] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [analysisLanguage, setAnalysisLanguage] = useState<"tr" | "en">("tr");
  const [analysisModel, setAnalysisModel] = useState("");
  const [analysisProvider, setAnalysisProvider] = useState("");
  const [analysisScenarioId, setAnalysisScenarioId] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reportSections, setReportSections] = useState<ReportSectionRecord[]>([]);
  const [activeReportGroupId, setActiveReportGroupId] = useState("");
  const [activeReportTitle, setActiveReportTitle] = useState("");
  const [reportScenarioId, setReportScenarioId] = useState("");
  const [reportGroupByScenarioId, setReportGroupByScenarioId] = useState<Record<string, string>>({});
  const [reportStatusByScenarioId, setReportStatusByScenarioId] = useState<Record<string, ReportRunStatus>>({});
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState("");
  const [selectedOptimizationIds, setSelectedOptimizationIds] = useState<string[]>([]);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationComparisonResult | null>(null);
  const [optimizationError, setOptimizationError] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [scenarioRowsById, setScenarioRowsById] = useState<Record<string, SimulationDataInsert[]>>({});
  const [isStorageReady, setIsStorageReady] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const projectScenarios = useMemo(
    () => scenarios.filter((scenario) => scenario.project_id === selectedProjectId),
    [scenarios, selectedProjectId]
  );

  const selectedReportsReady = useMemo(
    () =>
      selectedOptimizationIds.length >= 2 &&
      selectedOptimizationIds.every((scenarioId) => reportStatusByScenarioId[scenarioId] === "completed"),
    [reportStatusByScenarioId, selectedOptimizationIds]
  );

  const optimizationBlockReason = useMemo(() => {
    if (selectedOptimizationIds.length < 2) return "Karsilastirma icin en az iki scenario sec.";
    const missingCount = selectedOptimizationIds.filter((scenarioId) => reportStatusByScenarioId[scenarioId] !== "completed").length;
    if (missingCount > 0) {
      return `Optimizasyon icin secili ${missingCount} senaryonun raporu tamamlanmali.`;
    }
    return "";
  }, [reportStatusByScenarioId, selectedOptimizationIds]);

  useEffect(() => {
    setSelectedOptimizationIds((prev) => prev.filter((id) => projectScenarios.some((scenario) => scenario.id === id)));
  }, [projectScenarios]);

  useEffect(() => {
    const storedProjects = readStorage<Array<Omit<Project, "created_at"> & { created_at: string }>>(STORAGE_KEYS.projects, []);
    const storedScenarios = readStorage<Array<Omit<Scenario, "created_at"> & { created_at: string }>>(STORAGE_KEYS.scenarios, []);
    const storedRows = readStorage<Record<string, Array<Omit<SimulationDataInsert, "timestamp"> & { timestamp: string }>>>(
      STORAGE_KEYS.rows,
      {}
    );
    const storedSynced = readStorage<Record<string, boolean>>(STORAGE_KEYS.synced, {});
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
            rows.map((row) => ({
              ...row,
              timestamp: new Date(row.timestamp),
            })),
          ])
        )
      );
    }
    if (Object.keys(storedSynced).length > 0) {
      setSyncedScenarioIds(storedSynced);
    }
    if (storedSelectedProjectId) {
      setSelectedProjectId(storedSelectedProjectId);
    }
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
  }, [isStorageReady, syncedScenarioIds]);

  useEffect(() => {
    if (!isStorageReady || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.selectedProjectId, JSON.stringify(selectedProjectId));
  }, [isStorageReady, selectedProjectId]);

  useEffect(() => {
    if (!projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projects[0]?.id ?? "");
    }
  }, [projects, selectedProjectId]);

  const pollReportSections = useCallback(async (reportGroupId: string, scenarioId = reportScenarioId) => {
    const response = await fetch(`/api/reports?reportGroupId=${encodeURIComponent(reportGroupId)}`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      sections?: ReportSectionRecord[];
      error?: string;
    };

    if (!response.ok || !payload.success) {
      throw new Error(payload.error ?? "Rapor durumlari okunamadi.");
    }

    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    setReportSections(sections);

    if (sections.length > 0 && scenarioId) {
      const allCompleted =
        sections.length === REPORT_SECTION_DEFINITIONS.length &&
        sections.every((section) => section.status === "completed");
      const allFinished = sections.every((section) => section.status === "completed" || section.status === "failed");

      setReportStatusByScenarioId((prev) => ({
        ...prev,
        [scenarioId]: allCompleted ? "completed" : allFinished ? "failed" : "generating",
      }));

      if (allFinished) {
        setIsGeneratingReport(false);
      }
    }
  }, [reportScenarioId]);

  useEffect(() => {
    if (!activeReportGroupId || !isGeneratingReport) return;

    const interval = window.setInterval(() => {
      void pollReportSections(activeReportGroupId).catch((error) => {
        setReportError(error instanceof Error ? error.message : "Rapor durumu okunamadi.");
      });
    }, 1000); // Arttırıldı poll hızı: 2s -> 1s

    return () => window.clearInterval(interval);
  }, [activeReportGroupId, isGeneratingReport, pollReportSections]);

  const handleCreateProject = () => {
    const parsed: ProjectInsert = projectInsertSchema.parse({
      user_id: seedProjects[0]?.user_id ?? crypto.randomUUID(),
      name: newProjectName,
      location: newProjectLocation || null,
      climate_data: { source: "manual-entry" },
    });

    const created: Project = {
      id: crypto.randomUUID(),
      created_at: new Date(),
      ...parsed,
    };

    setProjects((prev) => [created, ...prev]);
    setSelectedProjectId(created.id);
    setNewProjectName("");
    setNewProjectLocation("");
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
    setSelectedOptimizationIds((prev) => prev.filter((id) => id !== scenarioId));
    if (analysisScenarioId === scenarioId) {
      setAnalysisScenarioId("");
      setAnalysisReport("");
      setTerminalTrace([]);
    }
    if (reportScenarioId === scenarioId) {
      setReportScenarioId("");
      setReportSections([]);
      setActiveReportGroupId("");
    }
    setMessage("Senaryo yerel listeden kaldirildi.");
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
    setUploadState("parsing");
    setProgressValue(4);
    setMessage(`${file.name} chunk bazli olarak ayrisiyor. Tarayici akici kalacak sekilde worker kullaniliyor.`);
    setWarnings([]);
    setPreviewRows([]);
    setRowCount(0);

    try {
      const result = await parseSimulationCsvFile(file, {
        scenarioId,
        onProgress: setProgressValue,
        onPreviewRows: setPreviewRows,
      });

      const totalEnergyConsumption = result.rows.reduce(
        (sum, row) => sum + (row.heating_load ?? 0) + (row.cooling_load ?? 0),
        0
      );

      const createdScenario: Scenario = {
        id: scenarioId,
        created_at: new Date(),
        ...scenarioDraft,
        total_energy_consumption: totalEnergyConsumption,
      };

      setScenarios((prev) => [createdScenario, ...prev]);
      setScenarioRowsById((prev) => ({ ...prev, [scenarioId]: result.rows }));
      setPreviewRows(result.previewRows);
      setWarnings(result.warnings);
      setRowCount(result.rowCount);
      setProgressValue(100);
      setUploadState("done");
      setMessage(`${result.rowCount} satir parse edildi. Ilk 10 satir onizleme ve normalize veri sag panelde hazir.`);

      try {
        const persistResponse = await fetch("/api/designbuilder/workspace/save-scenario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project: selectedProject,
            scenario: createdScenario,
            rows: result.rows,
          }),
        });

        const persistPayload = (await persistResponse.json().catch(() => ({}))) as {
          success?: boolean;
          persisted?: boolean;
          error?: string;
        };

        if (!persistResponse.ok || !persistPayload.success) {
          throw new Error(normalizeRemoteError(persistPayload.error ?? "Scenario DB'ye yazilamadi."));
        }

        setSyncedScenarioIds((prev) => ({ ...prev, [scenarioId]: true }));
        setMessage(`${result.rowCount} satir parse edildi ve scenario verisi Supabase'e senkronlandi.`);
      } catch (error) {
        setWarnings((prev) => [
          ...prev,
          error instanceof Error
            ? `DB senkronu basarisiz: ${normalizeRemoteError(error.message)}`
            : "DB senkronu basarisiz.",
        ]);
        setMessage(`${result.rowCount} satir parse edildi. Supabase baglantisi duzelene kadar senaryo yerelde saklaniyor.`);
      }
    } catch (error) {
      setUploadState("error");
      setMessage(error instanceof Error ? error.message : "CSV ayrisma sirasinda beklenmeyen hata.");
    }
  };

  const onInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleFile(file);
    event.target.value = "";
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleFile(file);
  };

  const analyzeScenario = async (scenario: Scenario) => {
    setIsAnalyzing(true);
    setAnalysisScenarioId(scenario.id);
    setAnalysisError("");
    setAnalysisReport("");
    setAnalysisModel("");
    setAnalysisProvider("");
    setTerminalTrace([
      { stage: "preprocess", message: `${scenario.name} senaryosu icin istatistiksel on-isleme paketi hazirlaniyor.` },
      { stage: "analyst", message: "Analizci verileri inceliyor..." },
    ]);

    try {
      const response = await fetch("/api/analyze-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: scenario.id, language: analysisLanguage }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        trace?: TerminalTrace[];
        report?: string;
        model?: string;
        provider?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Scenario analizi basarisiz.");
      }

      setTerminalTrace(Array.isArray(payload.trace) ? payload.trace : []);
      setAnalysisReport(payload.report ?? "");
      setAnalysisModel(payload.model ?? "");
      setAnalysisProvider(payload.provider ?? "");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "AI analizinde beklenmeyen hata.");
      setTerminalTrace((prev) => [
        ...prev,
        { stage: "completed", message: "Akis hata nedeniyle tamamlanamadi." },
      ]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateReport = async (scenario: Scenario) => {
    const reportGroupId = crypto.randomUUID();
    setActiveReportGroupId(reportGroupId);
    setActiveReportTitle(
      analysisLanguage === "tr"
        ? `${selectedProject?.name ?? "Project"} - DesignBuilder Teknik Raporu`
        : `${selectedProject?.name ?? "Project"} - DesignBuilder Technical Report`
    );
    setReportScenarioId(scenario.id);
    setReportGroupByScenarioId((prev) => ({ ...prev, [scenario.id]: reportGroupId }));
    setReportStatusByScenarioId((prev) => ({ ...prev, [scenario.id]: "generating" }));
    setReportSections([]);
    setReportError("");
    setIsGeneratingReport(true);

    try {
      const response = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: scenario.id,
          reportGroupId,
          language: analysisLanguage,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        reportTitle?: string;
        status?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Rapor olusturulamadi.");
      }

      setActiveReportTitle(payload.reportTitle ?? activeReportTitle);
      // Ilk poll için sections'ı getir
      await pollReportSections(reportGroupId, scenario.id);
      // isGeneratingReport polling loop tarafından kontrol edilecek
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Rapor olusturulamadi.");
      setReportStatusByScenarioId((prev) => ({ ...prev, [scenario.id]: "failed" }));
      setIsGeneratingReport(false);
    }
  };

  const fetchReportSections = async (reportGroupId: string) => {
    const response = await fetch(`/api/reports?reportGroupId=${encodeURIComponent(reportGroupId)}`, {
      cache: "no-store",
    });
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

  const buildReportMarkdown = (sections: ReportSectionRecord[]) =>
    [...sections]
      .sort((a, b) => a.sectionOrder - b.sectionOrder)
      .filter((section) => section.status === "completed" && section.sectionContent.trim())
      .map((section) => `## ${section.sectionTitle}\n\n${section.sectionContent}`)
      .join("\n\n");

  const regenerateReportSection = async (sectionKey: ReportSectionRecord["sectionKey"]) => {
    if (!activeReportGroupId || !reportScenarioId) return;
    setReportError("");
    setIsGeneratingReport(true);
    try {
      const response = await fetch("/api/reports/section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportGroupId: activeReportGroupId,
          scenarioId: reportScenarioId,
          sectionKey,
          language: analysisLanguage,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Section regenerate edilemedi.");
      }
      await pollReportSections(activeReportGroupId);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Section regenerate edilemedi.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const saveEditedSection = async (sectionKey: ReportSectionRecord["sectionKey"], sectionContent: string) => {
    if (!activeReportGroupId) return;
    const response = await fetch("/api/reports/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportGroupId: activeReportGroupId,
        sectionKey,
        sectionContent,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!response.ok || !payload.success) {
      throw new Error(payload.error ?? "Section kaydedilemedi.");
    }
    await pollReportSections(activeReportGroupId);
  };

  const toggleOptimizationScenario = (scenarioId: string) => {
    setSelectedOptimizationIds((prev) =>
      prev.includes(scenarioId) ? prev.filter((id) => id !== scenarioId) : [...prev, scenarioId]
    );
  };

  const runOptimization = async () => {
    if (selectedOptimizationIds.length < 2) {
      setOptimizationError("Karsilastirma icin en az iki scenario sec.");
      return;
    }
    if (!selectedReportsReady) {
      setOptimizationError(optimizationBlockReason || "Optimizasyon icin secili senaryolarin raporlari tamamlanmali.");
      return;
    }

    setOptimizationError("");
    setOptimizationResult(null);
    setIsOptimizing(true);

    try {
      const reportMarkdownByScenarioId = new Map<string, string>();
      for (const scenarioId of selectedOptimizationIds) {
        const reportGroupId = reportGroupByScenarioId[scenarioId];
        if (!reportGroupId) {
          throw new Error("Optimizasyon icin once secili senaryolarin raporlarini uret.");
        }

        const sections = await fetchReportSections(reportGroupId);
        if (
          sections.length !== REPORT_SECTION_DEFINITIONS.length ||
          sections.some((section) => section.status !== "completed")
        ) {
          throw new Error("Optimizasyon icin secili raporlarin tum bolumleri tamamlanmis olmali.");
        }
        reportMarkdownByScenarioId.set(scenarioId, buildReportMarkdown(sections));
      }

      const localPayloads = selectedOptimizationIds
        .map((scenarioId) => {
          const scenario = scenarios.find((item) => item.id === scenarioId);
          const project = projects.find((item) => item.id === scenario?.project_id);
          const rows = scenarioRowsById[scenarioId];
          if (!scenario || !project || !rows || rows.length === 0) {
            return null;
          }

          return {
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
            reportMarkdown: reportMarkdownByScenarioId.get(scenarioId) ?? null,
          };
        })
        .filter(
          (
            item
          ): item is {
            summary: ReturnType<typeof buildScenarioSummary>;
            costEstimate: number | null;
            reportMarkdown: string | null;
          } => item !== null
        );

      const response = await fetch("/api/optimize-scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioIds: selectedOptimizationIds,
          language: analysisLanguage,
          scenarioPayloads: localPayloads,
        }),
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

      if (!response.ok || !payload.success || !payload.winner || !payload.scenarios || !payload.latexTable || !payload.strategistSummary || !payload.baselineScenarioId || !payload.currency) {
        throw new Error(payload.error ?? "Optimization sonucu uretilemedi.");
      }

      setOptimizationResult({
        winner: payload.winner,
        scenarios: payload.scenarios,
        latexTable: payload.latexTable,
        strategistSummary: payload.strategistSummary,
        baselineScenarioId: payload.baselineScenarioId,
        currency: payload.currency,
      });
    } catch (error) {
      setOptimizationError(error instanceof Error ? error.message : "Optimization sonucu uretilemedi.");
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_420px]">
        <Card className="border-cyan-100">
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-cyan-700" />
              <div>
                <p className="text-sm font-black text-slate-900">Projeler</p>
                <p className="text-xs text-slate-500">Supabase `projects` tablosu icin hazir struktur</p>
              </div>
            </div>

            <div className="space-y-2">
              {projects.map((project) => {
                const isActive = project.id === selectedProjectId;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => setSelectedProjectId(project.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                      isActive ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <p className="text-sm font-black text-slate-900">{project.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{project.location || "Konum girilmedi"}</p>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Senaryo: {scenarios.filter((scenario) => scenario.project_id === project.id).length}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Yeni Proje</p>
              <div className="mt-3 space-y-2">
                <Input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Proje adi" />
                <Input value={newProjectLocation} onChange={(event) => setNewProjectLocation(event.target.value)} placeholder="Konum" />
                <Button
                  type="button"
                  className="w-full bg-cyan-700 hover:bg-cyan-600"
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim()}
                >
                  Proje Olustur
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-100">
          <CardContent className="space-y-5">
            <div className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-emerald-700" />
              <div>
                <p className="text-sm font-black text-slate-900">Dosya Yukleme</p>
                <p className="text-xs text-slate-500">Chunk + worker + zod dogrulamali DesignBuilder parser</p>
              </div>
            </div>

            <div
              onDrop={(event) => void onDrop(event)}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => inputRef.current?.click()}
              className={`rounded-[28px] border-2 border-dashed p-8 text-center transition ${
                isDragging ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-[linear-gradient(135deg,#f8fafc,#ecfeff)]"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => void onInputChange(event)}
              />
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
                {uploadState === "parsing" ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileSpreadsheet className="h-6 w-6" />}
              </div>
              <p className="mt-4 text-lg font-black text-slate-900">Drag & Drop ile CSV birak</p>
              <p className="mt-2 text-sm text-slate-600">
                {selectedProject ? `${selectedProject.name} projesine yeni senaryo olarak islenecek.` : "Once proje sec."}
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
                  {warnings.slice(0, 4).map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Simulation Rows</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{rowCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Active Scenarios</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{projectScenarios.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Validation</p>
                <p className="mt-2 text-sm font-black text-slate-900">Zod + typed mapping</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-slate-900">Scenario AI Analizi</p>
                  <p className="text-xs text-slate-500">Analizci -&gt; Denetci -&gt; Raporlayici orkestrasyonu</p>
                </div>
                <select
                  value={analysisLanguage}
                  onChange={(event) => setAnalysisLanguage(event.target.value === "en" ? "en" : "tr")}
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                >
                  <option value="tr">Turkce</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div className="space-y-3">
                {projectScenarios.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    Once bu projeye ait bir scenario yukle. Yuklenen dosyalar bu panelde kalici olarak listelenir.
                  </div>
                ) : (
                  projectScenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc,#ffffff)] p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-black text-slate-900">{scenario.name}</p>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${
                                syncedScenarioIds[scenario.id]
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {syncedScenarioIds[scenario.id] ? "Supabase Senkron" : "Yerel Kayit"}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${
                                reportStatusByScenarioId[scenario.id] === "completed"
                                  ? "bg-cyan-100 text-cyan-700"
                                  : reportStatusByScenarioId[scenario.id] === "generating"
                                    ? "bg-blue-100 text-blue-700"
                                    : reportStatusByScenarioId[scenario.id] === "failed"
                                      ? "bg-rose-100 text-rose-700"
                                      : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {reportStatusByScenarioId[scenario.id] === "completed"
                                ? "Rapor Hazir"
                                : reportStatusByScenarioId[scenario.id] === "generating"
                                  ? "Rapor Uretiliyor"
                                  : reportStatusByScenarioId[scenario.id] === "failed"
                                    ? "Rapor Hatali"
                                    : "Rapor Yok"}
                            </span>
                          </div>
                          <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                            <p>Enerji: <span className="font-bold text-slate-900">{numberFmt(scenario.total_energy_consumption)}</span></p>
                            <p>Maliyet: <span className="font-bold text-slate-900">{numberFmt(scenario.cost_estimate)}</span></p>
                            <p>
                              Satir: <span className="font-bold text-slate-900">{scenarioRowsById[scenario.id]?.length ?? 0}</span>
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 rounded-full px-3 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => removeScenario(scenario.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Kaldir
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={selectedOptimizationIds.includes(scenario.id)}
                            onChange={() => toggleOptimizationScenario(scenario.id)}
                          />
                          Karsilastirma listesine ekle
                        </label>
                        <Button
                          type="button"
                          className="bg-slate-900 hover:bg-slate-800"
                          disabled={isAnalyzing || !syncedScenarioIds[scenario.id]}
                          onClick={() => void analyzeScenario(scenario)}
                        >
                          <Bot className="mr-2 h-4 w-4" /> Analyze Scenario
                        </Button>
                        <Button
                          type="button"
                          className="bg-emerald-600 hover:bg-emerald-500"
                          disabled={isGeneratingReport || !syncedScenarioIds[scenario.id]}
                          onClick={() => void generateReport(scenario)}
                        >
                          <FileText className="mr-2 h-4 w-4" /> Generate Report
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">Sentez Modulu</p>
                    <p className="text-xs text-slate-600">
                      ROI, enerji, karbon ve konfor kriterleriyle en iyi senaryoyu sec.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="bg-violet-600 hover:bg-violet-500"
                    disabled={isOptimizing || isGeneratingReport || !selectedReportsReady}
                    onClick={() => void runOptimization()}
                  >
                    {isOptimizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                    Optimization
                  </Button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Secilen scenario sayisi: {selectedOptimizationIds.length}
                  {optimizationBlockReason ? ` · ${optimizationBlockReason}` : " · Raporlar incelendi, optimizasyon hazir."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-violet-100">
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-violet-700" />
              <div>
                <p className="text-sm font-black text-slate-900">Preview Table</p>
                <p className="text-xs text-slate-500">Ilk 10 satir ve normalize kolon eslesmesi</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>#</TableHeaderCell>
                      <TableHeaderCell>Timestamp</TableHeaderCell>
                      <TableHeaderCell>Zone</TableHeaderCell>
                      <TableHeaderCell>Air Temp</TableHeaderCell>
                      <TableHeaderCell>Heating</TableHeaderCell>
                      <TableHeaderCell>Cooling</TableHeaderCell>
                      <TableHeaderCell>Humidity</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="px-3 py-8 text-center text-slate-500">
                          Yukleme tamamlaninca ilk 10 satir burada gorunecek.
                        </TableCell>
                      </TableRow>
                    ) : (
                      previewRows.map((row) => (
                        <TableRow key={row.index}>
                          <TableCell className="font-bold">{row.index}</TableCell>
                          <TableCell>{new Date(row.normalized.timestamp).toLocaleString("tr-TR")}</TableCell>
                          <TableCell>{row.normalized.zone_name}</TableCell>
                          <TableCell>{numberFmt(row.normalized.air_temperature)}</TableCell>
                          <TableCell>{numberFmt(row.normalized.heating_load)}</TableCell>
                          <TableCell>{numberFmt(row.normalized.cooling_load)}</TableCell>
                          <TableCell>{numberFmt(row.normalized.humidity)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Secili Proje Ozet</p>
              {selectedProject ? (
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p><span className="font-black text-slate-900">Ad:</span> {selectedProject.name}</p>
                  <p><span className="font-black text-slate-900">Konum:</span> {selectedProject.location || "-"}</p>
                  <p><span className="font-black text-slate-900">Climate:</span> {JSON.stringify(selectedProject.climate_data)}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Proje secilmedi.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {isAnalyzing || terminalTrace.length > 0 || analysisReport || analysisError ? (
        <AiStatusTerminal
          isRunning={isAnalyzing}
          trace={terminalTrace}
          report={analysisReport}
          error={analysisError}
          language={analysisLanguage}
          model={analysisModel}
          provider={analysisProvider}
        />
      ) : null}

      {isGeneratingReport || reportSections.length > 0 ? (
        <ReportGenerationStepper sections={reportSections} isGenerating={isGeneratingReport} />
      ) : null}

      {reportError ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {reportError}
        </p>
      ) : null}

      {reportSections.length > 0 ? (
        <div className="space-y-5">
          <ReportViewer
            reportTitle={activeReportTitle}
            sections={reportSections}
            onRegenerate={regenerateReportSection}
            onSaveEdit={saveEditedSection}
          />

          <div className="rounded-3xl border border-cyan-100 bg-[linear-gradient(180deg,#ecfeff,#ffffff)] p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-700">Audit Dashboard</p>
                <p className="text-sm text-slate-700">
                  Mühendis denetimi, autosave, inline feedback ve refine akışı burada çalışır.
                </p>
              </div>
            </div>

            <ReportEditor
              reportGroupId={activeReportGroupId}
              language={analysisLanguage}
              sections={reportSections}
              onSectionsChanged={async () => {
                if (activeReportGroupId) {
                  await pollReportSections(activeReportGroupId);
                }
              }}
            />
          </div>
        </div>
      ) : null}

      {optimizationError ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {optimizationError}
        </p>
      ) : null}

      {optimizationResult ? <OptimizationDashboard result={optimizationResult} /> : null}
    </section>
  );
}
