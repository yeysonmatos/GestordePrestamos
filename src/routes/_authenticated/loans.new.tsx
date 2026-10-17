import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Money } from "@/components/money";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useClients, useLoan, useLoans, useProfile, useSubscription } from "@/lib/db";
import { createLoan, updateLoan } from "@/lib/actions";
import {
  addPeriods,
  buildSchedule,
  formatDate,
  FREQUENCIES,
  LOAN_TYPES,
  periodicRatePct,
  rd,
  todaySD,
} from "@/lib/finance";
import type { Frequency, LoanType } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/loans/new")({
  beforeLoad: async () => {
    const { fetchEntitlements } = await import("@/lib/entitlements");
    const e = await fetchEntitlements();
    if (e.readOnly) throw redirect({ to: "/loans" });
  },
  validateSearch: (search: Record<string, unknown>) => ({
    client: typeof search["client"] === "string" ? search["client"] : undefined,
    edit: typeof search["edit"] === "string" ? search["edit"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Nuevo préstamo | Gestor de Prestamos" },
      {
        name: "description",
        content: "Crea un préstamo y mira el cronograma de cuotas antes de guardar.",
      },
      { property: "og:title", content: "Nuevo préstamo | Gestor de Prestamos" },
      { property: "og:description", content: "Crea un préstamo con vista previa del cronograma." },
    ],
  }),
  component: NewLoan,
});

