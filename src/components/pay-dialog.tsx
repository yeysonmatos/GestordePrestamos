import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, Printer, Share2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { shareReceiptPdf } from "@/lib/receipt-pdf";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Money } from "@/components/money";
import { lateFee, daysBetween, formatDate, formatReceiptDate, rd, todaySD } from "@/lib/finance";
import { payInstallment, payOpenInterest } from "@/lib/actions";
import type { Installment, LoanWithClient } from "@/lib/db";
import { buildReceiptMessage, whatsappUrl } from "@/lib/messages";

export type PayTarget =
  | {
      mode: "installment";
      loanId: string;
      clientId: string;
      displayId: string;
      inst: Installment;
      clientName: string;
      phone: string | null;
      whatsapp: string | null;
      businessName: string;
      lateInterestRate: number;
      graceDays: number;
      prepaidBalance?: number;
    }
  | {
      mode: "open";
      loan: LoanWithClient;
      businessName: string;
      graceDays: number;
      /** Fecha del período de interés que se está cobrando (para calcular la mora). */
      dueDate?: string;
    };

export type Receipt = {
  paymentId: string;
  business: string;
  client: string;
  loanDisplayId: string;
  payType: string;
  method: string;
  amount: number;
  capital: number;
  interest: number;
  late: number;
  date: string;
  newBalance: number;
  phone: string | null;
  whatsapp: string | null;
  notes?: string | null;
  /** true cuando se reenvía un recibo de un pago ya guardado. */
  copy?: boolean;
};

const METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  deposito: "Depósito",
  otro: "Otro",
};

