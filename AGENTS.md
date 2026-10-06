<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Mis Préstamos — Objetivo

App profesional de control de préstamos (Next.js + Supabase) con dos modelos de amortización:
- **Francesa** — cuota fija, capital creciente, interés decreciente (bancos/financieras)
- **Interest-Only** — pagos periódicos de solo interés, capital al liquidar (prestamistas informales RD)

## Estado actual (13 Jul 2026)

### Completado
- [x] Fundación: types, calculos, utils, storage, supabase client/server/route
- [x] Schema DB con RLS + update_client_stats function
- [x] UI Components: Card, Badge, Button, Input, Select, Modal, Progress, Tabs, Avatar, SearchInput, PageHeader, StatCard, Skeleton, EmptyState
- [x] Layout: Sidebar + MainLayout
- [x] Login page (email/password con Supabase Auth)
- [x] Dashboard con métricas reales y gráfica
- [x] Clientes: listado, create, profile con tabs
- [x] Préstamos (French OK): listado, creación con vista previa, detalle con tabla amortización + pago + reversión + contrato
- [x] Colecciones: cobros del día/vencidos/próximos + historial + pago inline
- [x] Calendario: vista mensual con cuotas y pagos
- [x] Reportes: estadísticas, gráficas (barras + pie)
- [x] Documentos: subida, listado, filtro por tipo, borrado
- [x] Configuración: negocio, moneda, prefijo, mora, defaults
- [x] API routes: /api/collections, /api/calendar, /api/reports, /api/documents, /api/settings, /api/clients
- [x] Sistema de diseño persistido (ui-ux-pro-max → design-system/mis-préstamos/)
- [x] Design tokens aplicados (Tailwind v4 @theme + IBM Plex Sans)
- [x] Amortización francesa implementada en calculations.ts
- [x] update_client_stats RPC function en schema.sql
- [x] user_id agregado a inserts de payments
- [x] Mora calculada al pagar cuota vencida
- [x] Collections actualiza loan (paid_installments, progress, remaining_amount)
- [x] Dashboard con datos reales (no hardcodeados)
- [x] BadgeVariant incluye 'late'
- [x] Eliminados todos los `as any` casts
- [x] Columna `amortization_type` en schema.sql + type Loan
- [x] Payment type extendido: 'capital_abono', 'liquidation'
- [x] Schema: first_name, last_name, nickname, sex, document_type, whatsapp, provincia, municipio, sector, calle, numero, referencia, gps_lat, gps_lng en clients
- [x] Schema: open_ended, payment_day en loans
- [x] calculateInterestOnly(): período completo, si open_ended → schedule vacío + installment_amount
- [x] calculateProportionalInterest() para liquidación anticipada
- [x] NewLoanForm: checkbox "Sin límite de cuotas", campo "Día de pago", insert condicional de schedule
- [x] LoanDetail: open-ended view (sin tabla), liquidación con interés proporcional, botón Documentos con subida
- [x] Collections: open-ended loans en tabs Hoy/Vencidos/Próximos con vencimiento dinámico
- [x] Calendar: open-ended loans con próximos 12 vencimientos generados
- [x] Formulario cliente nuevo: Información Personal (nombres, apellidos, apodo, cédula, sexo), Contacto (tel, whatsapp, email), Dirección (provincia, municipio, sector, calle, número, referencia)
- [x] formatDate default → dd/mm/aaaa
- [x] Tasa de interés visible en detalle del préstamo
- [x] Filtros en lista de préstamos: por tipo (interés/francesa) y frecuencia (diario/semanal/quincenal/mensual)
- [x] Búsqueda por teléfono en lista de préstamos
- [x] Botón WhatsApp en header del préstamo (abre wa.me o copia al portapapeles si no hay teléfono)
- [x] Botón WhatsApp por pago individual en lista de pagos
- [x] Reversión de pago resetea la cuota a `status='pending'` para poder pagarla de nuevo
- [x] Modal de éxito post-pago con acciones: Descargar PDF, WhatsApp, Compartir
- [x] Fecha de pago por defecto usa zona horaria local (no UTC)
- [x] PWA: manifest.json, iconos SVG, service worker, meta tags iOS/Android
- [x] Auth: `createBrowserClient` de @supabase/ssr (cookies sincronizadas client/server)
- [x] UI responsiva iPhone 12 Mini: touch targets 44px (min-h-11), `min-w-0` en inputs date, grids stacked en mobile
- [x] Formato moneda: `formatNumber`/`formatCurrency` sin decimales → `1,234,567` (sin $ en cards, con $ en formularios)
- [x] NewLoanForm: grids responsive (stacked en mobile, 2 col tablet, 3-4 col desktop)
- [x] Deploy: Vercel + Supabase Cloud (snwwvvmszizarakrozah.supabase.co), dominio propio `gestordeprestamos.do` (configuración válida en Vercel), URL estable `.vercel.app` = `gestor-prestamos-one.vercel.app` (proyecto Vercel `gestor-prestamos`; el alias viejo `gestion-prestamos-one.vercel.app` quedó como backup)

### Pendiente
- Nada por ahora

## Hoy — 15 Jul 2026

### Completado
- [x] **Pagos parciales**: HandlePay acepta cualquier monto; asigna primero a cuota, luego a mora
- [x] **Parcial badge**: `(paid_amount > 0 && status !== 'paid')` → badge "Parcial" en Collections cards, LoanDetail tabla amortización, Calendar cuotas
- [x] **Dropdown cuota**: Filtra `status !== 'paid'` (incluye parciales), muestra monto restante + pagado antes
- [x] **Mora dinámica**: openPayment/onChange calcula mora al abrir; checkbox toggle actualiza paymentAmount (sin mora → solo cuota restante, con mora → cuota + mora)
- [x] **Modal total summary**: Subtotal cuota + Mora = Total (solo visible cuando hay mora)
- [x] **handlePay allocation**: `paidToInstallment = Math.min(amount, remaining)`, `paidToLate = Math.max(0, amount - paidToInstallment)`
- [x] **paid_amount tracking**: `installments.update({ paid_amount: totalPaidOnInstallment })` en lugar de sobreescribir con amount total; `paid_at` solo si fully paid
- [x] **Loan stats**: `fullyPaidCount` (no paidCount) para progress/remaining; partial payments no cuentan como paid

### Fix aplicado
- [x] **isNowFullyPaid bug**: Comparaba `totalPaidOnInstallment >= installmentAmount` → si la cuota quedaba cubierta (5000/5000) marcaba `paid` aunque faltara mora. Corregido a `amount >= (remaining) + (includeMora ? totalLateAmount : 0)`
- [x] **late_amount**: Ahora guarda `totalLateAmount` (mora total calculada) en vez de `paidToLate` (solo lo pagado a mora), para que el badge en cards refleje la deuda real

### Pendiente de corregir
- Nada por ahora

## Hoy — 18 Jul 2026

### Refactor mayor (sesión 1)
- [x] **Shared payment service**, `paid_late_amount` tracking, reversión inteligente, settings en Collections, sync UI, etc.

### Fixes aplicados (sesión 2)
- [x] **CR-1**: Collections pasaba `amortization_type: 'french'` forzado — ahora usa el tipo real del préstamo (toma `amortization_type` de `inst.loan`)
- [x] **CR-2**: Reversión sumaba `capital_amount` en vez de `payment.amount` para `remaining_amount` — corregido a `payment.amount`
- [x] **CR-3**: `recalculateInstallment` ponía `paid_at = today` — ahora usa la fecha del pago más reciente
- [x] **CR-5**: Query de próximos usaba `>= today` solapándose con los de hoy — cambiado a `> today`
- [x] **CR-6**: `paidToInstallment` sin cap en `remaining` cuando `includeMora=false` — ahora siempre capped
- [x] **H-2/H-3**: Catch blocks silenciosos reemplazados con `setPaymentError()` + UI visible en modales
- [x] **H-4**: Resultado de installment update no se verificaba — ahora lanza error si falla
- [x] **H-5**: División por cero en francesa con `n=0` — guard clause añadido
- [x] **H-6**: `calculateLateDays` mezclaba UTC/local — ahora usa `differenceInCalendarDays` de date-fns
- [x] **H-10**: Mora se calculaba sobre `installment.amount` completo — ahora sobre `remaining` (saldo restante)
- [x] **H-11**: `paidCount = 0 + 1` para open-ended — saltado cuando `isOpenEnded`
- [x] **M-2**: Interest-only cerrado nunca pasaba a 'paid' — eliminado filtro `!isInterestOnly` en auto-complete
- [x] **M-6**: Pago open-ended en Cobros no actualizaba loan — ahora actualiza `paid_amount` y llama `update_client_stats`
- [x] **M-8**: Balance threshold `< 0.01` cambiado a `< 0.005` para mejor precisión
- [x] **L-3**: Montos negativos pasaban validación (`!amount`) — cambiado a `amount <= 0`

## Hoy — 19 Jul 2026

### UI/UX & Branding
- [x] **Nueva paleta azul**: Primary `#2563EB`, Primary-hover `#3B82F6`, Primary-light `#60A5FA`, Accent `#8B5CF6`, Success `#22C55E`, Warning `#F59E0B`, Destructive `#EF4444`
- [x] **Sidebar navy gradient** (`#081528` → `#0F2A55`) con GP Logo.png + indicador activo morado + avatar usuario
- [x] **PWA icons actualizados**: `icon.svg` / `apple-icon.svg` con logo "GP" blanco sobre gradient azul→morado
- [x] **Sidebar fondo blanco** (reemplaza navy): `bg-white border-r border-border`, nav items con `bg-primary/10` activo, texto `text-muted-foreground`/`text-foreground`
- [x] **Icon cards fondo blanco** en Dashboard, Reports, Collections, StatCard: `bg-white border border-border` + icono `text-primary|text-success|text-destructive|text-emerald-600|text-purple-600`
- [x] **GP Logo.png unificado**: Sidebar (desktop+mobile), Login page, PWA manifest (512×512 maskable), favicon, apple-touch-icon, offline.html
- [x] **GP Login.png** para login page (imagen distinta a sidebar)
- [x] **Títulos**: "Mis Préstamos" → "Gestor de Prestamos" en Login y Sidebar; eliminada tagline "Control profesional"
- [x] **Filtros Loans unificados**: Mobile usa ActionSheet bottom sheet (igual que Clients) para filtro principal estado; Tipo y Frecuencia en sus propios ActionSheets; eliminado dropdown desktop

### LoanDetail & State
- [x] **LoanDetail restaurado con estado local**: `useState` para `loan`, `installments`, `payments` → mutaciones reactivas (pagar, abonar, liquidar, reversar) sin router.refresh()
- [x] `Progress` import corregido a named export

### Pendiente
- Nada por ahora

## Hoy — 20 Jul 2026

### LoanFilters (componente nuevo)
- [x] **LoanFilters component**: Filtros estilo MiFinanzApp — chips horizontales (Estado/Tipo/Frecuencia/Cliente), colores por categoría, badge con count, panel colapsable, resumen filtros activos removibles, date range, amount range
- [x] **UnifiedFilterSheet**: Bottom sheet unificado con secciones configurables, single/multi-select, contadores, limpiar por sección y global, botón "Aplicar (N)"
- [x] **tailwindcss-animate** + **framer-motion** instalados; ActionSheet reescrito con AnimatePresence + spring slide-up
- [x] **CSS module**: `LoanFilters.module.css` creado con transiciones, animaciones, chips, active filters summary

### Unificación / Fixes
- [x] **LoansClientUnified.tsx**: Nueva versión del listado que usa `LoanFilters` en lugar de filtros viejos; búsqueda + filtros en un solo componente
- [x] **Eliminada barra duplicada**: LoansClientUnified tenía su propio `<SearchInput>` — ahora solo LoanFilters maneja búsqueda
- [x] **CSS variables corregidas**: `LoanFilters.module.css` usaba `var(--primary)` pero Tailwind v4 define `var(--color-primary)` — reemplazadas 50 referencias a nombres correctos
- [x] **Bottom sheet en móvil**: Panel de filtros usa `AnimatePresence` + `motion.div` con slide-up desde abajo en mobile (<640px); inline en desktop
- [x] **View toggle movido**: El toggle cards/table ahora se renderiza dentro de LoanFilters (prop `viewToggle`), a la derecha del botón "Filtros"
- [x] **Importaciones limpias**: Eliminados `SearchInput`, `Funnel`, `calculateLateDays`, `search` state, `hasActiveFilters` no usados en LoansClientUnified

### Vercel Deploy
- [x] **Proyecto Vercel desconectado de GitHub**: `vercel.com/yeysonmatos/loan-tracker` muestra "No Production Deployment" — requiere conectar repositorio manualmente

### Collections Quick Payment Responsive
- [x] **BottomSheet centrado en desktop**: Cambiado `left-0 right-0` → `sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:max-w-lg` para centrar el modal en pantallas grandes
- [x] **className duplicado eliminado**: BottomSheet ya no aplica `className` al contenedor interno de contenido
- [x] **flex-shrink-0 en loan_id**: Cliente seleccionable en Quick Payment ahora tiene `flex-shrink-0` en el loan_id para evitar que se comprima
- [x] **flex-wrap en botones de monto**: Los botones 25%/50%/75%/100%/Cuota ahora envuelven en móvil con `flex-wrap`

## Hoy — 20 Jul 2026 (sesión 2)