function NewLoan() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const { data: clients = [] } = useClients();
  const { data: profile } = useProfile();
  const { data: loans = [] } = useLoans();
  const { data: sub } = useSubscription();

  const today = todaySD();
  const [clientId, setClientId] = useState(search.client ?? "");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [term, setTerm] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("mensual");
  const [loanType, setLoanType] = useState<LoanType>("cuota_fija");
  const [openEnded, setOpenEnded] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [firstPayment, setFirstPayment] = useState(addPeriods(today, "mensual", 1));
  const [lateFee, setLateFee] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const editId = search.edit;
  const limite = sub && sub.plan_price > 0 ? (sub.plan_max_loans ?? null) : null;
  const limiteAlcanzado =
    !editId && !!limite && loans.filter((l) => l.status === "en_curso").length >= limite;
  const { data: editing } = useLoan(editId ?? "00000000-0000-0000-0000-000000000000");
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);

  useEffect(() => {
    if (editId && editing && prefilledFor !== editId) {
      setClientId(editing.client_id);
      setPrincipal(String(editing.principal));
      setRate(String(editing.interest_rate));
      setTerm(String(editing.term));
      setFrequency(editing.frequency as Frequency);
      setLoanType(editing.loan_type as LoanType);
      setOpenEnded(editing.open_ended);
      setStartDate(editing.start_date);
      setFirstPayment(editing.first_payment_date);
      setLateFee(editing.late_fee_rate ? String(editing.late_fee_rate) : "");
      setNotes(editing.notes ?? "");
      setPrefilledFor(editId);
    }
  }, [editId, editing, prefilledFor]);

  // Blindaje: si el estado trae un valor que no corresponde a una opcion valida
  // (p. ej. un valor crudo de la BD), caemos al valor del prestamo y la vista previa
  // (y el guardado) nunca calculan con una frecuencia o tipo desconocidos.
  const safeFrequency: Frequency = FREQUENCIES.some((f) => f.value === frequency)
    ? frequency
    : ((editing?.frequency as Frequency | undefined) ?? "mensual");
  const safeLoanType: LoanType = LOAN_TYPES.some((t) => t.value === loanType)
    ? loanType
    : ((editing?.loan_type as LoanType | undefined) ?? "cuota_fija");
  const safeFirstPayment = /^\d{4}-\d{2}-\d{2}$/.test(firstPayment)
    ? firstPayment
    : (editing?.first_payment_date ?? firstPayment);

  const schedule = useMemo(
    () =>
      buildSchedule({
        principal: Number(principal) || 0,
        interestRate: Number(rate) || 0,
        term: Number(term) || 0,
        frequency: safeFrequency,
        loanType: safeLoanType,
        firstPaymentDate: safeFirstPayment,
      }),
    [principal, rate, term, safeFrequency, safeLoanType, safeFirstPayment],
  );

  const totals = useMemo(() => {
    const interes = schedule.reduce((s, r) => s + r.interest_amount, 0);
    const total = schedule.reduce((s, r) => s + r.total_amount, 0);
    return { interes, total, cuota: schedule[0]?.total_amount ?? 0 };
  }, [schedule]);

  const isOpen = safeLoanType === "solo_interes" && openEnded;
  const interestPerPeriod =
    Math.round((Number(principal) || 0) * periodicRatePct(Number(rate) || 0, safeFrequency) * 100) /
    100;

  function onFrequency(v: Frequency) {
    setFrequency(v);
    setFirstPayment(addPeriods(startDate, v, 1));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (limiteAlcanzado) {
      toast.error(
        `Tu plan permite máximo ${limite} préstamos activos. Mejora de plan para crear más.`,
      );
      return;
    }
    // Al editar, el cliente es el del préstamo (no editable): nunca debe bloquear el guardado.
    const effectiveClientId = clientId || (editId ? (editing?.client_id ?? "") : "");
    if (!effectiveClientId) {
      toast.error("Escoge un cliente");
      return;
    }
    if (!Number(principal)) {
      toast.error("Escribe el monto del préstamo");
      return;
    }
    if (!isOpen && !(Number(term) > 0)) {
      toast.error("Escribe la cantidad de cuotas");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        client_id: effectiveClientId,
        principal: Number(principal),
        interest_rate: Number(rate),
        term: Number(term),
        frequency: safeFrequency,
        loan_type: safeLoanType,
        start_date: startDate,
        first_payment_date: safeFirstPayment,
        late_fee_rate: Number(lateFee),
        notes,
        open_ended: isOpen,
      };
      if (editId) {
        await updateLoan(editId, payload);
        await queryClient.invalidateQueries();
        toast.success("Préstamo actualizado");
      } else {
        const loan = await createLoan(payload);
        await queryClient.invalidateQueries();
        toast.success("Préstamo creado");
        navigate({ to: "/loans/$id", params: { id: loan.id } });
        return;
      }
      navigate({ to: "/loans/$id", params: { id: editId! } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el préstamo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title={editId ? "Editar préstamo" : "Nuevo préstamo"}
        subtitle={
          editId
            ? "Se recalculará el cronograma; el cliente no puede cambiarse"
            : "Revisa el cronograma antes de guardar"
        }
      />

      {clients.length === 0 ? (
        <div className="surface p-8 text-center">
          <p className="text-sm text-muted-foreground">Primero necesitas registrar un cliente.</p>
          <Button asChild variant="accent" className="mt-4">
            <Link to="/clients/new">Agregar cliente</Link>
          </Button>
        </div>
      ) : (
        <>
          {limiteAlcanzado && (
            <Alert className="mb-4 border-warning/40 bg-warning/10">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Tu plan <strong>{sub?.plan_name}</strong> permite máximo <strong>{limite}</strong>{" "}
                  préstamos activos y ya tienes{" "}
                  {loans.filter((l) => l.status === "en_curso").length}.
                </span>
                <Button asChild size="sm" variant="accent">
                  <Link to="/pricing">Ver planes</Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={submit} className="grid gap-4 lg:grid-cols-5">
            <div className="surface space-y-4 p-5 lg:col-span-3">
              <div className="space-y-1.5">
                <Label>Cliente *</Label>
                {editId ? (
                  <div className="flex h-11 items-center rounded-md border border-input bg-secondary/50 px-3 text-sm">
                    {editing?.client?.full_name ??
                      clients.find((c) => c.id === editing?.client_id)?.full_name ??
                      clients.find((c) => c.id === clientId)?.full_name ??
                      "Cliente del préstamo"}
                  </div>
                ) : (
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Escoge un cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="principal">Monto prestado *</Label>
                  <Input
                    id="principal"
                    inputMode="decimal"
                    className="h-11"
                    value={principal}
                    onChange={(e) => setPrincipal(e.target.value)}
                    placeholder="25000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rate">Tasa mensual (%)</Label>
                  <Input
                    id="rate"
                    inputMode="decimal"
                    className="h-11"
                    placeholder="0"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Tipo de préstamo</Label>
                <Select
                  value={safeLoanType}
                  onValueChange={(v) => {
                    const t = v as LoanType;
                    setLoanType(t);
                    if (t !== "solo_interes") setOpenEnded(false);
                  }}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOAN_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loanType === "solo_interes" && (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={openEnded}
                    onChange={(e) => setOpenEnded(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Sin límite de cuotas (préstamo abierto)
                </label>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Frecuencia de pago</Label>
                  <Select value={safeFrequency} onValueChange={(v) => onFrequency(v as Frequency)}>
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isOpen ? (
                  <div className="space-y-1.5">
                    <Label>Cantidad de cuotas</Label>
                    <p className="rounded-xl bg-secondary px-3 py-2.5 text-sm text-muted-foreground">
                      Abierto — solo interés, el capital se paga al liquidar.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="term">Cantidad de cuotas</Label>
                    <Input
                      id="term"
                      inputMode="numeric"
                      className="h-11"
                      placeholder="0"
                      value={term}
                      onChange={(e) => setTerm(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="start">Fecha de entrega</Label>
                  <Input
                    id="start"
                    type="date"
                    className="h-11"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setFirstPayment(addPeriods(e.target.value, frequency, 1));
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="first">Primer pago</Label>
                  <Input
                    id="first"
                    type="date"
                    className="h-11"
                    value={firstPayment}
                    onChange={(e) => setFirstPayment(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mora">Mora diaria sobre atraso (%)</Label>
                <Input
                  id="mora"
                  inputMode="decimal"
                  className="h-11"
                  placeholder="0"
                  value={lateFee}
                  onChange={(e) => setLateFee(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notas">Notas</Label>
                <Textarea
                  id="notas"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <Button type="submit" variant="accent" className="w-full" disabled={saving}>
                {saving
                  ? editId
                    ? "Guardando…"
                    : "Creando…"
                  : editId
                    ? "Guardar cambios"
                    : "Crear préstamo"}
              </Button>
            </div>

            <div className="lg:col-span-2">
              {editId && (
                <div className="mb-3 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                  <b>Diagnóstico temporal</b> — del préstamo: «
                  {String(editing?.frequency ?? "cargando")}»/«
                  {String(editing?.loan_type ?? "cargando")}» · del formulario: «{String(frequency)}
                  »/«{String(loanType)}» · abierto: {openEnded ? "sí" : "no"} · cuotas: «
                  {term || "(vacío)"}» · 1er pago: {firstPayment || "(vacío)"} · cuota mostrada:{" "}
                  {isOpen ? rd(interestPerPeriod) : schedule.length === 0 ? "—" : rd(totals.cuota)}{" "}
                  · vence:{" "}
                  {schedule
                    .slice(0, 3)
                    .map((r) => r.due_date)
                    .join(" / ") || "(sin cronograma)"}
                </div>
              )}
              <div className="surface sticky top-4 p-5">
                <h2 className="font-display text-base font-semibold">Vista previa</h2>
                <div className="mt-3 space-y-2 text-sm">
                  <Row
                    label="Cuota"
                    value={
                      isOpen
                        ? rd(interestPerPeriod)
                        : schedule.length === 0
                          ? "—"
                          : rd(totals.cuota)
                    }
                    strong
                  />
                  <Row
                    label="Total a recibir"
                    value={isOpen ? "Abierto" : schedule.length === 0 ? "—" : rd(totals.total)}
                  />
                  <Row
                    label="Ganancia por interés"
                    value={
                      isOpen
                        ? rd(interestPerPeriod)
                        : schedule.length === 0
                          ? "—"
                          : rd(totals.interes)
                    }
                  />
                  <Row
                    label="Cuotas"
                    value={
                      isOpen ? "Abierto" : schedule.length === 0 ? "—" : String(schedule.length)
                    }
                  />
                </div>

                {isOpen && (
                  <p className="mt-3 text-xs text-primary">
                    Préstamo abierto: paga {rd(interestPerPeriod)} de interés cada período y el
                    capital ({rd(Number(principal) || 0)}) al liquidar.
                  </p>
                )}

                {!isOpen && (
                  <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-secondary text-left">
                        <tr>
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">Vence</th>
                          <th className="px-2 py-2 text-right">Cuota</th>
                          <th className="px-2 py-2 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {schedule.map((r) => (
                          <tr key={r.number}>
                            <td className="px-2 py-2">{r.number}</td>
                            <td className="px-2 py-2">{formatDate(r.due_date)}</td>
                            <td className="num px-2 py-2 text-right">{rd(r.total_amount)}</td>
                            <td className="num px-2 py-2 text-right text-muted-foreground">
                              {rd(r.balance)}
                            </td>
                          </tr>
                        ))}
                        {schedule.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">
                              Escribe el monto y las cuotas.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </form>
        </>
      )}
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "num font-display text-lg font-bold" : "num font-semibold"}>
        {value}
      </span>
    </div>
  );
}
