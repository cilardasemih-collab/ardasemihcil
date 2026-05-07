"use client";

import { useRef, useState } from "react";
import { Download, Plus, QrCode, Trash2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

type QrItem = {
  id: string;
  label: string;
  value: string;
};

export default function QrGenerator() {
  const [qrLabel, setQrLabel] = useState("");
  const [qrValue, setQrValue] = useState("");
  const [qrItems, setQrItems] = useState<QrItem[]>([]);
  const qrCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  const addQr = () => {
    const value = qrValue.trim();
    if (!value) return;

    const item: QrItem = {
      id: `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: qrLabel.trim() || `QR-${qrItems.length + 1}`,
      value,
    };

    setQrItems((prev) => [item, ...prev]);
    setQrLabel("");
    setQrValue("");
  };

  const removeQr = (id: string) => {
    setQrItems((prev) => prev.filter((item) => item.id !== id));
    delete qrCanvasRefs.current[id];
  };

  const downloadQrPng = (item: QrItem) => {
    const canvas = qrCanvasRefs.current[item.id];
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${item.label.replace(/\s+/g, "-").toLowerCase()}-qr.png`;
    link.click();
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      <h2 className="inline-flex items-center gap-2 text-2xl font-black text-slate-900">
        <QrCode size={22} /> QR Olusturucu
      </h2>
      <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-600">
        Suresiz QR kodlar olustur, listele ve PNG olarak indir. Link, metin, Wi-Fi bilgisi veya herhangi bir icerik girebilirsin.
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_140px]">
        <label className="rounded-2xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
          QR Etiketi
          <input
            value={qrLabel}
            onChange={(event) => setQrLabel(event.target.value)}
            placeholder="Orn: Proje Giris"
            className="mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none"
          />
        </label>

        <label className="rounded-2xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
          QR Icerigi
          <input
            value={qrValue}
            onChange={(event) => setQrValue(event.target.value)}
            placeholder="https://..."
            className="mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none"
          />
        </label>

        <button
          type="button"
          onClick={addQr}
          disabled={!qrValue.trim()}
          className="inline-flex h-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          <Plus size={16} /> Olustur
        </button>
      </div>

      {qrItems.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">
          Henuz QR yok.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {qrItems.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-slate-900">{item.label}</p>
                  <p className="mt-1 break-all text-[11px] font-semibold text-slate-600">{item.value}</p>
                  <p className="mt-1 text-[10px] font-semibold text-emerald-700">Suresiz</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeQr(item.id)}
                  className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-300 px-2 text-xs font-black text-slate-700"
                >
                  <Trash2 size={12} /> Sil
                </button>
              </div>

              <div className="mt-3 flex justify-center rounded-2xl bg-white p-3">
                <QRCodeCanvas
                  value={item.value}
                  size={180}
                  level="H"
                  includeMargin
                  ref={(node) => {
                    qrCanvasRefs.current[item.id] = node;
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => downloadQrPng(item)}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 text-xs font-black text-white"
              >
                <Download size={14} /> PNG Indir
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