### Fixes de persistencia de datos (críticos)
- [x] **Fix 1+8**: `handlePayInstallment` en LoanDetail.tsx ahora llama `updateLoanAfterPayment` y persiste `paid_amount`/`remaining_amount` en la tabla `loans` — evita que el pendiente vuelva al monto anterior al recargar
- [x] **Fix 1b**: Corregido `capital_amount` en `handlePayInstallment` — ahora separa capital de interés (usando `payInterestAmount`/`payCapitalAmount`) igual que `processInstallmentPayment`
- [x] **Fix 5**: `handleReversePayment` ahora resetea `status→'active'`, `progress`, `paid_installments` tras reversión; si es liquidación, recalcula todas las cuotas forzadas vía `recalculateInstallment`
- [x] **Fix 5b**: Se agregó `updateLoanAfterPayment` en reversión para recalcular métricas del préstamo desde datos reales

### Fixes de lógica de negocio
- [x] **Fix 2**: `calcCapitalRemaining` corregido — filtro invertido cambiado de excluir `capital_abono`/`installment` a incluir todos los pagos con `capital_amount > 0`
- [x] **Fix 3**: `handleCapitalAbono` ahora recalcula `installment_amount` en préstamos interest-only (nuevo interés = `newRemaining * periodicRate`), actualiza cuotas pendientes y persiste en DB
- [x] **Fix updateLoanAfterPayment**: `paidAmount` ahora incluye pagos tipo `capital_abono` y `liquidation` para préstamos no open-ended — evita que `remaining_amount` se sobreescriba con valor incorrecto tras abonos a capital

### Fixes de UI/UX
- [x] **Fix 6**: Badge de fecha en colecciones movido de la línea del nombre al subtítulo, y `flex-wrap` agregado para evitar truncamiento de nombres
- [x] **Fix 7**: Etiqueta "(C+I)" eliminada → ahora solo "Cuota" en NewLoanForm.tsx
- [x] **Progress bar**: `progressValue` en LoanDetail ahora calcula desde `installments.filter(status='paid')` si `loan.progress` es 0; mismo fix en LoansClientUnified y LoansClient

### Fixes de Dashboard/Reports
- [x] **Dashboard**: Capital recuperado ahora usa `totalCapital - pendingCapital` (con `remaining_amount` de loans activos) en vez de payments de 30 días
- [x] **Dashboard**: `overdueTotal` ahora descuenta `paid_amount` de cuotas parciales
- [x] **Dashboard**: Payments query extendido a 6 meses para gráfica mensual
- [x] **Reports**: `period` state ahora filtra loans/payments por fecha seleccionada
- [x] **Reports**: Monthly chart ya no salta meses sin payments (crea entrada si no existe)

### Pendiente
- [x] Bug 4: Fallback mejorado en historial cobros (muestra loan_id si client name es null)
- [x] **Bug 10: Sistema de Recibos post-pago**: Componente `PaymentReceipt` con formato imprimible (@media print), integrado en modal de éxito de LoanDetail y CollectionsContent. Incluye datos del negocio, cliente, préstamo, desglose (capital/interés/mora), balance anterior/nuevo. Botones PDF (print), WhatsApp, Compartir.

## Hoy — 26 Jul 2026

### Separación de lógica francesa vs interés-only (hooks)
- [x] **`loan-handler.types.ts`**: Interfaz compartida `LoanHandlerInput` (state + setters + services) que tipa los hooks de forma idéntica
- [x] **`useFrenchLoan.ts`**: Hook con los 4 handlers (`handlePayInstallment`, `handleCapitalAbono`, `handleLiquidation`, `handleReversePayment`) con lógica francesa — recalcula schedule con `recalculateFrenchSchedule` al abonar/reversar
- [x] **`useInterestOnlyLoan.ts`**: Hook con los 4 handlers con lógica interés-only — recalcula interés periódico sobre nuevo capital al abonar/reversar
- [x] **`LoanDetail.tsx` refactorizado**: Eliminados 400+ líneas de handlers inline; usa `useFrenchLoan` o `useInterestOnlyLoan` según `amortization_type`; imports limpios
- [x] **Aislamiento total**: Modificar lógica francesa (ej. fórmula de recálculo) no afecta interés-only y viceversa — archivos completamente independientes

### Pendiente
- Nada por ahora

## Hoy — 03 Ago 2026

### Panel de Administración (SaaS multi-tenant)
- [x] **Schema**: `supabase/admin-schema.sql` — tablas `app_users` (role admin/client, status active/blocked), `plans`, `subscriptions`, `subscription_payments` con RLS por rol
- [x] **RPC `is_admin()`**: guard security definer para middleware y API
- [x] **`handle_new_user` extendido**: al registrarse crea `app_users(role='client')` + suscripción `trial` (busca plan Trial) + settings
- [x] **Seed SQL comentado**: marcar tu email como admin + planes iniciales (Trial/Básico/Pro)
- [x] **Middleware**: `/admin/*` solo admin (vía RPC); login redirige admin→`/admin`, cliente→`/dashboard`; clientes con suscripción vencida/cancelada → `/suspended`
- [x] **`src/lib/admin.ts`**: `isAdminUser`, `getAdminSession`, `requireAdmin` (server), `requireAdminApi` (route handler guard + service role client)
- [x] **UI admin aislada**: `src/app/admin/*` con `AdminLayoutClient` + `AdminSidebar` (sidebar oscuro "GP Admin", separado de la app cliente)
- [x] **Páginas admin**: `/admin` (Resumen: MRR, clientes activos, por vencer, total cobrado), `/admin/users` (asignar plan, registrar pago, bloquear/desbloquear, crear usuario), `/admin/plans` (CRUD), `/admin/payments` (historial)
- [x] **API admin**: `/api/admin/users`, `/api/admin/users/[id]`, `/api/admin/plans`, `/api/admin/plans/[id]`, `/api/admin/payments` — todos con `requireAdminApi` + service role
- [x] **Pantalla `/suspended`**: suscripción vencida (client component por el icono de Phosphor que usa createContext)
- [x] **Verificado**: `npm run build` pasa (TypeScript OK). Icono del resumen es `Layout` (no `LayoutDashboard`) en esta versión de Phosphor
- [x] **Schema aplicado en Supabase**: `supabase/admin-schema.sql` ejecutado (4 tablas + RPC `is_admin` + `handle_new_user` extendido)
- [x] **Seed aplicado (vía service role)**: owner `yeysonmatos@outlook.com` (id `2863f8a1…`) marcado como **admin**; planes Trial (0 DOP) / Básico (500 DOP) / Pro (1000 DOP) creados; 3 cuentas client existentes con `app_users` + suscripción trial 14 días
- [x] **`SUPABASE_SERVICE_ROLE_KEY`** agregada a `.env.local` y `.env.production`
- [x] **Fix GoTrue 500**: `supabase/fix-auth-users.sql` — borra fila corrupta `5b37db05…` de `auth.users` (rompía `listUsers`) + crea RPC `admin_list_users()` (lee `auth.users` vía PostgREST, sin depender del endpoint GoTrue `/auth/v1/admin/users`). API `/api/admin/users` usa el RPC
- [x] **Middleware**: admin en rutas client → redirigido a `/admin` (antes solo redirigía desde `/login`)

## Hoy — 04 Ago 2026

### Retención SaaS + venta (fases 3-5, sin WhatsApp)
- [x] **Banner suscripción por vencer**: `dashboard/page.tsx` lee la suscripción del usuario; `DashboardContent` muestra banner ámbar cuando expira en ≤7 días ("Tu plan X vence el ... — contacta al administrador")
- [x] **Página `/pricing` pública**: server component que lee planes activos (RLS permite anon); 3 cards Trial/Básico/Pro con features + CTA a `/login?mode=register`. Sin iconos Phosphor (server component → usan createContext, mismo issue que `/suspended`)
- [x] **Login**: acepta `?mode=register` (abre directo el registro) + link "Ver planes" a `/pricing`
- [x] **Middleware**: `/pricing` agregado a `isPublic`
- [x] **`/account` self-service**: página cliente con plan actual (nombre, estado, inicio/vencimiento, días restantes, aviso si vence pronto) + historial de `subscription_payments`; datos del negocio desde `settings`. Ítem "Mi plan" (icono `Cardholder`) agregado al Sidebar
- [x] **Verificado**: `npm run build` OK (rutas `/account` + `/pricing` compilan), TypeScript OK, tests 35/35

## Hoy — 05 Ago 2026

### Upgrade de plan — Opción B (pago-por-plan-nuevo)
- [x] **Flujo**: cliente en Trial elige Básico/Pro → `POST /api/subscription/upgrade-request` crea una `subscription_payments` **pending** (amount = precio del plan nuevo, `target_plan_id`), ya NO un ticket de soporte
- [x] **Admin confirma en 1 acción** (`/admin/payments` o `/admin/users/[id]`): `confirm_payment` ahora resuelve `plan_id = payment.target_plan_id || sub.plan_id` → cambia el plan + extiende suscripción + audit `subscription.upgraded`
- [x] **SQL**: `supabase/sub-payment-target-plan.sql` agrega `subscription_payments.target_plan_id UUID → plans(id)`; `supabase/support-tickets-type.sql` agrega `support_tickets.type`
- [x] **Tickets de upgrade eliminados del flujo** (AdminUserDetail conserva código muerto inofensivo)
- [x] **Verificado**: `npx tsc --noEmit` y `npm run build` OK

### Pendiente (WhatsApp descartado — no se usará)
- ~~WhatsApp Cloud API~~ **descartado**: no se integra WhatsApp. Notificaciones solo por email (Resend).
- [x] **`RESEND_API_KEY` configurada** en `.env.local` y `.env.production` → notificaciones de correo activas (soporte, upgrades, pagos, recordatorios, vencimientos). Plan gratis Resend: 3,000 emails/mes, 100/día.
- [ ] **(Opcional futuro)** Job cron recordatorio automático: `POST /api/cron/daily` con `CRON_SECRET` + `vercel.json`.

## Hoy — 06 Ago 2026

### DOP-only (solo mercado dominicano)
- [x] **SQL**: `plans.currency` default `'DOP'` (admin-schema.sql), seed RD$ (Básico 500 / Pro 1000), `cleanup.sql` reset → `'DOP'`. Columna `currency` queda inerte (sin migración DROP)
- [x] **Tipos**: eliminado `Currency` + `CURRENCIES` de `src/types/index.ts`; `COUNTRIES` recortado a solo República Dominicana
- [x] **UI**: selectores de moneda eliminados de `SettingsContent.tsx` y onboarding (DOP fijo); `AdminPlans.tsx` y `AdminUsers.tsx` sin campo currency
- [x] **API**: `/api/admin/plans` (POST) escribe `currency: 'DOP'`; `plans/[id]` ya no actualiza currency; `/api/export` CSV sin columna "Moneda" (loans no tiene esa columna)

### Unificación de pagos admin
- [x] **`src/lib/billing.ts`**: `recordSubscriptionPayment()` — núcleo único que registra/confirma pago, extiende suscripción (upgrade con `target_plan_id` conserva `ends_at`, renovación extiende ciclo) y escribe `audit_logs`
- [x] **`POST /api/admin/payments`** (pago directo) y **`confirm_payment`** en `PATCH /api/admin/users/[id]` delegan en el mismo helper — un solo punto de verdad

### Métricas y escalabilidad
- [x] **`supabase/admin-stats.sql`**: RPC `admin_usage_stats(p_from_month)` — agregación 100% en SQL (ingresos por mes, usuarios por plan, conversión sin ventana de meses, MRR, counts). **Aplicado en Supabase**
- [x] **`/api/admin/stats`** reescrito para usar el RPC (deja de cargar tablas completas y agregar en JS)
- [x] **`GET /api/admin/users/[id]`**: loans/clients/payments ahora filtrados por `user_id` (antes cargaba TODA la BD de todos los usuarios); eliminado refiltrado en JS
- [x] **`GET /api/admin/users` (listado)**: reescrito para usar RPC `admin_usage_by_user()` — los conteos de uso (loans/clients/payments por usuario) se agregan en SQL; ya no carga las tablas completas
- [x] **MRR unificado**: `AdminOverview` usa `mrr`/`total_collected`/`recent_payments` del RPC (eliminada dependencia de `/api/admin/payments`); RPC `users_per_plan` ahora incluye `name`
- [x] **Errores 400**: `BillingError` en `billing.ts`; `POST /api/admin/payments` devuelve 400 para errores de negocio (sin suscripción, solicitud ya procesada, monto ≤0)
- [x] **Tests nuevos**: `src/lib/__tests__/billing.test.ts` — `computeUpgradeAmount` (prorate) + `recordSubscriptionPayment` (pago directo, confirmación pending, upgrade conserva ends_at, BillingError). **41/41 tests pasando**
- [x] **Paginación `/admin/payments`**: servidor — `GET /api/admin/payments` ahora acepta `page`/`page_size` (default 20, max 100), usa `.range()` y devuelve `total` (conteo con `count:'exact'`, mismos filtros), `total_amount` (suma de no-rechazados) y `counts` globales por estado. UI: `AdminPayments.tsx` con botones Anterior/Siguiente y reset a página 1 al filtrar
- [x] **Paginación `/admin/users`**: cliente (porque filtra en cliente) — `AdminUsers.tsx` pagina `filteredUsers` a 10/página con controles y reset al cambiar filtro
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41

### Pendiente
- Rotación de tokens (service_role + access token) — aplazada por el usuario

## Hoy — 06 Ago 2026 (sesión 2)

