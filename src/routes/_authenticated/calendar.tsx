import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { useAllInstallments, useLoans, usePaymentsForLoans, usePaymentsInRange } from "@/lib/db";
import { addPeriods, formatDate, installmentStatus, rd, todaySD, toISO } from "@/lib/finance";
import type { Frequency } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Calendario | Gestor de Prestamos" },
      { name: "description", content: "Calendario mensual de vencimientos, cobros y lo cobrado." },
      { property: "og:title", content: "Calendario | Gestor de Prestamos" },
      { property: "og:description", content: "Vencimientos y cobros del mes en un vistazo." },
    ],
  }),
  component: CalendarPage,
});

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

type DayInfo = { count: number; amount: number; overdue: number; collected: number };

function CalendarPage() {
  const { data: installments = [] } = useAllInstallments();
  const { data: loans = [] } = useLoans();
  const today = todaySD();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { y: y ?? 2026, m: (m ?? 1) - 1 };
  });
  const [selected, setSelected] = useState(today);

  // Pagos acotados: los de préstamos ABIERTOS (períodos de interés) y solo los del
  // mes que se está viendo (antes se descargaban TODOS los pagos del usuario).
  const openLoanIds = useMemo(() => loans.filter((l) => l.open_ended).map((l) => l.id), [loans]);
  const { data: interestPayments = [] } = usePaymentsForLoans(openLoanIds);
  const monthFrom = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-01`;
  const monthTo = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(
    new Date(cursor.y, cursor.m + 1, 0).getDate(),
  ).padStart(2, "0")}`;
  // Se incluye también el mes del día seleccionado (por si se navegó de mes sin
  // volver a tocar un día) para que su detalle siga mostrando lo cobrado.
  const selMonth = selected.slice(0, 7);
  const rangeFrom = selMonth < monthFrom.slice(0, 7) ? `${selMonth}-01` : monthFrom;
  const rangeTo = selMonth > monthTo.slice(0, 7) ? selected : monthTo;
  const { data: payments = [] } = usePaymentsInRange(rangeFrom, rangeTo);

  const loanById = useMemo(() => new Map(loans.map((l) => [l.id, l])), [loans]);

  const openRows = useMemo(() => {
    // Igual que Cobros: el período que se debe es el primero sin pagar
    // (primer pago + pagos de interés hechos), no el próximo.
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

  const byDay = useMemo(() => {
    const map = new Map<string, DayInfo>();
    const touch = (key: string) => {
      const cur = map.get(key) ?? { count: 0, amount: 0, overdue: 0, collected: 0 };
      map.set(key, cur);
      return cur;
    };
    for (const i of installments) {
      if (i.loan?.status !== "en_curso") continue;
      const st = installmentStatus(i);
      if (st === "pagada") continue;
      const cur = touch(i.due_date.slice(0, 10));
      cur.count += 1;
      cur.amount += Math.max(Number(i.total_amount) - Number(i.paid_amount), 0);
      if (st === "vencida") cur.overdue += 1;
    }
    for (const o of openRows) {
      const cur = touch(o.due);
      cur.count += 1;
      cur.amount += Number(o.loan.installment_amount);
      if (o.due < today) cur.overdue += 1;
    }
    for (const p of payments) {
      const key = String(p.paid_at).slice(0, 10);
      const cur = touch(key);
      cur.collected += Number(p.amount);
    }
    return map;
  }, [installments, openRows, payments, today]);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const offset = first.getDay(); // domingo primero
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const out: (string | null)[] = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= daysInMonth; d++) out.push(toISO(new Date(cursor.y, cursor.m, d)));
    return out;
  }, [cursor]);

  const selectedInstallments = installments.filter(
    (i) =>
      i.due_date.slice(0, 10) === selected &&
      i.loan?.status === "en_curso" &&
      installmentStatus(i) !== "pagada",
  );
  const selectedOpen = openRows.filter((o) => o.due === selected);
  const selectedCollected = payments.filter((p) => String(p.paid_at).slice(0, 10) === selected);

  const monthTotal = cells.reduce((s, c) => (c ? s + (byDay.get(c)?.amount ?? 0) : s), 0);
  const monthCollected = cells.reduce((s, c) => (c ? s + (byDay.get(c)?.collected ?? 0) : s), 0);

  function move(delta: number) {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  }

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle={`Por cobrar este mes: ${rd(monthTotal)} · Cobrado: ${rd(monthCollected)}`}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface p-3 sm:p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <Button size="icon" variant="ghost" onClick={() => move(-1)} aria-label="Mes anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <p className="font-display text-base font-semibold">
              {MESES[cursor.m]} {cursor.y}
            </p>
            <Button size="icon" variant="ghost" onClick={() => move(1)} aria-label="Mes siguiente">
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center text-[10px] uppercase text-muted-foreground sm:text-[11px]">
            {DIAS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-0.5 sm:gap-1">
            {cells.map((iso, idx) => {
              if (!iso) return <div key={`x${idx}`} />;
              const info = byDay.get(iso);
              const isToday = iso === today;
              const isSel = iso === selected;
              const dueSum = info?.count ?? 0;
              return (
                <button
                  key={iso}
                  onClick={() => setSelected(iso)}
                  className={`flex flex-col items-start rounded-lg border p-1 text-left transition-colors min-h-11 sm:min-h-16 ${
                    isSel
                      ? "border-accent bg-accent/10"
                      : isToday
                        ? "border-accent/60"
                        : "border-border hover:bg-secondary"
                  }`}
                >
                  <span className="text-[11px] font-semibold sm:text-xs">
                    {Number(iso.slice(8, 10))}
                  </span>
                  <span className="mt-auto flex w-full flex-col items-start gap-0.5">
                    {dueSum > 0 && (
                      <span
                        className={`w-full truncate text-[9px] font-semibold sm:text-[10px] ${
                          (info?.overdue ?? 0) > 0 ? "text-destructive" : "text-primary"
                        }`}
                      >
                        {dueSum} {dueSum > 1 ? "cuotas" : "cuota"}
                      </span>
                    )}
                    {info && info.amount > 0 && (
                      <span className="num hidden text-[10px] text-muted-foreground sm:block">
                        {rd(info.amount)}
                      </span>
                    )}
                    {info && info.collected > 0 && (
                      <span className="text-[9px] font-semibold text-success sm:text-[10px]">
                        ✓ {rd(info.collected)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="surface p-4">
          <p className="font-display text-base font-semibold">{formatDate(selected)}</p>
          {selectedInstallments.length === 0 &&
          selectedOpen.length === 0 &&
          selectedCollected.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Sin vencimientos ni cobros este día.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {selectedInstallments.map((i) => (
                <Link
                  key={i.id}
                  to="/loans/$id"
                  params={{ id: i.loan_id }}
                  className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {i.loan?.client?.full_name ?? "Cliente"} · Cuota {i.number}
                  </span>
                  <Money
                    value={Number(i.total_amount) - Number(i.paid_amount)}
                    className="font-semibold"
                  />
                </Link>
              ))}
              {selectedOpen.map((o) => (
                <Link
                  key={o.id}
                  to="/loans/$id"
                  params={{ id: o.loan.id }}
                  className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {o.loan.client?.full_name ?? "Cliente"} · Interés
                  </span>
                  <Money value={Number(o.loan.installment_amount)} className="font-semibold" />
                </Link>
              ))}
              {selectedCollected.map((p) => (
                <div
                  key={`c_${p.id}`}
                  className="flex items-center justify-between rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-success">
                    Cobrado · {loanById.get(p.loan_id)?.client?.full_name ?? "Cliente"}
                  </span>
                  <Money value={p.amount} className="font-semibold text-success" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
