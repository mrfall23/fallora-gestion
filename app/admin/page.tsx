'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaBox, FaUsers, FaFileExcel, FaSignOutAlt } from 'react-icons/fa';
import { MdDashboard, MdAttachMoney, MdInventory, MdPendingActions } from 'react-icons/md';
import { supabase } from '@/lib/supabase';

export default function AdminDashboard() {
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({
    totalVentes: 0,
    totalProduits: 0,
    stockRestant: 0,
    paiementsEnAttente: 0,
  });
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('fallora_user');
    if (!userData) { router.push('/'); return; }
    const parsed = JSON.parse(userData);
    if (parsed.role !== 'admin') { router.push('/'); return; }
    setUser(parsed);
    chargerStats();

    const canal = supabase
      .channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventes' }, () => {
        chargerStats();
      })
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, []);

  const chargerStats = async () => {
    // Ventes non annulees
    const { data: ventes } = await supabase
      .from('ventes')
      .select('id, total, reste_a_payer')
      .eq('annulee', false);

    // Produits vendus uniquement dans les ventes non annulees
    const venteIds = (ventes || []).map((v: any) => v.id);
    const { data: venteProduits } = venteIds.length > 0
      ? await supabase.from('vente_produits').select('quantite').in('vente_id', venteIds)
      : { data: [] };

    // Stock restant
    const { data: produits } = await supabase
      .from('produits')
      .select('stock_restant');

    const totalVentes = (ventes || []).reduce((sum: number, v: any) => sum + v.total, 0);
    const totalProduits = (venteProduits || []).reduce((sum: number, vp: any) => sum + vp.quantite, 0);
    const stockRestant = (produits || []).reduce((sum: number, p: any) => sum + p.stock_restant, 0);
    const paiementsEnAttente = (ventes || []).reduce((sum: number, v: any) => sum + v.reste_a_payer, 0);

    setStats({ totalVentes, totalProduits, stockRestant, paiementsEnAttente });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-amber-50">
      <nav className="bg-amber-800 text-white px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <MdDashboard size={24} />
          <h1 className="text-xl font-bold tracking-widest">Fallora Admin</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-amber-200 text-sm">Bonjour {user.nom}</span>
          <button
            onClick={() => { localStorage.removeItem('fallora_user'); document.cookie = 'fallora_role=; path=/; max-age=0'; router.push('/'); }}
            className="bg-amber-900 px-4 py-2 rounded-lg text-sm hover:bg-amber-700 flex items-center gap-2"
          >
            <FaSignOutAlt size={14} />
            Deconnexion
          </button>
        </div>
      </nav>

      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-amber-800">Tableau de bord</h2>
          <div className="bg-green-500 text-white text-xs px-3 py-1 rounded-full font-semibold">
            TEMPS REEL
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-4 shadow border border-amber-100">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm text-gray-500">Total ventes</p>
              <MdAttachMoney size={28} className="text-amber-600" />
            </div>
            <p className="text-3xl font-bold text-amber-800">{stats.totalVentes.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">FCFA</p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow border border-amber-100">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm text-gray-500">Produits vendus</p>
              <FaBox size={24} className="text-amber-600" />
            </div>
            <p className="text-3xl font-bold text-amber-800">{stats.totalProduits}</p>
            <p className="text-xs text-gray-400 mt-1">unites</p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow border border-amber-100">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm text-gray-500">Stock restant</p>
              <MdInventory size={28} className="text-amber-600" />
            </div>
            <p className="text-3xl font-bold text-amber-800">{stats.stockRestant}</p>
            <p className="text-xs text-gray-400 mt-1">unites en stock</p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow border border-orange-100">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm text-gray-500">Paiements en attente</p>
              <MdPendingActions size={28} className="text-orange-500" />
            </div>
            <p className="text-3xl font-bold text-orange-500">{stats.paiementsEnAttente.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">FCFA a encaisser</p>
          </div>
        </div>

        <h3 className="text-lg font-bold text-amber-800 mb-4">Menu</h3>
        <div className="grid grid-cols-1 gap-4">
          <a href="/admin/produits" className="bg-white rounded-2xl p-4 shadow border border-amber-100 flex items-center gap-4 hover:bg-amber-50 transition">
            <FaBox size={28} className="text-amber-700" />
            <div>
              <p className="font-bold text-amber-800">Gerer les produits</p>
              <p className="text-sm text-gray-500">Ajouter, modifier le stock</p>
            </div>
          </a>
          <a href="/admin/ventes" className="bg-white rounded-2xl p-4 shadow border border-amber-100 flex items-center gap-4 hover:bg-amber-50 transition">
            <MdAttachMoney size={32} className="text-amber-700" />
            <div>
              <p className="font-bold text-amber-800">Voir les ventes</p>
              <p className="text-sm text-gray-500">Toutes les ventes en temps reel</p>
            </div>
          </a>
          <a href="/admin/vendeuses" className="bg-white rounded-2xl p-4 shadow border border-amber-100 flex items-center gap-4 hover:bg-amber-50 transition">
            <FaUsers size={28} className="text-amber-700" />
            <div>
              <p className="font-bold text-amber-800">Vendeuses</p>
              <p className="text-sm text-gray-500">Performance de chaque vendeuse</p>
            </div>
          </a>
          <a href="/admin/rapports" className="bg-white rounded-2xl p-4 shadow border border-amber-100 flex items-center gap-4 hover:bg-amber-50 transition">
            <FaFileExcel size={28} className="text-amber-700" />
            <div>
              <p className="font-bold text-amber-800">Rapports Excel</p>
              <p className="text-sm text-gray-500">Exporter les rapports</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}