### Fixes críticos del panel admin
- [x] **Fix payJSON 500 en rutas admin**: `createRouteHandlerClient` en `src/lib/supabase-route.ts` usaba `NextResponse.next()` → **prohibido en app route handlers** (`NextResponse.next() was used in a app route handler, this is not supported`), causaba 500 con body vacío → client roto en `.json()`. Cambiado a `new NextResponse()` acumulando Set-Cookie; impacta todas las rutas admin y de app que propagan `supabaseResponse`.
- [x] **Fix métricas admin (is_admin guard)**: `supabase/admin-stats.sql` — el RPC `admin_usage_stats` tenía `IF NOT public.is_admin() THEN RAISE`. `is_admin()` chequea `auth.uid()`, NULL bajo service_role (cliente del API admin) → siempre 403/"Acceso denegado" → MRR/total/count eran 0. Eliminado el guard y protegido con `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.admin_usage_stats(text) TO service_role;`. Ahora MRR calcula precios reales, `total_collected` suma confirmados, planes por suscripción más reciente.
- [x] Verificado con datos: MRR RD$1,000 (2×Básico), Total cobrado RD$7,000, Suscripciones activas 2, Trial→Pago 67%, Usuarios por plan Básico 2/Trial 1.

## Hoy — 09 Ago 2026 (sesión 1)

### Auditoría entendible para el prestamista
- [x] **`src/lib/audit-ui.ts` reescrito**: `detailsSummary` ahora produce frases legibles por `action`/`entityType` en lugar de volcar `details` crudos. `ACTION_LABELS` agrega `subscription.upgraded` ("Cambio de plan"), traduce `subscription.rejected`, corrige duplicado de `subject` (ticket mostrará "Asunto: …"). Monedas formateadas `RD$…`, fechas de backup como `09/08/2026 12:51`, `open_ended` como "sí/no", tabla de claves conocidas (evita filtrado de raw). Labels de settings más claros ("Mora diaria", "Prefijo de ID", "Días de gracia").

### Eliminación de préstamos: borrado real + pagos conservados
- [x] **`supabase/delete-preserve-payments.sql`** (aplicado): `payments.loan_id` pasa de `ON DELETE CASCADE` a `ON DELETE SET NULL` (nullable); RLS de payments ampliada a `auth.uid() = payments.user_id OR EXISTS(loans del usuario)` (pagos huérfanos legibles); `update_client_stats.total_paid` ahora suma `payments.capital_amount` (status paid) en vez de `loans.paid_amount` → lo cobrado sobrevive al borrado.
- [x] **`DELETE /api/loans/[id]`**: lee el préstamo antes de borrar; tras borrar registra auditoría `loan.deleted` (label ya existía en `audit-ui.ts`) y llama `update_client_stats`.
- [x] **`LoanDetail.tsx`**: botón papelera (Trash) en header → `BottomSheet` de confirmación que avisa que cuotas se eliminan, pagos cobrados siguen en Dashboard/Reportes y documentos quedan en el cliente → `fetch DELETE` → redirige a `/loans`. Variante `danger` de Button/Alert ya existía.
- [x] **"Capital recuperado" ahora viene de los pagos** (no de restar lo pendiente): Dashboard (`capitalPayments` query + `DashboardContent.recoveredCapital = Σ capital_amount`) y Reports (`ReportsContent.recoveredCapital = Σ payments.capital_amount`). Resuelve que la parte de capital ya cobrada por cuota no se pierda al borrar el préstamo.
- [x] **Schema sincronizado**: `schema.sql` y `security-guards.sql` actualizados (FK SET NULL, RLS, `update_client_stats`).
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, migración aplicada (FK `confdeltype='n'`, policy RLS correcta). Desplegado en staging `gestion-prestamos-8m6bn6h8e…` → alias `staging-gestion-prestamos.vercel.app`.

### Pendiente
- Probar el flujo completo en staging: prestar → cobrar cuota → borrar préstamo → Dashboard/Reportes conservan el pago y "capital recuperado".

## Hoy — 09 Ago 2026 (sesión 2)

### Revisión integral del borrado de préstamos — correcciones
- [x] **Fix coherencia Dashboard**: eliminado `.limit(50)` de la query `loans` → las tarjetas Prestado/Pendiente/Recuperado usan todos los préstamos; tarjeta renombrada a **"Capital Recuperado (histórico)"** (aclara que incluye préstamos borrados).
- [x] **Fix Reportes exactos**: eliminado `.limit(100)` en la query de `payments` pagados → ingresos/recuperado del período exactos; tarjeta renombrada a **"Capital recuperado (período)"**.
- [x] **Fix "Total pagado" del cliente**: `update_client_stats.total_paid` pasa de `SUM(capital_amount)` a `SUM(amount)` (capital + interés + mora) → refleja todo lo que el cliente pagó y sigue sobreviviendo al borrado. Aplicado en `schema.sql`, `security-guards.sql`, `delete-preserve-payments.sql`.
- [x] **Fix RLS payments endurecida**: política única `FOR ALL` reemplazada por dos — **SELECT** `auth.uid() = payments.user_id OR EXISTS(préstamo propio)` (pagos huérfanos legibles) y **INSERT/UPDATE/DELETE** solo `EXISTS(préstamo propio)` (un pago huérfano ya no se puede modificar ni reasignar a otra cuenta). En `schema.sql` y `delete-preserve-payments.sql`.
- [x] **Fix texto del modal**: "seguirán contando en tu Dashboard e historial" (se quitó la promesa sobre Reportes).
- [x] **Fix aviso saldo a favor**: `LoanDetail.tsx` muestra línea ámbar en el modal de borrado cuando `loan.prepaid_balance > 0` ("se perderá al eliminar").
- [x] **`supabase/post-delete-review.sql` + `scripts/exec-post-delete-review.mjs`**: migración idempotente que aplica los fixes SQL (total_paid + RLS) a la BD en producción.

## Hoy — 09 Ago 2026 (sesión 3)

### Borrado lógico (soft delete) reemplaza al borrado físico
- [x] **Decisión**: el borrado físico generaba pagos huérfanos, exigía apretar RLS y perdía el saldo a favor. Se migró a **archivado** (`loans.deleted_at TIMESTAMPTZ`): el préstamo desaparece de las listas pero su historial, cuotas, pagos y documentos se conservan. Aprobado por el usuario.
- [x] **`supabase/soft-delete-loans.sql` + `scripts/exec-soft-delete-loans.mjs`** (aplicado): columna `deleted_at` + índice `loans(user_id, deleted_at)`; `update_client_stats` excluye préstamos archivados de los agregados de préstamos (`total_paid`/`last_payment_at` siguen sumando pagos de archivados).
- [x] **`DELETE /api/loans/[id]`** ahora hace `UPDATE loans SET deleted_at=now(), status='cancelled'` (mantiene auditoría `loan.deleted` + `update_client_stats`).
- [x] **Filtros `.is('deleted_at', null)`** (préstamos) y `.is('loan.deleted_at', null)` (cuotas vía join) en: listado préstamos (page + api), detalle/edición (PATCH y edit → 404 si archivado), Dashboard (loans + overdue/upcoming), Collections (page + api + open-ended + QuickPayment), Calendar (page + api + open-ended), Reportes (loans; payments conservan historial), clientes (lista + perfil), export, loan-status (page + cron), y pagos (POST bloquea préstamos archivados).
- [x] **Modal LoanDetail** actualizado: dice que se **archiva**, que cuotas/pagos/documentos se conservan y que el **saldo a favor no se pierde** (se quitó el aviso ámbar de pérdida).
- [x] **Tipo `Loan.deleted_at`** agregado; fixtures de tests actualizados.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41, migración aplicada, prueba transaccional ROLLBACK (5/5 OK: préstamo sigue en BD, deleted_at+cancelled, pago conserva loan_id, capital recuperado incluye, listado lo oculta) y 0 residuos.

## Hoy — 10 Ago 2026 (sesión 2)

### Auditoría entendible: nombre + N° de préstamo en todos los eventos
- [x] **Auditoría con nombre del cliente**: `DELETE /api/loans/[id]` ahora lee `client:clients(name)` y guarda `details.client_name`; `detailsSummary` (audit-ui) muestra "Cliente: {nombre} · N°: {loan_id}" en Préstamo eliminado — aplica a settings/AdminAudit/AdminUserDetail. Solo los borrados futuros lo incluyen (los antiguos no tenían el dato).
- [x] **Auditoría completa: nombre + N° en todos los eventos de préstamo/pago**: `detailsSummary` (audit-ui) ahora muestra `Cliente: {nombre}` y `N°: {loan_id}` también para eventos de tipo `payment` (Pago registrado/revertido/Abono a capital — antes solo tenían monto/mora/motivo, y el N° era el UUID en vez del visible). Detalles actualizados: `loan.liquidated` ahora guarda `loan_id` + `client_name` (antes ni el N° ni el cliente); `loan.created` (NewLoanForm) agrega `client_name` desde la lista de clientes; `loan.updated` (PATCH /api/loans/[id]) agrega `client_name` desde el embed `client:clients(*)`; `payment.recorded`/`capital_abono`/`payment.reversed` en `useSharedLoanHandlers` y `CollectionsContent` guardan `loan_id` visible (`loan.loan_id`/`inst.loan.loan_id`) + `client_name`. El `N°` que se muestra es el visible (ej. `L-558094`), no el UUID.

### Fix capital pendiente: solo principal (no interés programado)
- [x] **Bug confirmado por el usuario**: en francesa, `loans.remaining_amount` incluye el interés programado de las cuotas por vencer → "Capital Pendiente" se inflaba (40,000 ≠ 36,535 + 3,965 = 40,500). El interés ya tiene su indicador propio ("Total Intereses proyectados" / "Intereses cobrados"); el capital pendiente debe ser SOLO principal.
- [x] **`supabase/loan-stats.sql` (re-escrito)**: `pending_capital`, `active_capital` y `late_capital` ahora = `GREATEST(0, amount − Σ payments.capital_amount pagado)` vía subconsulta por lao (LEFT JOIN de pagos agrupados), NO `remaining_amount`. Se cumple la identidad contable **Prestado = Recuperado + Pendiente**.
- [x] **Verificado en BD real (cuenta `babfefb8…`)**: Prestado 40,000 = Recuperado 36,534.74 + Pendiente 3,465.26 (antes 3,965 inflado con ~500 de interés). El RPC devuelve NULL a la Management API (guard de seguridad, rol no superuser) y funciona con el JWT del usuario en la app — comportamiento esperado.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41, migración `scripts/exec-loan-stats.mjs` aplicada (201). Aplazado deploy hasta sesión de auditoría (ya desplegada juntas en siguiente linea).

## Hoy — 09 Ago 2026 (sesión 4)

### RPC centralizado `get_loan_stats` (fuente única de "capital recuperado")
- [x] **Decisión**: antes cada pantalla calculaba sus métricas en JS desde arrays descargados (`Dashboard` historial completo, `Reportes` período con filtros). El objetivo era un solo punto de verdad en SQL para que las tarjetas no difieran ni dependan del `.limit()` de las queries.
- [x] **`supabase/loan-stats.sql` + `scripts/exec-loan-stats.mjs`** (aplicado): `public.get_loan_stats(p_user_id, p_from_date DEFAULT NULL)` SECURITY DEFINER. Devuelve jsonb con `total_capital`, `recovered_capital`, `pending_capital`, `generated_interest`, `collected_interest`, `active_capital`, `late_capital`, `active_loans`, `outstanding_loans` (activos+morosos), `paid_loans`, `late_loans`, `active_clients`, `late_clients`.
- [x] **Guarda de seguridad**: `auth.uid()` debe ser NULL (con rol superuser) o igual a `p_user_id`; si no, devuelve NULL. Verificado: sin JWT la management API (rol postgres sin superuser) recibe NULL (bloqueado) — en la app el JWT del usuario coincide con `p_user_id`.
- [x] **Exclusión de archivados**: préstamos con `deleted_at NOT NULL` fuera de los agregados de préstamos; pagos históricos (`capital_amount`/`interest_amount` de `payments`) siempre suman.
- [x] **Dashboard** (`page.tsx` + `DashboardContent.tsx`): elimina la query `capitalPayments` y `clients`; usa `loanStats` para Capital Prestado/Recuperado/Pendiente/Intereses y Clientes activos/morosos. Tarjeta renombrada antes "Capital Recuperado (histórico)" se mantiene con `stats.recovered_capital` (sin fecha → historial completo).
- [x] **Reportes** (`page.tsx` + `ReportsContent.tsx`): llama el RPC con `p_from_date = effectiveFilterDate ?? null` (período en reportes avanzados, histórico en 'all'). Elimina la query `clients` y el `useMemo` de cálculos; `portfolioHealth` se deriva de `active_capital`/`late_capital` del RPC. `statusData` usa `outstanding_loans`/`paid_loans`/`late_loans`.
- [x] **Tipo `LoanStats`** agregado a `src/types/index.ts`; `EMPTY_STATS` fallback en ambos componentes si el RPC devuelve null.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41, función presente en BD y agregaciones internas validadas con datos reales (total 581K, recuperado 92.9K, pendiente 528.2K, 24 en curso).
- [ ] **(Pendiente)** Desplegar sesión 4 a staging.

## Hoy — 09 Ago 2026 (sesión 5)

