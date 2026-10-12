import { useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type Attachment = { path: string; name: string; mime_type?: string; size?: number };

const IMG_RE = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
const PDF_RE = /\.pdf$/i;

/**
 * Chips de adjuntos con visor interno (evita el bloqueador de popups):
 * imágenes y PDF se previsualizan en un diálogo; además permite descargar.
 */
export function AttachmentChips({ items }: { items?: Attachment[] | null | undefined }) {
  const [preview, setPreview] = useState<{ url: string; name: string; kind: "img" | "pdf" | "other" } | null>(null);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  async function open(a: Attachment) {
    setLoadingPath(a.path);
    try {
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(a.path, 120);
      if (error || !data?.signedUrl) {
        toast.error("No pudimos abrir el archivo. Pídele al soporte que lo vuelva a adjuntar.");
        return;
      }
      const kind = IMG_RE.test(a.name) ? "img" : PDF_RE.test(a.name) ? "pdf" : "other";
      if (kind === "other") {
        const a2 = document.createElement("a");
        a2.href = data.signedUrl;
        a2.download = a.name;
        a2.click();
        return;
      }
      setPreview({ url: data.signedUrl, name: a.name, kind });
    } finally {
      setLoadingPath(null);
    }
  }

  if (!items || items.length === 0) return null;
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => open(a)}
            disabled={loadingPath === a.path}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
          >
            <FileText className="size-3.5" />
            <span className="max-w-[160px] truncate">{a.name}</span>
            {loadingPath === a.path && <span className="animate-pulse">…</span>}
          </button>
        ))}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate text-sm">{preview?.name}</DialogTitle>
            <DialogDescription className="sr-only">Vista previa del archivo adjunto</DialogDescription>
          </DialogHeader>
          {preview?.kind === "img" && (
            <img src={preview.url} alt={preview.name} className="max-h-[60vh] w-full rounded-lg object-contain" />
          )}
          {preview?.kind === "pdf" && (
            <iframe src={preview.url} title={preview.name} className="h-[60vh] w-full rounded-lg border border-border" />
          )}
          {preview && (
            <div className="flex justify-end gap-2">
              <a href={preview.url} target="_blank" rel="noopener noreferrer" className="inline-flex">
                <Button variant="secondary" size="sm">
                  Abrir en pestaña nueva
                </Button>
              </a>
              <a href={preview.url} download={preview.name} className="inline-flex">
                <Button variant="outline" size="sm">
                  Descargar
                </Button>
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
