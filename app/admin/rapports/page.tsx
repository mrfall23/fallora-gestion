'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaArrowLeft, FaFileExcel, FaDownload } from 'react-icons/fa';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export default function AdminRapports() {
  const [ventes, setVentes] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('fallora_user');
    if (!userData) { router.push('/'); return; }
    chargerDonnees();
  }, []);

  const chargerDonnees = async () => {
    const { data } = await supabase
      .from('ventes')
      .select(`
        *,
        clientes (nom, telephone),
        utilisateurs (nom),
        vente_produits (quantite, prix_unitaire, produits (nom)),
        paiements (montant, mode)
      `)
      .eq('annulee', false)
      .order('date_vente', { ascending: false });
    setVentes(data || []);
    setChargement(false);
  };

  const exporterParVendeuse = () => {
    const ventesParVendeuse: any = {};
    ventes.forEach(v => {
      const nom = v.utilisateurs?.nom || 'Inconnu';
      if (!ventesParVendeuse[nom]) ventesParVendeuse[nom] = [];
      ventesParVendeuse[nom].push({
        'Date': new Date(v.date_vente).toLocaleString('fr-FR'),
        'Cliente': v.clientes?.nom || '',
        'Telephone': v.clientes?.telephone || '',
        'Total (FCFA)': v.total,
        'Montant Paye (FCFA)': v.montant_paye,
        'Reste a Payer (FCFA)': v.reste_a_payer,
        'Statut': v.statut_paiement === 'paye' ? 'Paye' : 'Partiel',
      });
    });

    const wb = XLSX.utils.book_new();
    Object.entries(ventesParVendeuse).forEach(([nom, data]: any) => {
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, nom.substring(0, 31));
    });
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf]), 'rapport_vendeuses.xlsx');
  };

  const exporterParProduit = () => {
    const produitsMap: any = {};
    ventes.forEach(v => {
      v.vente_produits?.forEach((vp: any) => {
        const nom = vp.produits?.nom || 'Inconnu';
        if (!produitsMap[nom]) produitsMap[nom] = { quantite: 0, total: 0 };
        produitsMap[nom].quantite += vp.quantite;
        produitsMap[nom].total += vp.prix_unitaire * vp.quantite;
      });
    });

    const data = Object.entries(produitsMap).map(([nom, stats]: any) => ({
      'Produit': nom,
      'Quantite Vendue': stats.quantite,
      'Total (FCFA)': stats.total,
    })).sort((a, b) => b['Quantite Vendue'] - a['Quantite Vendue']);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Produits');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf]), 'rapport_produits.xlsx');
  };

  const exporterParPaiement = () => {
    const paiementsMap: any = { cash: 0, mobile_money: 0, orange_money: 0 };
    ventes.forEach(v => {
      v.paiements?.forEach((p: any) => {
        if (paiementsMap[p.mode] !== undefined) {
          paiementsMap[p.mode] += p.montant;
        }
      });
    });

    const data = [
      { 'Mode de Paiement': 'Cash', 'Total (FCFA)': paiementsMap.cash },
      { 'Mode de Paiement': 'Mobile Money', 'Total (FCFA)': paiementsMap.mobile_money },
      { 'Mode de Paiement': 'Orange Money', 'Total (FCFA)': paiementsMap.orange_money },
      { 'Mode de Paiement': 'TOTAL', 'Total (FCFA)': Object.values(paiementsMap).reduce((a: any, b: any) => a + b, 0) },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Paiements');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf]), 'rapport_paiements.xlsx');
  };

  const totalVentes = ventes.reduce((sum, v) => sum + v.total, 0);
  const totalEncaisse = ventes.reduce((sum, v) => sum + v.montant_paye, 0);
  const totalEnAttente = ventes.reduce((sum, v) => sum + v.reste_a_payer, 0);

  return (
    <div className="min-h-screen bg-amber-50">
      <nav className="bg-amber-800 text-white px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin')} className="hover:bg-amber-700 p-2 rounded-lg">
            <FaArrowLeft size={16} />
          </button>
          <FaFileExcel size={24} />
          <h1 className="text-xl font-bold">Rapports Excel</h1>
        </div>
      </nav>

      <div className="p-6 max-w-4xl mx-auto">
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-4 shadow border border-amber-100 text-center">
            <p className="text-sm text-gray-500">Total ventes</p>
            <p className="text-xl font-bold text-amber-800">{totalVentes.toLocaleString()} FCFA</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow border border-green-100 text-center">
            <p className="text-sm text-gray-500">Encaisse</p>
            <p className="text-xl font-bold text-green-600">{totalEncaisse.toLocaleString()} FCFA</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow border border-orange-100 text-center">
            <p className="text-sm text-gray-500">En attente</p>
            <p className="text-xl font-bold text-orange-500">{totalEnAttente.toLocaleString()} FCFA</p>
          </div>
        </div>

        <h2 className="text-xl font-bold text-amber-800 mb-4">Exporter les rapports</h2>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow border border-amber-100 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-3 rounded-xl">
                  <FaFileExcel size={24} className="text-green-600" />
                </div>
                <div>
                  <p className="font-bold text-amber-800">Rapport par Vendeuse</p>
                  <p className="text-sm text-gray-500">Ventes de chaque vendeuse avec details</p>
                </div>
              </div>
              <button
                onClick={exporterParVendeuse}
                disabled={chargement || ventes.length === 0}
                className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-xl hover:bg-green-600 disabled:opacity-50 font-semibold text-sm">
                <FaDownload size={14} />
                Telecharger
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow border border-amber-100 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-3 rounded-xl">
                  <FaFileExcel size={24} className="text-blue-600" />
                </div>
                <div>
                  <p className="font-bold text-amber-800">Rapport par Produit</p>
                  <p className="text-sm text-gray-500">Quantites vendues et total par produit</p>
                </div>
              </div>
              <button
                onClick={exporterParProduit}
                disabled={chargement || ventes.length === 0}
                className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600 disabled:opacity-50 font-semibold text-sm">
                <FaDownload size={14} />
                Telecharger
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow border border-amber-100 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-3 rounded-xl">
                  <FaFileExcel size={24} className="text-amber-600" />
                </div>
                <div>
                  <p className="font-bold text-amber-800">Rapport par Paiement</p>
                  <p className="text-sm text-gray-500">Total encaisse par mode de paiement</p>
                </div>
              </div>
              <button
                onClick={exporterParPaiement}
                disabled={chargement || ventes.length === 0}
                className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-xl hover:bg-amber-600 disabled:opacity-50 font-semibold text-sm">
                <FaDownload size={14} />
                Telecharger
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}