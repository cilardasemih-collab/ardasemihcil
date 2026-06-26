import { z } from "zod";

import { generateLlmText } from "@/lib/ai/llmClient";
import { createServiceClient } from "@/lib/supabase/server";
import {
  formatLearnedRules,
  formatRetrievedContext,
  retrieveLearnedRules,
  retrieveRelevantDocuments,
} from "@/services/retrievalService";
import type { ScenarioSummaryPayload } from "@/services/aiOrchestrator";
import {
  REPORT_SECTION_DEFINITIONS,
  type ReportGenerationStatus,
  type ReportSectionDefinition,
  type ReportSectionKey,
  type ReportSectionRecord,
} from "@/types/report";

const sectionPayloadSchema = z.object({
  markdown: z.string(),
  summary: z.string(),
});

const SECTION_GENERATION_TIMEOUT_MS = 45000;
const SECTION_OUTPUT_TOKEN_LIMIT = Number(process.env.DESIGNBUILDER_SECTION_MAX_TOKENS ?? 1400);
const DESIGNBUILDER_CONTEXT_LIMIT = Number(process.env.DESIGNBUILDER_CONTEXT_LIMIT ?? 3);
type SectionMemoryItem = { title: string; summary: string };
type OpenMeteoGeocodingResponse = {
  results?: Array<{
    name?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
  }>;
};
type OpenMeteoForecastResponse = {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
  };
};

const fetchJsonWithTimeout = async <T>(url: string, timeoutMs = 4500): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
};

const avg = (values: Array<number | undefined>) => {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (filtered.length === 0) return null;
  return Number((filtered.reduce((sum, value) => sum + value, 0) / filtered.length).toFixed(1));
};

const sectionPromptForLanguage = (language: "tr" | "en") =>
  language === "tr"
    ? "Cevabi Turkce yaz. Markdown kullan. Gerekli durumlarda alinti yaptigin kurallar icin dokuman adini ve sayfa numarasini parantez icinde ver."
    : "Write in English using Markdown. Whenever you cite a rule or standard, append the document name and page number in parentheses.";

const sectionMethodPrompt: Record<ReportSectionKey, string> = {
  project_summary:
    "Method: Synthesize the scenario as an executive decision note. State the main winner/concern, not just scope.",
  methodology_and_data_quality:
    "Method: Audit CSV parsing quality, units, negative values, missing humidity, row/zone consistency, and whether the data can support final engineering decisions.",
  climate_and_boundary_conditions:
    "Method: Use the project location as city context. Discuss climate drivers such as heating/cooling season, outdoor conditions, solar gain, humidity, wind/infiltration sensitivity, and weather-file assumptions. If exact weather data is unavailable, say which climate inputs must be verified; do not invent exact degree-day values.",
  envelope_analysis:
    "Method: Tie heating/cooling loads to envelope behavior, U-value availability, infiltration, glazing, roof/wall/floor losses, and which envelope alternatives should be simulated next.",
  energy_profile:
    "Method: Compare heating, cooling, top zones, load balance, sign problems, and trend implications. Include at least one compact markdown table.",
  peak_load_analysis:
    "Method: Interpret peak heating/cooling as system sizing risk. Discuss peak timestamp/zone validation, diversity, terminal unit sizing, and outlier checks.",
  carbon_and_cost:
    "Method: Convert energy implications into operating cost and carbon logic. Identify missing tariff, fuel, COP, emission factor, and CAPEX assumptions.",
  thermal_comfort:
    "Method: Evaluate air temperature, humidity, comfort band risk, schedule assumptions, and what PMV/PPD or adaptive-comfort inputs are missing.",
  risk_and_anomalies:
    "Method: Prioritize anomalies by engineering severity. Separate data-quality risk from physical-model risk and give a verification plan.",
  optimization_conclusion:
    "Method: Turn all previous sections into a practical decision roadmap. Rank next actions and state whether the scenario can be selected now or needs re-export/re-simulation.",
};

