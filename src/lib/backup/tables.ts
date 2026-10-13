export interface BackupTable {
  name: string;
  label: string;
  filterColumn?: string;
  orderColumn: string;
  idColumn: string;
}

export const BACKUP_TABLES: BackupTable[] = [
  {
    name: "clients",
    label: "Clientes",
    filterColumn: "user_id",
    orderColumn: "name",
    idColumn: "id",
  },
  {
    name: "loans",
    label: "Pr├®stamos",
    filterColumn: "user_id",
    orderColumn: "created_at",
    idColumn: "id",
  },
  { name: "installments", label: "Cuotas", orderColumn: "number", idColumn: "id" },
  {
    name: "payments",
    label: "Pagos",
    filterColumn: "user_id",
    orderColumn: "created_at",
    idColumn: "id",
  },
  {
    name: "documents",
    label: "Documentos",
    filterColumn: "user_id",
    orderColumn: "created_at",
    idColumn: "id",
  },
  {
    name: "settings",
    label: "Configuraci├│n",
    filterColumn: "user_id",
    orderColumn: "updated_at",
    idColumn: "id",
  },
];

export const RESTORE_ORDER = [
  "settings",
  "clients",
  "loans",
  "installments",
  "payments",
  "documents",
];

export function getBackupFolder(userId: string): string {
  return `user_${userId}`;
}

export function getBackupTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
