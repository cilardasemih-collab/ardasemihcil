declare module "pdf-parse" {
  type PdfParseResult = {
    numpages: number;
    text: string;
    info?: unknown;
    metadata?: unknown;
  };

  export default function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
}