const buildSectionPrompt = (input: {
  section: ReportSectionDefinition;
  language: "tr" | "en";
  scenarioSummary: ScenarioSummaryPayload;
  retrievedContext: string;
  memory: SectionMemoryItem[];
  learnedRulesContext: string;
}) => {
  return [
    "You are a senior building-performance engineer producing one polished section of a professional DesignBuilder report.",
    sectionPromptForLanguage(input.language),
    "Do not mention fallback engines, AI limitations, missing services, or that you are following a prompt.",
    "Avoid repeating generic scope bullets from earlier sections. Each section must have a distinct argument and decision value.",
    "Use the scenario metrics as evidence, but do not dump every metric unless it supports the section's conclusion.",
    "Use projectContext fields as first-class engineering context: building type, floor area, HVAC, occupancy, weather file, design goal, and location notes.",
    "DİKKAT: Geçmiş mühendis geri bildirimlerine dayanan şu kuralları UYGULA:",
    input.learnedRulesContext,
    "Return JSON only with this schema:",
    JSON.stringify({ markdown: "string", summary: "string" }, null, 2),
    `Current section: ${input.section.title}`,
    `Goal: ${input.section.goal}`,
    `Required section-specific analysis method: ${sectionMethodPrompt[input.section.key]}`,
    input.memory.length > 0
      ? `Critical memory from previous sections:\n${input.memory.map((item) => `- ${item.title}: ${item.summary}`).join("\n")}`
      : "There are no previous sections yet.",
    "Scenario summary:",
    JSON.stringify(input.scenarioSummary, null, 2),
    "Retrieved technical context:",
    input.retrievedContext,
    "Write this section as final client-facing report prose, not a draft.",
    "Target roughly 350-600 words. Use clear subheadings, short technical paragraphs, compact tables only when they add decision value, and explicit engineering interpretation.",
    "Never use the words AI, yapay zeka, model limitation, fallback, prompt, or service failure in the report body.",
    "Finish with 2-4 actionable engineering notes specific to this section.",
  ].join("\n\n");
};

const loadRetrievedContext = async (scenarioSummary: ScenarioSummaryPayload) => {
  try {
    return formatRetrievedContext(await retrieveRelevantDocuments(scenarioSummary, DESIGNBUILDER_CONTEXT_LIMIT));
  } catch {
    return "Harici mevzuat baglami su anda kullanilamiyor. Yorum yalnizca mevcut simulasyon ozetine dayandirilsin.";
  }
};

