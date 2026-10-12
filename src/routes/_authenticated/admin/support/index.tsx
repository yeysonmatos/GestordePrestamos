import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/finance";
import { ArrowLeft, Send, X, Search, MessageCircle } from "lucide-react";
import { supportList } from "@/lib/admin-fns";
import { PageHeader } from "@/components/app-shell";

interface Ticket {
  id: string;
  subject: string;
  body: string;
  status: "open" | "replied" | "closed";
  priority: "low" | "normal" | "high";
  created_at: string;
  updated_at: string;
  user_id: string;
  author_name: string | null;
  type?: string | null;
}

const STATUS_BADGE: Record<
  Ticket["status"],
  { variant: "default" | "secondary" | "destructive" | "outline"; className?: string; label: string }
> = {
  open: { variant: "secondary", label: "Abierto" },
  replied: { variant: "outline", className: "border-success/50 text-success", label: "Respondido" },
  closed: { variant: "outline", label: "Cerrado" },
};

const PRIORITY_BADGE: Record<
  Ticket["priority"],
  { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
> = {
  low: { variant: "outline", label: "Baja" },
  normal: { variant: "secondary", label: "Normal" },
  high: { variant: "destructive", label: "Alta" },
};

const TABS: { key: "" | "open" | "closed"; label: string }[] = [
  { key: "", label: "Todos" },
  { key: "open", label: "Abiertos" },
  { key: "closed", label: "Cerrados" },
];

export const Route = createFileRoute("/_authenticated/admin/support/")({
  component: AdminSupport,
});

function AdminSupport() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"" | "open" | "closed">("open");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [SearchInput, setSearchInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supportList({
        data: {
          status: tab || undefined,
          priority: priority && priority !== "all" ? priority : undefined,
          q: q || undefined,
          type: type && type !== "all" ? type : undefined,
        },
      });
      setTickets((data.tickets || []) as Ticket[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    }
    setLoading(false);
  }, [tab, priority, q, type]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader title="Soporte" subtitle="Tickets recibidos de los suscriptores de la plataforma" />
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-11 rounded-md px-3 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={SearchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setQ(SearchInput.trim());
            }}
            placeholder="Buscar por asunto o usuario (Enter)..."
            className="min-h-11 pl-9"
          />
        </div>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="min-h-11 w-[160px]">
            <SelectValue placeholder="Toda prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda prioridad</SelectItem>
            <SelectItem value="low">Baja</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="min-h-11 w-[200px]">
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="upgrade_request">Upgrade de plan</SelectItem>
            <SelectItem value="support">Soporte general</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Cargando tickets...</div>
      ) : tickets.length === 0 ? (
        <Card className="py-12 text-center">
          <MessageCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No hay tickets en esta vista.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const st = STATUS_BADGE[t.status];
            const pr = PRIORITY_BADGE[t.priority];
            return (
              <Link key={t.id} to="/admin/support/$id" params={{ id: t.id }}>
                <Card className="cursor-pointer p-4 transition-colors hover:border-primary">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{t.subject}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t.author_name || "Usuario"} · {formatDate(t.updated_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge variant={st.variant} className={st.className}>{st.label}</Badge>
                      <Badge variant={pr.variant}>{pr.label}</Badge>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}





