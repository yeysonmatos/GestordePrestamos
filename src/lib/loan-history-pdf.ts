import { formatReceiptDate } from "@/lib/finance";

export interface LoanHistoryRow {
  date: string;
  concept: string;
  amount: number;
  capital: number;
  interest: number;
  late: number;
}

export interface LoanHistoryData {
  business: string;
  client: string;
  loanDisplayId: string;
  typeLabel: string;
  principal: number;
  rateLabel: string;
  frequencyLabel: string;
  startLabel: string;
  rows: LoanHistoryRow[];
  totals: { amount: number; capital: number; interest: number; late: number };
  balance: number;
  nextDue: string | null;
  issuedLabel: string;
}

function money(n: number): string {
  return `RD$ ${Number(n || 0).toLocaleString("es-DO", { maximumFractionDigits: 2 })}`;
}

/** PDF del historial de pagos de un préstamo (para enviárselo al deudor). */
export async function buildLoanHistoryPdf(d: LoanHistoryData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = 595.28;
  const M = 40;
  const right = W - M;
  let y = M + 8;

  function header() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(37, 99, 235);
    doc.text(d.business || "Gestor de Prestamos", M, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130, 140, 155);
    doc.text(`Emitido: ${d.issuedLabel}`, right, y, { align: "right" });

    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text("HISTORIAL DE PAGOS", M, y);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 100, 115);
    doc.text(`Préstamo ${d.loanDisplayId || "—"}`, right, y, { align: "right" });
    y += 14;

    doc.setDrawColor(226, 232, 240);
    doc.line(M, y, right, y);
    y += 14;

    // Datos del cliente y del préstamo
    doc.setFontSize(9);
    const info: Array<[string, string]> = [
      ["Cliente", d.client],
      ["Tipo", d.typeLabel],
      ["Monto prestado", money(d.principal)],
      ["Tasa", d.rateLabel],
      ["Frecuencia", d.frequencyLabel],
      ["Inicio", d.startLabel],
    ];
    for (const [label, value] of info) {
      doc.setTextColor(130, 140, 155);
      doc.text(`${label}:`, M, y);
      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "bold");
      doc.text(value, M + 95, y);
      doc.setFont("helvetica", "normal");
      y += 13;
    }
    y += 6;
    doc.line(M, y, right, y);
    y += 16;
  }

  function tableHead() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(110, 120, 135);
    doc.text("FECHA", M, y);
    doc.text("CONCEPTO", M + 62, y);
    doc.text("MONTO", 360, y, { align: "right" });
    doc.text("CAPITAL", 425, y, { align: "right" });
    doc.text("INTERÉS", 487, y, { align: "right" });
    doc.text("MORA", right, y, { align: "right" });
    y += 4;
    doc.setDrawColor(226, 232, 240);
    doc.line(M, y, right, y);
    y += 12;
  }

  header();
  tableHead();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  for (const r of d.rows) {
    if (y > 770) {
      doc.addPage();
      y = M + 8;
      header();
      tableHead();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
    }
    const concept = r.concept.length > 32 ? `${r.concept.slice(0, 31)}…` : r.concept;
    doc.setTextColor(60, 70, 85);
    doc.text(formatReceiptDate(r.date), M, y);
    doc.text(concept, M + 62, y);
    doc.setTextColor(30, 41, 59);
    doc.text(money(r.amount), 360, y, { align: "right" });
    doc.text(r.capital ? money(r.capital) : "—", 425, y, { align: "right" });
    doc.text(r.interest ? money(r.interest) : "—", 487, y, { align: "right" });
    doc.text(r.late ? money(r.late) : "—", right, y, { align: "right" });
    y += 14;
  }

  if (d.rows.length === 0) {
    doc.setTextColor(130, 140, 155);
    doc.text("Sin pagos registrados.", M, y);
    y += 14;
  }

  y += 4;
  doc.setDrawColor(180, 190, 205);
  doc.line(M, y, right, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text("TOTALES", M, y);
  doc.text(money(d.totals.amount), 360, y, { align: "right" });
  doc.text(money(d.totals.capital), 425, y, { align: "right" });
  doc.text(money(d.totals.interest), 487, y, { align: "right" });
  doc.text(money(d.totals.late), right, y, { align: "right" });
  y += 22;

  doc.setFontSize(10);
  doc.text(`Saldo pendiente del préstamo: ${money(d.balance)}`, M, y);
  y += 14;
  if (d.nextDue) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 100, 115);
    doc.text(`Próximo vencimiento: ${d.nextDue}`, M, y);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("Documento generado por Gestor de Prestamos", M, 812);

  return doc.output("blob");
}

/** Genera el historial y lo comparte (PWA) o lo descarga. */
export async function shareLoanHistoryPdf(d: LoanHistoryData): Promise<"shared" | "downloaded"> {
  const blob = await buildLoanHistoryPdf(d);
  const name = `historial-${(d.loanDisplayId || "prestamo").replace(/[^\w-]/g, "")}.pdf`;
  const file = new File([blob], name, { type: "application/pdf" });

  const nav = navigator as Navigator & {
    canShare?: (x: { files?: File[] }) => boolean;
    share?: (x: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "Historial de pagos" });
      return "shared";
    } catch {
      /* cancelado */
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