const loadInternetClimateContext = async (scenarioSummary: ScenarioSummaryPayload) => {
  const location = scenarioSummary.scenario.location?.trim();
  if (!location) return "Internet iklim baglami: Konum girilmedigi icin dis hava verisi aranamaz.";

  try {
    const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=tr&format=json`;
    const geocode = await fetchJsonWithTimeout<OpenMeteoGeocodingResponse>(geocodeUrl);
    const place = geocode.results?.find((item) => typeof item.latitude === "number" && typeof item.longitude === "number");
    if (!place || typeof place.latitude !== "number" || typeof place.longitude !== "number") {
      return `Internet iklim baglami: "${location}" icin koordinat bulunamadi.`;
    }

    const forecastUrl = [
      "https://api.open-meteo.com/v1/forecast",
      `latitude=${place.latitude}`,
      `longitude=${place.longitude}`,
      "current=temperature_2m,relative_humidity_2m,wind_speed_10m",
      "daily=temperature_2m_max,temperature_2m_min,precipitation_sum",
      `timezone=${encodeURIComponent(place.timezone ?? "auto")}`,
      "forecast_days=7",
    ].join("&").replace("forecast&latitude", "forecast?latitude");
    const forecast = await fetchJsonWithTimeout<OpenMeteoForecastResponse>(forecastUrl);
    const current = forecast.current ?? {};
    const daily = forecast.daily ?? {};
    const maxAvg = avg(daily.temperature_2m_max ?? []);
    const minAvg = avg(daily.temperature_2m_min ?? []);
    const precipitation = (daily.precipitation_sum ?? [])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .reduce((sum, value) => sum + value, 0);

    return [
      "Internet iklim/hava baglami (Open-Meteo, yaklasik konum):",
      `- Eslesen konum: ${place.name ?? location}${place.country ? `, ${place.country}` : ""} (${place.latitude}, ${place.longitude})`,
      `- Guncel dis hava sicakligi: ${current.temperature_2m ?? "yok"} C`,
      `- Guncel bagil nem: ${current.relative_humidity_2m ?? "yok"}%`,
      `- Guncel ruzgar hizi: ${current.wind_speed_10m ?? "yok"} km/h`,
      `- 7 gunluk ortalama maksimum/minimum sicaklik: ${maxAvg ?? "yok"} C / ${minAvg ?? "yok"} C`,
      `- 7 gunluk toplam yagis beklentisi: ${Number(precipitation.toFixed(1))} mm`,
      "Bu veri tasarim iklim dosyasinin yerine gecmez; raporda dis hava baglami ve kontrol notu olarak kullan.",
    ].join("\n");
  } catch {
    return "Internet iklim baglami: Open-Meteo verisi su anda alinamadi; rapor yalnizca simulasyon ve proje girdilerine dayandirilsin.";
  }
};

const loadLearnedRulesContext = async (scenarioSummary: ScenarioSummaryPayload) => {
  try {
    return formatLearnedRules(await retrieveLearnedRules(scenarioSummary, DESIGNBUILDER_CONTEXT_LIMIT));
  } catch {
    return "Ogrenilmis kural bulunamadi.";
  }
};

const buildFallbackSection = (input: {
  section: ReportSectionDefinition;
  language: "tr" | "en";
  scenarioSummary: ScenarioSummaryPayload;
  memory: SectionMemoryItem[];
}) => {
  const metrics = input.scenarioSummary.summary.metrics;
  const peaks = input.scenarioSummary.summary.peaks;
  const anomalies = input.scenarioSummary.summary.detectedAnomalies;
  const heating = metrics.heatingLoad.sum ?? 0;
  const cooling = metrics.coolingLoad.sum ?? 0;
  const total = heating + cooling;
  const heatShare = total !== 0 ? Number(((heating / total) * 100).toFixed(1)) : null;
  const topHeating = input.scenarioSummary.summary.topZonesByHeating.slice(0, 3);
  const topCooling = input.scenarioSummary.summary.topZonesByCooling.slice(0, 3);
  const language = input.language;
  const tr = language === "tr";
  const bullet = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
  const zoneList = (items: Array<{ zoneName: string; value: number }>) =>
    items.length > 0 ? items.map((item) => `${item.zoneName}: ${item.value}`).join(", ") : tr ? "Veri yok" : "No data";

  const sectionBodies: Record<ReportSectionKey, string[]> = {
    project_summary: tr
      ? [
          `## ${input.section.title}`,
          "",
          `**${input.scenarioSummary.scenario.projectName}** projesinin **${input.scenarioSummary.scenario.name}** senaryosu, ${input.scenarioSummary.summary.rowCount} satirlik simulasyon ciktisi ve ${input.scenarioSummary.summary.zoneCount} zon uzerinden degerlendirildi. Sonuclar, modelin enerji davranisinda isitma yuklerinin baskin oldugunu ve karar vericiler icin ilk kontrol alaninin pik yuklar ile veri tutarliligi oldugunu gosteriyor.`,
          "",
          "### Karar Ozeti",
          bullet([
            `Toplam isitma yuku ${heating} kWh, toplam sogutma yuku ${cooling} kWh olarak okunuyor.`,
            heatShare === null ? "Isitma/sogutma payi hesaplanamadi." : `Net yuk icinde isitma payi yaklasik %${heatShare}.`,
            `Pik isitma ${peaks.heating?.value ?? "-"} degeriyle ${peaks.heating?.zoneName ?? "belirsiz zon"} uzerinde goruluyor.`,
            `Pik sogutma ${peaks.cooling?.value ?? "-"} degeriyle ${peaks.cooling?.zoneName ?? "belirsiz zon"} uzerinde goruluyor.`,
          ]),
          "",
          "### Yonetici Yorumu",
          "Bu senaryo, nihai karar icin dogrudan tek basina yeterli olmaktan cok, hangi zonlarin ve hangi yuk tiplerinin ayrintili kontrol edilmesi gerektigini aciga cikaran bir performans okumasidir. Enerji toplamlarinin buyuklugu, zon isimlerinde sayisal degerlerin gorulmesi ve sogutma yuklerinde negatif degerlerin bulunmasi nedeniyle model ciktisinin birim, kolon esleme ve DesignBuilder export sablonu acisindan dogrulanmasi gerekir.",
        ]
      : [
          `## ${input.section.title}`,
          "",
          `The **${input.scenarioSummary.scenario.name}** scenario was reviewed for **${input.scenarioSummary.scenario.projectName}** using ${input.scenarioSummary.summary.rowCount} simulation rows across ${input.scenarioSummary.summary.zoneCount} zones. The result points to a heating-dominated load profile and highlights peak-load validation as the immediate decision issue.`,
        ],
    methodology_and_data_quality: tr
      ? [
          `## ${input.section.title}`,
          "",
          "### Veri Setinin Okunabilirligi",
          `Rapor motoru ${input.scenarioSummary.summary.rowCount} satiri zaman sirasi, zon adi, ic sicaklik, isitma yuku, sogutma yuku ve nem alanlari uzerinden yorumluyor. Zon sayisinin satir sayisina esit gorunmesi, export dosyasinda her satirin farkli zon gibi okunmus olabilecegini dusundurur; bu durum ozellikle kolon basliklari ve ayirac karakterleri kontrol edilmeden kesin performans karari verilmemesi gerektigini gosterir.`,
          "",
          "### Kalite Riskleri",
          bullet([
            `Sogutma toplaminda negatif deger okunuyor: ${cooling} kWh.`,
            `Nem ortalamasi ${metrics.humidity.avg ?? "bos"}; nem kolonu eksik veya farkli formatta olabilir.`,
            `Top heating zones: ${zoneList(topHeating)}.`,
            `Top cooling zones: ${zoneList(topCooling)}.`,
          ]),
          "",
          "### Dogrulama Notu",
          "Bir sonraki analiz icin CSV export sablonunda kolon adlari, ondalik ayiraci ve birim bilgisi sabitlenmeli. Bu dogrulama yapildiginda raporun enerji profili, konfor ve maliyet bolumleri daha guvenilir hale gelir.",
        ]
      : [`## ${input.section.title}`, "", "The parsed data should be validated for headers, decimal separators, units, and zone mapping before final design decisions are made."],
    climate_and_boundary_conditions: tr
      ? [
          `## ${input.section.title}`,
          "",
          `Proje konumu **${input.scenarioSummary.scenario.location ?? "belirtilmemis"}** olarak kayitli. Iklim verisi ayrintili EPW/DesignBuilder kaynak bilgisiyle birlikte gelmedigi icin bu bolum, dogrudan simulasyon ciktisinin isaret ettigi yuk davranisina odaklanir.`,
          "",
          "Isitma yuklerinin sogutmaya gore daha baskin gorunmesi, dis hava kosullari, kabuk isil gecirgenligi veya setpoint varsayimlarinin isitma sezonu davranisini belirginlestirdigini dusundurur. Konum bilgisi Balikesir gibi gecis iklimi ozelligi tasiyan bir bolgeyi temsil ediyorsa hem kisin isitma hem yazin sogutma pikleri ayrica senaryo bazinda kontrol edilmelidir.",
          "",
          "### Kontrol Edilecek Girdiler",
          bullet(["EPW dosyasi ve iklim yili", "Isitma/sogutma setpoint degerleri", "Havalandirma ve infiltrasyon kabulleri", "Calisma takvimi ve ic kazanc profilleri"]),
        ]
      : [`## ${input.section.title}`, "", "Climate and boundary conditions should be checked against the weather file, schedules, setpoints, ventilation, and internal gains."],
    envelope_analysis: tr
      ? [
          `## ${input.section.title}`,
          "",
          "Senaryo ozetinde U-degerleri ayrintili olarak gelmedigi icin kabuk yorumu yuk davranisi uzerinden sinirli okunmalidir. Isitma yukunun baskin cikmasi kabuk, infiltrasyon veya setpoint kaynakli isi kayiplarinin oncelikli kontrol alani olduguna isaret eder.",
          "",
          "### Muhendislik Yorumu",
          "Kabuk performansi degerlendirilirken dis duvar, cati, doseme ve dograma U-degerleri ayrica girilmeli; ardindan ayni rapor enerji yogunlugu ve pik yuk etkisiyle yeniden uretilmelidir. Mevcut cikti, kabuk iyilestirmesinin olasi etkisini nicel olarak ayirmiyor fakat isitma tarafindaki baskinlik kabuk senaryolarinin mutlaka karsilastirilmasi gerektigini gosteriyor.",
        ]
      : [`## ${input.section.title}`, "", "Envelope conclusions are limited because explicit U-values are not present in the scenario summary."],
    energy_profile: tr
      ? [
          `## ${input.section.title}`,
          "",
          "### Enerji Dagilimi",
          `Toplam isitma yuku **${heating} kWh**, toplam sogutma yuku **${cooling} kWh** olarak okunuyor. Bu profil, modelin net enerji davranisinda isitma tarafinin baskin oldugunu; sogutma tarafinda ise negatif toplam nedeniyle veri isaretinin veya kolon eslemesinin kontrol edilmesi gerektigini gosterir.`,
          "",
          "### Zon Katkisi",
          `Isitma tarafinda one cikan zonlar: ${zoneList(topHeating)}. Sogutma tarafinda one cikan zonlar: ${zoneList(topCooling)}.`,
          "",
          "### Aksiyon",
          bullet(["Enerji yukleri saatlik/zaman serisi olarak tekrar export edilmeli.", "Negatif sogutma degerlerinin birim veya isaret anlami DesignBuilder rapor sablonunda dogrulanmali.", "Zon bazli enerji yogunlugu icin alan bilgisi eklenmeli."]),
        ]
      : [`## ${input.section.title}`, "", "Heating dominates the parsed energy profile; cooling values require sign and unit validation."],
    peak_load_analysis: tr
      ? [
          `## ${input.section.title}`,
          "",
          `Pik isitma degeri **${peaks.heating?.value ?? "-"}** ve pik sogutma degeri **${peaks.cooling?.value ?? "-"}** olarak kaydedildi. Pik yuklar sistem kapasitesi, ekipman secimi ve kontrol stratejisi acisindan yillik toplamdan daha kritik olabilir.`,
          "",
          "### Tasarim Etkisi",
          "Piklerin olustugu zon adlarinin sayisal gorunmesi, parser tarafinda zon/kolon esleme kontrolunu zorunlu kilar. Bu alan dogrulandiktan sonra pik yuklar cihaz kapasitesi, es zamanlilik katsayisi ve zon bazli terminal unite secimi icin kullanilabilir.",
          "",
          "### Kontrol Listesi",
          bullet(["Pik saat ve tarih DesignBuilder arayuzunde dogrulanmali.", "Pik zonlar mimari zonlarla eslestirilmeli.", "Aykiri tekil pikler zaman serisi grafiginde kontrol edilmeli."]),
        ]
      : [`## ${input.section.title}`, "", "Peak loads should be validated by timestamp and zone before equipment sizing."],
    carbon_and_cost: tr
      ? [
          `## ${input.section.title}`,
          "",
          "Karbon ve isletme maliyeti hesabi icin enerji tasiyicisi, birim fiyat ve emisyon katsayisi gerekli. Mevcut senaryo yalnizca yuk toplamlarini verdigi icin bu bolum kesin maliyet sonucu yerine hesap altyapisini tarif eder.",
          "",
          "### Hesap Yaklasimi",
          bullet([`Isitma yuku: ${heating} kWh`, `Sogutma yuku: ${cooling} kWh`, "Elektrik/dogal gaz katsayilari girildiginde karbon ve maliyet otomatik turetilebilir.", "Negatif sogutma toplamindan dolayi maliyet hesabindan once veri isareti dogrulanmali."]),
        ]
      : [`## ${input.section.title}`, "", "Cost and carbon calculation requires tariffs, energy carrier assumptions, and emission factors."],
    thermal_comfort: tr
      ? [
          `## ${input.section.title}`,
          "",
          `Ortalama ic hava sicakligi **${metrics.airTemperature.avg ?? "-"} C**; minimum **${metrics.airTemperature.min ?? "-"} C**, maksimum **${metrics.airTemperature.max ?? "-"} C** olarak okunuyor. Nem verisi ise ${metrics.humidity.avg ?? "bos"} oldugu icin konfor yorumu sicaklik merkezli kalir.`,
          "",
          "### Konfor Yorumu",
          "Ortalama sicaklik kabul edilebilir banda yakin gorunse de zon bazli dagilim ve saatlik asim sureleri olmadan PMV/PPD veya adaptif konfor sonucu uretilemez. Bir sonraki raporda saatlik sicaklik, nem ve kullanim takvimi birlikte verilmelidir.",
        ]
      : [`## ${input.section.title}`, "", "Thermal comfort interpretation is temperature-led because humidity and occupancy context are incomplete."],
    risk_and_anomalies: tr
      ? [
          `## ${input.section.title}`,
          "",
          "### Oncelikli Riskler",
          anomalies.length > 0
            ? bullet(anomalies)
            : bullet(["Zon adlarinda sayisal deger gorunmesi kolon esleme riskine isaret ediyor.", "Sogutma yukunun negatif toplam vermesi isaret/birim kontrolu gerektiriyor.", "Nem verisinin bos okunmasi konfor analizini sinirliyor."]),
          "",
          "### Dogrulama Plani",
          "CSV yeniden export edilirken kolon basliklari, birimler ve ondalik ayraclar sabitlenmeli. Ardindan ayni senaryo tekrar raporlanarak enerji, pik yuk ve konfor bolumleri karsilastirilmali.",
        ]
      : [`## ${input.section.title}`, "", "Main risks are column mapping, negative cooling totals, and incomplete humidity data."],
    optimization_conclusion: tr
      ? [
          `## ${input.section.title}`,
          "",
          "### Yol Haritasi",
          bullet(["Once veri kalitesi dogrulanmali: kolonlar, zon adlari, birimler.", "Sonra kabuk ve setpoint varyantlari ayni formatta tekrar simule edilmeli.", "Pik yuklar dogrulandiktan sonra sistem kapasitesi ve kontrol stratejisi optimize edilmeli.", "Alan bilgisi ve enerji fiyatlari eklenerek maliyet/karbon onceliklendirmesi yapilmali."]),
          "",
          "### Sonuc",
          "Mevcut senaryo, karar verici icin ilk bakista isitma yuklerinin baskin oldugunu ve veri dogrulama adiminin rapor kalitesini belirleyecegini gosteriyor. Nihai optimizasyon, dogrulanmis export ve en az iki alternatif senaryo karsilastirmasi ile yapilmalidir.",
        ]
      : [`## ${input.section.title}`, "", "The next step is data validation, then scenario comparison and optimization."],
  };

  return {
    markdown: sectionBodies[input.section.key].join("\n"),
    summary:
      input.language === "tr"
        ? `${input.section.title} bolumunde ana performans bulgulari, veri riskleri ve uygulanabilir kontroller ozetlendi.`
        : `${input.section.title} summarizes performance findings, data risks, and actionable checks.`,
    provider: "fallback",
    model: "deterministic-template",
  };
};

