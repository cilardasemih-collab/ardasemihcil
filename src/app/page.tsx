import FileUpload from "@/components/FileUpload";
import AnalysisHistory from "@/components/AnalysisHistory";

export default function Page() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,#d1fae5_0,#f8fafc_35%,#e0f2fe_100%)] px-6 py-12">
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
        <section className="space-y-4">
          <p className="inline-flex rounded-full border border-cyan-300 bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-800">
            Agentic Workflow - Adim 1
          </p>
          <h1 className="text-4xl font-black leading-tight text-slate-900 md:text-5xl">
            Sanayi Verini Yukle, <br /> Analizi Baslat
          </h1>
          <p className="max-w-xl text-base text-slate-700">
            Bu adimda sadece CSV dosyasini guvenli sekilde Supabase Storage&apos;a aliyoruz. Sonraki adimlarda AI
            formulu cikaracak, optimize edecek ve nihai raporu uretecek.
          </p>
        </section>

        <FileUpload />
      </div>

      <div className="mx-auto mt-8 max-w-5xl">
        <AnalysisHistory />
      </div>
    </main>
  );
}