### Fix de raíz: mora por cuotas vencidas + UI de listado
- [x] **Causa del bug "Clientes morosos 0 / Salud cartera 100%"**: el cron de mora pinta los préstamos con `late_1_30/31_60/61_90` (nunca `late`), y el RPC contaba morosos solo con `status='late'` exacto → siempre 0. Confirmado en BD: cuenta `bab…` tenía RD$97,702 en cuotas vencidas y 0 préstamos marcados late.
- [x] **`supabase/loan-stats.sql` re-escrito**: `late_loans`, `late_capital`, `late_clients` y `active_capital`/`active_loans` se calculan con las **cuotas realmente vencidas** (subconsulta `late_loan_ids`: `installments.status IN (pending,partial,late) AND due_date < CURRENT_DATE`), no por estado del préstamo. Mora contada **"vencida hoy"** sin respetar período de Reportes (decisión del usuario); movimiento (prestado/recuperado/interés) sí respeta `p_from_date`. `pending_capital` incluye `late_*`. Aplicado y verificado: cuenta `bab…` → 3 préstamos morosos, 2 clientes morosos, RD$184,509.97 en capital moroso.
- [x] **Dashboard**: tarjeta renombrada a **"Total capital recuperado"** (sin "(histórico)").
- [x] **Reportes**: eliminado `.limit(100)` de la query de préstamos (`reports/page.tsx`) → gráfico "Ingresos vs Préstamos" usa todos los préstamos.
- [x] **Listado de préstamos** (`LoansClientUnified.tsx` + `LoanFilters.tsx`): el default ahora es **"En curso"** (`status='active'`), que incluye activos + atrasados `late_*`. Los **pagos no salen mezclados**; solo se ven con el filtro "Pagados" (o "Todos"). `clearStatus`/`clearAll` vuelven a "En curso". Chip "Activos" renombrado a **"En curso"**. Lógica de "filtros activos"/EmptyState trata `'active'` como default (sin badge fantasma). Contadores del chip agregan `late_*` a En curso/Atrasados.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41, datos reales con mora detectada.
- [x] **(Desplegado)** sesión 4+5 a staging (alias `staging-gestion-prestamos.vercel.app`).

## Hoy — (sesión 6)

### Fix del nivel de confianza (trust_score) + etiquetas Dashboard
- [x] **Causa raíz**: `update_client_stats` contaba morosos con `status='late'` exacto (que el cron nunca deja) → `late_loans` siempre 0 → todos quedaban "Alto 75/90" aunque debieran mora real.
- [x] **`supabase/client-stats-fix.sql` + `scripts/exec-client-stats-fix.mjs`** (aplicado): `update_client_stats` ahora cuenta mora real por cuotas vencidas (`installments.status IN (pending,partial,late) AND due_date < CURRENT_DATE`, no archivados) — mismo criterio que `get_loan_stats`; `active_loans`/`balance` incluyen `late_1_30/31_60/61_90`. Misma fórmula (50 +25/no-mora +15/pagados −10/moroso, ≥75 Alto / ≥40 Medio / <40 Bajo) y todas las copias sincronizadas (schema, security-guards, delete-preserve, soft-delete, post-delete-review).
- [x] **Guarda de seguridad corregida**: Supabase Cloud no da `postgres` como superuser → la invocación desde cron/management retornaba temprano y nunca actualizaba. Ahora acepta `current_user='postgres'` además de superuser.
- [x] **Cron `recalc-client-stats-daily`** re-registrado en BD con nuevo SQL (incluye `late_*` + `deleted_at IS NULL`); comentario actualizado en schema.sql.
- [x] **Re-procesado**: 29 clientes recalculados. Verificado en BD: cliente con 2 préstamos vencidos pasó de "Alto 75%" a **"Bajo 30"**; distribución 27 Alto / 1 Medio / 1 Bajo.
- [x] **Dashboard** (`DashboardContent.tsx`): tarjetas renombradas a **"Total Capital Prestado"**, **"Total Capital Pendiente"**, **"Total Intereses proyectados"**.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41. Desplegado a staging.
- [ ] **(Pendiente)** Desplegar sesión 6 a producción (vercel --prod).

## Hoy — (sesión 7)

### Eliminación de préstamo: confirmación clara, motivo y banner
- [x] **Modal de eliminación** (`LoanDetail.tsx`): texto cambiado a **"Seguro que deseas eliminar el préstamo {loan_id} de {monto}?"** + nota "Los pagos ya cobrados seguirán contando en tu Dashboard e historial y los documentos seguirán guardados en el cliente". Campo **"Motivo de eliminación (opcional)"** (textarea 300 chars) → state `deleteReason`.
- [x] **`supabase/delete-loan-reason.sql` + `scripts/exec-delete-loan-reason.mjs`** (aplicado): columna `loans.deleted_reason TEXT`; sync en `schema.sql` + tipo `Loan.deleted_reason` (+ fixtures de tests y objeto Loan de CollectionsContent). Borrado lógico mantiene la fila → el motivo persiste.
- [x] **`DELETE /api/loans/[id]`**: lee `body.reason`, lo persiste como `deleted_reason` en el préstamo y en `audit_logs.details.reason` (audit-ui ya muestra "Motivo: …").
- [x] **Banner post-eliminación**: `handleDeleteLoan` navega a `/loans?deleted=<loan_id>&amount=<monto>`; `loans/page.tsx` lee `searchParams` y lo pasa a `LoansClientUnified`, que muestra `Alert variant="success"`: **"El préstamo {loan_id} de {monto} fue eliminado."** con botón "Entendido".
- [x] **Cabecera responsive 375px** (`LoanDetail.tsx`): contenedor pasa a `flex flex-col sm:flex-row` (botones en fila propia debajo en móvil) + botones con `flex flex-wrap gap-1` — deja de distorsionarse el header. Icono `Warning` sin uso eliminado del import.
- [x] **Ajustes post-feedback**: quítado el botón "Entendido" del banner (desaparece al navegar a otro menú; `LoansClientUnified` hace `router.replace('/loans')` al montar para limpiar los query params y que no reaparezca al volver). La pregunta del modal de eliminación adopta el mismo formato que la nota inferior: caja `bg-red-50 border-red-200` con icono `Trash`, texto `text-sm text-muted-foreground`.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41, migración aplicada. Desplegado a staging (`staging-gestion-prestamos.vercel.app` + preview `gestion-prestamos-ponqh1ip0-ymatos-projects.vercel.app`).

### Verificación post-borrado (10 Ago) — Fix: filtro embedded `!inner`
- [x] **Verificado en BD**: tras eliminar préstamos de prueba, todas las tarjetas concuerdan (Capital prestado/recuperado/pendiente/intereses, préstamos act/pag, clientes) porque vienen del RPC `get_loan_stats` que excluye `deleted_at`. El RPC es la fuente única y da números correctos.
- [x] **Bug encontrado**: "Cobros vencidos 97,702" y "Próximos pagos" del Dashboard mostraban cuotas de préstamos **borrados**. Causa: `.is('loan.deleted_at', null)` sobre el embed `loan:loans(...)` NO filtra las filas padre en PostgREST (solo recorta el embed que queda `null`). Verificado directo en la API: sin `!inner` devuelve las 15 cuotas vencidas de borrados; con `!inner` devuelve 0.
- [x] **Fix aplicado (11 queries en 6 archivos)**: `dashboard/page.tsx` (overdue+upcoming), `collections/page.tsx` (hoy/vencidos/próximos), `calendar/page.tsx` (installments), `loans/page.tsx` (pendingInstallments), `api/calendar/route.ts`, `api/collections/route.ts` — el select embedido pasa a `loan:loans!inner(...)` (inner join → solo cuotas cuyos préstamos NO estén archivados). Las queries de `payments` con historial de borrados se mantienen intactas (correcto por diseño).
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41. Desplegado a staging.
- [x] **Explicación números Dashboard/Reportes**: tras borrados, Prestado 40,000 = L-712626+L-059608 (no archivados), Recuperado 36,535 = Σ capital pagado, Pendiente 3,465 = saldo L-059608, Intereses proyectados 49,850 = Σ total_interest no archivados. El RPC excluye `deleted_at`; solo los pagos históricos de borrados siguen sumando al recuperado.
- [x] **Auditoría con nombre del cliente**: `DELETE /api/loans/[id]` ahora lee `client:clients(name)` y guarda `details.client_name`; `detailsSummary` (audit-ui) muestra "Cliente: {nombre} · N°: {loan_id}" en Préstamo eliminado — aplica a settings/AdminAudit/AdminUserDetail. Solo los borrados futuros lo incluyen (los antiguos no tenían el dato).
- [x] **Auditoría completa: nombre + N° en todos los eventos de préstamo/pago**: `detailsSummary` (audit-ui) ahora muestra `Cliente: {nombre}` y `N°: {loan_id}` también para eventos de tipo `payment` (Pago registrado/revertido/Abono a capital — antes solo tenían monto/mora/motivo, y el N° era el UUID en vez del visible). Detalles actualizados: `loan.liquidated` ahora guarda `loan_id` + `client_name` (antes ni el N° ni el cliente); `loan.created` (NewLoanForm) agrega `client_name` desde la lista de clientes; `loan.updated` (PATCH /api/loans/[id]) agrega `client_name` desde el embed `client:clients(*)`; `payment.recorded`/`capital_abono`/`payment.reversed` en `useSharedLoanHandlers` y `CollectionsContent` guardan `loan_id` visible (`loan.loan_id`/`inst.loan.loan_id`) + `client_name`. El `N°` que se muestra es el visible (ej. `L-558094`), no el UUID.

## Hoy — 10 Ago 2026 (sesión 8)

### Rediseño de listados de cuotas (estilo compacto)
- [x] **Nota de trazabilidad**: NO existe `src/components/loans/InstallmentRows.tsx`. La sesión original la documentó como componente nuevo, pero el render quedó **inline en cada pantalla** (verificado en git: nunca se commiteó tal archivo). Lo que sigue describe el estado real del código.
- [x] **`LoanDetail.tsx`**: grid de cards de cuota inline con `installments.map(inst => …)` (líneas ~435-506): número en caja de color por estado (paid success / partial azul / vencida rojo / pendiente ámbar), monto restante (o completo si pagada), fecha, Badge (Pagada/Parcial/Vencida/Pendiente), detalle Cap/Int/Mora/Saldo (o Int/Mora/Bal en interest-only), botón "Pagar {restante}" (o línea "Cobrado {fecha}" / "Pagado X de Y"). Handler de pago extraído a `openPayModal(inst)` (setPaymentInstallmentId + mora con `calculateLateDays`/`calculateLateAmount` + includeMora + paymentAmount + showPayment). Las 4 tarjetas resumen (Pendientes/Pagadas/Por cobrar/Mora total) se conservan.
- [x] **`CollectionsContent.tsx`**: listado de cobros inline con `filteredList.map(inst => …)` (líneas ~472-523): avatar con inicial, nombre, Badges (Hoy / {días}d atrasado / Parcial), "Cuota #N · L-xxx" (o "Interés · L-xxx" en open-ended), monto (+mora), botón "Cobrar".
- [x] **`CalendarContent.tsx`**: vista mensual (grid 7 columnas) + lista de cuotas diarias inline con `filtered.slice(0, listLimit).map(inst => …)` (líneas ~271+). Los open-ended generan 12 vencimientos sintéticos (`buildSynthetic`).
- [x] **Verificado**: `npx tsc --noEmit` OK, vitest 41/41, `npm run build` OK (Next 16.2.10, 45 rutas).
- [ ] **(Pendiente)** Desplegar sesión 8 a staging (`vercel --prod` con token vcp_...).

## Hoy — 11 Ago 2026

### Badge de atraso dinámico + mora inmediata
- [x] **`lateStatusLabel(status, lateDays)`** en `src/lib/utils.ts`: "Atrasado Nd" para `late`/`late_1_30`/`late_31_60`/`late_61_90`. Aplicado en cards/tabla de `LoansClientUnified` y header de `LoanDetail`.
- [x] **`computeLateStatus`** en `src/lib/loan-status.ts`; `NewLoanForm` y `PATCH /api/loans/[id]` pinta `status`+`late_days` al crear/editar si hay cuotas vencidas → la mora aparece **de inmediato** (no al día siguiente). Script `scripts/repaint-loan-statuses.mjs` repintó préstamos existentes.
- [x] **Decisión usuario**: el badge cuenta días calendario desde el vencimiento SIN días de gracia; la mora en RD$ sí aplica tras la gracia.
- [x] Card de préstamo: solo fecha de inicio (se quitó próximo vencimiento) y línea duplicada de días atrasados.
- [x] **Stripe eliminado** en 4 pantallas: LoansClientUnified, ClientsClient (borrado `statusColorMap`), CollectionsContent, ClientProfile.
- [x] **Ruido visual**: ClientsClient sin badge de trust, badge de estado solo si `status !== 'active'`; Collections botón "Cobrar" sin icono.
- [x] **Etiquetas de saldo**: "Saldo pendiente" → **"Total por cobrar"** (perfil), "Saldo:" → **"Por Cobrar:"** (card clientes y card préstamos). La fórmula NO cambió (`balance` = Σ `remaining_amount`, incluye interés programado — decisión del usuario).
- [x] **Perfil cliente unificado**: pestaña "Préstamos (N)" muestra todos los no-archivados (activos primero, pagados al final con badge verde "Pagado"); card de pagado muestra **"Cobrado RD$… · fecha"** (`paid_amount`/`paid_at`).
- [x] **Fix pestaña del perfil**: filtro ahora `status==='active' || isLateStatus()` (las cuotas repintadas `late_*` ya contaban).

