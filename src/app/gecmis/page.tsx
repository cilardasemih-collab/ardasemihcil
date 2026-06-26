import Link from "next/link";

import HistoryExplorer from "@/components/HistoryExplorer";

export const metadata = {
  title: "Gecmis Sonuclar",
  description: "Mevcut sistem ve DesignBuilder analiz gecmisi",
};

export default function HistoryPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,#d1fae5_0,#f8fafc_35%,#e0f2fe_100%)] px-6 py-12">
      <div className="mx-auto max-w-7xl space-y-6">
        <nav className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-sm backdrop-blur">
          <Link href="/" className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600">
            Mevcut Sistem
          </Link>
          <Link href="/designbuilder" className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600">
            DesignBuilder
          </Link>
          <span className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">Gecmis</span>
          <Link href="/qr-olusturucu" className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600">
            QR Olusturucu
          </Link>
        </nav>

        <HistoryExplorer />
      </div>
    </main>
  );
}
