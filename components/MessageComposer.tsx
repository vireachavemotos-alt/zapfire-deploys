"use client";

import { useEffect, useRef, useState } from "react";
import {
  Type,
  Image as ImageIcon,
  Video,
  Mic,
  FileText,
  Sticker as StickerIcon,
  MapPin,
  Phone,
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  Upload,
  Shuffle,
} from "lucide-react";
import {
  MessageBlock,
  MessageKind,
  messageKindLabels,
  newBlock,
  blockSupportsMedia,
  blockSupportsVariations,
} from "@/lib/message";
import { NeonInput } from "./NeonInput";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<MessageKind, React.ComponentType<{ className?: string }>> = {
  text: Type,
  image: ImageIcon,
  video: Video,
  audio: Mic,
  document: FileText,
  sticker: StickerIcon,
  location: MapPin,
  call: Phone,
};

const MEDIA_ACCEPT: Record<MessageKind, string> = {
  text: "",
  image: "image/*",
  video: "video/mp4,video/*",
  audio: "audio/mpeg,audio/ogg,audio/*",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,application/*",
  sticker: "image/webp,image/png",
  location: "",
  call: "",
};

function fileToDataURL(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

// ─── Public composer ─────────────────────────────────────────────────

export function MessageComposer({
  value,
  onChange,
}: {
  value: MessageBlock[];
  onChange: (next: MessageBlock[]) => void;
}) {
  function update(id: string, patch: Partial<MessageBlock>) {
    onChange(value.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function remove(id: string) {
    onChange(value.filter((b) => b.id !== id));
  }
  function move(id: string, dir: -1 | 1) {
    const i = value.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function add(kind: MessageKind) {
    onChange([...value, newBlock(kind)]);
  }

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-xs text-zinc-500">
          Nenhuma mensagem ainda. Clique em <b>Adicionar mensagem</b> para
          começar.
        </p>
      )}

      {value.map((b, i) => (
        <BlockCard
          key={b.id}
          index={i}
          block={b}
          canUp={i > 0}
          canDown={i < value.length - 1}
          onUpdate={(p) => update(b.id, p)}
          onRemove={() => remove(b.id)}
          onMove={(d) => move(b.id, d)}
        />
      ))}

      <AddBlockBar onAdd={add} />

      <div className="text-[11px] text-zinc-500 pt-2">
        Dica: use <code className="text-[#FF0033]">{"{nome}"}</code> e{" "}
        <code className="text-[#FF0033]">{"{empresa}"}</code> para
        personalizar. Com várias variações, o sistema sorteia uma por envio.
      </div>
    </div>
  );
}

// ─── Add-block bar ───────────────────────────────────────────────────

function AddBlockBar({ onAdd }: { onAdd: (k: MessageKind) => void }) {
  const [open, setOpen] = useState(false);
  const kinds: MessageKind[] = [
    "text",
    "image",
    "audio",
    "video",
    "document",
    "sticker",
    "location",
    "call",
  ];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md border border-dashed border-white/10 hover:border-[#FF0033]/50 p-3 flex items-center justify-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
      >
        <Plus className="h-4 w-4" /> Adicionar mensagem
      </button>
    );
  }

  return (
    <div className="rounded-md border border-white/10 bg-black/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] uppercase tracking-widest text-zinc-500">
          Escolha o tipo
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-zinc-500 hover:text-white p-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        {kinds.map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                onAdd(k);
                setOpen(false);
              }}
              className="flex flex-col items-center gap-1 p-2 rounded-md border border-white/10 hover:border-[#FF0033] hover:bg-[#FF0033]/5 transition-colors"
            >
              <Icon className="h-4 w-4 text-[#FF0033]" />
              <span className="text-[10px] text-zinc-300">
                {messageKindLabels[k]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Block card ──────────────────────────────────────────────────────

function BlockCard({
  index,
  block,
  canUp,
  canDown,
  onUpdate,
  onRemove,
  onMove,
}: {
  index: number;
  block: MessageBlock;
  canUp: boolean;
  canDown: boolean;
  onUpdate: (p: Partial<MessageBlock>) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const Icon = KIND_ICON[block.kind];
  const nVar = block.variations.length;

  return (
    <div className="rounded-md border border-white/10 bg-black/30">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-6 w-6 rounded bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center shrink-0">
            <Icon className="h-3.5 w-3.5 text-[#FF0033]" />
          </div>
          <span className="text-xs font-medium">
            {index + 1}. {messageKindLabels[block.kind]}
          </span>
          {blockSupportsVariations(block.kind) && nVar > 1 && (
            <span className="text-[10px] text-[#FF0033] bg-[#FF0033]/10 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
              <Shuffle className="h-3 w-3" />
              {nVar} variações
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={!canUp}
            className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Mover para cima"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={!canDown}
            className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Mover para baixo"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-zinc-500 hover:text-red-400"
            aria-label="Remover bloco"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        {blockSupportsMedia(block.kind) && (
          <MediaPicker block={block} onUpdate={onUpdate} />
        )}

        {blockSupportsVariations(block.kind) && (
          <VariationsEditor
            block={block}
            onUpdate={onUpdate}
            captionLabel={
              block.kind === "text" ? "Mensagem" : "Legenda (opcional)"
            }
          />
        )}

        {block.kind === "location" && (
          <LocationEditor block={block} onUpdate={onUpdate} />
        )}

        {block.kind === "call" && (
          <CallEditor block={block} onUpdate={onUpdate} />
        )}
      </div>
    </div>
  );
}

// ─── Variations editor (inline + button) ─────────────────────────────

// Editor isolado de uma variação. Mantém o valor em state LOCAL e só
// propaga pro pai via onBlur + debounce 400ms. iOS Safari fechava o
// teclado a cada tecla porque o `onChange → onUpdate` cascateava um
// re-render da árvore do pai (nova/page.tsx, ~1300 linhas), que
// remontava o textarea. Isolando o estado, o pai só atualiza quando a
// edição estabiliza.
function VariationTextarea({
  value,
  onCommit,
  placeholder,
  showBadge,
  badgeLabel,
  onRemove,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder: string;
  showBadge: boolean;
  badgeLabel: string;
  onRemove?: () => void;
}) {
  const [local, setLocal] = useState(value);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  // Sincroniza se o pai mudar de verdade (ex: variação removida/reordenada).
  useEffect(() => {
    setLocal(value);
  }, [value]);

  // Debounce: envia pro pai 400ms depois da última tecla.
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => commitRef.current(local), 400);
    return () => clearTimeout(t);
  }, [local, value]);

  return (
    <div className="relative group">
      {showBadge && (
        <span className="absolute top-2 left-2 text-[9px] uppercase tracking-wider text-[#FF0033] bg-black/60 px-1.5 py-0.5 rounded border border-[#FF0033]/30 z-10 pointer-events-none">
          {badgeLabel}
        </span>
      )}
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) commitRef.current(local);
        }}
        rows={3}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-md border border-white/10 bg-black/40 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none resize-y p-3",
          "focus:border-[#FF0033]/70 transition-colors",
          showBadge && "pt-7"
        )}
      />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 p-1 bg-black/60 rounded"
          aria-label="Remover variação"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function VariationsEditor({
  block,
  onUpdate,
  captionLabel,
}: {
  block: MessageBlock;
  onUpdate: (p: Partial<MessageBlock>) => void;
  captionLabel: string;
}) {
  const vars = block.variations.length > 0 ? block.variations : [""];

  function setVar(i: number, v: string) {
    const next = vars.slice();
    next[i] = v;
    onUpdate({ variations: next });
  }
  function removeVar(i: number) {
    if (vars.length === 1) {
      // nunca deixar sem nenhum campo; em vez disso limpa o conteúdo
      onUpdate({ variations: [""] });
      return;
    }
    onUpdate({ variations: vars.filter((_, j) => j !== i) });
  }
  function addVar() {
    onUpdate({ variations: [...vars, ""] });
  }

  const placeholder =
    block.kind === "text" ? "Olá {nome}, tudo bem?" : "Legenda (opcional)";

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">
        {captionLabel}
      </p>

      {vars.map((v, i) => (
        <VariationTextarea
          key={i}
          value={v}
          onCommit={(next) => setVar(i, next)}
          placeholder={placeholder}
          showBadge={vars.length > 1}
          badgeLabel={`Var ${i + 1}`}
          onRemove={vars.length > 1 ? () => removeVar(i) : undefined}
        />
      ))}

      <button
        type="button"
        onClick={addVar}
        className="inline-flex items-center gap-1.5 text-xs text-[#FF0033] hover:text-white transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> Variação
      </button>
    </div>
  );
}

// ─── Media picker ────────────────────────────────────────────────────

function MediaPicker({
  block,
  onUpdate,
}: {
  block: MessageBlock;
  onUpdate: (p: Partial<MessageBlock>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<"file" | "url">(
    block.mediaUrl && /^https?:/i.test(block.mediaUrl) ? "url" : "file"
  );

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const dataUrl = await fileToDataURL(f);
      onUpdate({
        mediaUrl: dataUrl,
        mediaFileName: f.name,
        mediaMimetype: f.type || "application/octet-stream",
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function clear() {
    onUpdate({
      mediaUrl: undefined,
      mediaFileName: undefined,
      mediaMimetype: undefined,
    });
  }

  const hasMedia = !!block.mediaUrl;
  const isImage = block.kind === "image" || block.kind === "sticker";
  const isVideo = block.kind === "video";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">
          Arquivo
        </p>
        <div className="inline-flex rounded-md border border-white/10 overflow-hidden text-[10px]">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={cn(
              "px-2 py-1 transition-colors",
              mode === "file"
                ? "bg-[#FF0033]/10 text-[#FF0033]"
                : "text-zinc-400 hover:text-white"
            )}
          >
            Upload
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className={cn(
              "px-2 py-1 transition-colors border-l border-white/10",
              mode === "url"
                ? "bg-[#FF0033]/10 text-[#FF0033]"
                : "text-zinc-400 hover:text-white"
            )}
          >
            URL
          </button>
        </div>
      </div>

      {mode === "url" ? (
        <NeonInput
          placeholder="https://exemplo.com/arquivo.jpg"
          value={
            block.mediaUrl && /^https?:/i.test(block.mediaUrl)
              ? block.mediaUrl
              : ""
          }
          onChange={(e) =>
            onUpdate({
              mediaUrl: e.target.value.trim() || undefined,
              mediaFileName: undefined,
              mediaMimetype: inferMimeFromUrl(e.target.value, block.kind),
            })
          }
        />
      ) : hasMedia ? (
        <div className="flex items-start gap-3 rounded-md border border-white/10 bg-black/40 p-3">
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.mediaUrl}
              alt=""
              className="h-16 w-16 rounded object-cover border border-white/10 shrink-0"
            />
          )}
          {isVideo && (
            <video
              src={block.mediaUrl}
              className="h-16 w-24 rounded object-cover border border-white/10 shrink-0 bg-black"
              muted
            />
          )}
          {!isImage && !isVideo && (
            <div className="h-16 w-16 rounded bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-[#FF0033]" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">
              {block.mediaFileName ||
                (block.mediaUrl?.startsWith("data:")
                  ? "arquivo carregado"
                  : block.mediaUrl)}
            </p>
            <p className="text-[10px] text-zinc-500 truncate">
              {block.mediaMimetype || "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="text-zinc-500 hover:text-red-400 p-1"
            aria-label="Remover arquivo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full rounded-md border border-dashed border-white/10 hover:border-[#FF0033]/50 p-4 flex items-center justify-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <Upload className="h-4 w-4" />
          {uploading ? "Carregando..." : "Clique para selecionar"}
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={MEDIA_ACCEPT[block.kind]}
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}

function inferMimeFromUrl(url: string, kind: MessageKind): string | undefined {
  const u = url.toLowerCase();
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".mp4")) return "video/mp4";
  if (u.endsWith(".mp3")) return "audio/mpeg";
  if (u.endsWith(".ogg")) return "audio/ogg";
  if (u.endsWith(".pdf")) return "application/pdf";
  // fallback por tipo
  const fallback: Partial<Record<MessageKind, string>> = {
    image: "image/jpeg",
    video: "video/mp4",
    audio: "audio/mpeg",
    document: "application/pdf",
    sticker: "image/webp",
  };
  return fallback[kind];
}

// ─── Location editor ─────────────────────────────────────────────────

function LocationEditor({
  block,
  onUpdate,
}: {
  block: MessageBlock;
  onUpdate: (p: Partial<MessageBlock>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <NeonInput
        label="Latitude"
        type="number"
        step="any"
        value={block.latitude ?? ""}
        onChange={(e) =>
          onUpdate({
            latitude: e.target.value === "" ? undefined : Number(e.target.value),
          })
        }
        placeholder="-23.5505"
      />
      <NeonInput
        label="Longitude"
        type="number"
        step="any"
        value={block.longitude ?? ""}
        onChange={(e) =>
          onUpdate({
            longitude:
              e.target.value === "" ? undefined : Number(e.target.value),
          })
        }
        placeholder="-46.6333"
      />
      <NeonInput
        label="Nome (opcional)"
        value={block.locationName || ""}
        onChange={(e) => onUpdate({ locationName: e.target.value })}
        placeholder="Av. Paulista"
      />
      <NeonInput
        label="Endereço (opcional)"
        value={block.locationAddress || ""}
        onChange={(e) => onUpdate({ locationAddress: e.target.value })}
        placeholder="São Paulo, SP"
      />
    </div>
  );
}

// ─── Call editor ─────────────────────────────────────────────────────

function CallEditor({
  block,
  onUpdate,
}: {
  block: MessageBlock;
  onUpdate: (p: Partial<MessageBlock>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <NeonInput
        label="Duração (segundos)"
        type="number"
        min={1}
        max={60}
        value={String(block.callDurationSeconds ?? 10)}
        onChange={(e) =>
          onUpdate({
            callDurationSeconds: Math.max(1, Number(e.target.value) || 1),
          })
        }
        hint="Tempo que a chamada fantasma fica tocando no celular do contato."
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-300">
          Tipo
        </span>
        <div className="inline-flex rounded-xl border border-white/10 bg-black/40 overflow-hidden">
          <button
            type="button"
            onClick={() => onUpdate({ callIsVideo: false })}
            className={cn(
              "flex-1 h-11 text-sm transition-colors",
              !block.callIsVideo
                ? "bg-[#FF0033]/10 text-[#FF0033]"
                : "text-zinc-400 hover:text-white"
            )}
          >
            Voz
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ callIsVideo: true })}
            className={cn(
              "flex-1 h-11 text-sm transition-colors border-l border-white/10",
              block.callIsVideo
                ? "bg-[#FF0033]/10 text-[#FF0033]"
                : "text-zinc-400 hover:text-white"
            )}
          >
            Vídeo
          </button>
        </div>
      </div>
    </div>
  );
}
