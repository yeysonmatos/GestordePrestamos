import { createFileRoute } from "@tanstack/react-router";
import AdminEmails from "@/components/admin/AdminEmails";

export const Route = createFileRoute("/_authenticated/admin/emails/")({
  component: AdminEmailsRoute,
});

function AdminEmailsRoute() {
  return <AdminEmails />;
}
