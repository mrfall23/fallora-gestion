'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaShoppingCart, FaSignOutAlt, FaPlus, FaMinus, FaTrash, FaWhatsapp } from 'react-icons/fa';
import { MdAttachMoney, MdPerson } from 'react-icons/md';
import { supabase } from '@/lib/supabase';

export default function VendeusePage() {
  const [user, setUser] = useState<any>(null);
  const [produits, setProduits] = useState<any[]>([]);
  const [panier, setPanier] = useState<any[]>([]);
  const [cliente, setCliente] = useState({ nom: '', telephone: '' });
  const [modePaiement, setModePaiement] = useState('cash');
  const [montantPaye, setMontantPaye] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [succes, setSucces] = useState('');
  const [erreur, setErreur] = useState('');
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('fallora_user');
    if (!userData) { router.push('/'); return; }
    const parsed = JSON.parse(userData);
    setUser(parsed);
    chargerProduits();
  }, []);

  const chargerProduits = async () => {
    const { data } = await supabase
      .from('produits')
      .select('*')
      .order('nom');
    setProduits(data || []);
    setChargement(false);
  };

  const ajouterAuPanier = (produit: any) => {
    const existant = panier.find(p => p.id === produit.id);
    const quantiteActuelle = existant ? existant.quantite : 0;
    if (quantiteActuelle >= produit.stock_restant) return;
    if (existant) {
      setPanier(panier.map(p =>
        p.id === produit.id ? { ...p, quantite: p.quantite + 1 } : p
      ));
    } else {
      setPanier([...panier, { ...produit, quantite: 1 }]);
    }
  };

  const retirerDuPanier = (id: number) => {
    const existant = panier.find(p => p.id === id);
    if (existant.quantite === 1) {
      setPanier(panier.filter(p => p.id !== id));
    } else {
      setPanier(panier.map(p =>
        p.id === id ? { ...p, quantite: p.quantite - 1 } : p
      ));
    }
  };

  const supprimerDuPanier = (id: number) => {
    setPanier(panier.filter(p => p.id !== id));
  };

  const total = panier.reduce((sum, p) => sum + p.prix * p.quantite, 0);
  const resteAPayer = Math.max(0, total - montantPaye);

  const enregistrerVente = async () => {
    if (panier.length === 0) { setErreur('Ajoutez des produits au panier.'); return; }
    if (!cliente.nom) { setErreur('Entrez le nom de la cliente.'); return; }
    if (montantPaye <= 0) { setErreur('Entrez le montant paye.'); return; }

    setErreur('');
    try {
      // Créer ou trouver la cliente
      let clienteId;
      const { data: clienteExistante } = await supabase
  .from('clientes')
  .select('id')
  .eq('telephone', cliente.telephone)
  .maybeSingle();

      if (clienteExistante) {
        clienteId = clienteExistante.id;
      } else {
        const { data: nouvelleCliente, error: erreurCliente } = await supabase
          .from('clientes')
          .insert({ nom: cliente.nom, telephone: cliente.telephone })
          .select()
          .single();
        if (erreurCliente || !nouvelleCliente) {
          setErreur('Erreur lors de la creation de la cliente.');
          return;
        }
        clienteId = nouvelleCliente.id;
      }

      // Créer la vente
      const statut = resteAPayer === 0 ? 'paye' : 'partiel';
      const { data: vente } = await supabase
        .from('ventes')
        .insert({
          vendeuse_id: user.id,
          cliente_id: clienteId,
          total,
          montant_paye: montantPaye,
          reste_a_payer: resteAPayer,
          statut_paiement: statut,
        })
        .select()
        .single();

      // Ajouter les produits de la vente
      await supabase.from('vente_produits').insert(
        panier.map(p => ({
          vente_id: vente.id,
          produit_id: p.id,
          quantite: p.quantite,
          prix_unitaire: p.prix,
        }))
      );

      // Enregistrer le paiement
      await supabase.from('paiements').insert({
        vente_id: vente.id,
        montant: montantPaye,
        mode: modePaiement,
      });

      // Mettre à jour le stock
      for (const p of panier) {
        const produit = produits.find(pr => pr.id === p.id);
        await supabase
          .from('produits')
          .update({ stock_restant: Math.max(0, produit.stock_restant - p.quantite) })
          .eq('id', p.id);
      }

      setSucces('Vente enregistree avec succes !');
      setPanier([]);
      setCliente({ nom: '', telephone: '' });
      setMontantPaye(0);
      chargerProduits();
      setTimeout(() => setSucces(''), 3000);
    } catch (e) {
      setErreur('Erreur lors de la vente.');
    }
  };

  if (chargement) return <div className="min-h-screen bg-amber-50 flex items-center justify-center text-amber-600">Chargement...</div>;

  return (
    <div className="min-h-screen bg-amber-50">
      <nav className="bg-amber-800 text-white px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <FaShoppingCart size={20} />
          <h1 className="text-lg font-bold">Fallora Ventes</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-amber-200 text-sm">{user?.nom}</span>
          <button onClick={() => { localStorage.removeItem('fallora_user'); document.cookie = 'fallora_role=; path=/; max-age=0'; router.push('/'); }}
            className="bg-amber-900 p-2 rounded-lg hover:bg-amber-700">
            <FaSignOutAlt size={14} />
          </button>
        </div>
      </nav>

      <div className="p-4 max-w-2xl mx-auto">
        {succes && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 mb-4 text-sm text-center font-semibold">
            ✅ {succes}
          </div>
        )}
        {erreur && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-4 text-sm text-center">
            ⚠️ {erreur}
          </div>
        )}

        {/* PANIER */}
        {panier.length > 0 && (
          <div className="bg-white rounded-2xl shadow border border-amber-100 p-4 mb-4">
            <h2 className="font-bold text-amber-800 mb-3 flex items-center gap-2">
              <FaShoppingCart size={16} /> Panier ({panier.length} produits)
            </h2>
            {panier.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-amber-50 last:border-0">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">{p.nom}</p>
                  <p className="text-xs text-amber-600">{p.prix.toLocaleString()} FCFA x {p.quantite}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-amber-800 w-24 text-right">
                    {(p.prix * p.quantite).toLocaleString()} FCFA
                  </p>
                  <button onClick={() => retirerDuPanier(p.id)} className="bg-amber-100 text-amber-700 p-1 rounded-lg">
                    <FaMinus size={12} />
                  </button>
                  <button onClick={() => ajouterAuPanier(p)} className="bg-amber-100 text-amber-700 p-1 rounded-lg">
                    <FaPlus size={12} />
                  </button>
                  <button onClick={() => supprimerDuPanier(p.id)} className="bg-red-100 text-red-500 p-1 rounded-lg">
                    <FaTrash size={12} />
                  </button>
                </div>
              </div>
            ))}
            <div className="mt-3 pt-3 border-t border-amber-100">
              <p className="text-right font-bold text-amber-800 text-lg">
                Total: {total.toLocaleString()} FCFA
              </p>
            </div>

            {/* INFOS CLIENTE */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <MdPerson size={20} className="text-amber-600" />
                <h3 className="font-semibold text-amber-800">Infos Cliente</h3>
              </div>
              <input
                placeholder="Nom de la cliente *"
                value={cliente.nom}
                onChange={e => setCliente({ ...cliente, nom: e.target.value })}
                className="w-full border border-amber-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-amber-400"
              />
              <input
                placeholder="Telephone (optionnel)"
                value={cliente.telephone}
                onChange={e => setCliente({ ...cliente, telephone: e.target.value })}
                className="w-full border border-amber-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-amber-400"
              />

              {/* PAIEMENT */}
              <div className="flex items-center gap-2 mt-2">
                <MdAttachMoney size={20} className="text-amber-600" />
                <h3 className="font-semibold text-amber-800">Paiement</h3>
              </div>
              <div className="flex gap-2">
                {['cash', 'mobile_money', 'orange_money'].map(mode => (
                  <button key={mode}
                    onClick={() => setModePaiement(mode)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
                      modePaiement === mode
                        ? 'bg-amber-700 text-white border-amber-700'
                        : 'bg-white text-amber-700 border-amber-200'
                    }`}>
                    {mode === 'cash' ? 'Cash' : mode === 'mobile_money' ? 'Mobile Money' : 'Orange Money'}
                  </button>
                ))}
              </div>
              <input
                type="number"
                placeholder="Montant paye *"
                value={montantPaye || ''}
                onChange={e => setMontantPaye(Number(e.target.value))}
                className="w-full border border-amber-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-amber-400"
              />
              {resteAPayer > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="text-orange-700 text-sm font-semibold">
                    Reste a payer: {resteAPayer.toLocaleString()} FCFA
                  </p>
                </div>
              )}

              <button onClick={enregistrerVente}
                className="w-full bg-amber-700 text-white py-3 rounded-xl font-bold text-sm hover:bg-amber-800 transition">
                Enregistrer la vente
              </button>
            </div>
          </div>
        )}

        {/* LISTE PRODUITS */}
        <h2 className="font-bold text-amber-800 mb-3">Produits disponibles</h2>
        <div className="space-y-2">
          {produits.map(produit => (
            <div key={produit.id}
              className={`bg-white rounded-xl p-3 shadow border flex items-center gap-3 ${
                produit.stock_restant === 0 ? 'opacity-50 border-red-100' : 'border-amber-100'
              }`}>
              {produit.image && (
                <img src={produit.image} alt={produit.nom}
                  className="w-14 h-14 object-contain rounded-lg bg-amber-50" />
              )}
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">{produit.nom}</p>
                <p className="text-xs text-amber-600 font-bold">{produit.prix?.toLocaleString()} FCFA</p>
                <p className={`text-xs ${produit.stock_restant === 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {produit.stock_restant === 0 ? 'Rupture de stock' : `Stock: ${produit.stock_restant}`}
                </p>
              </div>
              <button
                onClick={() => ajouterAuPanier(produit)}
                disabled={produit.stock_restant === 0}
                className={`p-2 rounded-xl ${
                  produit.stock_restant === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-amber-700 text-white hover:bg-amber-800'
                }`}>
                <FaPlus size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}