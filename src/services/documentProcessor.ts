import * as XLSX from "xlsx";

import { generateEmbedding } from "@/lib/ai/embeddingClient";
import { createServiceClient } from "@/lib/supabase/server";

type ProcessDocumentInput = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  metadata?: Record<string, unknown>;
};

type DocumentChunk = {
  content: string;
  metadata: Record<string, unknown>;
};

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;

const chunkText = (text: string, baseMetadata: Record<string, unknown>) => {
  const normalized = text.replace(/\r/g, "").trim();
  const chunks: DocumentChunk[] = [];
  let cursor = 0;
  let index = 0;

  while (cursor < normalized.length) {
    const nextChunk = normalized.slice(cursor, cursor + CHUNK_SIZE).trim();
    if (nextChunk) {
      chunks.push({
        content: nextChunk,
        metadata: {
          ...baseMetadata,
          chunkIndex: index,
        },
      });
      index += 1;
    }
    if (cursor + CHUNK_SIZE >= normalized.length) break;
    cursor += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
};

const splitPdfIntoPages = async (buffer: Buffer) => {
  const dynamicImporter = new Function("moduleName", "return import(moduleName);") as (moduleName: string) => Promise<{
    default: (input: Buffer) => Promise<{ text: string }>;
  }>;
  let pdfParseModule: { default: (input: Buffer) => Promise<{ text: string }> };

  try {
    pdfParseModule = await dynamicImporter("pdf-parse");
  } catch {
    throw new Error("PDF ingest icin `pdf-parse` paketi kurulu degil. Bu ortamda once bagimlilik kurulumu gerekli.");
  }

  const parsed = await pdfParseModule.default(buffer);
  const pages = parsed.text
    .split(/\f+/)
    .map((page) => page.trim())
    .filter(Boolean);

  if (pages.length === 0 && parsed.text.trim()) {
    return [parsed.text.trim()];
  }

  return pages;
};

const sheetToMarkdownTable = (sheet: XLSX.WorkSheet) => {
  const matrix = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as Array<Array<string | number | null>>;

  if (matrix.length === 0) return "";

  const rows = matrix.map((row) => row.map((cell) => String(cell ?? "").replace(/\n/g, " ").trim()));
  const header = rows[0];
  const separator = header.map(() => "---");
  const body = rows.slice(1);

  return [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
};

const convertExcelToChunks = (buffer: Buffer, fileName: string, metadata: Record<string, unknown>) => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const chunks: DocumentChunk[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const markdownTable = sheetToMarkdownTable(sheet);
    if (!markdownTable) continue;

    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: false,
    });

    const serialized = [
      `Document: ${fileName}`,
      `Sheet: ${sheetName}`,
      "Markdown Table:",
      markdownTable,
      "",
      "JSON Rows:",
      JSON.stringify(jsonRows.slice(0, 40), null, 2),
    ].join("\n");

    chunks.push(
      ...chunkText(serialized, {
        ...metadata,
        sourceType: "excel",
        documentName: fileName,
        sheetName,
        citationLabel: `${fileName} / ${sheetName}`,
      })
    );
  }

  return chunks;
};

const convertPdfToChunks = async (buffer: Buffer, fileName: string, metadata: Record<string, unknown>) => {
  const pages = await splitPdfIntoPages(buffer);
  const chunks: DocumentChunk[] = [];

  pages.forEach((pageText, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const pageChunks = chunkText(pageText, {
      ...metadata,
      sourceType: "pdf",
      documentName: fileName,
      pageNumber,
      citationLabel: `${fileName}, Sayfa ${pageNumber}`,
    });
    chunks.push(...pageChunks);
  });

  return chunks;
};

export async function processDocumentToVectorStore(input: ProcessDocumentInput) {
  const baseMetadata = {
    ...input.metadata,
    originalFileName: input.fileName,
    mimeType: input.mimeType,
  };

  let chunks: DocumentChunk[] = [];

  if (input.mimeType.includes("pdf") || input.fileName.toLowerCase().endsWith(".pdf")) {
    chunks = await convertPdfToChunks(input.buffer, input.fileName, baseMetadata);
  } else if (
    input.mimeType.includes("sheet") ||
    input.fileName.toLowerCase().endsWith(".xlsx") ||
    input.fileName.toLowerCase().endsWith(".xls")
  ) {
    chunks = convertExcelToChunks(input.buffer, input.fileName, baseMetadata);
  } else {
    throw new Error("Desteklenmeyen dokuman tipi. Sadece PDF ve Excel destekleniyor.");
  }

  if (chunks.length === 0) {
    throw new Error("Dokumandan vektorlestirilecek anlamli icerik cikarilamadi.");
  }

  const supabase = createServiceClient();
  const insertedIds: string[] = [];

  for (const chunk of chunks) {
    const embeddingResult = await generateEmbedding(chunk.content);
    const { data, error } = await supabase
      .from("documents")
      .insert({
        content: chunk.content,
        metadata: {
          ...chunk.metadata,
          embeddingProvider: embeddingResult.provider,
          embeddingModel: embeddingResult.model,
        },
        embedding: embeddingResult.embedding,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (data?.id) insertedIds.push(String(data.id));
  }

  return {
    chunkCount: chunks.length,
    insertedIds,
  };
}
