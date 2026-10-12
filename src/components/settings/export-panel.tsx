import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  useAllInstallments,
  useAllPayments,
  useClients,
  useLoans,
} from "@/lib/db";
import { installmentStatus, nextDueDateAfter, todaySD } from "@/lib/finance";
import { downloadXlsx } from "@/lib/xlsx";

const ESTADO_LOAN: Record<string, string> = {
  en_curso: "En curso",
  pagado: "Pagado",
  archivado: "Archivado",
};

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

type Row = (string | number | null | undefined)[];

export function ExportPanel() {
  const { data: loans = [] } = useLoans();
  const { data: clients = [] } = useClients();
  const { data: installments = [] } = useAllInstallments();
  const { data: payments = [] } = useAllPayments();
  const [busy, setBusy] = useState<string | null>(null);

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const loanById = new Map(loans.map((l) => [l.id, l]));
  const today = todaySD();

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
      toast.success("Archivo generado. Revisa tus descargas.");
    } catch {
      toast.error("No se pudo generar el archivo.");
    } finally {
      setBusy(null);
    }
  }

  function exportLoans() {
    const headers = [
      "No.", "Cliente", "Teléfono", "Monto", "Por cobrar", "Tipo", "Frecuencia",
      "Cuotas pagadas", "Cuotas total", "Estado", "Inicio", "Próximo vencimiento",
    ];
    const rows: Row[] = loans
      .filter((l) => l.status !== "archivado")
      .map((l) => {
        const c = clientById.get(l.client_id);
        const insts = installments.filter((i) => i.loan_id === l.id);
        const next = insts
          .filter((i) => i.due_date.slice(0, 10) >= today && installmentStatus(i) !== "pagada")
          .map((i) => i.due_date.slice(0, 10))
          .sort()[0];
        const prox = l.open_ended
          ? nextDueDateAfter(l.first_payment_date, l.payment_day, today)
          : next ?? "";
        return [
          l.loan_id,
          c?.full_name ?? "",
          c?.phone ?? "",
          Number(l.principal),
          Number(l.remaining_amount),
          l.open_ended ? "Solo interés" : "Francesa",
          l.frequency,
          l.paid_installments,
          l.open_ended ? "—" : l.term,
          ESTADO_LOAN[l.status] ?? l.status,
          l.start_date.slice(0, 10),
          prox,
        ];
      });
    return downloadXlsx(headers, rows, `prestamos-${stamp()}`);
  }

  function exportPayments() {
    const headers = [
      "No.", "Cliente", "Monto", "Capital", "Interés", "Mora", "Tipo", "Método",
      "Estado", "Fecha", "Notas",
    ];
    const rows: Row[] = payments.map((p) => {
      const loan = loanById.get(p.loan_id);
      return [
        loan?.loan_id ?? p.loan_id,
        (loan && clientById.get(loan.client_id)?.full_name) ?? "",
        Number(p.amount),
        Number(p.principal_portion),
        Number(p.interest_portion),
        Number(p.late_fee),
        p.kind,
        p.method,
        p.reversed ? "Revertido" : "Confirmado",
        String(p.paid_at).slice(0, 10),
        p.note ?? "",
      ];
    });
    return downloadXlsx(headers, rows, `cobros-historial-${stamp()}`);
  }

  function exportPending() {
    const headers = ["No.", "Cliente", "Teléfono", "Cuota", "Monto", "Frecuencia", "Vence", "Estado"];
    const rows: Row[] = installments
      .filter((i) => i.loan?.status === "en_curso" && installmentStatus(i) !== "pagada")
      .map((i) => {
        const c = i.loan?.client;
        return [
          i.loan?.display_id ?? "",
          c?.full_name ?? "",
          c?.phone ?? "",
          i.number,
          Math.max(Number(i.total_amount) - Number(i.paid_amount), 0),
          i.loan?.frequency ?? "",
          i.due_date.slice(0, 10),
          installmentStatus(i) === "vencida" ? "Vencida" : "Pendiente",
        ];
      })
      .sort((a, b) => String(a[6]).localeCompare(String(b[6])));
    return downloadXlsx(headers, rows, `cobros-pendientes-${stamp()}`);
  }

  const items = [
    {
      key: "loans",
      title: "Préstamos",
      desc: "Todos tus préstamos activos y pagados con saldo y próximo vencimiento.",
      fn: exportLoans,
    },
    {
      key: "payments",
      title: "Historial de cobros",
      desc: "Cada pago registrado: capital, interés, mora, método y fecha.",
      fn: exportPayments,
    },
    {
      key: "pending",
      title: "Cobros pendientes",
      desc: "Cuotas por cobrar ordenadas por fecha de vencimiento.",
      fn: exportPending,
    },
  ];

  return (
    <div className="space-y-3">
      {items.map((it) => (
        <div key={it.key} className="surface flex items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <FileSpreadsheet className="size-5 text-success" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold">{it.title}</p>
              <p className="text-xs text-muted-foreground">{it.desc}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0"
            disabled={busy !== null}
            onClick={() => run(it.key, it.fn)}
          >
            {busy === it.key ? "Generando…" : "Descargar .xlsx"}
          </Button>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Los archivos se abren en Excel o Google Sheets. Incluye solo los datos de tu negocio.
      </p>
    </div>
  );
}
