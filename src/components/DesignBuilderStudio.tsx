"use client";

import { useState } from "react";

import DesignBuilderOptimization from "@/components/DesignBuilderOptimization";
import DesignBuilderWorkspace from "@/components/DesignBuilderWorkspace";

type BuilderTab = "workspace" | "optimization";

export default function DesignBuilderStudio() {
  const [activeTab, setActiveTab] = useState<BuilderTab>("workspace");

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab("workspace")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === "workspace" ? "bg-slate-900 text-white" : "text-slate-600"
          }`}
        >
          Workspace
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("optimization")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === "optimization" ? "bg-emerald-600 text-white" : "text-slate-600"
          }`}
        >
          Optimization
        </button>
      </div>

      {activeTab === "workspace" ? <DesignBuilderWorkspace /> : <DesignBuilderOptimization />}
    </div>
  );
}