### Clientes inactivos automáticos
- [x] **`supabase/client-status-auto.sql` (aplicado)**: `update_client_stats` marca `clients.status = CASE WHEN v_active_loans > 0 THEN 'active' ELSE 'inactive' END` (v_active_loans = préstamos `active`/`late*` no archivados). Cron `recalc-client-stats-daily` pasa a reevaluar **todos** los clientes + backfill. 6 copias de la función sincronizadas (schema, security-guards, delete-preserve, soft-delete, post-delete-review, client-stats-fix).
- [x] **`POST /api/clients`** inserta `status: 'inactive'` (cliente nuevo nace inactivo) → al crearle un préstamo pasa a "Activo" al instante; al archivar el último vuelve a "Inactivo".
- [x] **`getStatusLabel`** incluye `inactive: 'Inactivo'`; badge gris (`bg-muted-foreground`) y filtro "Inactivos" en la lista ya funcionaban.
- [x] **Fix selector Nuevo préstamo**: `loans/new/page.tsx` filtraba `status='active'` y ocultaba clientes inactivos → se quitó el filtro.

### Deploy
- [x] **Staging**: preview + alias (`staging-gestion-prestamos.vercel.app`), producción `gestion-prestamos-one.vercel.app` **intacta**. Verificado en staging: todo funciona.
- [ ] **(Pendiente)** Producir: mismo build a `vercel --prod` cuando el usuario lo decida.

## Hoy — 13 Ago 2026

### Auditoría Financiera y Contable (Verificación + Corrección)
**Contexto Fase A**: la BD de producción está vacía de dinero por diseño — el commit `0ca8d4e` aplicó `supabase/cleanup.sql` (DELETE payments/installments/loans/documents, conserva clients). Estado real: `clients=24` (todos de `user_id f4bebbc7-2ed5-4a07-a8c4-13d9ed9d4130`), `app_users=4`, `subscriptions=3`, `plans=3`, `settings=0`, `payments/loans/installments/audit_logs/subscription_payments=0`. Por eso las consultas A1-A8 devuelven vacío: la limpieza, no el código. Los bugs de Fase B son reales e independientes.

- [x] **B1 · `/api/export` eliminado**: `src/app/api/export/route.ts` estaba roto (select `*, person:people(*), payments(*)` — tabla `people` inexistente; sumaba pagos `reversed`; `remaining = amount − totalPaid`). Sin referencias en código.

### B2-B6 · Pagos, recibos y auditoría (código)
- [x] **B2 · Liquidación sincroniza `paid_amount`**: `useSharedLoanHandlers.handleLiquidation` ahora llama `updateLoanAfterPayment` y luego persiste `loans.paid_amount = Σ payments.amount` (status paid) — antes quedaba `paid_amount` = monto original del préstamo sin actualizar.
- [x] **B3 · Auditoría de pago usa efectivo real**: `CollectionsContent` loggea `payment.amount`/`late_amount`/`capital_amount`/`interest_amount` del payment devuelto por el RPC (antes `allocation.totalPaidOnInstallment`, que ignora crédito consumido/mora).
- [x] **B4 · Recibo: "Nuevo balance" = `loan.remaining_amount` persistido** (PaymentReceipt) en vez de `previousBalance − amount` (frágil con crédito consumido/surplus). `previousBalance` queda como línea informativa.
- [x] **B5 · Modal de éxito unificado**: `handleCapitalAbono` y `handleLiquidation` ahora abren el mismo modal de éxito con recibo (`setShowSuccess`), igual que el pago de cuota en `useSharedLoanHandlers` y `CollectionsContent`.
- [x] **B6 · WhatsApp de Collections arreglado**: buscaba `successPayment.loan?.client` (el RPC no lo embebe) → nunca abría `wa.me`. Ahora `successLoanInfo` guarda `whatsapp`/`phone` desde `inst.loan?.client`/`openEndedLoan` (embed `client:clients(id, name, phone, whatsapp)` en la query open-ended de page.tsx) y el botón los usa.

### B7 · Copias de RPC unificadas
- [x] **`schema.sql`**: `process_installment_payment` no tenía la **guarda de orden** ("Debes pagar las cuotas anteriores primero") que sí tenían `security-guards.sql` y `cascade-guard.sql`. Agregada → las 3 copias ahora son idénticas (idempotente: CREATE OR REPLACE).

### B8 · Open-ended excluido del balance del cliente (REVERTIDO)
- [ ] ~~Decisión aprobada por el usuario~~ → **revertida a petición del usuario**: `clients.balance` vuelve a sumar `remaining_amount` de TODOS los préstamos activos/morosos no archivados, **incluyendo open-ended**, como estaba desde el principio. Eliminados: filtro `open_ended = false` de las 7 copias, columna `open_ended_balance`, línea "Solo interés" en tarjeta/perfil, campo `Client.open_ended_balance`, y los archivos `supabase/balance-open-ended.sql` + `scripts/exec-balance-open-ended.mjs`. `audit-reconcile.sql` (invariante 3) mide contra la misma fórmula original (sin filtro open-ended).

### Fase C · Reconciliación contable
- [x] **`supabase/audit-reconcile.sql` + `scripts/exec-audit-reconcile.mjs`**: RPC `public.reconcile_money(p_user_id DEFAULT NULL)` — verifica 3 invariantes: (1) identidad contable `amount = capital_paid + capital_pending` en préstamos activos no archivados (solo principal, excluye open-ended), (2) `payments.amount = Σ(capital+interés+mora)` por pago pagado, (3) `clients.balance == Σ remaining_amount` de sus préstamos activos/morosos no archivados no open-ended (misma fórmula de update_client_stats). Devuelve `{ ran, testable_loans, open_ended_skipped, payment_rows, clients_checked, error_count, errors[] }`. Con `p_user_id` NULL recorre toda la BD; con UUID valida una cuenta.

### Denominadores (documentación)
- [x] **`recovered_capital` (Dashboard/Reportes, vía `get_loan_stats`) = Σ `payments.capital_amount`** — SOLO principal cobrado, histórico (sin fecha) o por período.
- [x] **`clients.total_paid` (perfil) = Σ `payments.amount`** — capital + interés + mora, todo lo que el cliente pagó. Dos métricas distintas a propósito.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 46/46.
- [x] **`audit-reconcile.sql` aplicado en BD** y correr `reconcile_money()`: 201 OK; reporte limpio (3 préstamos verificables, 1 open-ended omitido, 0 pagos, 25 clientes con balance OK, **0 errores**).
- [x] **Fix "Por cobrar" en préstamos open-ended**
- [x] **Bug**: en el detalle de un préstamo open-ended (solo interés) el header "Por cobrar" mostraba RD$0. Causa: `totalPorCobrar` se calculaba desde `installments` (cuotas) — un préstamo abierto **no genera cuotas**, así que la suma daba 0 aunque quedara capital. Corregido en `LoanDetail.tsx`: para `isOpenEnded`, `capitalPorCobrar = loan.remaining_amount` e `interesPorCobrar = 0` (el capital pendiente real, ej. RD$50,000). La barra de progreso y el resumen ya usaban `remaining_amount` y eran correctos.

## Hoy — 13 Ago 2026 (sesión 2) · Auditoría 7 — Reportes y Documentación (verificación + fixes)

### Auditoría 7 (verificación amplia)
Inventario completo de los puntos auditados: Dashboard (8 tarjetas vía `get_loan_stats` + gráfica 6 meses), Reportes (filtro período, plan avanzado Pro), Recibos (PaymentReceipt imprimible), Contrato (modal lectura), WhatsApp (wa.me texto en 4 botones), CSV (solo admin), Historial (8 listados), Documentos (Storage). Denominadores ya documentados en sesión anterior.

### Fixes aplicados
- [x] **A1 · Botón "Ver todos" engañoso** (`LoanDetail.tsx`): copiaba un resumen de pagos al portapapeles en silencio (y solo si existía teléfono). Reemplazado por botón honesto **"Copiar resumen"** con feedback visual ("¡Resumen copiado!") vía estado `summaryCopied` y `tooltip` explícito.
- [x] **A2 · Impresión multi-cuota rota** (`LoanDetail.tsx`): cuando un pago cubría varias cuotas el modal de éxito no incluía ningún `#payment-receipt`, así que `window.print()` imprimía la página completa. Ahora el bloque multi-cuota es un recibo imprimible dedicado (mismo `id="payment-receipt"` + `@media print` inline) con desglose por cuota, total, capital/interés/mora y nuevo balance.
- [x] **A3 · Recibo de Cobros frágil** (`CollectionsContent.tsx` + `PaymentReceipt.tsx`): se construía un objeto `Loan` de 40 campos con `as Loan` (cualquier campo faltante rompería el recibo). `PaymentReceipt` ahora acepta una interfaz mínima `ReceiptLoan { loan_id, remaining_amount, client?.name }`; Collections pasa solo esos 3 campos tipados.
- [x] **A4 · CSV admin omitía filtros activos** (`api/admin/export/route.ts` + `AdminPayments.tsx`): ahora el export de pagos acepta y filtra por `method` y `status` (además de `month`/`user_id`), y el botón los envía. Columna "Estado" añadida al CSV.
- [x] **A5 · Código muerto** (`AccountContent.tsx`): eliminado `whatsappUrl()` (definido pero sin referencia).
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK (Next 16.2.10, 46 rutas), vitest 46/46.

## Hoy — 13 Ago 2026 (sesión 3) · Nuevas características (1, 2, 4 de Auditoría 7)

### 1 · Contrato imprimible + lugar de firma
- [x] **`LoanDetail.tsx`**: el modal de contrato ahora es un **recibo imprimible** (`id="loan-contract"` + `@media print` inline, mismo patrón que PaymentReceipt): número del préstamo, datos, y **líneas de firma** ("Firma del prestamista" / "Firma del cliente"). Botón **"Imprimir / PDF"** (`window.print()`) en el modal.

