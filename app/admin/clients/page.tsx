'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaArrowLeft, FaUsers, FaSearch, FaPhoneAlt, FaShoppingBag } from 'react-icons/fa';
import { MdAttachMoney, MdAccessTime } from 'react-icons/md';
import { supabase } from '@/lib/supabase';

type Cliente = {
  id: number;
  nom: string;
  telephone: string | null;
  created_at: string;
  nbVentes: number;
  totalDepense: number;
  resteAPayer: number;
  derniereVisite: string | null;
};

export default function AdminClients() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [clienteSelectee, setClienteSelectee] = useState<Cliente | null>(null);
  const [ventesCliente, setVentesCliente] = useState<any[]>([]);
  const [chargementDetail, setChargementDetail] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('fallora_user');
    if (!userData) { router.push('/'); return; }
    const parsed = JSON.parse(userData);
    if (parsed.role !== 'admin') { router.push('/'); return; }
    chargerClientes();
  }, []);

  const chargerClientes = async () => {
    // 1. Toutes les clientes
    const { data: clientesData } = await supabase
      .from('clientes')
      .select('*')
      .order('nom');

    if (!clientesData || clientesData.length === 0) {
      setClientes([]);
      setChargement(false);
      return;
    }

    // 2. Ventes non annulees
    const clienteIds = clientesData.map((c: any) => c.id);
    const { data: ventes } = await supabase
      .from('ventes')
      .select('id, cliente_id, total, reste_a_payer, date_vente')
      .eq('annulee', false)
      .in('cliente_id', clienteIds);

    // 3. Calcul des stats par cliente
    const clientesAvecStats: Cliente[] = clientesData.map((c: any) => {
      const ventesCliente = (ventes || []).filter((v: any) => v.cliente_id === c.id);
      const nbVentes = ventesCliente.length;
      const totalDepense = ventesCliente.reduce((sum: number, v: any) => sum + v.total, 0);
      const resteAPayer = ventesCliente.reduce((sum: number, v: any) => sum + v.reste_a_payer, 0);
      const dates = ventesCliente.map((v: any) => v.date_vente).sort().reverse();
      return {
        ...c,
        nbVentes,
        totalDepense,
        resteAPayer,
        derniereVisite: dates[0] || null,
      };
    });

    setClientes(clientesAvecStats);
    setChargement(false);
  };

  const voirDetailCliente = async (cliente: Cliente) => {
    if (clienteSelectee?.id === cliente.id) {
      setClienteSelectee(null);
      setVentesCliente([]);
      return;
    }
    setClienteSelectee(cliente);
    setChargementDetail(true);

    // Ventes de cette cliente
    const { data: ventesData } = await supabase
      .from('ventes')
      .select('*')
      .eq('cliente_id', cliente.id)
      .eq('annulee', false)
      .order('date_vente', { ascending: false });

    if (!ventesData || ventesData.length === 0) {
      setVentesCliente([]);
      setChargementDetail(false);
      return;
    }

    // Produits de ces ventes
    const venteIds = ventesData.map((v: any) => v.id);
    const { data: venteProduits } = await supabase
      .from('vente_produits')
      .select('*')
      .in('vente_id', venteIds);

    const produitIds = [...new Set((venteProduits || []).map((vp: any) => vp.produit_id))];
    const { data: produits } = produitIds.length > 0
      ? await supabase.from('produits').select('id, nom').in('id', produitIds)
      : { data: [] };

    // Vendeuses
    const userIds = [...new Set(ventesData.map((v: any) => v.vendeuse_id))];
    const { data: utilisateurs } = await supabase
      .from('utilisateurs')
      .select('id, nom')
      .in('id', userIds);

    const ventesAssemblees = ventesData.map((v: any) => ({
      ...v,
      utilisateurs: (utilisateurs || []).find((u: any) => u.id === v.vendeuse_id) || null,
      vente_produits: (venteProduits || [])
        .filter((vp: any) => vp.vente_id === v.id)
        .map((vp: any) => ({
          ...vp,
          produits: (produits || []).find((p: any) => p.id === vp.produit_id) || null,
        })),
    }));

    setVentesCliente(ventesAssemblees);
    setChargementDetail(false);
  };

  const clientesFiltrees = clientes.filter(c =>
    c.nom.toLowerCase().includes(recherche.toLowerCase()) ||
    (c.telephone && c.telephone.includes(recherche))
  );

  const totalClientes = clientes.length;
  const totalCA = clientes.reduce((sum, c) => sum + c.totalDepense, 0);
  const totalEnAttente = clientes.reduce((sum, c) => sum + c.resteAPayer, 0);

  return (
    <div className="min-h-screen bg-amber-50">
      <nav className="bg-amber-800 text-white px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin')} className="hover:bg-amber-700 p-2 rounded-lg">
            <FaArrowLeft size={16} />
          </button>
          <FaUsers size={22} />
          <h1 className="text-xl font-bold">Gestion des Clientes</h1>
        </div>
      </nav>

      <div className="p-6 max-w-6xl mx-auto">

        {/* STATS */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-4 shadow border border-amber-100 text-center">
            <FaUsers size={20} className="text-amber-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-amber-800">{totalClientes}</p>
            <p className="text-sm text-gray-500">Clientes</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow border border-green-100 text-center">
            <MdAttachMoney size={22} className="text-green-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-700">{totalCA.toLocaleString()}</p>
            <p className="text-sm text-gray-500">CA Total FCFA</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow border border-orange-100 text-center">
            <MdAttachMoney size={22} className="text-orange-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-orange-500">{totalEnAttente.toLocaleString()}</p>
            <p className="text-sm text-gray-500">En attente FCFA</p>
          </div>
        </div>

        {/* RECHERCHE */}
        <div className="relative mb-4">
          <FaSearch size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom ou telephone..."
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            className="w-full bg-white border border-amber-100 rounded-xl pl-10 pr-4 py-3 text-sm shadow focus:outline-none focus:border-amber-400"
          />
        </div>

        {/* LAYOUT 2 COLONNES */}
        <div className={`${clienteSelectee ? 'grid grid-cols-2 gap-4' : ''}`}>

          {/* LISTE CLIENTES */}
          <div>
            {chargement ? (
              <div className="text-center py-12 text-amber-600">Chargement...</div>
            ) : clientesFiltrees.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow">
                <FaUsers size={48} className="text-amber-200 mx-auto mb-3" />
                <p className="text-gray-500">
                  {recherche ? 'Aucune cliente trouvee pour cette recherche.' : 'Aucune cliente enregistree.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {clientesFiltrees.map(cliente => (
                  <button
                    key={cliente.id}
                    onClick={() => voirDetailCliente(cliente)}
                    className={`w-full bg-white rounded-2xl shadow border p-4 text-left transition ${
                      clienteSelectee?.id === cliente.id
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-amber-100 hover:bg-amber-50'
                    }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 font-bold text-lg shrink-0">
                          {cliente.nom.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-amber-800">{cliente.nom}</p>
                          {cliente.telephone ? (
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <FaPhoneAlt size={10} />
                              <span>{cliente.telephone}</span>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-300">Pas de telephone</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-amber-800 text-sm">{cliente.totalDepense.toLocaleString()} FCFA</p>
                        <div className="flex items-center gap-2 justify-end mt-0.5">
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                            {cliente.nbVentes} achat{cliente.nbVentes > 1 ? 's' : ''}
                          </span>
                          {cliente.resteAPayer > 0 && (
                            <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">
                              -{cliente.resteAPayer.toLocaleString()} FCFA
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {cliente.derniereVisite && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                        <MdAccessTime size={12} />
                        <span>Derniere visite : {new Date(cliente.derniereVisite).toLocaleDateString('fr-FR')}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* DETAIL CLIENTE */}
          {clienteSelectee && (
            <div className="bg-white rounded-2xl shadow border border-amber-200 overflow-hidden h-fit sticky top-4">
              <div className="bg-amber-800 text-white p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-amber-600 flex items-center justify-center text-white font-bold text-xl">
                    {clienteSelectee.nom.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-lg">{clienteSelectee.nom}</p>
                    {clienteSelectee.telephone ? (
                      <div className="flex items-center gap-1 text-amber-300 text-sm">
                        <FaPhoneAlt size={11} />
                        <span>{clienteSelectee.telephone}</span>
                      </div>
                    ) : (
                      <p className="text-amber-400 text-sm">Pas de telephone</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-amber-700 rounded-xl p-2">
                    <p className="text-xl font-bold">{clienteSelectee.nbVentes}</p>
                    <p className="text-xs text-amber-300">Achats</p>
                  </div>
                  <div className="bg-amber-700 rounded-xl p-2">
                    <p className="text-sm font-bold">{clienteSelectee.totalDepense.toLocaleString()}</p>
                    <p className="text-xs text-amber-300">Total FCFA</p>
                  </div>
                  <div className={`rounded-xl p-2 ${clienteSelectee.resteAPayer > 0 ? 'bg-orange-600' : 'bg-green-700'}`}>
                    <p className="text-sm font-bold">{clienteSelectee.resteAPayer.toLocaleString()}</p>
                    <p className="text-xs text-white/80">Reste</p>
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FaShoppingBag size={14} className="text-amber-600" />
                  <h3 className="font-bold text-amber-800 text-sm">Historique des achats</h3>
                </div>

                {chargementDetail ? (
                  <p className="text-center text-amber-600 text-sm py-4">Chargement...</p>
                ) : ventesCliente.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-4">Aucun achat.</p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {ventesCliente.map(vente => (
                      <div key={vente.id} className="border border-amber-100 rounded-xl p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-xs text-gray-400">
                              {new Date(vente.date_vente).toLocaleDateString('fr-FR', {
                                day: '2-digit', month: 'short', year: 'numeric'
                              })}
                            </p>
                            <p className="text-xs text-gray-500">
                              par {vente.utilisateurs?.nom || 'Inconnue'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-amber-800 text-sm">{vente.total?.toLocaleString()} FCFA</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              vente.statut_paiement === 'paye'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-orange-100 text-orange-600'
                            }`}>
                              {vente.statut_paiement === 'paye' ? 'Paye' : `Reste : ${vente.reste_a_payer?.toLocaleString()} FCFA`}
                            </span>
                          </div>
                        </div>
                        {vente.vente_produits?.length > 0 && (
                          <div className="border-t border-amber-50 pt-2 space-y-0.5">
                            {vente.vente_produits.map((vp: any, i: number) => (
                              <div key={i} className="flex justify-between text-xs text-gray-600">
                                <span>{vp.produits?.nom || 'Inconnu'} <span className="text-amber-600 font-bold">x{vp.quantite}</span></span>
                                <span className="font-semibold">{(vp.prix_unitaire * vp.quantite).toLocaleString()} FCFA</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
