import { jsPDF } from "jspdf";

export interface SafetyChecklistItem {
  id: string;
  category: string;
  question: string;
}

export interface SafetyChecklistAnswer {
  item_id: string;
  checked: boolean;
  bemerkung: string | null;
}

export interface SafetySignature {
  unterschrift: string;
  unterschrift_name: string;
  unterschrieben_am: string;
  personal_answers?: Array<{ item_id: string; checked: boolean; bemerkung: string | null }>;
}

export interface SafetyEvaluationData {
  titel: string;
  typ: string;
  kategorie: string | null;
  projektName: string;
  status: string;
  created_at: string;
  checklistItems: SafetyChecklistItem[];
  answers: SafetyChecklistAnswer[];
  diskussionNotizen: string | null;
  signatures: SafetySignature[];
  employees: { vorname: string; nachname: string }[];
}

const STATUS_LABELS: Record<string, string> = {
  entwurf: "Entwurf",
  ausgefuellt: "Ausgefüllt",
  diskutiert: "Diskutiert",
  abgeschlossen: "Abgeschlossen",
};

export function generateSafetyEvaluationPDF(
  data: SafetyEvaluationData,
  options: { returnAsBlob?: boolean } = {}
): void | Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let yPos = margin;

  const checkPage = (needed: number) => {
    if (yPos + needed > pageHeight - 20) {
      doc.addPage();
      yPos = margin;
    }
  };

  // Header
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(61, 63, 71);
  doc.text("SCHAFFERHOFER BAU", margin, yPos);
  yPos += 8;

  doc.setDrawColor(61, 63, 71);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, margin + contentWidth, yPos);
  yPos += 6;

  const typLabel = data.typ === "evaluierung" ? "Evaluierung" : "Sicherheitsunterweisung";
  doc.setFontSize(16);
  doc.setTextColor(100, 100, 100);
  doc.text(typLabel, margin, yPos);
  yPos += 10;

  // Title
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text(data.titel, margin, yPos);
  yPos += 8;

  // Meta info
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Projekt: ${data.projektName}`, margin, yPos); yPos += 5;
  if (data.kategorie) { doc.text(`Kategorie: ${data.kategorie}`, margin, yPos); yPos += 5; }
  doc.text(`Status: ${STATUS_LABELS[data.status] || data.status}`, margin, yPos); yPos += 5;
  doc.text(`Erstellt: ${new Date(data.created_at).toLocaleDateString("de-AT")}`, margin, yPos); yPos += 5;

  // Employees
  if (data.employees.length > 0) {
    doc.text(`Beteiligte: ${data.employees.map((e) => `${e.vorname} ${e.nachname}`).join(", ")}`, margin, yPos);
    yPos += 5;
  }
  yPos += 8;

  // Checklist
  if (data.checklistItems.length > 0) {
    checkPage(15);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Checkliste", margin, yPos);
    yPos += 8;

    const categories = [...new Set(data.checklistItems.map((i) => i.category))];

    for (const cat of categories) {
      checkPage(12);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 80);
      doc.text(cat, margin, yPos);
      yPos += 6;

      const items = data.checklistItems.filter((i) => i.category === cat);
      for (const item of items) {
        checkPage(12);
        const answer = data.answers.find((a) => a.item_id === item.id);
        const checked = answer?.checked ?? false;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);

        // Checkbox symbol
        const symbol = checked ? "[x]" : "[ ]";
        doc.text(`${symbol}  ${item.question}`, margin + 2, yPos);
        yPos += 5;

        if (answer?.bemerkung) {
          doc.setFontSize(8);
          doc.setTextColor(120, 120, 120);
          const bemLines = doc.splitTextToSize(`Bemerkung: ${answer.bemerkung}`, contentWidth - 10);
          doc.text(bemLines, margin + 10, yPos);
          yPos += bemLines.length * 4 + 2;
        }
      }
      yPos += 3;
    }
    yPos += 5;
  }

  // Discussion notes
  if (data.diskussionNotizen) {
    checkPage(20);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Besprechungsnotizen", margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize(data.diskussionNotizen, contentWidth);
    for (const line of noteLines) {
      checkPage(6);
      doc.text(line, margin, yPos);
      yPos += 5;
    }
    yPos += 8;
  }

  // Signatures
  if (data.signatures.length > 0) {
    checkPage(30);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`Unterschriften (${data.signatures.length}/${data.employees.length})`, margin, yPos);
    yPos += 8;

    for (const sig of data.signatures) {
      checkPage(40);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`${sig.unterschrift_name} — ${new Date(sig.unterschrieben_am).toLocaleDateString("de-AT")}`, margin, yPos);
      yPos += 5;

      if (sig.unterschrift) {
        try {
          doc.addImage(sig.unterschrift, "PNG", margin, yPos, 50, 20);
          yPos += 23;
        } catch {
          yPos += 3;
        }
      }

      // Personal answers for this employee
      const checkedAnswers = (sig.personal_answers || []).filter((a) => a.checked);
      if (checkedAnswers.length > 0) {
        checkPage(8);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(80, 80, 80);
        doc.text(`Abgehakte Punkte (${checkedAnswers.length}/${(sig.personal_answers || []).length}):`, margin + 2, yPos);
        yPos += 4;

        for (const answer of checkedAnswers) {
          const item = data.checklistItems.find((i) => i.id === answer.item_id);
          if (!item) continue;
          checkPage(6);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(0, 0, 0);
          const lines = doc.splitTextToSize(`✓  ${item.question}`, contentWidth - 10);
          doc.text(lines, margin + 4, yPos);
          yPos += lines.length * 4;
        }
      }

      yPos += 5;
    }
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  const footerY = pageHeight - 10;
  doc.text(`Erstellt am: ${new Date().toLocaleDateString("de-AT")} | Schafferhofer Bau`, margin, footerY);

  const dateStr = new Date(data.created_at).toISOString().slice(0, 10);
  const titelClean = data.titel.replace(/[^a-zA-Z0-9äöüÄÖÜß ]/g, "_").slice(0, 40);
  if (options.returnAsBlob) {
    return doc.output("blob");
  }
  doc.save(`${typLabel}_${titelClean}_${dateStr}.pdf`);
}
