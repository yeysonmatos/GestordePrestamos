import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, LifeBuoy, MessageSquarePlus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { supportNotifyAdmin } from "@/lib/admin-fns";
import { Chip } from "@/components/money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Attachment } from "@/components/support/attachment-chips";
import { ThreadMessage } from "@/components/support/thread-message";
import { formatDate } from "@/lib/finance";

type Ticket = {
  id: string;
  subject: string;
  body: string;
  status: "open" | "replied" | "closed";
  priority: "low" | "normal" | "high";
  attachments?: Attachment[] | null;
  created_at: string | null;
  updated_at: string | null;
};

type Message = {
  id: string;
  body: string;
  is_staff: boolean;
  attachments?: Attachment[] | null;
  created_at: string | null;
};

function FilePills({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
        >
          <FileText className="size-4" /> {f.name}
          <button type="button" onClick={() => onRemove(i)} className="hover:text-destructive">
            <X className="size-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
}

const STATUS: Record<Ticket["status"], { label: string; tone: "neutral" | "success" | "info" }> = {
  open: { label: "Abierto", tone: "neutral" },
  replied: { label: "Respondido", tone: "success" },
  closed: { label: "Cerrado", tone: "info" },
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
};

async function currentUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Soporte del suscriptor: sus tickets, nuevo ticket y conversación. */
export function SupportPanel() {
  const queryClient = useQueryClient();
  const [uid, setUid] = useState<string | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ subject: "", body: "", priority: "normal" });
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);

  async function uploadAll(files: File[], folder: string): Promise<Attachment[]> {
    const out: Attachment[] = [];
    for (const f of files) {
      const path = `${folder}/${Date.now()}-${f.name}`;
      const { error } = await supabase.storage.from("documents").upload(path, f);
      if (!error) out.push({ path, name: f.name, mime_type: f.type, size: f.size });
    }
    return out;
  }

  useEffect(() => {
    currentUid().then(setUid);
  }, []);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["my-tickets", uid],
    enabled: !!uid,
    refetchInterval: expanded ? 30_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, subject, body, status, priority, attachments, created_at, updated_at")
        .eq("user_id", uid as string)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Ticket[];
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["ticket-messages", expanded],
    enabled: !!expanded,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, body, is_staff, attachments, created_at")
        .eq("ticket_id", expanded as string)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Message[];
    },
  });

  async function crear() {
    if (!uid) return;
    if (!form.subject.trim() || !form.body.trim()) {
      toast.error("Escribe un asunto y describe tu solicitud.");
      return;
    }
    setSending(true);
    try {
      const { data: created, error } = await supabase
        .from("support_tickets")
        .insert({
          user_id: uid,
          subject: form.subject.trim(),
          body: form.body.trim(),
          priority: form.priority,
          type: "support",
          status: "open",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (newFiles.length && created?.id) {
        const att = await uploadAll(newFiles, `support/${created.id}`);
        if (att.length)
          await supabase.from("support_tickets").update({ attachments: att }).eq("id", created.id);
      }
      setNewFiles([]);
      toast.success("Ticket creado. El equipo te responderá por aquí y por correo.");
      // Aviso por correo al admin (no bloquea la UI si falla).
      if (created?.id) {
        void supportNotifyAdmin({ data: { ticketId: created.id, kind: "created" } }).catch(
          () => {},
        );
      }
      setForm({ subject: "", body: "", priority: "normal" });
      setOpenNew(false);
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos crear el ticket");
    } finally {
      setSending(false);
    }
  }

  async function responder(ticket: Ticket) {
    if (!uid || !reply.trim()) return;
    setSending(true);
    try {
      const att = replyFiles.length ? await uploadAll(replyFiles, `support/${ticket.id}`) : [];
      const { error: insErr } = await supabase.from("support_messages").insert({
        ticket_id: ticket.id,
        user_id: uid,
        body: reply.trim(),
        is_staff: false,
        attachments: att,
      });
      if (insErr) throw new Error(insErr.message);
      if (ticket.status === "replied" || ticket.status === "closed") {
        await supabase.from("support_tickets").update({ status: "open" }).eq("id", ticket.id);
      }
      // Aviso por correo al admin de la respuesta del suscriptor.
      void supportNotifyAdmin({
        data: { ticketId: ticket.id, kind: "reply", message: reply.trim() },
      }).catch(() => {});
      setReply("");
      setReplyFiles([]);
      queryClient.invalidateQueries({ queryKey: ["ticket-messages", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos enviar la respuesta");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <LifeBuoy className="size-5 text-accent" /> Tus tickets de soporte
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Reporta un problema o hace una pregunta; el administrador responde aquí.
          </p>
        </div>
        <Button variant="accent" size="sm" className="min-h-11" onClick={() => setOpenNew(true)}>
          <MessageSquarePlus className="mr-1 size-4" /> Nuevo ticket
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando tickets…</p>}
      {!isLoading && tickets.length === 0 && (
        <div className="surface flex flex-col items-center gap-2 p-10 text-center">
          <LifeBuoy className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Todavía no has abierto ningún ticket.</p>
        </div>
      )}

      <ul className="space-y-3">
        {tickets.map((t) => {
          const open = expanded === t.id;
          const st = STATUS[t.status] ?? { label: t.status, tone: "neutral" as const };
          return (
            <li key={t.id} className="surface overflow-hidden">
              <button
                onClick={() => setExpanded(open ? null : t.id)}
                className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{t.subject}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Prioridad {PRIORITY_LABEL[t.priority] ?? t.priority} ·{" "}
                    {formatDate(t.created_at)}
                  </p>
                </div>
                <Chip tone={st.tone}>{st.label}</Chip>
              </button>

              {open && (
                <div className="border-t border-border bg-secondary/30 p-4">
                  <div className="space-y-3">
                    <ThreadMessage
                      from="me"
                      time={formatDate(t.created_at)}
                      body={t.body}
                      attachments={t.attachments}
                    />
                    {messages.map((m) => (
                      <ThreadMessage
                        key={m.id}
                        from={m.is_staff ? "staff" : "me"}
                        time={formatDate(m.created_at)}
                        body={m.body}
                        attachments={m.attachments}
                      />
                    ))}
                  </div>
                  {t.status !== "closed" ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-end gap-2">
                        <Textarea
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder="Escribe una respuesta…"
                          rows={2}
                          className="min-h-11"
                        />
                        <Button
                          variant="accent"
                          className="h-11 shrink-0"
                          disabled={sending || (!reply.trim() && !replyFiles.length)}
                          onClick={() => responder(t)}
                        >
                          <Send className="mr-1 size-4" /> Enviar
                        </Button>
                      </div>
                      <FilePills
                        files={replyFiles}
                        onRemove={(i) => setReplyFiles((fs) => fs.filter((_, x) => x !== i))}
                      />
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                        <FileText className="size-4" /> Adjuntar captura o PDF
                        <input
                          type="file"
                          multiple
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const sel = Array.from(e.target.files || []);
                            setReplyFiles((fs) => [...fs, ...sel]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Este ticket está cerrado. Abre uno nuevo si necesitas algo más.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo ticket de soporte</DialogTitle>
            <DialogDescription>
              Cuéntanos qué pasó: el administrador te responderá aquí y por correo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Asunto</Label>
              <Input
                className="h-11"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Ej: No puedo cargar un préstamo"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>¿Qué pasó?</Label>
              <Textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={4}
                placeholder="Describe el problema o la pregunta con detalle…"
              />
            </div>
            <FilePills
              files={newFiles}
              onRemove={(i) => setNewFiles((fs) => fs.filter((_, x) => x !== i))}
            />
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary">
              <FileText className="size-4" /> Adjuntar capturas o PDF
              <input
                type="file"
                multiple
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const sel = Array.from(e.target.files || []);
                  setNewFiles((fs) => [...fs, ...sel]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenNew(false)}>
              Cancelar
            </Button>
            <Button variant="accent" disabled={sending} onClick={crear}>
              {sending ? "Enviando…" : "Enviar ticket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
