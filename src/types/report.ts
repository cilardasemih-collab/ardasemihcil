export type ReportSectionKey =
  | "project_summary"
  | "envelope_analysis"
  | "energy_and_carbon"
  | "thermal_comfort"
  | "optimization_conclusion";

export type ReportGenerationStatus = "pending" | "generating" | "completed" | "failed";

export type ReportSectionDefinition = {
  key: ReportSectionKey;
  order: number;
  title: string;
  shortLabel: string;
  goal: string;
};

export type ReportSectionRecord = {
  id: string;
  reportGroupId: string;
  scenarioId: string;
  language: "tr" | "en";
  reportTitle: string;
  sectionKey: ReportSectionKey;
  sectionTitle: string;
  sectionOrder: number;
  status: ReportGenerationStatus;
  sectionContent: string;
  initialSectionContent: string | null;
  sectionSummary: string | null;
  reviewStatus: "draft" | "reviewed" | "final";
  lastEditedSource: "ai" | "engineer" | "refined";
  contextSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ReportBundle = {
  reportGroupId: string;
  scenarioId: string;
  language: "tr" | "en";
  reportTitle: string;
  sections: ReportSectionRecord[];
};

export const REPORT_SECTION_DEFINITIONS: ReportSectionDefinition[] = [
  {
    key: "project_summary",
    order: 1,
    title: "Proje Ozeti & Metodoloji",
    shortLabel: "Proje Ozeti",
    goal: "Projeyi, veri kapsamını, simulasyon yaklaşımını ve kullanılan metodolojiyi net biçimde açıkla.",
  },
  {
    key: "envelope_analysis",
    order: 2,
    title: "Yapi Kabugu Analizi (U-Degerleri)",
    shortLabel: "Yapi Kabugu",
    goal: "U değerleri, kabuk bileşenleri ve ilgili mevzuat/standart referanslarıyla yapı kabuğu performansını değerlendir.",
  },
  {
    key: "energy_and_carbon",
    order: 3,
    title: "Enerji Tuketim & Karbon Salimi",
    shortLabel: "Enerji & Karbon",
    goal: "Enerji tüketim özetini, pik yükleri, eğilimleri ve olası karbon etkilerini teknik bir dille özetle.",
  },
  {
    key: "thermal_comfort",
    order: 4,
    title: "Termal Konfor & Risk Analizi",
    shortLabel: "Konfor & Risk",
    goal: "Sıcaklık, nem, konfor bandı ve operasyonel/fiziksel riskleri açıkla.",
  },
  {
    key: "optimization_conclusion",
    order: 5,
    title: "Optimizasyon Onerileri & Sonuc",
    shortLabel: "Sonuc",
    goal: "Uygulanabilir optimizasyon önerilerini, öncelik sırasını ve mühendislik sonucunu üret.",
  },
];

export const REPORT_SECTION_TITLE_MAP = Object.fromEntries(
  REPORT_SECTION_DEFINITIONS.map((section) => [section.key, section.title])
) as Record<ReportSectionKey, string>;
