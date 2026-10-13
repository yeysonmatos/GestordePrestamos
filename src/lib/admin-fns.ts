import { createServerFn } from "@tanstack/react-start";

type Ctx = { data?: unknown };

// ---- Platform config ----
export const platformConfigGet = createServerFn({ method: "GET" }).handler(async () =>
  (await import("@/lib/admin-api.server")).platformConfigGet(),
);

export const platformConfigUpdate = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).platformConfigUpdate(
      (data || {}) as Record<string, unknown>,
    ),
  );

// ---- Correos ----
export const emailsList = createServerFn({ method: "GET" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).emailsList(
      (data || {}) as { status?: string; q?: string; page?: number; page_size?: number },
    ),
  );

export const emailsRetry = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).emailsRetry((data || {}) as { ids?: string[] }),
  );

export const emailsDelete = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).emailsDelete(
      (data || {}) as { ids?: string[]; status?: string },
    ),
  );

// ---- Recordatorios ----
export const remindersList = createServerFn({ method: "GET" }).handler(async () =>
  (await import("@/lib/admin-api.server")).remindersList(),
);

export const remindersSend = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).remindersSend(
      (data || {}) as { subscription_ids?: string[] },
    ),
  );

// ---- SMTP ----
export const smtpGet = createServerFn({ method: "GET" })
  .validator((d: unknown) => d)
  .handler(async () => (await import("@/lib/admin-api.server")).smtpGet());

export const smtpSave = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).smtpSave((data || {}) as Record<string, unknown>),
  );

export const smtpTest = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).smtpTest((data || {}) as { to?: string }),
  );

// ---- Soporte ----
export const supportList = createServerFn({ method: "GET" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).supportList(
      (data || {}) as {
        status?: string;
        priority?: string;
        q?: string;
        user_id?: string;
        type?: string;
      },
    ),
  );

export const supportGet = createServerFn({ method: "GET" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).supportGet(
      String((data as { id?: string })?.id || ""),
    ),
  );

export const supportReply = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).supportReply(
      (data || {}) as {
        id: string;
        body?: string;
        attachments?: { path: string; name: string; mime_type?: string; size?: number }[];
      },
    ),
  );

export const supportUpdate = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).supportUpdate(
      (data || {}) as { id: string; status?: string; priority?: string },
    ),
  );

/** Aviso por correo al admin cuando el suscriptor abre un ticket o responde. */
export const supportNotifyAdmin = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).supportNotifyAdmin(
      (data || {}) as { ticketId: string; kind?: "created" | "reply"; message?: string },
    ),
  );

// ---- Datos globales (service role) ----
export const dashboardData = createServerFn({ method: "GET" }).handler(async () =>
  (await import("@/lib/admin-api.server")).dashboardData(),
);

export const auditList = createServerFn({ method: "GET" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).auditList(
      (data || {}) as {
        limit?: number;
        user?: string;
        action?: string;
        entity?: string;
        q?: string;
        from?: string;
        to?: string;
      },
    ),
  );

export const plansList = createServerFn({ method: "GET" }).handler(async () =>
  (await import("@/lib/admin-api.server")).plansList(),
);

export const paymentsList = createServerFn({ method: "GET" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).paymentsList(
      (data || {}) as {
        month?: string;
        method?: string;
        user_id?: string;
        status?: string;
        page?: number;
        page_size?: number;
      },
    ),
  );

export const paymentsExport = createServerFn({ method: "GET" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).paymentsExport(
      (data || {}) as { month?: string; method?: string; user_id?: string; status?: string },
    ),
  );

export const assignPlanAction = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).assignPlanAction(
      (data || {}) as { userId: string; plan: string; estado: string },
    ),
  );

export const notifyPaymentApproved = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).notifyPaymentApproved(
      (data || {}) as { userId: string; amount: number; planName?: string; endsAt?: string | null },
    ),
  );

export const extendSubscription = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).extendSubscription(
      (data || {}) as { userId: string; days: number },
    ),
  );

export const userSubscriptions = createServerFn({ method: "GET" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).userSubscriptions(
      String((data as { userId?: string })?.userId || ""),
    ),
  );

export const resendPasswordEmail = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).resendPasswordEmail(
      (data || {}) as { userId: string; redirect?: string },
    ),
  );

export const confirmPaymentAction = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).confirmPaymentAction(
      String((data as { paymentId?: string })?.paymentId || ""),
    ),
  );

export const flushQueueAction = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).flushQueueAction(
      Number((data as { max?: number })?.max || 20),
    ),
  );

export const notifyAdminUpgradeRequest = createServerFn({ method: "POST" })
  .validator((d: unknown) => d)
  .handler(async ({ data }: Ctx) =>
    (await import("@/lib/admin-api.server")).notifyAdminUpgradeRequest(
      (data || {}) as { paymentId: string },
    ),
  );
