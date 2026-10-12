import { createFileRoute } from "@tanstack/react-router";
import AdminReminders from "@/components/admin/AdminReminders";

export const Route = createFileRoute("/_authenticated/admin/reminders/")({
  component: AdminRemindersRoute,
});

function AdminRemindersRoute() {
  return <AdminReminders />;
}
