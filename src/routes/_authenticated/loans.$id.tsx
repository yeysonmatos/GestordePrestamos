import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  EllipsisVertical,
  FileText,
  MessageCircle,
  Pencil,
  Undo2,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Chip, Money, StatusChip } from "@/components/money";
import { PayDialog, ReceiptDialog } from "@/components/pay-dialog";
import type { PayTarget, Receipt } from "@/components/pay-dialog";
import { buildClientMessage } from "@/lib/messages";
import { receiptFromPayment } from "@/lib/receipt";
import { shareLoanHistoryPdf } from "@/lib/loan-history-pdf";
import { useGuardedAction } from "@/hooks/use-guarded-action";
import { useInstallments, useLoan, usePayments, useProfile } from "@/lib/db";
import {
  addPeriods,
  formatDate,
  formatDateTime,
  formatReceiptDate,
  installmentStatus,
  lateFee,
  LOAN_STATUS_LABEL,
  periodicRatePct,
  rd,
  todaySD,
} from "@/lib/finance";
import type { Frequency } from "@/lib/finance";
import {
  archiveLoan,
  payCapital,
  reversePayment,
  settleLoan,
  settlementQuote,
  whatsappLink,
} from "@/lib/actions";
import { getPaymentLabel } from "@/lib/payment-labels";

export const Route = createFileRoute("/_authenticated/loans/$id")({
  head: () => ({
    meta: [
      { title: "Detalle del préstamo | Gestor de Prestamos" },
      { name: "description", content: "Cuotas, pagos, liquidación y contrato del préstamo." },
      { property: "og:title", content: "Detalle del préstamo | Gestor de Prestamos" },
      { property: "og:description", content: "Cuotas, pagos y contrato del préstamo." },
    ],
  }),
  component: LoanDetail,
});

function LoanDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: loan, isLoading } = useLoan(id);
  const { data: installments = [] } = useInstallments(id);
  const { data: payments = [] } = usePayments(id);
  const { data: profile } = useProfile();

  const [target, setTarget] = useState<PayTarget | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [abono, setAbono] = useState<string | null>(null);
  const [liquidar, setLiquidar] = useState(false);
  const [contrato, setContrato] = useState(false);
  const [reverso, setReverso] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [abonoFecha, setAbonoFecha] = useState(todaySD());

  const { busy, run } = useGuardedAction();

  const isOpen = loan?.open_ended === true;
  const editable =
    !!loan &&
    loan.status !== "archivado" &&
    Number(loan.paid_amount) === 0 &&
    Number(loan.paid_installments) === 0 &&
    payments.filter((p) => !p.reversed).length === 0;

  const totals = useMemo(() => {
    if (loan?.open_ended) {
      const pagado = payments.filter((p) => !p.reversed).reduce((s, p) => s + Number(p.amount), 0);
      return {
        total: Number(loan.principal),
        pagado,
        pendiente: Number(loan.remaining_amount),
        vencidas: 0,
        mora: 0,
      };
    }
    const total = installments.reduce((s, i) => s + Number(i.total_amount), 0);
    const pagado = installments.reduce((s, i) => s + Number(i.paid_amount), 0);
    const vencidas = installments.filter((i) => installmentStatus(i) === "vencida");
    const mora = vencidas.reduce(
      (s, i) =>
        s +
        lateFee({
          dueDate: i.due_date,
          pending: Number(i.total_amount) - Number(i.paid_amount),
          lateFeeRate: Number(loan?.late_fee_rate ?? 0),
        }),
      0,
    );
    return { total, pagado, pendiente: total - pagado, vencidas: vencidas.length, mora };
  }, [installments, loan, payments]);

  const quote = useMemo(() => {
    if (!loan) return { capital: 0, interes: 0, mora: 0, total: 0, cuotas: 0 };
    const good = payments.filter((p) => !p.reversed);
    const lastPaid = good
      .map((p) => p.paid_at)
      .sort()
      .pop();
    const capitalPaid = good.reduce((s, p) => s + Number(p.principal_portion || 0), 0);
    return settlementQuote({
      loan,
      installments,
      mora: loan.open_ended ? 0 : totals.mora,
      lastPaymentDate: lastPaid ?? null,
      capitalPaid,
    });
  }, [loan, installments, payments, totals.mora]);

  const lastPaidId = useMemo(() => {
    const good = payments
      .filter((p) => !p.reversed)
      .slice()
      .sort(
        (a, b) =>
          String(a.paid_at).localeCompare(String(b.paid_at)) ||
          String(a.created_at).localeCompare(String(b.created_at)),
      );
    return good.length > 0 ? String(good[good.length - 1]?.id ?? "") : null;
  }, [payments]);

  /** Fecha del período de interés que se debe (abiertos): primer pago + pagos de interés ya hechos. */
  const interesDueDate = useMemo(() => {
    if (!loan?.open_ended) return null;
    const hechos = payments.filter(
      (p) => !p.reversed && !p.installment_id && Number(p.principal_portion) === 0,
    ).length;
    return addPeriods(loan.first_payment_date, (loan.frequency as Frequency) || "mensual", hechos);
  }, [loan, payments]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!loan) return <p className="text-sm text-muted-foreground">Préstamo no encontrado.</p>;

  const proxima = installments.find((i) => installmentStatus(i) !== "pagada");
  const pagadasCount = installments.filter((i) => installmentStatus(i) === "pagada").length;

  async function doAbono() {
    const amount = Number(abono);
    if (!amount || amount <= 0) {
      toast.error("Escribe un monto válido");
      return;
    }
    if (amount > quote.capital + 0.005) {
      toast.error("El abono no puede superar el capital pendiente. Usa Liquidación para cerrarlo.");
      return;
    }
    await run(async () => {
      try {
        const r = await payCapital({
          loan: loan!,
          amount,
          method: metodo,
          paymentDate: abonoFecha,
        });
        await queryClient.invalidateQueries();
        toast.success("Abono a capital registrado");
        setAbono(null);
        // Recibo del abono a capital.
        setReceipt({
          paymentId: r.payment.id,
          business: profile?.business_name ?? "Gestor de Prestamos",
          client: loan!.client?.full_name ?? "Cliente",
          loanDisplayId: loan!.loan_id ?? "",
          payType: "Abono a capital",
          method:
            {
              efectivo: "Efectivo",
              transferencia: "Transferencia",
              deposito: "Depósito",
              otro: "Otro",
            }[metodo] ?? metodo,
          amount,
          capital: amount,
          interest: 0,
          late: 0,
          date: r.payment.payment_date,
          newBalance: Math.max(0, Number(loan!.remaining_amount) - amount),
          phone: loan!.client?.phone ?? null,
          whatsapp: loan!.client?.whatsapp ?? null,
          notes: null,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo registrar");
      }
    });
  }

  async function doLiquidar() {
    await run(async () => {
      try {
        const r = await settleLoan({
          loan: loan!,
          total: quote.total,
          interest: quote.interes,
          late: quote.mora,
        });
        await queryClient.invalidateQueries();
        toast.success("Préstamo liquidado");
        setLiquidar(false);
        // Recibo de la liquidación.
        setReceipt({
          paymentId: r.payment.id,
          business: profile?.business_name ?? "Gestor de Prestamos",
          client: loan!.client?.full_name ?? "Cliente",
          loanDisplayId: loan!.loan_id ?? "",
          payType: "Liquidación",
          method: "Efectivo",
          amount: quote.total,
          capital: quote.capital,
          interest: quote.interes,
          late: quote.mora,
          date: r.payment.payment_date,
          newBalance: 0,
          phone: loan!.client?.phone ?? null,
          whatsapp: loan!.client?.whatsapp ?? null,
          notes: null,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo liquidar");
      }
    });
  }

  async function doReverso() {
    if (!reverso || !motivo.trim()) {
      toast.error("Escribe el motivo de la reversión");
      return;
    }
    await run(async () => {
      try {
        await reversePayment({ paymentId: reverso, reason: motivo });
        await queryClient.invalidateQueries();
        toast.success("Pago revertido");
        setReverso(null);
        setMotivo("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo revertir");
      }
    });
  }

  /** Reenvía el recibo de un pago ya guardado (copia del original). */
  function verRecibo(p: (typeof payments)[number]) {
    if (!loan || p.reversed) return;
    setReceipt(
      receiptFromPayment({
        payment: p,
        loan,
        clientName: loan.client?.full_name ?? "Cliente",
        business: profile?.business_name ?? "Gestor de Prestamos",
        phone: loan.client?.phone ?? null,
        whatsapp: loan.client?.whatsapp ?? null,
        installmentNumber: installments.find((x) => x.id === p.installment_id)?.number ?? null,
        payments,
        currentBalance: Number(loan.remaining_amount ?? 0),
      }),
    );
  }

  /** PDF con el historial de pagos del préstamo (para el deudor). */
  async function historialPdf() {
    if (!loan) return;
    const rows = payments
      .filter((p) => !p.reversed)
      .slice()
      .sort((a, b) =>
        String(a.payment_date ?? a.paid_at).localeCompare(String(b.payment_date ?? b.paid_at)),
      );
    const totals = rows.reduce(
      (acc, p) => ({
        amount: acc.amount + Number(p.amount || 0),
        capital: acc.capital + Number(p.principal_portion || 0),
        interest: acc.interest + Number(p.interest_portion || 0),
        late: acc.late + Number(p.late_fee || 0),
      }),
      { amount: 0, capital: 0, interest: 0, late: 0 },
    );
    const nextPending = installments.find((i) => installmentStatus(i) !== "pagada");
    try {
      const how = await shareLoanHistoryPdf({
        business: profile?.business_name ?? "Gestor de Prestamos",
        client: loan.client?.full_name ?? "Cliente",
        loanDisplayId: loan.loan_id ?? "",
        typeLabel: loan.open_ended ? "Solo interés (abierto)" : "Cuota fija",
        principal: Number(loan.principal),
        rateLabel: `${Number(loan.interest_rate)}% mensual`,
        frequencyLabel: loan.frequency
          ? loan.frequency.charAt(0).toUpperCase() + loan.frequency.slice(1)
          : "—",
        startLabel: formatDate(loan.start_date),
        rows: rows.map((p) => ({
          date: p.payment_date ?? p.paid_at,
          concept: getPaymentLabel(p, {
            installmentNumber: installments.find((x) => x.id === p.installment_id)?.number ?? null,
            includeMethod: false,
          }),
          amount: Number(p.amount),
          capital: Number(p.principal_portion),
          interest: Number(p.interest_portion),
          late: Number(p.late_fee),
        })),
        totals,
        balance: Math.max(0, Number(loan.remaining_amount ?? 0)),
        nextDue: nextPending ? formatDate(nextPending.due_date) : null,
        issuedLabel: formatReceiptDate(todaySD()),
      });
      toast.success(how === "shared" ? "Historial listo para compartir" : "Historial descargado");
    } catch {
      toast.error("No se pudo generar el historial");
    }
  }

  async function toggleArchive() {
    await run(async () => {
      await archiveLoan(loan!.id, loan!.status !== "archivado");
      await queryClient.invalidateQueries();
      toast.success(loan!.status === "archivado" ? "Préstamo reactivado" : "Préstamo archivado");
    });
  }

  const mensaje = buildClientMessage({
    clientName: loan.client?.full_name ?? "",
    businessName: profile?.business_name ?? "Gestor de Prestamos",
    balance: Number(loan.remaining_amount ?? 0),
    nextDue: proxima?.due_date ?? null,
  });

  const waNumber = loan.client?.whatsapp || loan.client?.phone;
  const freqLabel = loan.frequency
    ? loan.frequency.charAt(0).toUpperCase() + loan.frequency.slice(1)
    : "—";
  const lastDue = installments.length > 0 ? installments[installments.length - 1]?.due_date : null;

  return (
    <>
      <PageHeader
        title={loan.client?.full_name ?? "Préstamo"}
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Documentos y contacto"
                title="Documentos y contacto"
              >
                <EllipsisVertical className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setContrato(true)}>
                <FileText className="size-4" /> Contrato
              </DropdownMenuItem>
              {waNumber ? (
                <DropdownMenuItem asChild>
                  <a href={whatsappLink(waNumber, mensaje)} target="_blank" rel="noreferrer">
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard
                      .writeText(mensaje)
                      .then(() => toast.info("Mensaje copiado (sin teléfono)"));
                  }}
                >
                  <MessageCircle className="size-4" /> Copiar mensaje
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {loan.status === "archivado" && (
        <div className="mb-4 rounded-xl border border-border bg-secondary px-4 py-3 text-sm">
          Este préstamo está archivado. No aparece en cobros ni en el resumen.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total del préstamo" value={rd(totals.total)} />
        <Stat label="Pagado" value={rd(totals.pagado)} tone="success" />
        <Stat label="Pendiente" value={rd(totals.pendiente)} />
        <Stat label="Mora acumulada" value={rd(totals.mora)} tone="danger" />
      </div>

      <div className="no-print mt-4 flex flex-wrap gap-2">
        <Chip
          tone={
            loan.status === "en_curso" ? "info" : loan.status === "pagado" ? "success" : "neutral"
          }
        >
          {LOAN_STATUS_LABEL[loan.status] ?? loan.status}
        </Chip>
        {!isOpen && installments.length > 0 && (
          <Chip tone="neutral">
            {pagadasCount}/{installments.length} pagadas
          </Chip>
        )}
        {totals.vencidas > 0 && <Chip tone="danger">{totals.vencidas} cuotas vencidas</Chip>}
        <div className="ml-auto flex flex-wrap gap-2">
          {isOpen && (
            <Button
              size="sm"
              variant="accent"
              className="px-2 sm:px-3"
              aria-label="Cobrar interés"
              onClick={() =>
                setTarget({
                  mode: "open",
                  loan,
                  businessName: profile?.business_name ?? "Mi Negocio",
                  graceDays: profile?.grace_days ?? 0,
                  ...(interesDueDate ? { dueDate: interesDueDate } : {}),
                })
              }
            >
              Cobrar
              <span className="hidden sm:inline">&nbsp;interés</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="px-2 sm:px-3"
            aria-label="Abono a capital"
            onClick={() => setAbono("")}
          >
            Abono a capital
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="px-2 sm:px-3"
            onClick={() => setLiquidar(true)}
          >
            Liquidar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                aria-label="Más acciones"
                title="Más acciones"
              >
                <EllipsisVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {editable && (
                <DropdownMenuItem asChild>
                  <Link to="/loans/new" search={{ client: undefined, edit: loan.id }}>
                    <Pencil className="size-4" /> Editar
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={toggleArchive} disabled={busy}>
                <Archive className="size-4" />
                {loan.status === "archivado" ? "Reactivar" : "Archivar"}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/clients/$id" params={{ id: loan.client_id }}>
                  <User className="size-4" /> Ver cliente
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="surface mt-4 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Datos del préstamo
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          <Dato label="Monto" value={rd(Number(loan.principal))} />
          <Dato
            label="Tipo"
            value={loan.loan_type === "solo_interes" ? "Solo interés" : "Cuota fija"}
          />
          <Dato label="Inicio (entrega)" value={formatDate(loan.start_date)} />
          <Dato label="Primer pago" value={formatDate(loan.first_payment_date)} />
          <Dato label="Frecuencia" value={freqLabel} />
          <Dato label="Cuotas" value={isOpen ? "Abierto (solo interés)" : String(loan.term)} />
          <Dato label="Tasa mensual" value={`${Number(loan.interest_rate)}%`} />
          {Number(loan.late_fee_rate) > 0 && (
            <Dato label="Mora diaria" value={`${Number(loan.late_fee_rate)}%`} />
          )}
          {isOpen && loan.payment_day ? (
            <Dato label="Día de pago" value={`Día ${loan.payment_day}`} />
          ) : null}
          {!isOpen && lastDue ? (
            <Dato label="Último vencimiento" value={formatDate(lastDue)} />
          ) : null}
          <Dato label="Nº de préstamo" value={loan.loan_id || "—"} />
        </div>
      </div>

      <Tabs defaultValue="cuotas" className="mt-6">
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="cuotas">{isOpen ? "Resumen" : "Cuotas"}</TabsTrigger>
            <TabsTrigger value="pagos">Pagos ({payments.length})</TabsTrigger>
          </TabsList>
          {payments.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={historialPdf}
              disabled={busy}
              aria-label="Historial de pagos (PDF)"
              title="Historial de pagos (PDF)"
            >
              <FileText className="size-4" />
            </Button>
          )}
        </div>

        <TabsContent value="cuotas" className="mt-4">
          {isOpen ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Préstamo abierto
                </p>
                <p className="mt-1 font-display text-base font-semibold">
                  Solo interés · sin cuotas fijas
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  El cliente paga {loan.interest_rate}% mensual (
                  {Math.round(periodicRatePct(loan.interest_rate, loan.frequency) * 10000) / 100}%
                  por pago {loan.frequency}) y devuelve el capital ({rd(Number(loan.principal))}) al
                  liquidar.
                </p>
              </div>
              <div className="surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Interés por período
                </p>
                <Money
                  value={Number(loan.installment_amount)}
                  className="num mt-1 font-display text-lg font-bold"
                />
                {loan.payment_day && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Día de pago sugerido: {loan.payment_day} de cada período
                  </p>
                )}
              </div>
              <div className="surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Capital restante
                </p>
                <Money
                  value={Number(loan.remaining_amount)}
                  className="num mt-1 font-display text-lg font-bold"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Se devuelve al liquidar el préstamo
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {installments.map((i) => {
                const st = installmentStatus(i);
                const pending = Number(i.total_amount) - Number(i.paid_amount);
                const mora = lateFee({
                  dueDate: i.due_date,
                  pending,
                  lateFeeRate: Number(loan.late_fee_rate),
                });
                return (
                  <div key={i.id} className="surface p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-display text-sm font-semibold">Cuota {i.number}</p>
                        {st === "pagada" ? (
                          <p className="text-xs text-muted-foreground">
                            Pagada {formatDate(i.paid_at ?? i.due_date)}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Vence {formatDate(i.due_date)}
                          </p>
                        )}
                      </div>
                      <StatusChip status={st} />
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Cuota</p>
                        <Money value={i.total_amount} className="font-semibold" />
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Saldo</p>
                        <Money value={pending} className="font-semibold" />
                      </div>
                    </div>
                    {mora > 0 && (
                      <p className="mt-2 text-xs font-semibold text-destructive">
                        Mora acumulada {rd(mora)}
                      </p>
                    )}
                    {st !== "pagada" && loan.status !== "archivado" && (
                      <Button
                        size="sm"
                        variant="accent"
                        className="mt-3 w-full"
                        onClick={() =>
                          setTarget({
                            mode: "installment",
                            loanId: loan.id,
                            clientId: loan.client?.id ?? "",
                            displayId: loan.loan_id ?? "",
                            inst: i,
                            clientName: loan.client?.full_name ?? "Cliente",
                            phone: loan.client?.phone ?? null,
                            whatsapp: loan.client?.whatsapp ?? null,
                            businessName: profile?.business_name ?? "Mi Negocio",
                            lateInterestRate: Number(loan.late_fee_rate),
                            graceDays: profile?.grace_days ?? 0,
                            prepaidBalance: loan.prepaid_balance ?? 0,
                          })
                        }
                      >
                        Registrar pago
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pagos" className="mt-4">
          {payments.length === 0 ? (
            <div className="surface p-8 text-center text-sm text-muted-foreground">
              Todavía no hay pagos registrados.
            </div>
          ) : (
            <div className="surface divide-y divide-border">
              {payments.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-semibold">
                      {getPaymentLabel(p, {
                        installmentNumber:
                          installments.find((x) => x.id === p.installment_id)?.number ?? null,
                      })}
                      {p.reversed && <span className="ml-2 text-destructive">(revertido)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(p.paid_at)}</p>
                    {p.reversal_reason && (
                      <p className="text-xs text-destructive">Motivo: {p.reversal_reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Money value={p.amount} className="font-semibold" />
                    {p.id === lastPaidId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => verRecibo(p)}
                        aria-label="Reenviar recibo"
                        title="Reenviar recibo"
                      >
                        <FileText className="size-4" />
                      </Button>
                    )}
                    {!p.reversed && p.id === lastPaidId && (
                      <Button size="sm" variant="ghost" onClick={() => setReverso(p.id)}>
                        <Undo2 className="size-4" /> Revertir
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <p className="p-3 text-xs text-muted-foreground">
                Solo el último pago registrado puede revertirse.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <PayDialog target={target} onOpenChange={(o) => !o && setTarget(null)} onPaid={setReceipt} />
      <ReceiptDialog receipt={receipt} onOpenChange={(o) => !o && setReceipt(null)} />

      {/* Abono a capital */}
      <Dialog open={abono !== null} onOpenChange={(o) => !o && setAbono(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Abono a capital</DialogTitle>
            <DialogDescription>
              El abono reduce el capital y recalcula las cuotas restantes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <div className="flex justify-between rounded-xl bg-secondary px-4 py-3 text-sm">
              <span className="text-muted-foreground">Capital actual</span>
              <Money value={quote.capital} className="font-semibold" />
            </div>
            <Label htmlFor="abono">Abono</Label>
            <Input
              id="abono"
              inputMode="decimal"
              className="h-11"
              value={abono ?? ""}
              onChange={(e) => setAbono(e.target.value)}
              placeholder="1000"
            />
            <div className="flex justify-between rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-semibold">
              <span>Capital restante</span>
              <Money value={Math.max(0, quote.capital - (Number(abono) || 0))} />
            </div>
            <p className="text-xs text-muted-foreground">
              Las cuotas pendientes se reducirán proporcionalmente.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label>Forma de pago</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="deposito">Depósito</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="abono-fecha">Fecha de pago</Label>
              <Input
                id="abono-fecha"
                type="date"
                className="h-11 w-full min-w-0"
                max={todaySD()}
                value={abonoFecha}
                onChange={(e) => setAbonoFecha(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="accent" className="w-full min-h-11" onClick={doAbono} disabled={busy}>
              {busy ? "Registrando…" : "Registrar abono"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Liquidación */}
      <Dialog open={liquidar} onOpenChange={setLiquidar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Liquidación anticipada</DialogTitle>
            <DialogDescription>
              {isOpen
                ? "Se cobra el capital pendiente más el interés del período hasta hoy."
                : "Se cobra el capital pendiente, el interés solo hasta hoy y la mora pendiente."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-xl bg-secondary p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Capital pendiente</span>
              <Money value={quote.capital} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Interés hasta hoy</span>
              <Money value={quote.interes} />
            </div>
            {quote.mora > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mora pendiente</span>
                <Money value={quote.mora} className="text-destructive" />
              </div>
            )}
            <div className="flex justify-between font-display text-base font-bold">
              <span>Total</span>
              <Money value={quote.total} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="accent" className="w-full" onClick={doLiquidar} disabled={busy}>
              {busy ? "Liquidando…" : "Confirmar liquidación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reversión */}
      <Dialog open={reverso !== null} onOpenChange={(o) => !o && setReverso(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revertir pago</DialogTitle>
            <DialogDescription>Debes indicar el motivo de la reversión.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <Input
              id="motivo"
              className="h-11"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Cheque devuelto"
            />
          </div>
          <DialogFooter>
            <Button variant="destructive" className="w-full" onClick={doReverso} disabled={busy}>
              {busy ? "Revirtiendo…" : "Revertir pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contrato imprimible */}
      <Dialog open={contrato} onOpenChange={setContrato}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-auto">
          <DialogHeader>
            <DialogTitle>Contrato de préstamo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed">
            <div className="text-center">
              <p className="font-display text-lg font-bold">
                {profile?.business_name ?? "Mi Negocio"}
              </p>
              <p className="text-xs text-muted-foreground">
                Contrato de préstamo personal · Santo Domingo, R.D.
              </p>
            </div>
            <p>
              {isOpen ? (
                <>
                  Entre <strong>{profile?.business_name ?? "el prestamista"}</strong> y{" "}
                  <strong>{loan.client?.full_name}</strong> se acuerda un{" "}
                  <strong>préstamo abierto</strong> por{" "}
                  <strong>{rd(Number(loan.principal))}</strong>, a una tasa mensual de{" "}
                  <strong>{loan.interest_rate}%</strong>, iniciando el{" "}
                  <strong>{formatDate(loan.first_payment_date)}</strong>.
                </>
              ) : (
                <>
                  Entre <strong>{profile?.business_name ?? "el prestamista"}</strong> y{" "}
                  <strong>{loan.client?.full_name}</strong> se acuerda un préstamo por{" "}
                  <strong>{rd(Number(loan.principal))}</strong>, a una tasa mensual de{" "}
                  <strong>{loan.interest_rate}%</strong>, pagadero en <strong>{loan.term}</strong>{" "}
                  cuotas de frecuencia <strong>{loan.frequency}</strong>, iniciando el{" "}
                  <strong>{formatDate(loan.first_payment_date)}</strong>.
                </>
              )}
            </p>
            <p>
              {isOpen ? (
                <>
                  El cliente paga un interés de{" "}
                  <strong>{rd(Number(loan.installment_amount))}</strong> por período, mientras el
                  capital ({rd(Number(loan.principal))}) se devuelve al liquidar. El retraso en el
                  interés genera una mora de <strong>{loan.late_fee_rate}%</strong> diaria sobre el
                  monto vencido.
                </>
              ) : (
                <>
                  El monto total a pagar asciende a <strong>{rd(totals.total)}</strong>. Toda cuota
                  atrasada genera una mora de <strong>{loan.late_fee_rate}%</strong> diaria sobre el
                  saldo vencido.
                </>
              )}
            </p>
            {!isOpen && (
              <table className="w-full text-xs">
                <thead className="bg-secondary text-left">
                  <tr>
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">Vence</th>
                    <th className="px-2 py-1 text-right">Capital</th>
                    <th className="px-2 py-1 text-right">Interés</th>
                    <th className="px-2 py-1 text-right">Cuota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {installments.map((i) => (
                    <tr key={i.id}>
                      <td className="px-2 py-1">{i.number}</td>
                      <td className="px-2 py-1">{formatDate(i.due_date)}</td>
                      <td className="num px-2 py-1 text-right">{rd(Number(i.principal_amount))}</td>
                      <td className="num px-2 py-1 text-right">{rd(Number(i.interest_amount))}</td>
                      <td className="num px-2 py-1 text-right">{rd(Number(i.total_amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs">
              <div className="border-t border-foreground pt-2">Prestamista</div>
              <div className="border-t border-foreground pt-2">{loan.client?.full_name}</div>
            </div>
          </div>
          <DialogFooter className="no-print">
            <Button variant="secondary" className="w-full" onClick={() => window.print()}>
              Imprimir contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "";
  return (
    <div className="surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`num mt-1 font-display text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
