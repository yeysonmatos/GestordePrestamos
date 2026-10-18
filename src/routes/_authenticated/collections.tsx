import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Inbox, MessageCircle, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, Money, StatusChip } from "@/components/money";
import { PayDialog, ReceiptDialog } from "@/components/pay-dialog";
import type { PayTarget, Receipt } from "@/components/pay-dialog";
import {
  useAllInstallments,
  useLoans,
  usePaymentsForLoans,
  useProfile,
  useRecentPayments,
} from "@/lib/db";
import type { InstallmentFull, LoanWithClient } from "@/lib/db";
import { getPaymentLabel } from "@/lib/payment-labels";
import { buildCollectReminder, whatsappUrl } from "@/lib/messages";
import {
  addPeriods,
  daysBetween,
  formatDate,
  installmentStatus,
  lateFee,
  moraDays,
  rd,
  todaySD,
} from "@/lib/finance";
import type { Frequency } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/collections")({
  head: () => ({
    meta: [
      { title: "Cobros | Gestor de Prestamos" },
      {
        name: "description",
        content: "Cobros de hoy, vencidos, próximos e historial con mora calculada.",
      },
      { property: "og:title", content: "Cobros | Gestor de Prestamos" },
      { property: "og:description", content: "Ruta de cobro del día con mora y días de gracia." },
    ],
  }),
  component: Collections,
});

const TABS = ["Hoy", "Vencidos", "Próximos", "Historial"] as const;
type Tab = (typeof TABS)[number];

type Row =
  | { kind: "installment"; id: string; inst: InstallmentFull; due: string }
  | { kind: "open"; id: string; loanId: string; due: string };