export function PayDialog({
  target,
  onOpenChange,
  onPaid,
}: {
  target: PayTarget | null;
  onOpenChange: (open: boolean) => void;
  onPaid?: (receipt: Receipt) => void;
}) {
  const queryClient = useQueryClient();
  const isOpen = target?.mode === "open";

  const pending = useMemo(() => {
    if (!target) return 0;
    if (target.mode === "open") return Math.max(0, Number(target.loan.installment_amount || 0));
    return Math.max(0, Number(target.inst.total_amount) - Number(target.inst.paid_amount));
  }, [target]);

  const dueDate =
    target?.mode === "installment"
      ? target.inst.due_date
      : target?.mode === "open"
        ? (target.dueDate ?? "")
        : "";
  const rate =
    target?.mode === "installment"
      ? target.lateInterestRate
      : target?.mode === "open"
        ? Number(target.loan.late_fee_rate ?? 0)
        : 0;
  const grace = target ? target.graceDays : 0;
  const mora = useMemo(
    () => (target ? lateFee({ dueDate, pending, lateFeeRate: rate, graceDays: grace }) : 0),
    [target, dueDate, pending, rate, grace],
  );

  const prepaid = isOpen
    ? 0
    : Number(target?.mode === "installment" ? (target.prepaidBalance ?? 0) : 0);
  const daysLate = target && dueDate ? lateDays(dueDate, grace) : 0;
  const [includeMora, setIncludeMora] = useState(true);
  const [amount, setAmount] = useState<string | null>(null);
  const [method, setMethod] = useState("efectivo");
  const [date, setDate] = useState(todaySD());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const lockRef = useRef(false);

  const expectedTotal = Math.max(0, pending + (includeMora ? mora : 0) - prepaid);
  const amountValue = amount === null || amount === "" ? expectedTotal : Number(amount);
  const paidBefore = target?.mode === "installment" ? Number(target.inst.paid_amount) : 0;

  function reset() {
    setAmount(null);
    setMethod("efectivo");
    setDate(todaySD());
    setNote("");
    setIncludeMora(true);
  }

  async function submit() {
    if (!target) return;
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      toast.error("Escribe un monto válido");
      return;
    }
    if (lockRef.current) return;
    lockRef.current = true;
    setSaving(true);
    try {
      if (target.mode === "open") {
        const r = await payOpenInterest({
          loan: target.loan,
          amount: amountValue,
          method,
          paymentDate: date,
          note,
        });
        await queryClient.invalidateQueries();
        onPaid?.({
          paymentId: r.payment.id,
          business: target.businessName,
          client: target.loan.client?.full_name ?? "Cliente",
          loanDisplayId: target.loan.loan_id ?? "",
          payType: mora > 0 ? "Interés + mora" : "Interés",
          method: METHOD_LABELS[method] ?? method,
          amount: amountValue,
          capital: 0,
          interest: Number(r.payment.interest_amount),
          late: Number(r.payment.late_amount),
          date: r.payment.payment_date,
          newBalance: Math.max(0, Number(target.loan.remaining_amount)),
          phone: target.loan.client?.phone ?? null,
          whatsapp: target.loan.client?.whatsapp ?? null,
          notes: note || null,
        });
      } else {
        const r = await payInstallment({
          loanId: target.loanId,
          installmentId: target.inst.id,
          amount: amountValue,
          includeMora: mora > 0 && includeMora,
          paymentDate: date,
          method,
          notes: note,
          lateInterestRate: target.lateInterestRate,
          graceDays: target.graceDays,
        });
        await queryClient.invalidateQueries();
        const applied = r.allocation?.paidToInstallment ?? amountValue;
        const paidLate = r.allocation?.paidToLate ?? 0;
        onPaid?.({
          paymentId: r.payment.id,
          business: target.businessName,
          client: target.clientName,
          loanDisplayId: target.displayId,
          payType: `Cuota ${target.inst.number}`,
          method: METHOD_LABELS[method] ?? method,
          amount: applied + paidLate,
          capital: Number(r.payment.capital_amount),
          interest: Number(r.payment.interest_amount),
          late: paidLate || Number(r.payment.late_amount),
          date: r.payment.payment_date || date,
          newBalance: Number(r.loan?.remaining_amount ?? 0),
          phone: target.phone,
          whatsapp: target.whatsapp,
          notes: note || null,
        });
      }
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el pago");
    } finally {
      lockRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isOpen ? "Cobrar interés" : "Registrar pago"}</DialogTitle>
          <DialogDescription>
            {target?.mode === "open"
              ? `${target.loan.client?.full_name ?? "Cliente"} · interés del período (préstamo abierto)`
              : target
                ? `${target.clientName} · Cuota ${target.inst.number} vence ${formatDate(target.inst.due_date)}`
                : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-secondary p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {isOpen ? "Interés del período" : "Saldo de la cuota"}
            </span>
            <Money value={pending} className="font-semibold" />
          </div>
          {paidBefore > 0 && (
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>Pagado antes</span>
              <span className="num">{rd(paidBefore)}</span>
            </div>
          )}
          {prepaid > 0 && (
            <div className="mt-1 flex justify-between text-xs text-success">
              <span>Saldo a favor (se aplica solo)</span>
              <span className="num">−{rd(prepaid)}</span>
            </div>
          )}
          {includeMora && mora > 0 && (
            <div className="mt-1 flex justify-between text-xs text-destructive">
              <span>Mora</span>
              <span className="num">{rd(mora)}</span>
            </div>
          )}
          {mora > 0 && (
            <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
              <span>Total a cobrar</span>
              <span className="num">{rd(expectedTotal)}</span>
            </div>
          )}
        </div>

        {mora > 0 && (
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={includeMora}
              onChange={(e) => {
                setIncludeMora(e.target.checked);
                setAmount(null);
              }}
            />
            <span>
              Incluir mora: <span className="font-semibold text-destructive">{rd(mora)}</span>
              <span className="block text-xs text-muted-foreground">
                {daysLate} día{daysLate === 1 ? "" : "s"} de atraso
                {grace > 0 ? ` (tras ${grace} día(s) de gracia)` : ""}
              </span>
            </span>
          </label>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="monto">Monto recibido</Label>
          <Input
            id="monto"
            inputMode="decimal"
            className="h-11"
            placeholder={rd(expectedTotal)}
            value={amount ?? String(Math.round(expectedTotal * 100) / 100)}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setAmount(String(Math.round(expectedTotal * 100) / 100))}
            >
              Completo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setAmount(String(Math.round((expectedTotal / 2) * 100) / 100))}
            >
              Mitad
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label>Forma de pago</Label>
            <Select value={method} onValueChange={setMethod}>
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
            <Label htmlFor="fecha">Fecha de pago</Label>
            <Input
              id="fecha"
              type="date"
              className="h-11 w-full min-w-0"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nota">Nota / referencia (opcional)</Label>
          <Textarea id="nota" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>

        <div className="flex justify-between rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-semibold">
          <span>Total a recibir</span>
          <Money value={amountValue} />
        </div>

        <DialogFooter>
          <Button variant="accent" className="w-full min-h-11" onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Confirmar cobro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function lateDays(dueDate: string, grace: number): number {
  return Math.max(0, daysBetween(dueDate, todaySD()) - Math.max(0, grace));
}

export function ReceiptDialog({
  receipt,
  onOpenChange,
}: {
  receipt: Receipt | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!receipt) return null;

  const msg = buildReceiptMessage({
    amount: receipt.amount,
    payType: receipt.payType,
    payMethod: receipt.method,
    clientName: receipt.client,
    loanId: receipt.loanDisplayId,
    paymentDate: receipt.date,
    notes: receipt.notes,
    newBalance: receipt.newBalance,
    businessName: receipt.business,
  });

  function sendWhatsApp() {
    const phone = receipt!.whatsapp || receipt!.phone;
    if (phone) {
      window.open(whatsappUrl(phone, msg), "_blank");
      return;
    }
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true);
      toast.info("Sin teléfono: mensaje copiado al portapapeles");
    });
  }

  async function compartir() {
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ text: msg });
        return;
      } catch {
        /* cancelado */
      }
    }
    await navigator.clipboard.writeText(msg);
    toast.success("Resumen copiado al portapapeles");
  }

  async function descargarPdf() {
    try {
      const how = await shareReceiptPdf(receipt!, msg);
      toast.success(how === "shared" ? "PDF listo para guardar o enviar" : "PDF descargado");
    } catch {
      // ultimo recurso: impresion del navegador (escritorio)
      try {
        window.print();
      } catch {
        toast.error("No se pudo generar el PDF");
      }
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>✅ Pago registrado</DialogTitle>
          <DialogDescription className="no-print">
            Guarda o comparte el recibo con el cliente.
          </DialogDescription>
        </DialogHeader>

        <div id="payment-receipt" className="space-y-3 text-sm">
          <div className="text-center">
            <p className="font-display text-base font-bold">{receipt.business}</p>
            <p className="text-xs text-muted-foreground">
              RECIBO-{receipt.paymentId.slice(0, 8).toUpperCase()}
              {receipt.copy ? " · COPIA" : ""}
            </p>
            <p className="text-xs text-muted-foreground">{formatReceiptDate(receipt.date)}</p>
          </div>
          <div className="space-y-1 border-y border-border py-3">
            <Row label="Cliente" value={receipt.client} />
            <Row label="Préstamo" value={receipt.loanDisplayId || "—"} />
            <Row label="Concepto" value={receipt.payType} />
            <Row label="Forma de pago" value={receipt.method} />
            {receipt.notes && <Row label="Nota" value={receipt.notes} />}
            <div className="flex justify-between pt-1">
              <span className="text-muted-foreground">Mora</span>
              <span className="num font-medium">{rd(receipt.late)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Capital / Interés</span>
              <span className="num font-medium">
                {rd(receipt.capital)} / {rd(receipt.interest)}
              </span>
            </div>
          </div>
          <div className="flex justify-between font-display text-base font-bold">
            <span>Total recibido</span>
            <span className="num">{rd(receipt.amount)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Nuevo balance del préstamo: {rd(receipt.newBalance)}
          </p>
        </div>

        <DialogFooter className="no-print gap-2 sm:grid sm:grid-cols-3">
          <Button variant="secondary" className="min-h-11" onClick={descargarPdf}>
            <Printer className="mr-1 size-4" /> PDF
          </Button>
          <Button variant="accent" className="min-h-11" onClick={sendWhatsApp}>
            <MessageCircle className="mr-1 size-4" /> WhatsApp
          </Button>
          <Button variant="outline" className="min-h-11" onClick={compartir}>
            <Share2 className="mr-1 size-4" /> {copied ? "Copiado" : "Compartir"}
          </Button>
        </DialogFooter>

        <style>{`@media print { body * { visibility: hidden !important; } #payment-receipt, #payment-receipt * { visibility: visible !important; } #payment-receipt { position: absolute !important; inset: 0 auto auto 0 !important; width: 380px !important; max-width: 380px !important; } }`}</style>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="num text-right font-medium">{value}</span>
    </div>
  );
}