### 2 · Export CSV para el prestamista (préstamos + cobros)
- [x] **`src/lib/csv.ts` (nuevo)**: `buildCsv()` (escape de comillas) + `downloadCsv(fileName, csv)` con BOM UTF-8 (abre correctamente en Excel).
- [x] **Listado de préstamos** (`LoansClientUnified.tsx`): botón **"Exportar CSV"** en el header — exporta los préstamos **filtrados** (No., Cliente, Teléfono, Monto, Por cobrar, Tipo, Frecuencia, Cuotas pagadas/totales, Estado, Inicio, Próximo vencimiento). Archivo `prestamos-YYYY-MM-DD.csv`.
- [x] **Cobros** (`CollectionsContent.tsx`): botón **"Exportar CSV"** en el header. En pestaña **Historial** exporta los pagos (No., Cliente, Monto, Capital, Interés, Mora, Tipo, Método, Estado, Fecha, Notas) → `cobros-historial-*.csv`. En Hoy/Vencidos/Próximos exporta la lista filtrada actual (cuotas: No., Cliente, Teléfono, Cuota #, Monto, Frecuencia, Vence, Estado) → `cobros-<tab>-*.csv`.

### 4 · Botón WhatsApp en clientes (lista + perfil)
- [x] **`src/lib/messages.ts`**: nuevo `buildClientMessage()` — "Hola {nombre}, saludos de {negocio}." + línea de saldo por cobrar/próxima cuota si hay préstamos activos, o "no tiene préstamos pendientes".
- [x] **Lista de clientes** (`ClientsClient.tsx`): botón verde WhatsApp en cada card (usa `whatsapp || phone`, `preventDefault`/`stopPropagation` para no navegar) que abre `wa.me` con el mensaje.
- [x] **Perfil del cliente** (`ClientProfile.tsx`): botón WhatsApp en el header (junto a Editar) que abre `wa.me` con mensaje que incluye saldo por cobrar y próxima fecha de pago. Eliminado `createClient` no usado.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 46/46.

### Deploy (13 Ago 2026)
- [x] **Característica 3 (antigüedad de mora / envejecimiento en Dashboard) DESCARTADA** por decisión del usuario — no se implementará.
- [x] **Staging** (`staging-gestion-prestamos.vercel.app`): preview `gestion-prestamos-pfg1vobtu` + alias → HTTP 200. Build OK (46 rutas).
- [x] **Producción** (`gestion-prestamos-one.vercel.app`): `vercel --prod` → deployment `gestion-prestamos-mmt7ols6n` (alias automático). HTTP 200.
- [x] Incluye todas las sesiones del 13 Ago: Auditoría 7 (A1-A5), contrato imprimible+firma, exports CSV (ExportPanel en Configuración), WhatsApp en préstamos, refinamientos contrato/exports/WhatsApp.

## Hoy — 13 Ago 2026 (sesión 3 ajustes) · Refinamientos de Contrato, Exports y WhatsApp

### 1 · Contrato imprimible + firma — fix de impresión
- [x] **`LoanDetail.tsx`**: `#loan-contract` ahora imprime en **una sola página** (antes salía partido a la mitad de dos páginas). Se compactó a `max-w-xs`, `@media print` con `max-width: 380px`, `page-break-inside: avoid` + `break-inside` en p y div, `@page a4 portrait` con margen 8mm.

### 2 · Exports CSV — movidos a Configuración + botones de página abreviados
- [x] **`src/components/settings/ExportPanel.tsx` (nuevo)**: pestaña **"Exportar datos"** en `/settings` con lista de las 3 exportaciones posibles (Préstamos, Historial de cobros, Cobros pendientes). Cada una consulta con RLS del usuario y descarga CSV con BOM UTF-8.
- [x] **Botones de página abreviados**: en `LoansClientUnified` y `CollectionsContent` el botón "Exportar CSV" pasa a **icono solo** (`FileCsv` + `title`/`aria-label`), para no estorbar en móvil — la lista completa está en Configuración.
- [x] `ExportPanel` reusa `buildCsv`/`downloadCsv` de `src/lib/csv.ts` e iconos `FileCsv`/`Export` (existen en esta versión de Phosphor).

### 3 · WhatsApp en clientes → movido al botón de préstamos
- [x] **`LoanDetail.tsx`**: el botón WhatsApp del header ahora usa `buildClientMessage` (saludo + saldo por cobrar + próxima cuota) **en vez de** `buildQuickMessage` (solo "⚡ L-xxx · nombre"). El mensaje rico se movió del cliente al préstamo.
- [x] **Eliminados** los botones WhatsApp de clientes: `ClientsClient.tsx` (lista) y `ClientProfile.tsx` (perfil); se quitaron handlers e imports (`WhatsappLogo`, `buildClientMessage`, `openWhatsApp`).
- [x] **`src/lib/messages.ts`**: eliminado `buildQuickMessage` (sin uso); se conservan `buildReceiptMessage`, `buildPaymentSummary`, `buildClientMessage`.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 46/46.

## Hoy — 13 Ago 2026 (sesión 4) · Hardening de seguridad — Auditorías 8 + 4 aplicadas

### Auditorías
- [x] **Auditoría 8 (Go Live)**: `docs/AUDITORIA-8-GO-LIVE.md` — 62/100, no listo (seguridad 35).
- [x] **Auditoría 4 (Seguridad)**: `docs/AUDITORIA-4-SEGURIDAD.md` — 4 áreas (Auth, Autorización, APIs, Datos sensibles) + verificación en vivo en la BD.
- [x] **Confirmado en producción** (anon key): `reconcile_money`/`admin_list_users`/`admin_usage_stats`/`update_all_loan_statuses` expuestos; bucket `documents` abierto cross-tenant; `subscription_payments.status` default `confirmed`.

### SQL aplicado a producción
- [x] **`supabase/security-hardening.sql` + `scripts/exec-security-hardening.mjs`** (aplicado, 201): guarda interna en `reconcile_money` (solo dueño/postgres/service_role) + REVOKE PUBLIC/anon + GRANT authenticated/service_role; `update_all_loan_statuses` REVOKE PUBLIC/authenticated + guarda con `session_user`; followers flocking REVOKE anon en `process_installment_payment`/`process_cascade_payment` (firma `p_loan_id, p_user_id, p_amount, p_include_mora, p_payment_date, p_method, p_notes, p_late_interest_rate, p_grace_days`); `update_client_stats` REVOKE anon; `is_admin`/`calc_late_*` REVOKE anon; **bucket `documents` aislado por prefijo** `(storage.foldername(name))[1] = 'user_' || auth.uid()` (SELECT/INSERT/DELETE); `subscription_payments.status` default → `'pending'` + política INSERT con `status='pending' AND amount>0`; índice `idx_payments_user_status ON payments(user_id, status)`; cron `cleanup-audit-logs-weekly` activado.
- [x] **`supabase/security-hardening2.sql` + `scripts/exec-security-hardening2.mjs`** (aplicado, 201): REVOKE PUBLIC/anon en `admin_list_users()`, `admin_usage_stats(text)`, `admin_usage_by_user()` (firmas reales verificadas) + GRANT service_role; guarda con `session_user` en `update_all_loan_statuses`.
- [x] **Re-verificado**: 5 RPCs sensibles → **401 permission denied** con anon key; service_role sigue funcionando (reconcile_money 0 errores, admin_list_users OK); `get_loan_stats` devuelve null a ajenos; `subscription_payments.status` default `pending` confirmado en schema cache.

### Código Next.js (todos verificados: tsc OK, vitest 46/46, build OK)
- [x] **`next.config.ts`**: headers de seguridad (X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy, Permissions-Policy, X-Powered-By personalizado) + CSP pragmática.
- [x] **`rate-limit.ts`**: key solo por IP real del proxy (x-forwarded-for/cf-connecting-ip/x-real-ip); eliminada confianza en header client-controlable `x-user-id`.
- [x] **`supabase-client.ts`**: `cookieOptions sameSite:'lax'` + `secure` en producción.
- [x] **`auth/callback/route.ts`**: open redirect cerrado — `safeNext()` solo permite pathnames locales whitelisteados.
- [x] **`backup/setup/route.ts`**: exige `requireAdminApi` (antes usaba service role sin auth).
- [x] **`clients/[id]/route.ts` + `settings/route.ts`**: whitelist de columnas actualizables (anti mass-assignment).
- [x] **`smtp-config/route.ts`**: GET ya no devuelve `pass` (solo `configured`).
- [x] **`support/notify/route.ts`**: valida que el ticket pertenezca al usuario (`.eq('user_id', user.id)`).
- [x] **`loans/route.ts` POST**: valida `amount > 0` finito; `calculations.ts` guard `n <= 0` en `calculateFlatRate` (evita Infinity/NaN).
- [x] **`request.json().catch(() => ({}))`** en las 7 rutas de negocio que no lo tenían (collections, clients, clients/[id], loans, loans/[id], loans/[id]/payments).
- [x] **`audit.ts`**: `sanitizeAuditDetails()` redacta PII (document, gps_*, phones, address, references) en `audit_logs.details`.
- [x] **`global-error.tsx`, `error.tsx`, `loading.tsx`, `not-found.tsx`**: boundaries de error/carga añadidos al app router.
- [x] **`getLocalDate()`** reemplaza `new Date().toISOString().split('T')[0]` en los **21 sitios** (fix del bug UTC vs hora local RD 20:00-24:00).
- [x] **`public/sw.js`** (cache v4): excluye del cache-first las URLs de Supabase (`/rest|auth|storage/v1`) y `/api/` — evita servir datos obsoletos/otra sesión.

### Pendiente (decisión del usuario)
- Falta desplegar esta sesión a staging/producción (build ya verificado localmente).
- Confirm email / MFA del panel de Supabase (config de dashboard, no código).
- Política de privacidad (Ley 172-13 RD) — no implementada aún.

### Deploy (13 Ago 2026)
- [x] **Producción** (`gestion-prestamos-one.vercel.app`): `vercel --prod` → deployment `gestion-prestamos-5yok5axl3`. **Verificado**: HTTP 200 + headers de seguridad activos (X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy, Permissions-Policy, CSP con frame-ancestors, X-Powered-By personalizado). Incluye toda la sesión 4 (hardening código + whitelists + getLocalDate + error boundaries + SW v4).
- [x] **Staging**: preview `gestion-prestamos-fmry60s35` desplegado en el mismo paso.
- [x] Nota: `next.config.ts`/`rate-limit.ts`/`supabase-client.ts` no persistieron en el primer intento; se re-aplicaron y redeployó con éxito.

## Hoy — 15 Ago 2026

### Política de privacidad pública (Ley 172-13 RD)
- [x] **`src/app/privacidad/page.tsx`**: página pública con 11 secciones (responsable Gestor de Prestamos · gestordprestamo@gmail.com, datos recopilados, finalidad, conservación, consentimiento, transferencias, seguridad, derechos ARCO, datos de terceros, menores, cambios). Server component, mismo estilo que `/pricing`.
- [x] **`src/middleware.ts`**: `/privacidad` agregado a `isPublic`.
- [x] **Enlaces**: en Login (`/login`, "Al continuar aceptas nuestra Política de Privacidad") y en Pricing (`/pricing`, con mención a la Ley 172-13). Decisión del usuario: SOLO en login y pricing.
- [x] Verificado: tsc OK, build OK (`/privacidad` compila).

### Confirmar correo + SMTP propio (Supabase Auth)
- [x] **Configuración verificada en Supabase**: `mailer_autoconfirm=false` (confirmación de correo requerida) + `mailer_allow_unverified_email_sign_ins=false` ya estaban activos.
- [x] **SMTP de Gmail conectado a Supabase** (vía Management API, opción A elegida por el usuario): `smtp.gmail.com:587`, user `gestordprestamo@gmail.com`, contraseña de aplicación del usuario, `smtp_sender_name="Gestor de Prestamos"`. Las confirmaciones/recuperaciones salen del propio Gmail del negocio.
- [x] Mismo patrón de la app: Gmail + contraseña de aplicación (sin servicios técnicos adicionales).

### MFA (doble verificación) — Activada en Supabase + UI en la app
- [x] Config Supabase ya activa: `mfa_totp_enroll_enabled=true`, `mfa_totp_verify_enabled=true`, `mfa_allow_low_aal=false`.
- [x] **`src/components/auth/MfaSetup.tsx`**: inscripción TOTP (QR + secreto manual + copiar), verificación con código, desactivación. Estado "Activa/Inactiva" con Badge.
- [x] **Login** (`src/app/login/page.tsx`): tras `signInWithPassword`, si `nextLevel=='aal2'` muestra paso de código de 6 dígitos → `challengeAndVerify` → redirige a `/dashboard`.
- [x] **Middleware** (`src/middleware.ts`): sesión aal1 con MFA activa en ruta protegida → redirige a `/mfa-verify?next=…`; `/mfa-verify` agregado a `isPublic`.
- [x] **`src/app/mfa-verify/`**: página+client de verificación (Suspense en page por searchParams).
- [x] **`/account`** (AccountContent): tarjeta MFA bajo "Cambiar contraseña" (clientes). **`/admin/seguridad`**: página nueva + item "Seguridad" (icono `ShieldCheck`) en AdminSidebar para el admin (el middleware redirige admins fuera de `/account`).
- [x] Verificado: tsc OK, vitest 46/46, build OK (rutas `/privacidad`, `/mfa-verify`, `/admin/seguridad`).
- [ ] **(Pendiente)** Desplegar a staging/producción y probar flujo completo MFA (inscribir autenticador → cerrar sesión → login pide código).

## Hoy — 15 Ago 2026 (sesión 2)

### Fix MFA post-prueba
- [x] **QR no cargaba** (`MfaSetup.tsx`): el SDK `@supabase/auth-js` en esta versión YA devuelve `qr_code` con prefijo `data:image/svg+xml;utf-8,` (GoTrueClient.js:4760). El código agregaba el prefijo + `encodeURIComponent` otra vez → imagen rota. Fix: `src={pending.qr_code}` directo.
- [x] **"factor Autenticador ya existe"** (`MfaSetup.tsx`): un intento previo dejó un factor `unverified` en Supabase (invisible porque `enrolled` filtra `status==='verified'`), y `enroll({ friendlyName:'Autenticador' })` falla por nombre repetido (`mfa_factor_name_conflict`). Fix: `startEnroll()` primero `unenroll` de todos los factores `status !== 'verified'` antes de reinscribir.

### Ajustes de producto (4 tareas)
- [x] **T1 · CSV fuera de Préstamos/Cobros + .xlsx solo en Configuración**:
  - Eliminados botones FileCsv + handlers `exportCsv`: `src/app/loans/LoansClientUnified.tsx` y `src/app/collections/CollectionsContent.tsx` (imports, handler, botón header). Los 3 exports admin (audit/users/payments, flujo `DownloadSimple` + `/api/admin/export`) NO se tocan.
  - **`xlsx` (SheetJS 0.18.5) instalado** (npm). `src/lib/csv.ts` agrega `downloadXlsx(headers, rows, fileName)` con import dinámico (solo se carga al exportar).
  - **`ExportPanel.tsx`** (Configuración → Exportar datos): las 3 exportaciones generan `.xlsx` (`prestamos-*.xlsx`, `cobros-historial-*.xlsx`, `cobros-pendientes-*.xlsx`); subtítulo "Descarga tus datos en Excel (.xlsx)"; icono `FileXls`.
- [x] **T2 · Favicon**: eliminado `src/app/favicon.ico` (ícono stock de Create Next App que Next auto-inyectaba y ganaba en el `<head>` sobre el `<link rel="icon" href="/gp-icon-opaque.png">` de `layout.tsx:29`). Ahora el GP icon queda único. `public/sw.js` cache `v4 → v5` para purgar el `/favicon.ico` cacheado en PWA ya instaladas.
- [x] **T3 · Clientes sin préstamos no salían en "Inactivos"** — causa raíz: el `CREATE OR REPLACE` de `update_client_stats` aplicado en `security-hardening.sql` (13 Ago) SOLO actualizaba trust (perdió `status`, balance, métricas). Fix aplicado:
  - **`supabase/client-status-fix2.sql` + `scripts/exec-client-status-fix2.mjs`** (aplicado en producción, 201): restaura la función completa (cuerpo de `schema.sql` con `status=CASE…`, todas las métricas + guarda `service_role`) + **backfill** `SELECT public.update_client_stats(id) FROM clients;` (28 clientes recalculados → 27 inactivos, 1 activo = el único con préstamos, verificado en BD).
  - **`security-hardening.sql` sincronizado** con el cuerpo completo (para que re-aplicarlo no vuelva a romper status).
  - **`ClientForm.tsx`**: inserta con `status: 'inactive'` (cliente nuevo nace inactivo).
  - **`clients/page.tsx`**: `.limit(100)` → `.limit(1000)` en clients y loans (evita cortar listados).
- [x] **Verificado**: `npx tsc --noEmit` OK, vitest 46/46, `npm run build` OK.

### Pendiente
- [ ] **T4 · N° Documento "000000000" da error**: NO hay validación en código ni BD (columna TEXT sin CHECK/UNIQUE/trigger, 0 clientes con ese valor, plan Pro sin `max_clients`). El usuario va a reproducir y reportar el mensaje exacto antes de corregir.
- [ ] Desplegar sesión (MFA fix + los ajustes de producto) a staging/producción.
- [ ] Probar flujo completo MFA (inscribir autenticador → cerrar sesión → login pide código).

## Hoy — 16 Ago 2026 · Email de recuperación

### Correo de recuperación roto → modo integrado Supabase
- [x] **Síntoma**: al pulsar "¿Olvidaste tu contraseña?" el login mostraba `{}`; `POST /auth/v1/recover` devolvía **HTTP 500 `{\"error_code\":\"unexpected_failure\",\"msg\":\"Error sending recovery email\"}`**.
- [x] **Causa raíz**: el SMTP custom de Gmail (`gestordprestamo@gmail.com`) rechazaba **todas** las contraseñas de aplicación probadas (`kpqm jnvi wsxl zlmo`, `rjqz zytm ucnm ciwh`, `yewa bcge fiyu sejf`) con `535 5.7.8 BadCredentials`, incluso probado con `nodemailer` directo y tras 12 h de espera (descartado bloqueo temporal). El pass quedaba inválido/revocado en la cuenta.
- [x] **Solución aplicada (Management API, `PATCH /config/auth`)**: se limpió el SMTP custom (`smtp_host/port/user/pass/admin_email/sender_name = null`) → el correo de recuperación sale por el **correo integrado de Supabase** (`no-reply@supabase.co`). `POST /auth/v1/recover` → **HTTP 200** verificado.
- [x] **Límite**: el correo integrado está fijo en **2 emails/hora** (`rate_limit_email_sent`) y la API **no permite subirlo sin SMTP custom** (`401: Custom SMTP required to configure RATE_LIMIT_EMAIL_SENT`). El usuario verá "email rate limit exceeded" al superarlo — aceptado por ahora.
- [x] **Plan B probado (a medias)**: Resend SMTP (`smtp.resend.com:587`, user `resend`, pass = API key) **sí autentica** con `nodemailer` verify, pero `onboarding@resend.dev` solo envía al correo dueño (550). Para usarlo como SMTP de Supabase falta **verificar `gestiondeprestamos.com`** en Resend (registros DNS pendientes: TXT `resend._domainkey`, MX `send → feedback-smtp.us-east-1.amazonses.com` prio 10, TXT `send → v=spf1 include:amazonses.com ~all`). Dominio Resend: `3959c216-a749-4f8e-9818-8786cd7f0627`.
- [ ] **(Pendiente, decisión del usuario)** Dejarlo en modo integrado por ahora, o retomar luego: verificar dominio Resend (DNS) o arreglar la app password de Gmail.

## Hoy — 16 Ago 2026 (sesión 2) · Go-Live A1+A2 (consolidación AUDITORIA-8)

### Auditoría consolidada
- [x] **`docs/AUDITORIA-8-GO-LIVE.md` re-puntuada**: 62 → **69/100**, LISTO PARA GO-LIVE CONDICIONADO. Re-verificadas en código/BD: S1 (RPCs revocados + guardas, 401 anon), S2 (bucket documents por prefijo usuario), S3 (setup requiere requireAdminApi), A3/A4/A6/A7/A10 y M1/M2/M5/M7/M8/M10/M11 resueltos. Quedan como **condición de go-live** A1 (restore transaccional) y A2 (backup automático).

### A1 · Restore transaccional
- [x] **`supabase/backup-restore-transactional.sql` + `scripts/exec-backup-restore-transactional.mjs`** (APLICADO en producción, 201): RPC `public.restore_user_backup(p_user_id, p_settings, p_clients, p_loans, p_installments, p_payments, p_documents)` SECURITY DEFINER que borra + inserta TODO el backup en **UNA sola transacción PostgreSQL** (rollback automático si algo falla → nunca tablas vacías/parciales). Guarda (dueño o postgres/service_role), desactiva `trg_enforce_client_limit` durante el restore, valida tipos vía `jsonb_populate_record` (uuid/timestamp corruptos revierten), y recalcula `update_client_stats` de cada cliente restaurado. REVOKE PUBLIC/anon.
- [x] **`src/lib/backup/export.ts`**: manifest ahora guarda `checksums` sha256 por tabla.
- [x] **`src/lib/backup/import.ts` reescrito**: valida folder (regex anti traversal), descarga+valida manifest (`userId` debe coincidir), **verifica checksums de cada CSV ANTES de tocar datos**, parsea todo, y delega el borrado+inserción al RPC transaccional (antes: borra-inserta por tabla vía REST, frágil).
- [x] **`src/lib/backup/export.ts`**: `pruneOldBackups(supabase, userId, retentionDays)` elimina backups por usuario más viejos que N días.

### A2 · Backup automático diario
- [x] **`src/app/api/cron/backup/route.ts`**: GET+POST protegido con `Authorization: Bearer $CRON_SECRET` → usa service role para respaldar a TODOS los `app_users` + purga (`BACKUP_RETENTION_DAYS`, default 30). Devuelve `{ok, backups, purged, users, errors}`.
- [x] **`vercel.json`**: cron diario `0 4 * * *` → `/api/cron/backup`.
- [x] **Env Vercel** (production+preview+development): `CRON_SECRET` (encrypted) y `BACKUP_RETENTION_DAYS=30` creados vía API (201). En `.env.local` + `.env.production` también.

### Verificación
- [x] `npx tsc --noEmit` OK, vitest 46/46, `npm run build` OK (página `/api/cron/backup` compilada).
- [ ] **(Pendiente)** Deploy a staging/producción para activar el cron y probar el flujo real (generar → restore transaccional → purga)).

