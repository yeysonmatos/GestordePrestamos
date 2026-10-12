import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/finance";
import { ArrowLeft, Check, FileText, Send, X } from "lucide-react";
import { supportGet, supportReply, supportUpdate } from "@/lib/admin-fns";
import { ThreadMessage } from "@/components/support/thread-message";

interface Attachment { path: string; name: string; mime_type?: string; size?: number }
interface Ticket {
  id: string;
  subject: string;
  body: string;
  status: "open" | "replied" | "closed";
  priority: "low" | "normal" | "high";
  attachments?: Attachment[];
  created_at: string;
  user_id: string;
  author_name: string | null;
}
interface Message { id: string; body: string; is_staff: boolean; attachments: Attachment[]; created_at: string }

const STATUS_BADGE: Record<Ticket["status"], { variant: "default" | "secondary" | "destructive" | "outline"; className?: string; label: string }> = {
  open: { variant: "secondary", label: "Abierto" },
  replied: { variant: "outline", className: "border-success/50 text-success", label: "Respondido" },
  closed: { variant: "outline", label: "Cerrado" },
};

export const Route = createFileRoute("/_authenticated/admin/support/$id/")({
  component: SupportDetail,
});

function SupportDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supportGet({ data: { id } });
      if (data.ticket) setTicket(data.ticket as Ticket);
      setMessages((data.messages || []) as Message[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    // Mientras la ficha está abierta, trae respuestas nuevas cada 30 s.
    const t = setInterval(() => load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  function flashMsg(m: string) {
    setMessage(m);
    setTimeout(() => setMessage(""), 4000);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && files.length === 0) return;
    setSending(true);
    setError("");
    try {
      const attachments: Attachment[] = [];
      for (const file of files) {
        const path = `support/${id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (!upErr) attachments.push({ path, name: file.name, mime_type: file.type, size: file.size });
      }
      await supportReply({ data: { id, body: text.trim(), attachments } });
      setText("");
      setFiles([]);
      flashMsg("Respuesta enviada");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al responder");
    }
    setSending(false);
  }

  async function setStatus(status: "open" | "closed") {
    setSaving(true);
    setError("");
    try {
      await supportUpdate({ data: { id, status } });
      setTicket((prev) => (prev ? { ...prev, status } : prev));
      flashMsg(status === "closed" ? "Ticket cerrado" : "Ticket reabierto");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
    setSaving(false);
  }

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Cargando...</div>;

  if (!ticket) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-muted-foreground">Ticket no encontrado.</p>
        <Button variant="secondary" className="mt-3" onClick={() => navigate({ to: "/admin/support" })}>
          <ArrowLeft className="mr-1 size-4" /> Volver
        </Button>
      </Card>
    );
  }

  const st = STATUS_BADGE[ticket.status];

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate({ to: "/admin/support" })}
        className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 size-4" /> Bandeja de soporte
      </button>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">{ticket.subject}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {ticket.author_name || "Usuario"} · Creado {formatDate(ticket.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={st.variant} className={st.className}>{st.label}</Badge>
            {ticket.status === "closed" ? (
              <Button size="sm" variant="secondary" disabled={saving} onClick={() => setStatus("open")}>
                <Check className="mr-1 size-4" /> Reabrir
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled={saving} onClick={() => setStatus("closed")}>
                <Check className="mr-1 size-4" /> Cerrar
              </Button>
            )}
          </div>
        </div>
      </Card>

      {message && <Alert><span>{message}</span></Alert>}
      {error && <Alert variant="destructive"><span>{error}</span></Alert>}

      <Card className="p-4">
        <div className="space-y-3">
          <ThreadMessage
            from="me"
            time={formatDate(ticket.created_at)}
            body={ticket.body}
            attachments={ticket.attachments}
            mineLabel={ticket.author_name || "Cliente"}
          />
          {messages.map((m) => (
            <ThreadMessage
              key={m.id}
              from={m.is_staff ? "staff" : "me"}
              time={formatDate(m.created_at)}
              body={m.body}
              attachments={m.attachments}
              mineLabel={ticket.author_name || "Cliente"}
            />
          ))}
        </div>
      </Card>

      {ticket.status !== "closed" && (
        <Card className="p-4">
          <form onSubmit={handleSend} className="space-y-3">
            <label className="text-sm font-medium">Responder</label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Responder al cliente..." rows={4} />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={i} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
                    <FileText className="size-4" /> {f.name}
                    <button type="button" onClick={() => setFiles((fs) => fs.filter((_, x) => x !== i))} className="text-muted-foreground hover:text-destructive">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary">
                <FileText className="size-4" />
                <span className="text-xs">Adjuntar</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const sel = Array.from(e.target.files || []);
                    setFiles((fs) => [...fs, ...sel]);
                    e.target.value = "";
                  }}
                />
              </label>
              <Button type="submit" disabled={sending || (!text.trim() && files.length === 0)}>
                <Send className="mr-1 size-4" /> Responder
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
