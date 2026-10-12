import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { deletePlan, savePlan, useAdminPlans, type AdminPlan } from "@/lib/admin";
import { rd } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/admin/plans")({
  component: AdminPlans,
});

type PlanForm = {
  name: string;
  price: string;
  billing_cycle: string;
  description: string;
  max_clients: string;
  max_loans: string;
  features: string;
  is_active: boolean;
};

const EMPTY: PlanForm = {
  name: "",
  price: "0",
  billing_cycle: "monthly",
  description: "",
  max_clients: "",
  max_loans: "",
  features: "",
  is_active: true,
};

function toFeatures(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter((x) => x.trim() !== "");
  return [];
}

function AdminPlans() {
  const { data: planes, isLoading } = useAdminPlans();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PlanForm>(EMPTY);

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    queryClient.invalidateQueries({ queryKey: ["admin-data"] });
  };

  const openCreate = () => {
    setForm(EMPTY);
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (p: AdminPlan) => {
    setForm({
      name: p.name,
      price: String(p.price),
      billing_cycle: p.billing_cycle,
      description: p.description ?? "",
      max_clients: p.max_clients != null && p.max_clients > 0 ? String(p.max_clients) : "",
      max_loans: (p as any).max_loans != null && (p as any).max_loans > 0 ? String((p as any).max_loans) : "",
      features: toFeatures(p.features).join("\n"),
      is_active: p.is_active,
    });
    setEditing(p);
    setOpen(true);
  };

  const buildPayload = () => {
    const price = Number(form.price);
    if (!form.name.trim()) throw new Error("Falta el nombre del plan");
    if (Number.isNaN(price) || price < 0) throw new Error("Precio inválido");
    const max = form.max_clients.trim() === "" ? null : Number(form.max_clients);
    const maxL = form.max_loans.trim() === "" ? null : Number(form.max_loans);
    const base = {
      name: form.name.trim(),
      price,
      billing_cycle: form.billing_cycle,
      description: form.description.trim() || null,
      max_clients: max != null && max > 0 ? max : null,
      max_loans: maxL != null && maxL > 0 ? maxL : null,
      features: form.features
        .split("\n")
        .map((x) => x.trim())
        .filter((x) => x !== ""),
      is_active: form.is_active,
    };
    return editing ? { ...base, id: editing.id } : base;
  };

  const guardar = useMutation({
    mutationFn: () => savePlan(buildPayload()),
    onSuccess: () => {
      toast.success(editing ? "Plan actualizado" : "Plan creado");
      setOpen(false);
      setEditing(null);
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (p: AdminPlan) => {
    savePlan({ ...p, is_active: !p.is_active })
      .then(() => {
        toast.success(p.is_active ? "Plan desactivado" : "Plan activado");
        refetch();
      })
      .catch((e: Error) => toast.error(e.message));
  };

  const remove = (p: AdminPlan) => {
    if (!confirm(`¿Eliminar el plan "${p.name}"?`)) return;
    deletePlan(p.id)
      .then(() => {
        toast.success("Plan eliminado");
        refetch();
      })
      .catch((e: Error) => toast.error(e.message));
  };

  return (
    <>
      <PageHeader
        title="Planes"
        subtitle="Crea y gestiona los planes de suscripción (DOP)"
        action={
          <Button variant="accent" onClick={openCreate}>
            <Plus className="size-4" /> Nuevo plan
          </Button>
        }
      />

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Cargando planes…</p>
      ) : (planes ?? []).length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Crea tu primer plan de suscripción
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(planes ?? []).map((plan) => (
            <Card key={plan.id} className={!plan.is_active ? "opacity-60" : ""}>
              <div className="p-4">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {plan.billing_cycle === "yearly" ? "Anual" : "Mensual"}
                    </p>
                  </div>
                  {plan.is_active ? (
                    <Badge variant="outline" className="border-success/50 text-success">
                      <Check className="mr-1 size-3" /> Activo
                    </Badge>
                  ) : (
                    <Badge variant="destructive">Inactivo</Badge>
                  )}
                </div>
                <p className="mb-1 text-2xl font-bold text-foreground">{rd(plan.price)}</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  {plan.max_clients != null && plan.max_clients > 0
                    ? `Máximo ${plan.max_clients} deudores`
                    : "Deudores ilimitados"}
                  {" · "}
                  {(plan as any).max_loans != null && (plan as any).max_loans > 0
                    ? `Máximo ${(plan as any).max_loans} préstamos`
                    : "Préstamos ilimitados"}
                  {" · "}
                  {plan.clients ?? 0} suscriptor{(plan.clients ?? 0) !== 1 ? "es" : ""}
                </p>
                {plan.description && (
                  <p className="mb-3 text-sm text-muted-foreground">{plan.description}</p>
                )}
                {toFeatures(plan.features).length > 0 && (
                  <ul className="mb-4 space-y-1">
                    {toFeatures(plan.features).map((f, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <Check className="mt-0.5 size-4 shrink-0 text-success" /> {f}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(plan)}>
                    <Pencil className="mr-1 size-4" /> Editar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => toggle(plan)}>
                    {plan.is_active ? "Desactivar" : "Activar"}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => remove(plan)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar plan" : "Nuevo plan"}</DialogTitle>
            <DialogDescription>El precio se muestra en pesos dominicanos (DOP).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                className="h-11"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Básico"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Precio</Label>
                <Input
                  className="h-11"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ciclo</Label>
                <Select
                  value={form.billing_cycle}
                  onValueChange={(v) => setForm({ ...form, billing_cycle: v })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensual</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input
                className="h-11"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Máximo de deudores (vacío = ilimitado)</Label>
              <Input
                className="h-11"
                type="number"
                min="1"
                value={form.max_clients}
                onChange={(e) => setForm({ ...form, max_clients: e.target.value })}
                placeholder="Ej: 30"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Máximo de préstamos activos (vacío = ilimitado)</Label>
              <Input
                className="h-11"
                type="number"
                min="1"
                value={form.max_loans}
                onChange={(e) => setForm({ ...form, max_loans: e.target.value })}
                placeholder="Ej: 10"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Características (una por línea)</Label>
              <textarea
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
                rows={4}
                className="block w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder={"Hasta 30 deudores\nPréstamos ilimitados\nSoporte por email"}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="size-4 rounded border-border"
              />
              Plan activo (se ofrece en el registro)
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
            >
              Cancelar
            </Button>
            <Button variant="accent" disabled={guardar.isPending} onClick={() => guardar.mutate()}>
              {guardar.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