const normalizeSectionRow = (row: Record<string, unknown>): ReportSectionRecord => ({
  id: String(row.id),
  reportGroupId: String(row.report_group_id),
  scenarioId: String(row.scenario_id),
  language: String(row.language) === "en" ? "en" : "tr",
  reportTitle: String(row.report_title),
  sectionKey: row.section_key as ReportSectionKey,
  sectionTitle: String(row.section_title),
  sectionOrder: Number(row.section_order),
  status: row.status as ReportGenerationStatus,
  sectionContent: String(row.section_content ?? ""),
  initialSectionContent: row.initial_section_content ? String(row.initial_section_content) : null,
  sectionSummary: row.section_summary ? String(row.section_summary) : null,
  reviewStatus:
    row.review_status === "final" ? "final" : row.review_status === "reviewed" ? "reviewed" : "draft",
  lastEditedSource:
    row.last_edited_source === "engineer" ? "engineer" : row.last_edited_source === "refined" ? "refined" : "ai",
  contextSnapshot: (row.context_snapshot as Record<string, unknown> | null) ?? {},
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const parseSectionResponse = (text: string) => {
  const sanitized = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = sanitized.indexOf("{");
  const end = sanitized.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? sanitized.slice(start, end + 1) : sanitized;
  return sectionPayloadSchema.parse(JSON.parse(candidate));
};

const markRemainingSectionsFailed = async (params: {
  reportGroupId: string;
  fromSectionKey: ReportSectionKey;
  message: string;
}) => {
  const startIndex = REPORT_SECTION_DEFINITIONS.findIndex((section) => section.key === params.fromSectionKey);
  if (startIndex < 0) return;

  for (const section of REPORT_SECTION_DEFINITIONS.slice(startIndex)) {
    await updateSectionRow({
      reportGroupId: params.reportGroupId,
      sectionKey: section.key,
      values: {
        status: "failed",
        section_content: "",
        section_summary: params.message,
      },
    });
  }
};

async function updateSectionRow(params: {
  reportGroupId: string;
  sectionKey: ReportSectionKey;
  values: Record<string, unknown>;
}) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("reports")
    .update({
      ...params.values,
      updated_at: new Date().toISOString(),
    })
    .eq("report_group_id", params.reportGroupId)
    .eq("section_key", params.sectionKey);

  if (error) {
    throw new Error(error.message);
  }
}

export async function initializeReportSections(input: {
  reportGroupId: string;
  scenarioId: string;
  language: "tr" | "en";
  reportTitle: string;
}) {
  const supabase = createServiceClient();
  const rows = REPORT_SECTION_DEFINITIONS.map((section) => ({
    report_group_id: input.reportGroupId,
    scenario_id: input.scenarioId,
    language: input.language,
    report_title: input.reportTitle,
    section_key: section.key,
    section_title: section.title,
    section_order: section.order,
    status: "pending",
    section_content: "",
    initial_section_content: "",
    section_summary: null,
    review_status: "draft",
    last_edited_source: "ai",
    context_snapshot: {},
  }));

  const { error } = await supabase.from("reports").upsert(rows, {
    onConflict: "report_group_id,section_key",
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function generateSequentialReport(input: {
  reportGroupId: string;
  scenarioSummary: ScenarioSummaryPayload;
  language: "tr" | "en";
}) {
  const retrievedContext = [await loadRetrievedContext(input.scenarioSummary), await loadInternetClimateContext(input.scenarioSummary)].join("\n\n");
  const memory: Array<{ title: string; summary: string }> = [];
  let provider = "";
  let model = "";

  for (const section of REPORT_SECTION_DEFINITIONS) {
    await updateSectionRow({
      reportGroupId: input.reportGroupId,
      sectionKey: section.key,
      values: {
        section_content: "",
        section_summary: null,
      },
    });
  }

  return generateReportSectionsFrom({
    reportGroupId: input.reportGroupId,
    scenarioSummary: input.scenarioSummary,
    language: input.language,
    startSectionKey: REPORT_SECTION_DEFINITIONS[0].key,
    initialMemory: memory,
    retrievedContext,
  });
}

export async function generateReportSectionsFrom(input: {
  reportGroupId: string;
  scenarioSummary: ScenarioSummaryPayload;
  language: "tr" | "en";
  startSectionKey: ReportSectionKey;
  initialMemory: Array<{ title: string; summary: string }>;
  retrievedContext?: string;
}) {
  const retrievedContext =
    input.retrievedContext ??
    [await loadRetrievedContext(input.scenarioSummary), await loadInternetClimateContext(input.scenarioSummary)].join("\n\n");
  const learnedRulesContext = await loadLearnedRulesContext(input.scenarioSummary);
  const memory = [...input.initialMemory];
  let provider = "";
  let model = "";
  const startIndex = REPORT_SECTION_DEFINITIONS.findIndex((section) => section.key === input.startSectionKey);
  const sectionsToGenerate =
    startIndex >= 0 ? REPORT_SECTION_DEFINITIONS.slice(startIndex) : REPORT_SECTION_DEFINITIONS;

  for (const section of sectionsToGenerate) {
    await updateSectionRow({
      reportGroupId: input.reportGroupId,
      sectionKey: section.key,
      values: {
        status: "generating",
        context_snapshot: {
          retrievedContext,
          memory,
          scenarioSummary: input.scenarioSummary,
        },
      },
    });

    try {
      const result = await generateSingleReportSection({
        section,
        language: input.language,
        scenarioSummary: input.scenarioSummary,
        retrievedContext,
        memory,
        learnedRulesContext,
      });
      const parsed = { markdown: result.markdown, summary: result.summary };
      provider = result.provider;
      model = result.model;

      memory.push({
        title: section.title,
        summary: parsed.summary,
      });

      await updateSectionRow({
        reportGroupId: input.reportGroupId,
        sectionKey: section.key,
        values: {
          status: "completed",
          section_content: parsed.markdown,
          initial_section_content: parsed.markdown,
          section_summary: parsed.summary,
          review_status: "draft",
          last_edited_source: "ai",
          context_snapshot: {
            retrievedContext,
            memory,
            scenarioSummary: input.scenarioSummary,
            provider: result.provider,
            model: result.model,
          },
        },
      });

    } catch (error) {
      await updateSectionRow({
        reportGroupId: input.reportGroupId,
        sectionKey: section.key,
        values: {
          status: "failed",
          section_content: "",
          section_summary: error instanceof Error ? error.message : "Section generation failed.",
        },
      });
      throw error;
    }
  }

  return {
    provider,
    model,
    retrievedContext,
  };
}

export async function generateSingleReportSection(input: {
  section: ReportSectionDefinition;
  language: "tr" | "en";
  scenarioSummary: ScenarioSummaryPayload;
  retrievedContext?: string;
  memory: SectionMemoryItem[];
  learnedRulesContext?: string;
}) {
  const retrievedContext =
    input.retrievedContext ??
    [await loadRetrievedContext(input.scenarioSummary), await loadInternetClimateContext(input.scenarioSummary)].join("\n\n");
  const learnedRulesContext = input.learnedRulesContext ?? (await loadLearnedRulesContext(input.scenarioSummary));

  try {
    const result = await generateLlmText({
      systemPrompt:
        "You produce a single final-quality section of a formal building-performance engineering report. Be specific, evidence-based, non-repetitive, and client-facing.",
      userPrompt: buildSectionPrompt({
        section: input.section,
        language: input.language,
        scenarioSummary: input.scenarioSummary,
        retrievedContext,
        memory: input.memory,
        learnedRulesContext,
      }),
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: SECTION_OUTPUT_TOKEN_LIMIT,
      timeoutMs: SECTION_GENERATION_TIMEOUT_MS,
    });

    const parsed = parseSectionResponse(result.text);
    return {
      markdown: parsed.markdown,
      summary: parsed.summary,
      provider: result.provider,
      model: result.model,
    };
  } catch (error) {
    console.warn(`Section ${input.section.title} LLM generation failed, using fallback:`, error instanceof Error ? error.message : error);
    return buildFallbackSection({
      section: input.section,
      language: input.language,
      scenarioSummary: input.scenarioSummary,
      memory: input.memory,
    });
  }
}

export async function listReportSections(input: { scenarioId?: string; reportGroupId?: string }) {
  const supabase = createServiceClient();
  let query = supabase
    .from("reports")
    .select("*")
    .order("section_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (input.scenarioId) {
    query = query.eq("scenario_id", input.scenarioId);
  }
  if (input.reportGroupId) {
    query = query.eq("report_group_id", input.reportGroupId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => normalizeSectionRow(row as Record<string, unknown>));
}

export async function updateReportSectionContent(input: {
  reportGroupId: string;
  sectionKey: ReportSectionKey;
  sectionContent: string;
  lastEditedSource?: "ai" | "engineer" | "refined";
  reviewStatus?: "draft" | "reviewed" | "final";
}) {
  await updateSectionRow({
    reportGroupId: input.reportGroupId,
    sectionKey: input.sectionKey,
    values: {
      section_content: input.sectionContent,
      status: "completed",
      last_edited_source: input.lastEditedSource ?? "engineer",
      review_status: input.reviewStatus ?? "reviewed",
    },
  });
}
