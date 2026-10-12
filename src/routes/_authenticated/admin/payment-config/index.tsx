import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { platformConfigGet, platformConfigUpdate } from "@/lib/admin-fns";

interface Config {
  bank_name: string;
  account_name: string;
  account_number: string;
  payment_phone: string;
}

export const Route = createFileRoute("/_authenticated/admin/payment-config/")({
  component: AdminPaymentConfig,
});

function AdminPaymentConfig() {
  const [form, setForm] = useState<Config>({
    bank_name: "",
    account_name: "",
    account_number: "",
    payment_phone: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    platformConfigGet()
      .then((d) => {
        if (d.config)
          setForm({
            bank_name: d.config.bank_name || "",
            account_name: d.config.account_name || "",
            account_number: d.config.account_number || "",
            payment_phone: d.config.payment_phone || "",
          });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof Config>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await platformConfigUpdate({ data: { ...form } });
      setMessage("Datos de pago guardados correctamente");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
    setSaving(false);
  }

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Cargando...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Datos de cobro" subtitle="Cuenta donde tus suscriptores pagan la mensualidad" />
      {message && <Alert variant="default">{message}</Alert>}
      {error && <Alert variant="destructive">{error}</Alert>}

      <Card className="p-4">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Building className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Cuenta de cobro</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Estos datos se muestran a tus clientes para que puedan pagar su suscripción por transferencia.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Banco</label>
              <Input value={form.bank_name} onChange={(e) => update("bank_name", e.target.value)} placeholder="Ej: Banco Popular Dominicano" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Titular de la cuenta</label>
              <Input value={form.account_name} onChange={(e) => update("account_name", e.target.value)} placeholder="Ej: Juan Pérez" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Número de cuenta</label>
              <Input value={form.account_number} onChange={(e) => update("account_number", e.target.value)} placeholder="Ej: 123456789012" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Teléfono de pago (contacto)</label>
              <Input value={form.payment_phone} onChange={(e) => update("payment_phone", e.target.value)} placeholder="Ej: 809-000-0000" />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving} className="min-h-11">
              Guardar datos de pago
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}



