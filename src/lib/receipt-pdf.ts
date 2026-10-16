import type { Receipt } from "@/components/pay-dialog";
import { formatReceiptDate } from "@/lib/finance";

function money(n: number): string {
  return `RD$ ${Number(n || 0).toLocaleString("es-DO", { maximumFractionDigits: 2 })}`;
}

/**
 * Genera el PDF del recibo con jsPDF (texto vectorial, sin capturas).
 * Se usa porque `window.print()` NO funciona en las PWA instaladas de iPhone.
 */
export async function buildReceiptPdf(r: Receipt): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = 595.28;
  const M = 48;
  const right = W - M;
  let y = M + 6;

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(37, 99, 235);
  doc.text(r.business || "Gestor de Prestamos", M, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 130, 145);
  doc.text(`RECIBO #${r.paymentId.slice(0, 8).toUpperCase()}${r.copy ? " · COPIA" : ""}`, M, y);
  doc.text(formatReceiptDate(r.date), right, y, { align: "right" });
  y += 16;

  doc.setDrawColor(226, 232, 240);
  doc.line(M, y, right, y);
  y += 20;

  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110, 120, 135);
    doc.text(label, M, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(value, right, y, { align: "right" });
    y += 16;
  };

  row("Cliente", r.client);
  row("Préstamo", r.loanDisplayId || "—");
  row("Concepto", r.payType);
  row("Forma de pago", r.method);
  if (r.notes) row("Nota", r.notes);
  row("Mora", money(r.late));
  row("Capital / Interés", `${money(r.capital)} / ${money(r.interest)}`);

  y += 6;
  doc.line(M, y, right, y);
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text("Total recibido", M, y);
  doc.text(money(r.amount), right, y, { align: "right" });
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110, 120, 135);
  doc.text(`Nuevo balance del préstamo: ${money(r.newBalance)}`, M, y);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("Documento generado por Gestor de Prestamos", M, 806);

  return doc.output("blob");
}

/**
 * Comparte el PDF por el menú nativo (funciona en la PWA de iPhone) o lo
 * descarga como archivo (navegadores de escritorio).
 */
export async function shareReceiptPdf(
  r: Receipt,
  shareText?: string,
): Promise<"shared" | "downloaded"> {
  const blob = await buildReceiptPdf(r);
  const name = `recibo-${r.paymentId.slice(0, 8)}.pdf`;
  const file = new File([blob], name, { type: "application/pdf" });

  const nav = navigator as Navigator & {
    canShare?: (d: { files?: File[] }) => boolean;
    share?: (d: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };

  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      const payload: { files: File[]; title: string; text?: string } = {
        files: [file],
        title: "Recibo de pago",
      };
      if (shareText) payload.text = shareText;
      await nav.share(payload);
      return "shared";
    } catch {
      /* el usuario canceló: se intenta la descarga */
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
