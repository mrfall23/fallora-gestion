'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaArrowLeft, FaUsers, FaTrophy, FaMedal, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { MdAttachMoney, MdShoppingCart } from 'react-icons/md';
import { supabase } from '@/lib/supabase';

export default function AdminVendeuses() {
  const [vendeuses, setVendeuses] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);
  const [detailOuvert, setDetailOuvert] = useState<number | null>(null);
  const [ventesDetail, setVentesDetail] = useState<any[]>([]);
  const [chargementDetail, setChargementDetail] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('fallora_user');
    if (!userData) { router.push('/'); return; }
    chargerVendeuses();

    const canal = supabase
      .channel('vendeuses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventes' }, () => {
        chargerVendeuses();
      })
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, []);

  const chargerVendeuses = async () => {
    // 1. Vendeuses actives
    const { data: utilisateurs } = await supabase
      .from('utilisateurs')
      .select('*')
      .eq('role', 'vendeuse')
      .eq('actif', true);

    // 2. Toutes les ventes non annulees
    const { data: ventes } = await supabase
      .from('ventes')
      .select('*')
      .eq('annulee', false);

    // 3. Tous les vente_produits
    const venteIds = (ventes || []).map((v: any) => v.id);
    const { data: venteProduits } = venteIds.length > 0
      ? await supabase.from('vente_produits').select('vente_id, quantite').in('vente_id', venteIds)
      : { data: [] };

    // 4. Calcul des stats par vendeuse
    const vendeusesAvecStats = (utilisateurs || []).map((u: any) => {
      const ventesVendeuse = (ventes || []).filter((v: any) => v.vendeuse_id === u.id);
      const totalVentes = ventesVendeuse.reduce((sum: number, v: any) => sum + v.total, 0);
      const totalEncaisse = ventesVendeuse.reduce((sum: number, v: any) => sum + v.montant_paye, 0);
      const nbVentes = ventesVendeuse.length;
      const venteIdsVendeuse = ventesVendeuse.map((v: any) => v.id);
      const nbProduits = (venteProduits || [])
        .filter((vp: any) => venteIdsVendeuse.includes(vp.vente_id))
        .reduce((sum: number, vp: any) => sum + vp.quantite, 0);
      return { ...u, totalVentes, totalEncaisse, nbVentes, nbProduits };
    }).sort((a: any, b: any) => b.totalVentes - a.totalVentes);

    setVendeuses(vendeusesAvecStats);
    setChargement(false);
  };

  const voirDetail = async (vendeuseId: number) => {
    if (detailOuvert === vendeuseId) {
      setDetailOuvert(null);
      setVentesDetail([]);
      return;
    }
    setDetailOuvert(vendeuseId);
    setChargementDetail(true);

    // 1. Ventes de cette vendeuse
    const { data: ventesData } = await supabase
      .from('ventes')
      .select('*')
      .eq('vendeuse_id', vendeuseId)
      .eq('annulee', false)
      .order('date_vente', { ascending: false });

    if (!ventesData || ventesData.length === 0) {
      setVentesDetail([]);
      setChargementDetail(false);
      return;
    }

    // 2. Clientes
    const clienteIds = [...new Set(ventesData.map((v: any) => v.cliente_id).filter(Boolean))];
    const { data: clientes } = await supabase.from('clientes').select('*').in('id', clienteIds);

    // 3. Vente_produits
    const venteIds = ventesData.map((v: any) => v.id);
    const { data: venteProduits } = await supabase.from('vente_produits').select('*').in('vente_id', venteIds);

    // 4. Produits
    const produitIds = [...new Set((venteProduits || []).map((vp: any) => vp.produit_id).filter(Boolean))];
    const { data: produits } = produitIds.length > 0
      ? await supabase.from('produits').select('id, nom').in('id', produitIds)
      : { data: [] };

    // 5. Assemblage
    const ventesAssemblees = ventesData.map((v: any) => ({
      ...v,
      clientes: (clientes || []).find((c: any) => c.id === v.cliente_id) || null,
      vente_produits: (venteProduits || [])
        .filter((vp: any) => vp.vente_id === v.id)
        .map((vp: any) => ({
          ...vp,
          produits: (produits || []).find((p: any) => p.id === vp.produit_id) || null,
        })),
    }));

    setVentesDetail(ventesAssemblees);
    setChargementDetail(false);
  };

  const getMedaille = (index: number) => {
    if (index === 0) return <FaTrophy size={20} className="text-yellow-500" />;
    if (index === 1) return <FaMedal size={20} className="text-gray-400" />;
    if (index === 2) return <FaMedal size={20} className="text-amber-600" />;
    return null;
  };

  return (
    <div className="min-h-screen bg-amber-50">
      <nav className="bg-amber-800 text-white px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin')} className="hover:bg-amber-700 p-2 rounded-lg">
            <FaArrowLeft size={16} />
          </button>
          <FaUsers size={24} />
          <h1 className="text-xl font-bold">Performance Vendeuses</h1>
        </div>
        <div className="bg-green-500 text-white text-xs px-3 py-1 rounded-full font-semibold">
          TEMPS REEL
        </div>
      </nav>

      <div className="p-6 max-w-4xl mx-auto">
        {chargement ? (
          <div className="text-center py-12 text-amber-600">Chargement...</div>
        ) : vendeuses.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow">
            <FaUsers size={48} className="text-amber-300 mx-auto mb-4" />
            <p className="text-gray-500">Aucune vendeuse trouvee.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {vendeuses.map((vendeuse, index) => (
              <div key={vendeuse.id}
                className={`bg-white rounded-2xl shadow border ${
                  index === 0 ? 'border-yellow-200' :
                  index === 1 ? 'border-gray-200' :
                  index === 2 ? 'border-amber-200' : 'border-amber-100'
                }`}>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                        index === 0 ? 'bg-yellow-500' :
                        index === 1 ? 'bg-gray-400' :
                        index === 2 ? 'bg-amber-600' : 'bg-amber-800'
                      }`}>
                        {vendeuse.nom.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-amber-800">{vendeuse.nom}</p>
                          {getMedaille(index)}
                        </div>
                        <p className="text-xs text-gray-400">{vendeuse.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-amber-800">
                        {vendeuse.totalVentes.toLocaleString()} FCFA
                      </p>
                      <p className="text-xs text-gray-500">Total ventes</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-amber-50 rounded-xl p-3 text-center">
                      <MdShoppingCart size={20} className="text-amber-600 mx-auto mb-1" />
                      <p className="text-xl font-bold text-amber-800">{vendeuse.nbVentes}</p>
                      <p className="text-xs text-gray-500">Commandes</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <MdAttachMoney size={20} className="text-green-600 mx-auto mb-1" />
                      <p className="text-lg font-bold text-green-700">
                        {vendeuse.totalEncaisse.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">Encaisse FCFA</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3 text-center">
                      <FaUsers size={16} className="text-blue-500 mx-auto mb-1" />
                      <p className="text-xl font-bold text-blue-700">{vendeuse.nbProduits}</p>
                      <p className="text-xs text-gray-500">Produits vendus</p>
                    </div>
                  </div>

                  <button
                    onClick={() => voirDetail(vendeuse.id)}
                    className="w-full flex items-center justify-center gap-2 bg-amber-50 text-amber-700 py-2 rounded-xl text-sm font-semibold hover:bg-amber-100 border border-amber-200">
                    {detailOuvert === vendeuse.id ? <FaChevronUp size={14} /> : <FaChevronDown size={14} />}
                    {detailOuvert === vendeuse.id ? 'Masquer les details' : 'Voir les details des ventes'}
                  </button>
                </div>

                {detailOuvert === vendeuse.id && (
                  <div className="border-t border-amber-100 p-5 bg-amber-50 rounded-b-2xl">
                    {chargementDetail ? (
                      <p className="text-center text-amber-600 text-sm">Chargement...</p>
                    ) : ventesDetail.length === 0 ? (
                      <p className="text-center text-gray-500 text-sm">Aucune vente.</p>
                    ) : (
                      <div className="space-y-3">
                        {ventesDetail.map(vente => (
                          <div key={vente.id} className="bg-white rounded-xl p-3 border border-amber-100">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="font-semibold text-amber-800 text-sm">
                                  {vente.clientes?.nom || 'Cliente inconnue'}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {new Date(vente.date_vente).toLocaleString('fr-FR')}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-amber-800">{vente.total?.toLocaleString()} FCFA</p>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
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
                              <div className="border-t border-amber-50 pt-2">
                                <p className="text-xs text-gray-400 mb-1">Produits achetes :</p>
                                {vente.vente_produits.map((vp: any, i: number) => (
                                  <div key={i} className="flex justify-between text-xs py-0.5">
                                    <span className="text-gray-700">
                                      {vp.produits?.nom || 'Inconnu'}{' '}
                                      <span className="text-amber-600 font-bold">x{vp.quantite}</span>
                                    </span>
                                    <span className="text-amber-700 font-semibold">
                                      {(vp.prix_unitaire * vp.quantite).toLocaleString()} FCFA
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
