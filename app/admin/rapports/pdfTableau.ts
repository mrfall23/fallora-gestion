// Rapports PDF en tableaux (meme en-tete que le recapitulatif de periode).
// jsPDF est charge seulement au clic.

export type Colonne = { titre: string; largeur: number; droite?: boolean }; // largeur en mm
export type Section = { titre: string; colonnes: Colonne[]; lignes: string[][]; total?: string[]; vide?: string };

const ACCENT: [number, number, number] = [169, 103, 61];

// Les polices integrees de jsPDF (WinAnsi) ne connaissent pas les espaces fines.
const propre = (t: string) => String(t ?? '').replace(/[   ]/g, ' ');

export async function telechargerPdfTableau(o: { titre: string; periode: string; plage: string; sections: Section[]; fichier: string; paysage?: boolean }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: o.paysage ? 'landscape' : 'portrait' });
  const M = 15, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const utile = W - 2 * M;
  let y = 20;

  const pied = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150);
      doc.text(propre(`Fallora — ${o.titre} — ${o.periode}`), M, H - 8);
      doc.text(`Page ${i} / ${n}`, W - M, H - 8, { align: 'right' });
    }
  };

  // En-tete du document
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...ACCENT); doc.text('Fallora', M, y); y += 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(60); doc.text(propre(o.titre), M, y); y += 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(40); doc.text(propre(o.periode), M, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120);
  doc.text(propre(`${o.plage}   ·   Édité le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`), M, y); y += 10;

  for (const s of o.sections) {
    // Les largeurs sont reparties sur la largeur utile de la page.
    const somme = s.colonnes.reduce((a, c) => a + c.largeur, 0);
    const largeurs = s.colonnes.map((c) => (c.largeur / somme) * utile);
    const xs = largeurs.map((_, i) => M + largeurs.slice(0, i).reduce((a, b) => a + b, 0));

    const entete = () => {
      doc.setFillColor(246, 239, 232);
      doc.rect(M, y - 4.5, utile, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...ACCENT);
      s.colonnes.forEach((c, i) => doc.text(propre(c.titre).toUpperCase(), c.droite ? xs[i] + largeurs[i] - 2 : xs[i] + 2, y, { align: c.droite ? 'right' : 'left' }));
      y += 6;
    };
    const ligne = (cells: string[], gras = false) => {
      doc.setFont('helvetica', gras ? 'bold' : 'normal'); doc.setFontSize(9); doc.setTextColor(gras ? 30 : 50);
      const decoupees = cells.map((t, i) => doc.splitTextToSize(propre(t), largeurs[i] - 4) as string[]);
      const h = Math.max(...decoupees.map((d) => d.length)) * 4.2 + 2;
      if (y + h > H - 16) { doc.addPage(); y = 20; entete(); doc.setFont('helvetica', gras ? 'bold' : 'normal'); doc.setFontSize(9); doc.setTextColor(gras ? 30 : 50); }
      decoupees.forEach((d, i) => doc.text(d, s.colonnes[i].droite ? xs[i] + largeurs[i] - 2 : xs[i] + 2, y, { align: s.colonnes[i].droite ? 'right' : 'left' }));
      y += h;
      doc.setDrawColor(235); doc.line(M, y - 3.2, W - M, y - 3.2);
    };

    if (y + 22 > H - 16) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(60, 40, 30);
    doc.text(propre(s.titre), M, y); y += 7;
    entete();
    if (!s.lignes.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(140);
      doc.text(propre(s.vide || 'Aucune donnée sur la période.'), M + 2, y); y += 7;
    } else {
      s.lignes.forEach((l) => ligne(l));
    }
    if (s.total) ligne(s.total, true);
    y += 6;
  }

  pied();
  doc.save(o.fichier);
}
