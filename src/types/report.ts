export const REPORT_SECTION_KEYS = [
  "project_summary",
  "methodology_and_data_quality",
  "climate_and_boundary_conditions",
  "envelope_analysis",
  "energy_profile",
  "peak_load_analysis",
  "carbon_and_cost",
  "thermal_comfort",
  "risk_and_anomalies",
  "optimization_conclusion",
] as const;

export type ReportSectionKey = (typeof REPORT_SECTION_KEYS)[number];

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
    title: "Proje Ozeti & Yonetici Ozet",
    shortLabel: "Yonetici Ozet",
    goal: "Projenin hedefini, senaryonun amacini ve ana performans sonucunu karar vericiler icin kisa ama teknik bir dille ozetle.",
  },
  {
    key: "methodology_and_data_quality",
    order: 2,
    title: "Metodoloji & Veri Kalitesi",
    shortLabel: "Metodoloji",
    goal: "Kullanilan veri yapisini, parser varsayimlarini, birim donusumlerini ve veri kalitesi guvenilirligini acikla.",
  },
  {
    key: "climate_and_boundary_conditions",
    order: 3,
    title: "Iklim Verisi & Sinir Kosullari",
    shortLabel: "Iklim",
    goal: "Konum, iklim bolgesi ve simulasyonu etkileyen sinir kosullarini teknik dayanaklariyla degerlendir.",
  },
  {
    key: "envelope_analysis",
    order: 4,
    title: "Yapi Kabugu Analizi (U-Degerleri)",
    shortLabel: "Yapi Kabugu",
    goal: "U degerleri, kabuk performansi ve ilgili mevzuat/dokuman baglamina gore kabuk davranisini analiz et.",
  },
  {
    key: "energy_profile",
    order: 5,
    title: "Enerji Tuketim Profili",
    shortLabel: "Enerji Profili",
    goal: "Isitma ve sogutma enerji profilini, zon dagilimini ve yillik tuketim egilimlerini detaylandir.",
  },
  {
    key: "peak_load_analysis",
    order: 6,
    title: "Pik Yuk & Sistem Davranisi",
    shortLabel: "Pik Yuk",
    goal: "Pik isitma ve sogutma yuklerini, kritik zamanlari ve sistem davranisina etkilerini yorumla.",
  },
  {
    key: "carbon_and_cost",
    order: 7,
    title: "Karbon Salimi & Isletme Maliyeti",
    shortLabel: "Karbon & Maliyet",
    goal: "Karbon etkisini, isletme maliyeti varsayimlarini ve ekonomik okunabilirligi muhendislik diliyle acikla.",
  },
  {
    key: "thermal_comfort",
    order: 8,
    title: "Termal Konfor Analizi",
    shortLabel: "Konfor",
    goal: "Sicaklik, nem ve kullanici konforu acisindan guclu ve zayif yonleri acikla.",
  },
  {
    key: "risk_and_anomalies",
    order: 9,
    title: "Riskler, Anomaliler & Dogrulama Notlari",
    shortLabel: "Riskler",
    goal: "Supheli olcumleri, fiziksel tutarsizliklari ve ek dogrulama gerektiren basliklari siniflandir.",
  },
  {
    key: "optimization_conclusion",
    order: 10,
    title: "Optimizasyon Onerileri, Yol Haritasi & Sonuc",
    shortLabel: "Sonuc",
    goal: "Uygulanabilir optimizasyon adimlarini, oncelik sirasini ve nihai muhendislik sonucunu bir yol haritasi halinde sun.",
  },
];

export const REPORT_SECTION_TITLE_MAP = Object.fromEntries(
  REPORT_SECTION_DEFINITIONS.map((section) => [section.key, section.title])
) as Record<ReportSectionKey, string>;