function Collections() {
  const { data: installments = [] } = useAllInstallments();
  const { data: loans = [] } = useLoans();
  // Los pagos se cargan acotados: los de préstamos ABIERTOS (para contar sus períodos
  // de interés) y solo los últimos N para el historial (antes se descargaban TODOS).
  const openLoanIds = useMemo(() => loans.filter((l) => l.open_ended).map((l) => l.id), [loans]);
  const { data: interestPayments = [] } = usePaymentsForLoans(openLoanIds);
  const [histLimit, setHistLimit] = useState(20);
  const { data: payments = [] } = useRecentPayments(histLimit + 1);
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("Hoy");
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<PayTarget | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const today = todaySD();
  const grace = profile?.grace_days ?? 0;
  const business = profile?.business_name ?? "Mi Negocio";

  const loanById = useMemo(() => new Map(loans.map((l) => [l.id, l])), [loans]);
  const instById = useMemo(() => new Map(installments.map((i) => [i.id, i])), [installments]);

  const openEndedRows = useMemo(() => {
    // Cada pago de interés (sin cuota y sin capital) cubre un período: el que se
    // debe es el primero sin pagar, NO el próximo (ese era el bug de "Vencidos").
    const periodosPagados = new Map<string, number>();
    for (const p of interestPayments) {
      if (p.reversed || p.installment_id) continue;
      if (Number(p.principal_portion) > 0) continue;
      periodosPagados.set(p.loan_id, (periodosPagados.get(p.loan_id) ?? 0) + 1);
    }
    return loans
      .filter((l) => l.open_ended && l.status === "en_curso" && Number(l.installment_amount) > 0)
      .map((l) => ({
        id: `open_${l.id}`,
        loan: l,
        due: addPeriods(
          l.first_payment_date,
          (l.frequency as Frequency) || "mensual",
          periodosPagados.get(l.id) ?? 0,
        ),
      }));
  }, [loans, interestPayments]);

  const groups = useMemo(() => {
    const vivas = installments.filter(
      (i) => i.loan?.status === "en_curso" && installmentStatus(i) !== "pagada",
    );
    const instRows = (list: InstallmentFull[], test: (i: InstallmentFull) => boolean) =>
      list
        .filter(test)
        .map<Row>((i) => ({ kind: "installment", id: i.id, inst: i, due: i.due_date }));
    const openRows = (test: (due: string) => boolean) =>
      openEndedRows
        .filter((o) => test(o.due))
        .map<Row>((o) => ({ kind: "open", id: o.id, loanId: o.loan.id, due: o.due }));

    return {
      Hoy: [...instRows(vivas, (i) => i.due_date === today), ...openRows((d) => d === today)],
      Vencidos: [
        ...instRows(vivas, (i) => daysBetween(i.due_date, today) > 0),
        ...openRows((d) => d < today),
      ],
      Próximos: [
        ...instRows(vivas, (i) => {
          const d = daysBetween(today, i.due_date);
          return d > 0 && d <= 14;
        }),
        ...openRows((d) => d > today),
      ],
    } as Record<Exclude<Tab, "Historial">, Row[]>;
  }, [installments, openEndedRows, today]);

  function matches(row: Row): boolean {
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    if (row.kind === "installment") {
      const c = row.inst.loan?.client;
      return (c?.full_name ?? "").toLowerCase().includes(t) || (c?.phone ?? "").includes(t);
    }
    const l = loanById.get(row.loanId);
    return (
      (l?.client?.full_name ?? "").toLowerCase().includes(t) ||
      (l?.client?.phone ?? "").includes(t) ||
      (l?.loan_id ?? "").toLowerCase().includes(t)
    );
  }

  const rows = tab === "Historial" ? [] : groups[tab].filter(matches);
  const pendingTotal = rows.reduce((s, r) => {
    if (r.kind === "installment")
      return s + (Number(r.inst.total_amount) - Number(r.inst.paid_amount));
    return s + Number(loanById.get(r.loanId)?.installment_amount ?? 0);
  }, 0);

  function buildTarget(row: Row): PayTarget | null {
    if (row.kind === "open") {
      const loan = loanById.get(row.loanId);
      if (!loan) return null;
      return { mode: "open", loan, businessName: business, graceDays: grace };
    }
    const inst = row.inst;
    if (!inst.loan) return null;
    return {
      mode: "installment",
      loanId: inst.loan.id,
      clientId: inst.loan.client?.id ?? "",
      displayId: inst.loan.display_id,
      inst,
      clientName: inst.loan.client?.full_name ?? "Cliente",
      phone: inst.loan.client?.phone ?? null,
      whatsapp: inst.loan.client?.whatsapp ?? null,
      businessName: business,
      lateInterestRate: inst.loan.late_fee_rate,
      graceDays: grace,
      prepaidBalance: inst.loan.prepaid_balance,
    };
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["installments-all"] });
    queryClient.invalidateQueries({ queryKey: ["payments-recent"] });
    queryClient.invalidateQueries({ queryKey: ["payments-for-loans"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    queryClient.invalidateQueries({ queryKey: ["loans"] });
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  const hist = payments.slice(0, histLimit);

  return (
    <>
      <PageHeader
        title="Cobros"
        subtitle={`Ruta del ${formatDate(today)}`}
        action={
          <Button
            variant="secondary"
            size="sm"
            className="h-11 w-11 p-0"
            onClick={refresh}
            aria-label="Actualizar"
          >
            <RefreshCw className="size-4" />
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = t === "Historial" ? payments.length : groups[t].length;
          return (
            <Button
              key={t}
              variant={tab === t ? "default" : "secondary"}
              size="sm"
              className="min-h-11"
              onClick={() => {
                setTab(t);
                setHistLimit(20);
              }}
            >
              {t}
              <span className="ml-1 rounded-full bg-background/25 px-1.5 text-[11px]">{count}</span>
            </Button>
          );
        })}
      </div>

      {tab !== "Historial" && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder="Buscar por cliente o teléfono"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      )}

      {tab !== "Historial" && (
        <div className="surface mb-4 flex items-center justify-between p-4">
          <span className="text-sm text-muted-foreground">Total por cobrar en “{tab}”</span>
          <Money value={pendingTotal} className="font-display text-lg font-bold" />
        </div>
      )}

      {tab === "Historial" ? (
        payments.length === 0 ? (
          <Empty
            title="Sin cobros registrados"
            text="Los cobros aparecerán aquí cuando registres el primero."
            icon={Inbox}
          />
        ) : (
          <div className="surface divide-y divide-border">
            {hist.map((p) => {
              const loan = loanById.get(p.loan_id);
              const typeLabel = getPaymentLabel(p, {
                installmentNumber: instById.get(p.installment_id ?? "")?.number ?? null,
                includeMethod: false,
              });
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {loan?.client?.full_name ?? "Cliente"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {typeLabel} · {formatDate(p.paid_at)}
                      {p.note && !typeLabel.includes(p.note) ? ` · ${p.note}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money value={p.amount} className="text-sm font-bold text-success" />
                    <p className="text-xs capitalize text-muted-foreground">{p.method}</p>
                  </div>
                </div>
              );
            })}
            {payments.length > histLimit && (
              <button
                onClick={() => setHistLimit((v) => v + 20)}
                className="w-full py-3 text-center text-sm text-primary hover:underline"
              >
                Ver más ({payments.length - histLimit} restantes)
              </button>
            )}
          </div>
        )
      ) : rows.length === 0 ? (
        <Empty
          title={
            tab === "Vencidos"
              ? "Todo está al día"
              : tab === "Hoy"
                ? "No hay cobros para hoy"
                : "Nada próximo en 14 días"
          }
          text={q ? "Prueba con otro nombre o teléfono." : "Vuelve mañana o revisa los próximos."}
          icon={CheckCircle2}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((row) =>
            row.kind === "open" ? (
              <OpenCard
                key={row.id}
                loan={loanById.get(row.loanId)}
                due={row.due}
                business={business}
                grace={grace}
                onPay={setTarget}
                showReminder={tab === "Vencidos"}
              />
            ) : (
              <CollectionCard
                key={row.id}
                inst={row.inst}
                grace={grace}
                business={business}
                onPay={setTarget}
                showReminder={tab === "Vencidos"}
              />
            ),
          )}
        </div>
      )}

      <PayDialog target={target} onOpenChange={(o) => !o && setTarget(null)} onPaid={setReceipt} />
      <ReceiptDialog receipt={receipt} onOpenChange={(o) => !o && setReceipt(null)} />
    </>
  );
}

function Empty({
  title,
  text,
  icon: Icon,
}: {
  title: string;
  text: string;
  icon: typeof CheckCircle2;
}) {
  return (
    <div className="surface flex flex-col items-center gap-2 p-10 text-center">
      <Icon className="size-8 text-success" />
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function CollectionCard({
  inst,
  grace,
  business,
  onPay,
  showReminder,
}: {
  inst: InstallmentFull;
  grace: number;
  business: string;
  onPay: (t: PayTarget) => void;
  showReminder?: boolean;
}) {
  const pending = Number(inst.total_amount) - Number(inst.paid_amount);
  const rate = Number(inst.loan?.late_fee_rate ?? 0);
  const mora = lateFee({ dueDate: inst.due_date, pending, lateFeeRate: rate, graceDays: grace });
  const dias = moraDays(inst.due_date, grace);

  /** Abre WhatsApp con el recordatorio de la cuota (o copia el mensaje si no hay teléfono). */
  function recordar() {
    const phone = inst.loan?.client?.whatsapp || inst.loan?.client?.phone;
    const msg = buildCollectReminder({
      clientName: inst.loan?.client?.full_name ?? "Cliente",
      businessName: business,
      kind: "installment",
      lateDays: dias,
      amount: pending,
      mora,
    });
    if (phone) {
      window.open(whatsappUrl(phone, msg), "_blank");
      return;
    }
    navigator.clipboard.writeText(msg).then(() => toast.info("Sin teléfono: mensaje copiado"));
  }

  return (
    <div className="surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to="/loans/$id"
            params={{ id: inst.loan_id }}
            className="truncate font-display text-base font-semibold hover:underline"
          >
            {inst.loan?.client?.full_name ?? "Cliente"}
          </Link>
          <p className="text-xs text-muted-foreground">
            Cuota {inst.number} · vence {formatDate(inst.due_date)}
            {dias > 0 && ` · ${dias} día(s) atrasados`}
          </p>
        </div>
        <StatusChip status={installmentStatus(inst)} />
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            {Number(inst.paid_amount) > 0
              ? `Restante (${rd(inst.paid_amount)} pagado)`
              : "Saldo de la cuota"}
          </p>
          <Money value={pending} className="font-display text-lg font-bold" />
        </div>
        {mora > 0 && <Chip tone="danger">Mora {rd(mora)}</Chip>}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="accent"
          className="min-h-11 flex-1"
          onClick={() =>
            onPay({
              mode: "installment",
              loanId: inst.loan_id,
              clientId: inst.loan?.client?.id ?? "",
              displayId: inst.loan?.display_id ?? "",
              inst,
              clientName: inst.loan?.client?.full_name ?? "Cliente",
              phone: inst.loan?.client?.phone ?? null,
              whatsapp: inst.loan?.client?.whatsapp ?? null,
              businessName: business,
              lateInterestRate: rate,
              graceDays: grace,
              prepaidBalance: inst.loan?.prepaid_balance ?? 0,
            })
          }
        >
          Cobrar {rd(pending + mora)}
        </Button>
        {showReminder && (
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 w-11 shrink-0"
            onClick={recordar}
            aria-label="Recordar por WhatsApp"
            title="Recordar por WhatsApp"
          >
            <MessageCircle className="size-5 text-success" />
          </Button>
        )}
      </div>
    </div>
  );
}

function OpenCard({
  loan,
  due,
  business,
  grace,
  onPay,
  showReminder,
}: {
  loan?: LoanWithClient | undefined;
  due: string;
  business: string;
  grace: number;
  onPay: (t: PayTarget) => void;
  showReminder?: boolean;
}) {
  if (!loan) return null;
  const mora = lateFee({
    dueDate: due,
    pending: Number(loan.installment_amount),
    lateFeeRate: Number(loan.late_fee_rate),
    graceDays: grace,
  });
  const dias = moraDays(due, grace);

  /** Recordatorio del interés del período (abierto) por WhatsApp. */
  function recordar() {
    const phone = loan?.client?.whatsapp || loan?.client?.phone;
    const msg = buildCollectReminder({
      clientName: loan?.client?.full_name ?? "Cliente",
      businessName: business,
      kind: "interest",
      lateDays: dias,
      amount: Number(loan?.installment_amount ?? 0),
      mora,
      capitalPending: Number(loan?.remaining_amount ?? 0),
    });
    if (phone) {
      window.open(whatsappUrl(phone, msg), "_blank");
      return;
    }
    navigator.clipboard.writeText(msg).then(() => toast.info("Sin teléfono: mensaje copiado"));
  }

  return (
    <div className="surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to="/loans/$id"
            params={{ id: loan.id }}
            className="truncate font-display text-base font-semibold hover:underline"
          >
            {loan.client?.full_name ?? "Cliente"}
          </Link>
          <p className="text-xs text-muted-foreground">
            Interés · vence {formatDate(due)}
            {dias > 0 && ` · ${dias} día(s) atrasados`}
          </p>
        </div>
        <Chip tone="info">Abierto</Chip>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            Interés del período · capital {rd(loan.remaining_amount)}
          </p>
          <Money
            value={Number(loan.installment_amount)}
            className="font-display text-lg font-bold"
          />
        </div>
        {mora > 0 && <Chip tone="danger">Mora {rd(mora)}</Chip>}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="accent"
          className="min-h-11 flex-1"
          onClick={() =>
            onPay({ mode: "open", loan, businessName: business, graceDays: grace, dueDate: due })
          }
        >
          Cobrar {rd(Number(loan.installment_amount) + mora)}
        </Button>
        {showReminder && (
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 w-11 shrink-0"
            onClick={recordar}
            aria-label="Recordar por WhatsApp"
            title="Recordar por WhatsApp"
          >
            <MessageCircle className="size-5 text-success" />
          </Button>
        )}
      </div>
    </div>
  );
}
