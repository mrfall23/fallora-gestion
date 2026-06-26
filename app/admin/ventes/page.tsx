'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaArrowLeft, FaTrash } from 'react-icons/fa';
import { MdAttachMoney, MdPerson, MdAccessTime } from 'react-icons/md';
import { supabase } from '@/lib/supabase';

export default function AdminVentes() {
  const [ventes, setVentes] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('fallora_user');
    if (!userData) { router.push('/'); return; }
    chargerVentes();

    const canal = supabase
      .channel('ventes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventes' }, () => {
        chargerVentes();
      })
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, []);

  const chargerVentes = async () => {
    // 1. Ventes
    const { data: ventesData } = await supabase
      .from('ventes')
      .select('*')
      .eq('annulee', false)
      .order('date_vente', { ascending: false });

    if (!ventesData || ventesData.length === 0) {
      setVentes([]);
      setChargement(false);
      return;
    }

    // 2. Clientes
    const clienteIds = [...new Set(ventesData.map((v: any) => v.cliente_id).filter(Boolean))];
    const { data: clientes } = await supabase.from('clientes').select('*').in('id', clienteIds);

    // 3. Utilisateurs (vendeuses)
    const userIds = [...new Set(ventesData.map((v: any) => v.vendeuse_id).filter(Boolean))];
    const { data: utilisateurs } = await supabase.from('utilisateurs').select('id, nom').in('id', userIds);

    // 4. Vente_produits
    const venteIds = ventesData.map((v: any) => v.id);
    const { data: venteProduits } = await supabase.from('vente_produits').select('*').in('vente_id', venteIds);

    // 5. Produits
    const produitIds = [...new Set((venteProduits || []).map((vp: any) => vp.produit_id).filter(Boolean))];
    const { data: produits } = produitIds.length > 0
      ? await supabase.from('produits').select('id, nom').in('id', produitIds)
      : { data: [] };

    // 6. Assemblage
    const ventesAssemblees = ventesData.map((v: any) => ({
      ...v,
      clientes: (clientes || []).find((c: any) => c.id === v.cliente_id) || null,
      utilisateurs: (utilisateurs || []).find((u: any) => u.id === v.vendeuse_id) || null,
      vente_produits: (venteProduits || [])
        .filter((vp: any) => vp.vente_id === v.id)
        .map((vp: any) => ({
          ...vp,
          produits: (produits || []).find((p: any) => p.id === vp.produit_id) || null,
        })),
    }));

    setVentes(ventesAssemblees);
    setChargement(false);
  };

  const annulerVente = async (id: number) => {
    if (!confirm('Annuler cette vente ?')) return;
    await supabase.from('ventes').update({ annulee: true }).eq('id', id);
    chargerVentes();
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
          <MdAttachMoney size={24} />
          <h1 className="text-xl font-bold">Toutes les Ventes</h1>
        </div>
        <div className="bg-green-500 text-white text-xs px-3 py-1 rounded-full font-semibold">
          TEMPS REEL
        </div>
      </nav>

      <div className="p-6 max-w-4xl mx-auto">
        <div className="grid grid-cols-3 gap-4 mb-6">
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

        {chargement ? (
          <div className="text-center py-12 text-amber-600">Chargement...</div>
        ) : ventes.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow">
            <MdAttachMoney size={48} className="text-amber-300 mx-auto mb-4" />
            <p className="text-gray-500">Aucune vente pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {ventes.map(vente => (
              <div key={vente.id} className="bg-white rounded-2xl shadow border border-amber-100 p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <MdPerson size={16} className="text-amber-600" />
                      <p className="font-bold text-amber-800">{vente.clientes?.nom || 'Cliente inconnue'}</p>
                      {vente.clientes?.telephone && (
                        <p className="text-xs text-gray-400">{vente.clientes.telephone}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <MdPerson size={14} className="text-gray-400" />
                      <p className="text-xs text-gray-500">Vendeuse : {vente.utilisateurs?.nom || 'Inconnue'}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <MdAccessTime size={14} className="text-gray-400" />
                      <p className="text-xs text-gray-400">
                        {new Date(vente.date_vente).toLocaleString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-800 text-lg">{vente.total?.toLocaleString()} FCFA</p>
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                      vente.statut_paiement === 'paye'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {vente.statut_paiement === 'paye'
                        ? 'Paye'
                        : `Reste : ${vente.reste_a_payer?.toLocaleString()} FCFA`}
                    </span>
                  </div>
                </div>

                {vente.vente_produits?.length > 0 && (
                  <div className="border-t border-amber-50 pt-3">
                    <p className="text-xs text-gray-500 mb-2">Produits :</p>
                    <div className="space-y-1">
                      {vente.vente_produits.map((vp: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-700">{vp.produits?.nom || 'Produit inconnu'} x{vp.quantite}</span>
                          <span className="text-amber-700 font-semibold">
                            {(vp.prix_unitaire * vp.quantite).toLocaleString()} FCFA
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end mt-3">
                  <button onClick={() => annulerVente(vente.id)}
                    className="flex items-center gap-2 bg-red-50 text-red-500 px-3 py-2 rounded-xl text-xs hover:bg-red-100 border border-red-100">
                    <FaTrash size={12} />
                    Annuler la vente
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
