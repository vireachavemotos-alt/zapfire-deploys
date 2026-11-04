"use client";
import { cn } from "@/lib/utils";
import { UploadCloud, FileSpreadsheet, FileText } from "lucide-react";
import { useState, DragEvent, useRef } from "react";

type Props = {
  onFile?: (file: File) => void;
  accept?: string;
  label?: string;
  sublabel?: string;
};

export function FileDropzone({
  onFile,
  accept = ".csv,.xlsx,.xls",
  label = "Arraste sua planilha aqui ou clique para selecionar",
  sublabel = "CSV, XLS ou XLSX — até 10MB",
}: Props) {
  const [over, setOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    onFile?.(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 cursor-pointer transition-all",
        "bg-black/30 backdrop-blur-xl",
        over
          ? "border-neon shadow-neon bg-neon/10"
          : "border-neon/30 hover:border-neon/70 hover:shadow-neon-sm"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neon/10 border border-neon/40 text-neon animate-glow-pulse">
        <UploadCloud className="h-8 w-8" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-zinc-100">{label}</p>
        <p className="text-xs text-zinc-400 mt-1">{sublabel}</p>
      </div>
      {file && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-neon/40 bg-neon/5 px-3 py-2">
          {file.name.endsWith(".csv") ? (
            <FileText className="h-4 w-4 text-neon" />
          ) : (
            <FileSpreadsheet className="h-4 w-4 text-neon" />
          )}
          <span className="text-xs text-zinc-200">{file.name}</span>
          <span className="text-[11px] text-zinc-500">
            {(file.size / 1024).toFixed(1)} KB
          </span>
        </div>
      )}
    </div>
  );
}
