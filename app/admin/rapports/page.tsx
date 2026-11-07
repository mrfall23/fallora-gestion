'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toutLire, lireParIds } from '@/lib/requetes';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { telechargerPdfTableau, type Section } from './pdfTableau';

const MODE_LABELS: Record<string, string> = { cash: 'Espèces', mobile_money: 'Mobile Money', orange_money: 'Orange Money' };
const fmt = (n: number) => n.toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const fmtDate = (s: string | Date) => new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

// Une vente en ligne (commande du site) n'a pas de vendeuse : elle est rangee sous « Site web ».
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nomVendeuse = (v: any): string => v.utilisateurs?.nom || (v.canal === 'en_ligne' ? 'Site web' : 'Inconnu');

export default function AdminRapports() {
  const [ventes, setVentes] = useState<any[]>([]);
  const [depenses, setDepenses] = useState<{ date_depense: string; categorie: string; libelle: string | null; montant: number }[]>([]);
  const [periodes, setPeriodes] = useState<any[]>([]);
  const [periodeSel, setPeriodeSel] = useState<string>('active'); // 'active' | 'all' | id
  const [chargement, setChargement] = useState(true);

  useEffect(() => { chargerDonnees(); }, []);

  const chargerDonnees = async () => {
    const { data: per } = await supabase.from('periodes').select('*').order('debut', { ascending: false });
    setPeriodes(per || []);
    type LigneDepense = { date_depense: string; categorie: string; libelle: string | null; montant: number };
    const dep = await toutLire<LigneDepense>(() => supabase.from('depenses').select('date_depense, categorie, libelle, montant').order('date_depense', { ascending: false }).order('id')).catch(() => [] as LigneDepense[]);
    setDepenses(dep.map(d => ({ ...d, montant: Number(d.montant) || 0 })));
    const ventesData = await toutLire(() => supabase.from('ventes').select('*').eq('annulee', false).order('date_vente', { ascending: false }).order('id', { ascending: false }));
    if (ventesData.length === 0) { setVentes([]); setChargement(false); return; }
    const venteIds = ventesData.map((v: any) => v.id);
    const [clientes, utilisateurs, venteProduits, paiements] = await Promise.all([
      lireParIds('clientes', '*', 'id', ventesData.map((v: any) => v.cliente_id)),
      lireParIds('utilisateurs', 'id, nom', 'id', ventesData.map((v: any) => v.vendeuse_id)),
      lireParIds('vente_produits', '*', 'vente_id', venteIds),
      lireParIds('paiements', '*', 'vente_id', venteIds),
    ]);
    const produits = await lireParIds('produits', 'id, nom', 'id', venteProduits.map((vp: any) => vp.produit_id));
    setVentes(ventesData.map((v: any) => ({
      ...v,
      clientes: (clientes || []).find((c: any) => c.id === v.cliente_id) || null,
      utilisateurs: (utilisateurs || []).find((u: any) => u.id === v.vendeuse_id) || null,
      vente_produits: (venteProduits || []).filter((vp: any) => vp.vente_id === v.id).map((vp: any) => ({ ...vp, produits: (produits || []).find((p: any) => p.id === vp.produit_id) || null })),
      paiements: (paiements || []).filter((p: any) => p.vente_id === v.id),
    })));
    setChargement(false);
  };

  // Periode active = celle sans fin. Le filtre borne les ventes a [debut, fin).
  const periodeActive = periodes.find(p => !p.fin) || null;
  const periodeChoisie = periodeSel === 'active' ? periodeActive : periodeSel === 'all' ? null : periodes.find(p => String(p.id) === periodeSel) || null;
  const libellePeriode = periodeSel === 'all' ? 'Toutes les périodes' : (periodeChoisie?.nom || 'Période en cours');

  const ventesFiltrees = useMemo(() => {
    if (periodeSel === 'all' || !periodeChoisie) {
      if (periodeSel === 'all') return ventes;
      return ventes; // pas encore de periode connue -> tout
    }
    const debut = new Date(periodeChoisie.debut); const fin = periodeChoisie.fin ? new Date(periodeChoisie.fin) : null;
    return ventes.filter(v => { const d = new Date(v.date_vente); return d >= debut && (!fin || d < fin); });
  }, [ventes, periodeSel, periodeChoisie]);

  // ── Agregats reutilises par Excel et PDF ──
  const parVendeuse = () => {
    const map: Record<string, { nb: number; total: number }> = {};
    ventesFiltrees.forEach(v => { const nom = nomVendeuse(v); if (!map[nom]) map[nom] = { nb: 0, total: 0 }; map[nom].nb += 1; map[nom].total += v.total; });
    return Object.entries(map).map(([nom, s]) => ({ nom, ...s })).sort((a, b) => b.total - a.total);
  };
  const parProduit = () => {
    const map: Record<string, { quantite: number; total: number }> = {};
    // Remise d'une vente repartie au prorata de ses lignes (total = sous-total - remise).
    ventesFiltrees.forEach(v => { const coef = Number(v.remise) > 0 ? v.total / (v.total + Number(v.remise)) : 1; v.vente_produits?.forEach((vp: any) => { const nom = vp.produits?.nom || 'Inconnu'; if (!map[nom]) map[nom] = { quantite: 0, total: 0 }; map[nom].quantite += vp.quantite; map[nom].total += Math.round(vp.prix_unitaire * vp.quantite * coef); }); });
    return Object.entries(map).map(([nom, s]) => ({ nom, ...s })).sort((a, b) => b.quantite - a.quantite);
  };
  const parMode = () => {
    const map: Record<string, number> = { cash: 0, mobile_money: 0, orange_money: 0 };
    ventesFiltrees.forEach(v => v.paiements?.forEach((p: any) => { if (map[p.mode] !== undefined) map[p.mode] += p.montant; else map[p.mode] = p.montant; }));
    return map;
  };

  const totalVentes = ventesFiltrees.reduce((s, v) => s + v.total, 0);
  // Depenses de la periode, comparees en date locale (date_depense est une date sans heure).
  const jourLocal = (d: string | Date) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const debutDepenses = periodeSel !== 'all' && periodeChoisie ? jourLocal(periodeChoisie.debut) : null;
  const finDepenses = periodeSel !== 'all' && periodeChoisie?.fin ? jourLocal(periodeChoisie.fin) : null;
  const depensesFiltrees = depenses.filter(d => (!debutDepenses || d.date_depense >= debutDepenses) && (!finDepenses || d.date_depense < finDepenses));
  const totalDepenses = depensesFiltrees.reduce((s, d) => s + d.montant, 0);
  const depensesParCategorie = () => Object.entries(depensesFiltrees.reduce<Record<string, number>>((acc, d) => { acc[d.categorie] = (acc[d.categorie] || 0) + d.montant; return acc; }, {})).sort((a, b) => b[1] - a[1]);

  const totalEncaisse = ventesFiltrees.reduce((s, v) => s + v.montant_paye, 0);
  const totalEnAttente = ventesFiltrees.reduce((s, v) => s + v.reste_a_payer, 0);
  const slug = libellePeriode.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'periode';

  const exporterParVendeuse = () => {
    const map: any = {};
    ventesFiltrees.forEach(v => {
      const nom = nomVendeuse(v);
      if (!map[nom]) map[nom] = [];
      map[nom].push({ 'Date': new Date(v.date_vente).toLocaleString('fr-FR'), 'Cliente': v.clientes?.nom || '', 'Telephone': v.clientes?.telephone || '', 'Total (FCFA)': v.total, 'Montant Paye (FCFA)': v.montant_paye, 'Reste a Payer (FCFA)': v.reste_a_payer, 'Statut': v.statut_paiement === 'paye' ? 'Paye' : 'Partiel' });
    });
    const wb = XLSX.utils.book_new();
    Object.entries(map).forEach(([nom, data]: any) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), nom.substring(0, 31)));
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]), `rapport_vendeuses_${slug}.xlsx`);
  };

  const exporterParProduit = () => {
    const data = parProduit().map(p => ({ 'Produit': p.nom, 'Quantite Vendue': p.quantite, 'Total (FCFA)': p.total }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Produits');
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]), `rapport_produits_${slug}.xlsx`);
  };

  const exporterParPaiement = () => {
    const m = parMode();
    const total = Object.values(m).reduce((a, b) => a + b, 0);
    const data = [{ 'Mode': 'Cash', 'Total (FCFA)': m.cash }, { 'Mode': 'Mobile Money', 'Total (FCFA)': m.mobile_money }, { 'Mode': 'Orange Money', 'Total (FCFA)': m.orange_money }, { 'Mode': 'TOTAL', 'Total (FCFA)': total }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Paiements');
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]), `rapport_paiements_${slug}.xlsx`);
  };

  // Boutique / site web : nombre de ventes et chiffre d'affaires, puis le detail des ventes en ligne.
  const exporterParCanal = () => {
    const canal = (v: { canal?: string }) => (v.canal === 'en_ligne' ? 'Site web' : 'Boutique');
    const resume = ['Boutique', 'Site web'].map(c => {
      const vs = ventesFiltrees.filter(v => canal(v) === c);
      return { 'Canal': c, 'Ventes': vs.length, 'Total (FCFA)': vs.reduce((s, v) => s + v.total, 0) };
    });
    resume.push({ 'Canal': 'TOTAL', 'Ventes': ventesFiltrees.length, 'Total (FCFA)': totalVentes });
    const enLigne = ventesFiltrees.filter(v => v.canal === 'en_ligne').map(v => ({
      'Date': new Date(v.date_vente).toLocaleString('fr-FR'),
      'Commande': v.reference_site || '',
      'Cliente': v.clientes?.nom || '',
      'Telephone': v.clientes?.telephone || '',
      'Produits': (v.vente_produits || []).map((vp: { quantite: number; produits?: { nom: string } }) => `${vp.quantite} x ${vp.produits?.nom || ''}`).join(', '),
      'Total (FCFA)': v.total,
      'Paiement': (v.paiements || []).map((p: { mode: string }) => MODE_LABELS[p.mode] || p.mode).join(', '),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resume), 'Par canal');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(enLigne.length ? enLigne : [{ 'Commande': 'Aucune vente en ligne sur la période' }]), 'Ventes en ligne');
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]), `rapport_canaux_${slug}.xlsx`);
  };

  const exporterDepenses = () => {
    const data = depensesFiltrees.map(d => ({ 'Date': fmtDate(`${d.date_depense}T12:00:00`), 'Categorie': d.categorie, 'Detail': d.libelle || '', 'Montant (FCFA)': d.montant }));
    data.push({ 'Date': '', 'Categorie': 'TOTAL', 'Detail': '', 'Montant (FCFA)': totalDepenses });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Depenses');
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]), `rapport_depenses_${slug}.xlsx`);
  };

  // ── Rapports en PDF (tableaux) ; l'Excel reste disponible en lien secondaire ──
  const plagePdf = periodeChoisie ? `${fmtDate(periodeChoisie.debut)} — ${periodeChoisie.fin ? fmtDate(periodeChoisie.fin) : 'en cours'}` : 'Toutes les ventes';
  const pdf = (titre: string, sections: Section[], fichier: string, paysage = false) =>
    telechargerPdfTableau({ titre, periode: libellePeriode, plage: plagePdf, sections, fichier: `${fichier}_${slug}.pdf`, paysage });
  const F = (n: number) => `${fmt(Number(n) || 0)} FCFA`;
  const dateHeure = (d: string) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  const pdfParVendeuse = () => {
    const pv = parVendeuse();
    const sections: Section[] = [{
      titre: 'Résumé',
      colonnes: [{ titre: 'Vendeuse', largeur: 60 }, { titre: 'Ventes', largeur: 20, droite: true }, { titre: 'Total', largeur: 40, droite: true }],
      lignes: pv.map(v => [v.nom, String(v.nb), F(v.total)]),
      total: ['TOTAL', String(ventesFiltrees.length), F(totalVentes)],
    }];
    pv.forEach(({ nom }) => {
      const vs = ventesFiltrees.filter(v => nomVendeuse(v) === nom);
      sections.push({
        titre: nom,
        colonnes: [{ titre: 'Date', largeur: 26 }, { titre: 'Cliente', largeur: 40 }, { titre: 'Téléphone', largeur: 28 }, { titre: 'Total', largeur: 26, droite: true }, { titre: 'Payé', largeur: 26, droite: true }, { titre: 'Reste', largeur: 24, droite: true }],
        lignes: vs.map(v => [dateHeure(v.date_vente), v.clientes?.nom || '', v.clientes?.telephone || '', F(v.total), F(v.montant_paye), F(v.reste_a_payer)]),
        total: ['', '', 'Total', F(vs.reduce((a, v) => a + v.total, 0)), F(vs.reduce((a, v) => a + v.montant_paye, 0)), F(vs.reduce((a, v) => a + v.reste_a_payer, 0))],
      });
    });
    return pdf('Rapport par vendeuse', sections, 'rapport_vendeuses', true);
  };

  const pdfParCanal = () => {
    const canal = (v: { canal?: string }) => (v.canal === 'en_ligne' ? 'Site web' : 'Boutique');
    const enLigne = ventesFiltrees.filter(v => v.canal === 'en_ligne');
    return pdf('Boutique / site web', [
      {
        titre: 'Par canal',
        colonnes: [{ titre: 'Canal', largeur: 60 }, { titre: 'Ventes', largeur: 20, droite: true }, { titre: 'Total', largeur: 40, droite: true }],
        lignes: ['Boutique', 'Site web'].map(c => { const vs = ventesFiltrees.filter(v => canal(v) === c); return [c, String(vs.length), F(vs.reduce((a, v) => a + v.total, 0))]; }),
        total: ['TOTAL', String(ventesFiltrees.length), F(totalVentes)],
      },
      {
        titre: 'Commandes en ligne',
        colonnes: [{ titre: 'Date', largeur: 24 }, { titre: 'Commande', largeur: 20 }, { titre: 'Cliente', largeur: 32 }, { titre: 'Produits', largeur: 64 }, { titre: 'Paiement', largeur: 26 }, { titre: 'Total', largeur: 26, droite: true }],
        lignes: enLigne.map(v => [
          dateHeure(v.date_vente), v.reference_site || '', v.clientes?.nom || '',
          (v.vente_produits || []).map((vp: { quantite: number; produits?: { nom: string } }) => `${vp.quantite} × ${vp.produits?.nom || ''}`).join(', '),
          (v.paiements || []).map((p: { mode: string }) => MODE_LABELS[p.mode] || p.mode).join(', '),
          F(v.total),
        ]),
        total: enLigne.length ? ['', '', '', '', 'Total', F(enLigne.reduce((a, v) => a + v.total, 0))] : undefined,
        vide: 'Aucune vente en ligne sur la période.',
      },
    ], 'rapport_canaux', true);
  };

  const pdfParProduit = () => {
    const pp = parProduit();
    return pdf('Rapport par produit', [{
      titre: 'Ventes par produit',
      colonnes: [{ titre: 'Produit', largeur: 90 }, { titre: 'Quantité', largeur: 22, droite: true }, { titre: 'Total', largeur: 40, droite: true }],
      lignes: pp.map(p => [p.nom, String(p.quantite), F(p.total)]),
      total: ['TOTAL', String(pp.reduce((a, p) => a + p.quantite, 0)), F(pp.reduce((a, p) => a + p.total, 0))],
    }], 'rapport_produits');
  };

  const pdfDepenses = () => pdf('Rapport des dépenses', [
    {
      titre: 'Par catégorie',
      colonnes: [{ titre: 'Catégorie', largeur: 90 }, { titre: 'Montant', largeur: 40, droite: true }],
      lignes: depensesParCategorie().map(([c, m]) => [c, F(m)]),
      total: ['TOTAL', F(totalDepenses)],
    },
    {
      titre: 'Détail',
      colonnes: [{ titre: 'Date', largeur: 26 }, { titre: 'Catégorie', largeur: 36 }, { titre: 'Détail', largeur: 70 }, { titre: 'Montant', largeur: 30, droite: true }],
      lignes: depensesFiltrees.map(d => [fmtDate(`${d.date_depense}T12:00:00`), d.categorie, d.libelle || '', F(d.montant)]),
      total: ['', '', 'Total', F(totalDepenses)],
      vide: 'Aucune dépense sur la période.',
    },
  ], 'rapport_depenses');

  const pdfParPaiement = () => {
    const m = parMode();
    const total = Object.values(m).reduce((a, b) => a + b, 0);
    return pdf('Rapport par paiement', [{
      titre: 'Encaissements par mode de paiement',
      colonnes: [{ titre: 'Mode', largeur: 90 }, { titre: 'Total', largeur: 40, droite: true }],
      lignes: Object.entries(m).map(([mode, t]) => [MODE_LABELS[mode] || mode, F(t)]),
      total: ['TOTAL', F(total)],
    }], 'rapport_paiements');
  };

  // ── Récap PDF de la période ──
  const genererPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const M = 15, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    let y = 20;
    const saut = (h = 6) => { if (y + h > H - 15) { doc.addPage(); y = 20; } };
    const titreSection = (t: string) => { saut(12); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(60, 40, 30); doc.text(t, M, y); y += 6; doc.setDrawColor(220); doc.line(M, y, W - M, y); y += 5; };
    const ligne = (g: string, d: string, gras = false) => { saut(); doc.setFont('helvetica', gras ? 'bold' : 'normal'); doc.setFontSize(10); doc.setTextColor(40); doc.text(String(g), M, y); doc.text(String(d), W - M, y, { align: 'right' }); y += 6; };

    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(169, 103, 61); doc.text('Fallora', M, y); y += 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(60); doc.text('Rapport de période', M, y); y += 9;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(40); doc.text(libellePeriode, M, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120);
    const plage = periodeChoisie ? `${fmtDate(periodeChoisie.debut)} — ${periodeChoisie.fin ? fmtDate(periodeChoisie.fin) : 'en cours'}` : 'Toutes les ventes';
    doc.text(`${plage}   ·   Édité le ${fmtDate(new Date())}`, M, y); y += 10;

    titreSection('Synthèse');
    ligne('Nombre de ventes', String(ventesFiltrees.length));
    ligne('Chiffre d\'affaires', `${fmt(totalVentes)} FCFA`, true);
    ligne('Encaissé', `${fmt(totalEncaisse)} FCFA`);
    ligne('Reste à encaisser', `${fmt(totalEnAttente)} FCFA`);
    ligne('Dépenses', `${fmt(totalDepenses)} FCFA`);

    titreSection('Par vendeuse');
    const pv = parVendeuse();
    if (pv.length === 0) ligne('—', '');
    else pv.forEach(v => ligne(`${v.nom} (${v.nb} vente${v.nb > 1 ? 's' : ''})`, `${fmt(v.total)} FCFA`));

    titreSection('Par produit');
    const pp = parProduit();
    if (pp.length === 0) ligne('—', '');
    else pp.forEach(p => ligne(`${p.nom}  ×${p.quantite}`, `${fmt(p.total)} FCFA`));

    titreSection('Dépenses par catégorie');
    const dc = depensesParCategorie();
    if (dc.length === 0) ligne('—', '');
    else dc.forEach(([cat, montant]) => ligne(cat, `${fmt(montant)} FCFA`));

    titreSection('Par mode de paiement');
    const m = parMode();
    Object.entries(m).forEach(([mode, tot]) => ligne(MODE_LABELS[mode] || mode, `${fmt(tot)} FCFA`));

    doc.save(`rapport_${slug}.pdf`);
  };

  const CARDS = [
    { icon: 'picture_as_pdf', title: 'Récapitulatif PDF', desc: 'Synthèse de la période : totaux, dépenses, par vendeuse, par produit et par mode de paiement. À télécharger/imprimer avant de clôturer.', onClick: genererPdf, cta: 'Télécharger le PDF', pdf: true },
    { icon: 'groups', title: 'Rapport par vendeuse', desc: 'Ventes, transactions et détails pour chaque vendeuse sur la période.', onClick: pdfParVendeuse, excel: exporterParVendeuse, cta: 'Télécharger le PDF', pdf: true },
    { icon: 'language', title: 'Boutique / site web', desc: 'Chiffre d\'affaires de la boutique et du site, avec le détail des commandes en ligne.', onClick: pdfParCanal, excel: exporterParCanal, cta: 'Télécharger le PDF', pdf: true },
    { icon: 'inventory_2', title: 'Rapport par produit', desc: 'Quantités vendues et chiffre d\'affaires article par article.', onClick: pdfParProduit, excel: exporterParProduit, cta: 'Télécharger le PDF', pdf: true },
    { icon: 'payments', title: 'Rapport des dépenses', desc: 'Toutes les dépenses de la période : date, catégorie, détail et total.', onClick: pdfDepenses, excel: exporterDepenses, cta: 'Télécharger le PDF', pdf: true },
    { icon: 'account_balance_wallet', title: 'Rapport par paiement', desc: 'Encaissements par mode : espèces, Mobile Money, Orange Money.', onClick: pdfParPaiement, excel: exporterParPaiement, cta: 'Télécharger le PDF', pdf: true },
  ] as { icon: string; title: string; desc: string; onClick: () => void; excel?: () => void; cta: string; pdf?: boolean }[];

  return (
    <div className="fade-up">
      {/* Sélecteur de période */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-55)' }}>Période :</span>
        <select value={periodeSel} onChange={e => setPeriodeSel(e.target.value)} style={{ height: '44px', padding: '0 14px', borderRadius: '13px', background: 'var(--surface)', border: '1px solid var(--accent-20)', color: 'var(--ink)', fontSize: '14px', fontWeight: 600, outline: 'none', cursor: 'pointer' }}>
          <option value="active">Période en cours{periodeActive?.nom && periodeActive.nom !== 'Période en cours' ? ` (${periodeActive.nom})` : ''}</option>
          {periodes.filter(p => p.fin).map(p => <option key={p.id} value={String(p.id)}>{p.nom} — {fmtDate(p.debut)}</option>)}
          <option value="all">Toutes les périodes</option>
        </select>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Total ventes', value: totalVentes.toLocaleString(), color: 'var(--ink)' },
          { label: 'Dont site web', value: ventesFiltrees.filter(v => v.canal === 'en_ligne').reduce((s, v) => s + v.total, 0).toLocaleString(), color: 'var(--accent)' },
          { label: 'Encaissé', value: totalEncaisse.toLocaleString(), color: 'var(--success)' },
          { label: 'En attente', value: totalEnAttente.toLocaleString(), color: 'var(--warn)' },
          { label: 'Dépenses', value: totalDepenses.toLocaleString(), color: 'var(--danger)' },
        ].map(s => (
          <div key={s.label} style={{ padding: '20px', borderRadius: '18px', background: 'var(--surface)', border: '1px solid var(--accent-12)', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.5px', color: 'var(--ink-55)', textTransform: 'uppercase', marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value} <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>FCFA</span></div>
          </div>
        ))}
      </div>

      {chargement ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-45)' }}>Chargement...</div>
      ) : ventesFiltrees.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--ink-45)' }}>
          <span className="ms" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: 'var(--accent-30)' }}>download</span>
          Aucune vente sur cette période.
        </div>
      ) : (
        <>
          <div style={{ fontSize: '14px', color: 'var(--ink-55)', marginBottom: '16px', fontWeight: 500 }}>
            {ventesFiltrees.length} vente{ventesFiltrees.length > 1 ? 's' : ''} — {libellePeriode}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '20px' }}>
            {CARDS.map(r => (
              <div key={r.title} style={{ display: 'flex', flexDirection: 'column', padding: '28px', borderRadius: '22px', background: 'var(--surface)', border: `1px solid ${r.pdf ? 'var(--accent-25)' : 'var(--accent-12)'}`, boxShadow: 'var(--shadow-md)' }}>
                <div style={{ width: '54px', height: '54px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: r.pdf ? 'var(--accent-12)' : 'var(--success-tint)', border: `1px solid ${r.pdf ? 'var(--accent-25)' : 'var(--success-line)'}`, marginBottom: '20px' }}>
                  <span className="ms" style={{ fontSize: '27px', color: r.pdf ? 'var(--accent)' : 'var(--success)' }}>{r.icon}</span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', marginBottom: '7px' }}>{r.title}</div>
                <div style={{ fontSize: '13.5px', lineHeight: 1.55, color: 'var(--ink-55)', marginBottom: '24px', flex: 1 }}>{r.desc}</div>
                <button onClick={r.onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', height: '48px', border: 'none', borderRadius: '14px', cursor: 'pointer', background: r.pdf ? 'var(--accent-grad)' : 'var(--success)', color: r.pdf ? 'var(--on-accent)' : '#fff', fontSize: '14.5px', fontWeight: 700, boxShadow: r.pdf ? 'var(--shadow-accent)' : 'none' }}>
                  <span className="ms" style={{ fontSize: '20px' }}>download</span>{r.cta}
                </button>
                {r.excel && (
                  <button onClick={r.excel} style={{ marginTop: '10px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-45)', fontSize: '12.5px', textDecoration: 'underline' }}>
                    ou version Excel
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
