import { createFileRoute } from "@tanstack/react-router";
import AdminSmtpConfig from "@/components/admin/AdminSmtpConfig";

export const Route = createFileRoute("/_authenticated/admin/smtp-config/")({
  component: AdminSmtpConfigRoute,
});

function AdminSmtpConfigRoute() {
  return <AdminSmtpConfig />;
}