## Hoy — 16 Ago 2026 (sesión 3) · Zona horaria única: America/Santo_Domingo

### Problema (mezcla de 3 relojes)
- [x] **Diagnóstico**: RD es UTC-4 fijo (sin DST). El sistema usaba 3 relojes: navegador (RD), servidor Vercel (UTC) y PostgreSQL `CURRENT_DATE` (UTC). Entre 20:00 y 00:00 hora RD (= 00:00–04:00 UTC del día siguiente) la mora se computaba con 1 día de más y los estados late/vencidos/próximos se pintaban antes de tiempo.

### Fix JS determinístico (independiente de la zona del runtime)
- [x] **getLocalDate()** (`src/lib/utils.ts`) → usa `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' })` (con caché) en vez de getFullYear()/getMonth()/getDate() (dependía de la zona del runtime). Server (UTC en Vercel) y browser producen la MISMA fecha RD.
- [x] **daysBetweenDateStrings(a,b)** nuevo en utils.ts: días calendario entre fechas 'yyyy-MM-dd' vía Date.UTC (operación pura, sin zona) — usado por el cálculo de mora.
- [x] **firstOfNextMonth(month)** nuevo: primer día del mes siguiente (filtros de pago admin determinísticos).
- [x] **getLocalMonthStart(monthsBack=0)** nuevo: primer día del mes en RD, determinístico (props de monthsBack=1 mes, 3, 11…). Usado por los filtros de período de Reportes (`reports/page.tsx`) que antes hacían `new Date(y, m, 1)` (medianoche UTC del servidor → retrocedía 1 día en RD).
- [x] **calculateLateDays** (`src/lib/calculations.ts`): ahora `daysBetweenDateStrings(due, getLocalDate()) - grace` (antes `differenceInCalendarDays(now, parseISO(due))` que variaba server vs browser).
- [x] **computeLateStatus** (`src/lib/loan-status.ts`) y **POST /api/loan-status**: usan `daysBetweenDateStrings` + `getLocalDate()` (quitado `new Date(due)` que parseaba como UTC y `new Date()` local, ambos #N del runtime).
- [x] **Pagos de suscripción**: `payment_date` por defecto pasa de `new Date().toISOString().slice(0,10)` (UTC) a `getLocalDate()` en `src/lib/billing.ts`, `/api/subscription/upgrade-request` y `/api/subscription/pay`.
- [x] **Filtros admin por mes**: `/api/admin/payments` y `/api/admin/export` usan `firstOfNextMonth()` en vez de `new Date(y,m,1).toISOString()` (caso límite noche).
- [x] **Vercel env TZ DESCARTADO**: `TZ` es nombre reservado por Vercel (400 `env_key_reserved`). El fix determinístico con Intl cubre el problema sin depender de la zona del runtime.

### Fix SQL (migración aplicada en producción)
- [x] **`supabase/timezone-rd.sql` + `scripts/exec-timezone-rd.mjs`** (APLICADO, 201 + backfill 28 clientes): helper `public.today_rd()` = `(now() AT TIME ZONE 'America/Santo_Domingo')::date`; `calc_late_days`, `update_client_stats`, `get_loan_stats` y `update_all_loan_statuses` re-creadas usando `today_rd()` en vez de `CURRENT_DATE`.
- [x] `subscription_payments.payment_date` DEFAULT → `(now() AT TIME ZONE 'America/Santo_Domingo')::date`.
- [x] Copias sincronizadas: schema.sql, client-status-fix2.sql, client-status-auto.sql, client-stats-fix.sql, delete-preserve-payments.sql, post-delete-review.sql, soft-delete-loans.sql, security-guards.sql, security-hardening.sql, security-hardening2.sql, loan-stats.sql, admin-schema.sql (dejado `rebuild-74f-payments.sql` como script one-off histórico).
- [x] **Verificado**: `today_rd()` devuelve 2026-08-16 (igual que UTC ese día), `calc_late_days` 7/0 para ±7/±0 días vía query; `npx tsc --noEmit` OK, vitest 49/49 (tests nuevos determinísticos: `daysBetweenDateStrings`, `firstOfNextMonth`, `getLocalMonthStart`), `npm run build` OK.
- [x] **(Hecho, 16 Ago)** Commit `e98946e` pusheado y deploy a producción `gestion-prestamos-one.vercel.app` (build 27s, alias Ready). Verificado: login HTTP 200, `/api/cron/backup` sin auth → 401 y con Bearer → `{"ok":true,"backups":4,"purged":0,"users":4,"errors":[]}`.

## Hoy — 17 Ago 2026 · Pendientes: limpieza repo, purga de backups y blobs de documentos

### Limpieza del repo
- [x] **`cookies.txt`, `ngrok-url.txt` y `docs/conversation-2026-08-05.json`** salieron del tracking (`git rm --cached`) y ahora están en `.gitignore`. Ninguno tiene credenciales vivas (cookies vacío, túnel ngrok muerto, resumen sin tokens) → no se reescribe historial (repo privado, contenido inocuo). Sin cambio de código.
- [x] **AGENTS.md sesión 8 corregida**: la entrada documentaba un componente `InstallmentRows.tsx` que **nunca existió** en git. Reescrita describiendo la realidad: render inline en `LoanDetail.tsx`, `CollectionsContent.tsx` y `CalendarContent.tsx`. `docs/AUDITORIA-8-GO-LIVE.md` M15 actualizado.

### Backup/Restore/Purga — prueba real + bug fix
- [x] **Restore transaccional probado en producción** con datos reales del usuario `babfefb8` (4 clientes, 3 préstamos, 20 cuotas, 3 pagos, 1 setting): `restore_user_backup` devolvió `{ok:true,...}` dentro de una transacción que luego hizo **ROLLBACK** → los conteos quedaron intactos (4/3/20/3/1). El borrar+reinsertar completo revierte si algo falla.
- [x] **BUG de purga encontrado**: `supabase.storage.remove()` con **path de carpeta** devuelve `200 []` pero **no borra nada** (los objetos internos quedan). El cron reportaba `purged:1` falsamente. **Fix en `src/lib/backup/export.ts`**: `pruneOldBackups` ahora lista los archivos dentro de cada carpeta vieja (`list` paginado por 200) y los borra por ruta exacta. Verificado con carpeta sintética `2026-06-01_00-00-00` → el cron la purgó (desapareció) y los backups reales quedaron intactos.

### Backup de documentos (blobs de Storage) — nueva capacidad
- [x] **Antes**: el backup respaldaba solo la tabla `documents` (metadata con `path`), no los bytes. Un restore dejaría filas apuntando a objetos inexistentes.
- [x] **`src/lib/backup/export.ts`**: `exportDocumentFiles()` descarga cada blob del bucket `documents` y lo sube al backup como `files/N-<name>` + `files-manifest.json` (mapeo ruta-original → ruta-backup).
- [x] **`src/lib/backup/import.ts`**: `restoreDocumentFiles()` re-sube los blobs al bucket `documents` en sus rutas originales tras el RPC, validando que la ruta pertenezca al usuario.
- [x] **Verificado end-to-end**: blob de prueba (`test-blob.txt`) → cron lo respaldó (`files/0-...`) → borrado del original → restore re-subió el archivo con contenido idéntico (`"TEST DOC BLOB..."`). Datos de prueba limpiados después (docs count: 0).
- [x] **Verificado**: `npx tsc --noEmit` OK, vitest 49/49, `npm run build` OK, desplegado a producción (3 deploys en el proceso: purge fix + blob export + confirmación).

## Hoy — 17 Ago 2026 (sesión 2) · Primer pago automático + limpieza de código muerto + limpieza raíz

### Feature: primer pago alineado a la frecuencia
- [x] **`firstPaymentDateFor(startDate, frequency)`** (`src/lib/calculations.ts`): fecha del primer pago = un período después de `start_date`, reutilizando `calcDueDate` (mensual con `addMonths`, NO 30 días planos) → coincide exactamente con el vencimiento de la cuota #2 del cronograma real.
- [x] **`NewLoanForm.tsx`**: default del campo "Fecha primer pago" usa `firstPaymentDateFor(getLocalDate(), default_frequency)`; el auto-sync se dispara ahora al cambiar `start_date` **o** `frequency` (antes solo start_date), y solo si el usuario no editó la fecha a mano. Eliminados `PERIOD_DAYS` y `defaultFirstPaymentDate`.
- [x] **Tests** (5 nuevos en `calculations.test.ts`): mensual 16/08→16/09, ±7/14/1 días en las demás frecuencias, meses cortos (31/01→29/02 2028), fecha vacía → '', y coincidencia con due_date de la cuota #2. Verificado: tsc OK, vitest 54/54, build OK.

### Limpieza de código muerto (0 errores `no-unused-vars`)
- [x] **Tier 1 borrados**: `src/lib/email.ts`, `src/lib/auth-utils.ts`, `src/components/ui/{Skeleton,ActionSheet,UnifiedFilterSheet,index}.tsx`, `filter-alternatives.html` (raíz). `src/components/ui/` restante: Alert, Avatar, Badge, BottomSheet, Button, Card, EmptyState, Input, Modal, MoneyInput, PageHeader, Progress, SearchInput, StatCard, Tabs, ViewTabs.
- [x] **Cascada Collections**: eliminados `activeLoans`/`ActiveLoanBrief` de `CollectionsContent.tsx` y la query de `collections/page.tsx`; `avatarColor`, `moraAmount` sin uso.
- [x] **Cascada AdminUserDetail**: eliminado código muerto de upgrades/tickets (`upgradeRequests`, `upgradeProcessing`, `handleAssignPlanFromUpgrade`, imports `ACTION_LABELS`+`ArrowRight`).
- [x] **~25 imports/estado/vars muertos** en: payments.ts, supabase-route.ts, useFrenchLoan.ts, LoansClientUnified, LoanDetail, ClientProfile, ClientsClient, DocumentsContent, ReportsContent, AuditLogsContent (prop `showHeader` sin uso), SettingsTabs, SupportContent, AccountContent (estado `settings` que nunca se leía), AdminEmails, calendar/page, MfaSetup, upgrade-request/route (`formatNumber`).
- [x] **Se conservan por decisión del usuario**: las 12 rutas API sin llamador; los 29 `no-explicit-any`; `set-state-in-effect` (23); `prefer-const`; `LoanFilters.tsx` SÍ se usa (dynamic import en LoansClientUnified).

### Limpieza de raíz del proyecto
- [x] Borrados: `auditoria.html` + `auditoria-resumen.html` (reportes HTML one-off), `fix-client-status.mjs` (one-off superado por scripts/), carpeta `Auditoria del Sistema/` (8 TXT; los .md de auditorías 4 y 8 quedan en `docs/`), y en disco: `cookies.txt`, `ngrok-url.txt`, `docs/conversation-2026-08-05.json`, `tsconfig.tsbuildinfo`.

### Deploy (17 Ago 2026)
- [x] Commits `d16e282` (feature + limpieza) y `0703285` (limpieza raíz) pusheados a `main`.
- [x] **Producción** `gestion-prestamos-one.vercel.app` (deployment `gestion-prestamos-nvk5zre4b`, HTTP 200) y **staging** `staging-gestion-prestamos.vercel.app` (preview `gestion-prestamos-aw32fjo2j`, HTTP 200).

## Hoy — 01 Set 2026

### DNS propio conectado a Vercel (`gestordeprestamos.do`)
- [x] **Dominio validado**: `gestordeprestamos.do` + `www.gestordeprestamos.do` → "Configuración válida · Producción" en Vercel. La delegación terminó en `ns1-2.vercel-dns.com` y la **zona DNS de Vercel quedó activa y autoritativa** (responde `ns4.vercel-dns.com`). Naturaleza: la delegación a Vercel (del 31 Ago) quedó a medias → SERVFAIL público; se intentó revertir a midominio pero el TLD propagó a Vercel y se activó su zona. Los registros del dnsbox de midominio quedaron inertes (no re-guardar NS ahí).
- [x] Apex y www resuelven Status 0 en resolvers públicos (Google/Cloudflare) → `216.198.79.65 / 64.29.17.x`; HTTPS 200 Server Vercel en ambos.

### Retención (trial 14 días + recordatorios ≤3 días)
- [x] **Trial de vuelta a 14 días**: `supabase/trial-14-days.sql` + `scripts/exec-trial-14-days.mjs` (aplicado en BD, verificado en `pg_proc`: `handle_new_user` usa `INTERVAL '14 days'`). El 30 Ago `plan-updates.sql` lo había subido a 30 días pero el texto del plan siempre decía 14 → se revierte. Las suscripciones ya otorgadas (ej. Bessi) conservan su vencimiento.
- [x] **Recordatorio de renovación a ≤3 días** (antes 7 días): `DashboardContent.tsx` calcula `subDaysLeft` con `daysBetweenDateStrings(getLocalDate(), ends_at.slice(0,10))`, bandera `subExpiringSoon = !subExpired && subDaysLeft <= 3`, banner con "vence en N día(s) (fecha)" o "hoy".
- [x] **AdminOverview.tsx**: helper `expiringLabel(endsAt)` → "venció {fecha}" o "vence en N día(s) ({fecha})" en la fila de usuario del panel de admin.
- [x] `supabase/plan-updates.sql`: header de AVISO (precios 899/1499 vigentes, trial revertido a 14 días por decisión 01/09/2026).

### Rebrand de alias `.vercel.app` (gestor-prestamos)
- [x] Decisión del usuario: la URL estable debe ser **`gestor-prestamos-one.vercel.app`** (coincide con "Gestor de Prestamos"). Re-apuntado al deployment de producción real (`gestion-prestamos-5u2gmtnh4-…`).
- [x] `gestion-prestamos-one.vercel.app` restaurado como **backup** (misma app) para que enlaces viejos de correos/documentos sigan funcionando.
- [x] Eliminado el deployment del template `vercel/install-vercel-speed-insights` ("Login - Vercel") que el usuario había creado al instalar Speed Insights; su alias y el dominio `gestor-prestamos-one.vercel.app` quedaron limpios.
- [x] **Desactivada la SSO / Deployment Protection** del proyecto (`ssoProtection` → `all_except_custom_domains`, bloqueaba todos los `.vercel.app` con login de Vercel y dejaba solo los dominios custom públicos). Al desactivarla (`PATCH /v9/projects/{id}` con `ssoProtection: null`), los `.vercel.app` volvieron a servir la app público.

### Supabase Auth (enlaces de recuperación)
- [x] `site_url` → `https://gestordeprestamos.do` (antes `gestion-prestamos-one.vercel.app`).
- [x] `uri_allow_list` ampliado: `.do` (apex+www) + `gestor-prestamos-one.vercel.app` (y backups `gestion-prestamos-one`/staging) con rutas `/auth/reset-password` y `/auth/callback`. El login usa `window.location.origin`, así el enlace cae en el host del usuario.

### Código
- [x] `src/lib/notify/templates.ts:32`: fallback de `appUrl()` → `https://gestordeprestamos.do` (antes la URL vieja, muerta).

### Vercel Speed Insights (medición de rendimiento real)
- [x] **`@vercel/speed-insights` v2** instalado y `<SpeedInsights />` montado en `src/app/layout.tsx` (al final del `<body>`). Se mide en **todos** los dominios que sirven esa build (`.do` apex/www + `.vercel.app`).
- [x] El script se inyecta **en runtime** (`document.head.appendChild`), no en el HTML estático — normal, para medir visitas reales.
- [x] Desplegado a producción (`vercel --prod` → deployment `gestor-prestamos-99781fkzz`). `gestor-prestamos-one.vercel.app` re-alineado a este deployment; `gestion-prestamos-one.vercel.app` quedó en el anterior (backup). Verificado: tsc OK, build OK, lint sin errores nuevos.

## Pendiente — Google OAuth: publicación y verificación de marca

> Guardado el 05 Oct 2026 tras el rechazo de la verificación de marca. Nada de esto bloquea el acceso de usuarios (ver nota).

### Corrección importante sobre el modo Testing (se tenía mal)
- [x] **Verificado contra docs oficiales de Google**: en modo *Testing* + *External*, la app **ya acepta cualquier cuenta Google** si solo pide identity scopes básicos. Excepción documentada: "If the app only requests basic identity scopes (`openid`, `email`, `profile`), any user can access without being on the allowlist."
- [x] **Scopes reales verificados** en la URL de authorize: `scope=email+profile`. Sin scopes sensibles → **no aplica** el tope de 100 usuarios, ni la pantalla de "app no verificada" (Danger UI).
- Consecuencia: **no existía tal muro de acceso**. Lo único pendiente de "publicar" es quitar la pantalla de aviso "app en modo de pruebas".

### Tabla de estados (referencia)
| Publishing | Verificación | Scopes | Resultado |
|---|---|---|---|
| Testing | N/A | solo `email`/`profile` | Cualquiera entra; muestra aviso de pruebas |
| Published | Unverified | solo `email`/`profile` | Cualquiera entra; sin aviso; **sin tope de 100**; sin nombre/logo en consent |
| Published | Verified | solo `email`/`profile` | Cualquiera entra; con nombre y logo |

### 1 · Publicar la app (usuario, requiere sesión Google)
- [ ] Google Cloud Console → **Google Auth Platform** → pestaña **Audience** → **Publishing status** → **Publish**.
- [ ] En **Data Access** confirmar que solo aparecen `.../auth/userinfo.email` y `.../auth/userinfo.profile`. Si aparece algo más, **no publicar sin revisar** (ahí sí saltaría el aviso de app no verificada).
- [ ] En **Branding** dejar apuntando Home page y Privacy Policy a URLs reales de `gestordeprestamos.do` (Google las revisa al pedir verificación).

### 2 · Verificar dominio en Search Console (desbloquea el problema 1 del rechazo)
- [ ] [search.google.com/search-console](https://search.google.com/search-console) → Add property → tipo **Domain** → `gestordeprestamos.do`.
- [ ] Pegar el registro **TXT** en los DNS de Vercel (la zona DNS de Vercel ya es autoritativa desde el 01 Sep, así que aplica directo).
- [ ] Verificar y **esperar 24 h** antes de reintentar la verificación de marca (Google lo exige explícitamente; sin atajo).
- Nota: causa probable del rechazo → **privacidad WHOIS activa** en el registrador (midominio.com), que oculta el titular real como `REDACTED FOR PRIVACY`. Si Search Console no basta, desactivar esa privacidad.

### 3 · Logo propio (problema 2 del rechazo)
- [ ] Google rechazó: "El logotipo no identifica de manera inequívoca tu marca y tu identidad."
- [ ] Logo actual es **"GP" blanco sobre gradiente azul→morado** (`public/gp-icon-opaque.png` 512×512, 106 KB; también `gp-icon-maskable.png`, `gp-icon.png`, `apple-touch-icon.png`). Requisitos de Google: **128×128 mínimo**, PNG o JPEG, **sin** los cuatro colores de Google ni forma de "G", y **coincidir con el branding visible en la homepage** (Google compara ambos).
- [ ] **DECISIÓN DEL USUARIO PENDIENTE**: ¿existe ya un logo definitivo ("GP Logo.png" que se menciona en el historial) o hay que crear uno? Si hay que crearlo, propuesta: ícono + wordmark "Gestor de Préstamos" con la paleta existente (`primary #2563EB`, `accent #8B5CF6`). Requiere aprobación del usuario antes de subirlo.

### 4 · Reintentar verificación de marca
- [ ] Solo después de 2 + 3. Botón "Corregí los problemas → Solicita la nueva verificación" en Google Auth Platform.
- [ ] Alternativa si Google insiste: "Considero que los problemas detectados son incorrectos" → revisión adicional.

### 5 · CAPTCHA y abuso de trials (riesgo real, independiente de la marca)
- [x] **Config actual verificada** en Supabase: `disable_signup=false`, **`security_captcha_enabled=false`**, `rate_limit_email_sent=2` (por hora).
- [ ] **Riesgo**: el registro por correo está topado a 2 emails/hora (por el correo integrado de Supabase), pero **OAuth no pasa por ese límite**. Cualquiera con cuentas de Google puede crear cuentas ilimitadas, cada una con **14 días de trial**, sin CAPTCHA.
- [ ] Activar hCaptcha o Turnstile en Supabase Auth (proveedor ya configurado: `hcaptcha`; solo faltan site key + secret key) **y** añadir el widget al form de `/register`.

### 6 · Rotación de credenciales expuestas (urgente, independiente)
- [ ] **Client Secret de Google OAuth**: regenerar en Google Auth Platform → Credentials → OAuth 2.0 Client → Download/regenerar secret. PATCH a Supabase (`external_google_secret`) con el nuevo valor.
- [ ] **PAT de Supabase** (`sbp_...`): revocar el actual y crear uno nuevo.
- [ ] **Token de Vercel** (`vcp_...`): revocar. Ojo: es *scoped* y no sirve para la CLI; los deploys funcionan por la integración con GitHub, así que no bloquea nada.
- [ ] No persistir credenciales nuevas en archivos de texto plano del repo.

### 7 · Backlog no relacionado (de sesiones previas)
- [ ] Cola Gmail: 41 mensajes pendientes (`2 sent`, `27 sending`, `12 queued`) — `smtp.gmail.com:587`.
- [ ] `src/lib/notify/actions.ts` + `src/lib/notify/queue.ts`: confiabilidad, flush y reintentos.
- [ ] `src/components/loans/PaymentReceipt.tsx`: solo muestra Capital/Interés cuando `hasMora`.
- [ ] Crear `/terminos` y enlazar privacidad/términos desde el registro.