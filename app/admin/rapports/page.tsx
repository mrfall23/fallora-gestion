'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export default function AdminRapports() {
  const [ventes, setVentes] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => { chargerDonnees(); }, []);

  const chargerDonnees = async () => {
    const { data: ventesData } = await supabase.from('ventes').select('*').eq('annulee', false).order('date_vente', { ascending: false });
    if (!ventesData || ventesData.length === 0) { setVentes([]); setChargement(false); return; }
    const clienteIds = [...new Set(ventesData.map((v: any) => v.cliente_id).filter(Boolean))];
    const { data: clientes } = clienteIds.length > 0 ? await supabase.from('clientes').select('*').in('id', clienteIds) : { data: [] };
    const userIds = [...new Set(ventesData.map((v: any) => v.vendeuse_id).filter(Boolean))];
    const { data: utilisateurs } = userIds.length > 0 ? await supabase.from('utilisateurs').select('id, nom').in('id', userIds) : { data: [] };
    const venteIds = ventesData.map((v: any) => v.id);
    const { data: venteProduits } = await supabase.from('vente_produits').select('*').in('vente_id', venteIds);
    const produitIds = [...new Set((venteProduits || []).map((vp: any) => vp.produit_id).filter(Boolean))];
    const { data: produits } = produitIds.length > 0 ? await supabase.from('produits').select('id, nom').in('id', produitIds) : { data: [] };
    const { data: paiements } = await supabase.from('paiements').select('*').in('vente_id', venteIds);
    setVentes(ventesData.map((v: any) => ({
      ...v,
      clientes: (clientes || []).find((c: any) => c.id === v.cliente_id) || null,
      utilisateurs: (utilisateurs || []).find((u: any) => u.id === v.vendeuse_id) || null,
      vente_produits: (venteProduits || []).filter((vp: any) => vp.vente_id === v.id).map((vp: any) => ({ ...vp, produits: (produits || []).find((p: any) => p.id === vp.produit_id) || null })),
      paiements: (paiements || []).filter((p: any) => p.vente_id === v.id),
    })));
    setChargement(false);
  };

  const exporterParVendeuse = () => {
    const map: any = {};
    ventes.forEach(v => {
      const nom = v.utilisateurs?.nom || 'Inconnu';
      if (!map[nom]) map[nom] = [];
      map[nom].push({ 'Date': new Date(v.date_vente).toLocaleString('fr-FR'), 'Cliente': v.clientes?.nom || '', 'Telephone': v.clientes?.telephone || '', 'Total (FCFA)': v.total, 'Montant Paye (FCFA)': v.montant_paye, 'Reste a Payer (FCFA)': v.reste_a_payer, 'Statut': v.statut_paiement === 'paye' ? 'Paye' : 'Partiel' });
    });
    const wb = XLSX.utils.book_new();
    Object.entries(map).forEach(([nom, data]: any) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), nom.substring(0, 31)));
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]), 'rapport_vendeuses.xlsx');
  };

  const exporterParProduit = () => {
    const map: any = {};
    ventes.forEach(v => v.vente_produits?.forEach((vp: any) => {
      const nom = vp.produits?.nom || 'Inconnu';
      if (!map[nom]) map[nom] = { quantite: 0, total: 0 };
      map[nom].quantite += vp.quantite; map[nom].total += vp.prix_unitaire * vp.quantite;
    }));
    const data = Object.entries(map).map(([nom, s]: any) => ({ 'Produit': nom, 'Quantite Vendue': s.quantite, 'Total (FCFA)': s.total })).sort((a: any, b: any) => b['Quantite Vendue'] - a['Quantite Vendue']);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Produits');
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]), 'rapport_produits.xlsx');
  };

  const exporterParPaiement = () => {
    const map: any = { cash: 0, mobile_money: 0, orange_money: 0 };
    ventes.forEach(v => v.paiements?.forEach((p: any) => { if (map[p.mode] !== undefined) map[p.mode] += p.montant; }));
    const total = Object.values(map).reduce((a: any, b: any) => a + b, 0) as number;
    const data = [{ 'Mode': 'Cash', 'Total (FCFA)': map.cash }, { 'Mode': 'Mobile Money', 'Total (FCFA)': map.mobile_money }, { 'Mode': 'Orange Money', 'Total (FCFA)': map.orange_money }, { 'Mode': 'TOTAL', 'Total (FCFA)': total }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Paiements');
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]), 'rapport_paiements.xlsx');
  };

  const totalVentes = ventes.reduce((s, v) => s + v.total, 0);
  const totalEncaisse = ventes.reduce((s, v) => s + v.montant_paye, 0);
  const totalEnAttente = ventes.reduce((s, v) => s + v.reste_a_payer, 0);

  const CARDS = [
    { icon: 'groups', title: 'Rapport par vendeuse', desc: 'Ventes, transactions et détails pour chaque vendeuse sur la période.', onClick: exporterParVendeuse },
    { icon: 'inventory_2', title: 'Rapport par produit', desc: 'Quantités vendues, chiffre d\'affaires et stock restant article par article.', onClick: exporterParProduit },
    { icon: 'account_balance_wallet', title: 'Rapport par paiement', desc: 'Suivi des paiements complets et partiels, soldes dus et encaissements par mode.', onClick: exporterParPaiement },
  ];

  return (
    <div className="fade-up">
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Total ventes', value: totalVentes.toLocaleString(), color: 'var(--ink)' },
          { label: 'Encaissé', value: totalEncaisse.toLocaleString(), color: 'var(--success)' },
          { label: 'En attente', value: totalEnAttente.toLocaleString(), color: 'var(--warn)' },
        ].map(s => (
          <div key={s.label} style={{ padding: '20px', borderRadius: '18px', background: 'var(--surface)', border: '1px solid var(--accent-12)', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.5px', color: 'var(--ink-55)', textTransform: 'uppercase', marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value} <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>FCFA</span></div>
          </div>
        ))}
      </div>

      {chargement ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-45)' }}>Chargement...</div>
      ) : ventes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--ink-45)' }}>
          <span className="ms" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: 'var(--accent-30)' }}>download</span>
          Aucune vente à exporter.
        </div>
      ) : (
        <>
          <div style={{ fontSize: '14px', color: 'var(--ink-55)', marginBottom: '16px', fontWeight: 500 }}>
            {ventes.length} vente{ventes.length > 1 ? 's' : ''} disponibles à l'export
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '20px' }}>
            {CARDS.map(r => (
              <div key={r.title} style={{ display: 'flex', flexDirection: 'column', padding: '28px', borderRadius: '22px', background: 'var(--surface)', border: '1px solid var(--accent-12)', backdropFilter: 'blur(20px)', boxShadow: 'var(--shadow-md)' }}>
                <div style={{ width: '54px', height: '54px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--success-tint)', border: '1px solid var(--success-line)', marginBottom: '20px' }}>
                  <span className="ms" style={{ fontSize: '27px', color: 'var(--success)' }}>{r.icon}</span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', marginBottom: '7px' }}>{r.title}</div>
                <div style={{ fontSize: '13.5px', lineHeight: 1.55, color: 'var(--ink-55)', marginBottom: '24px', flex: 1 }}>{r.desc}</div>
                <button onClick={r.onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', height: '48px', border: 'none', borderRadius: '14px', cursor: 'pointer', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontSize: '14.5px', fontWeight: 700, boxShadow: 'var(--shadow-accent)' }}>
                  <span className="ms" style={{ fontSize: '20px' }}>download</span>Télécharger Excel
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
