import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, CreditCard, EllipsisVertical, Eye, Receipt, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignPlan,
  ESTADOS_PLAN,
  ESTADO_LABEL,
  PLANES,
  PLAN_LABEL,
  setUserAccess,
  useAdminPlans,
  type AdminNegocio,
} from "@/lib/admin";
import { formatDate } from "@/lib/finance";
import { useProfile } from "@/lib/db";
import { Dato, RegistrarPagoButton } from "./shared";

export function NegocioCard({ negocio }: { negocio: AdminNegocio }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: plans } = useAdminPlans();
  const { data: profile } = useProfile();
  const isSelf = profile?.id === negocio.id;

  const [planOpen, setPlanOpen] = useState(false);
  const [pagoOpen, setPagoOpen] = useState(false);
  const [plan, setPlan] = useState(negocio.plan_display);
  const [estado, setEstado] = useState(negocio.plan_status);

  const guardarPlan = useMutation({
    mutationFn: () => assignPlan(negocio.id, plan, estado),
    onSuccess: () => {
      toast.success("Plan actualizado");
      setPlanOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acceso = useMutation({
    mutationFn: (blocked: boolean) => setUserAccess(negocio.id, blocked),
    onSuccess: (_v, blocked) => {
      toast.success(blocked ? "Acceso bloqueado" : "Acceso restaurado");
      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cambiado = plan !== negocio.plan_display || estado !== negocio.plan_status;
  const badgeColor = negocio.blocked
    ? "border-destructive/25 bg-destructive/12 text-destructive"
    : negocio.plan_status === "activo"
      ? "border-success/25 bg-success/12 text-success"
      : negocio.plan_status === "prueba"
        ? "border-info/25 bg-info/12 text-info"
        : "border-destructive/25 bg-destructive/12 text-destructive";

  return (
    <div className={`surface p-4 ${negocio.blocked ? "opacity-80" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-2">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <p className="truncate font-display text-base font-semibold">
            <Link to="/admin/users/$id" params={{ id: negocio.id }} className="hover:underline">
              {negocio.business_name}
            </Link>
            {isSelf && <span className="ml-2 text-xs font-normal text-muted-foreground">(tú)</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {negocio.owner_name || "Sin dueño registrado"}
            {negocio.phone ? ` · ${negocio.phone}` : ""} · Desde{" "}
            {formatDate(negocio.created_at.slice(0, 10))}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeColor}`}
          >
            {negocio.blocked
              ? "Bloqueado"
              : `${PLAN_LABEL[negocio.plan] ?? negocio.plan_display} · ${ESTADO_LABEL[negocio.plan_status] ?? negocio.plan_status}`}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Acciones"
                className="size-11 p-0 text-muted-foreground hover:text-foreground"
              >
                <EllipsisVertical className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onSelect={() => navigate({ to: "/admin/users/$id", params: { id: negocio.id } })}
              >
                <Eye className="mr-2 size-4" /> Ver detalle
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPagoOpen(true)}>
                <Receipt className="mr-2 size-4" /> Registrar pago
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setPlan(negocio.plan_display);
                  setEstado(negocio.plan_status);
                  setPlanOpen(true);
                }}
              >
                <CreditCard className="mr-2 size-4" /> Asignar plan
              </DropdownMenuItem>
              {!isSelf && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className={
                      negocio.blocked
                        ? "text-success focus:text-success"
                        : "text-destructive focus:text-destructive"
                    }
                    onSelect={() => acceso.mutate(!negocio.blocked)}
                  >
                    {negocio.blocked ? (
                      <>
                        <ShieldCheck className="mr-2 size-4" /> Restaurar acceso
                      </>
                    ) : (
                      <>
                        <Ban className="mr-2 size-4" /> Bloquear acceso
                      </>
                    )}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato label="Deudores" value={String(negocio.clientes)} />
        <Dato
          label="Préstamos activos"
          value={`${negocio.prestamosActivos}/${negocio.prestamos}`}
        />
        <Dato label="Capital colocado" money={negocio.capital} />
        <Dato label="Ganancia generada" money={negocio.ingreso} />
      </div>

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar plan a {negocio.business_name}</DialogTitle>
            <DialogDescription>
              Cambia el plan y el estado de la suscripción de este negocio.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(plans ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.name}>
                      {p.name}
                      {p.is_active ? "" : " · oculto"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_PLAN.map((e) => (
                    <SelectItem key={e} value={e}>
                      {ESTADO_LABEL[e] ?? e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPlanOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="accent"
              disabled={!cambiado || guardarPlan.isPending}
              onClick={() => guardarPlan.mutate()}
            >
              {guardarPlan.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RegistrarPagoButton
        negocios={[negocio]}
        presetUserId={negocio.id}
        open={pagoOpen}
        onOpenChange={setPagoOpen}
        renderTrigger={() => null}
      />
    </div>
  );
}
