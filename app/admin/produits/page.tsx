'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaArrowLeft, FaPlus, FaEdit, FaTrash, FaBox } from 'react-icons/fa';
import { MdInventory } from 'react-icons/md';
import { supabase } from '@/lib/supabase';

type Produit = {
  id: number;
  nom: string;
  prix: number;
  stock_initial: number;
  stock_restant: number;
  image?: string;
};

const FORM_VIDE = { nom: '', prix: '', stock_initial: '', image: '' };

export default function AdminProduits() {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [chargement, setChargement] = useState(true);
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [produitEnEdition, setProduitEnEdition] = useState<Produit | null>(null);
  const [form, setForm] = useState(FORM_VIDE);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('fallora_user');
    if (!userData) { router.push('/'); return; }
    const parsed = JSON.parse(userData);
    if (parsed.role !== 'admin') { router.push('/'); return; }
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

  const ouvrirAjout = () => {
    setProduitEnEdition(null);
    setForm(FORM_VIDE);
    setErreur('');
    setAfficherFormulaire(true);
  };

  const ouvrirEdition = (produit: Produit) => {
    setProduitEnEdition(produit);
    setForm({
      nom: produit.nom,
      prix: String(produit.prix),
      stock_initial: String(produit.stock_initial),
      image: produit.image || '',
    });
    setErreur('');
    setAfficherFormulaire(true);
  };

  const fermerFormulaire = () => {
    setAfficherFormulaire(false);
    setProduitEnEdition(null);
    setForm(FORM_VIDE);
    setErreur('');
  };

  const enregistrer = async () => {
    if (!form.nom.trim()) { setErreur('Le nom est obligatoire.'); return; }
    if (!form.prix || Number(form.prix) <= 0) { setErreur('Le prix doit etre superieur a 0.'); return; }
    if (!form.stock_initial || Number(form.stock_initial) < 0) { setErreur('Le stock doit etre un nombre positif.'); return; }

    setEnregistrement(true);
    setErreur('');

    try {
      if (produitEnEdition) {
        const difference = Number(form.stock_initial) - produitEnEdition.stock_initial;
        const nouveauStock = Math.max(0, produitEnEdition.stock_restant + difference);

        const { error } = await supabase
          .from('produits')
          .update({
            nom: form.nom.trim(),
            prix: Number(form.prix),
            stock_initial: Number(form.stock_initial),
            stock_restant: nouveauStock,
            image: form.image.trim() || null,
          })
          .eq('id', produitEnEdition.id);

        if (error) throw error;
        setSucces('Produit modifie avec succes.');
      } else {
        const { error } = await supabase
          .from('produits')
          .insert({
            nom: form.nom.trim(),
            prix: Number(form.prix),
            stock_initial: Number(form.stock_initial),
            stock_restant: Number(form.stock_initial),
            image: form.image.trim() || null,
          });

        if (error) throw error;
        setSucces('Produit ajoute avec succes.');
      }

      fermerFormulaire();
      chargerProduits();
      setTimeout(() => setSucces(''), 3000);
    } catch {
      setErreur('Erreur lors de l\'enregistrement. Veuillez reessayer.');
    } finally {
      setEnregistrement(false);
    }
  };

  const supprimerProduit = async (produit: Produit) => {
    if (!confirm(`Supprimer le produit "${produit.nom}" ?`)) return;
    const { error } = await supabase.from('produits').delete().eq('id', produit.id);
    if (error) {
      setErreur('Impossible de supprimer ce produit (il est peut-etre lie a des ventes).');
      setTimeout(() => setErreur(''), 4000);
    } else {
      chargerProduits();
    }
  };

  const stockTotal = produits.reduce((sum, p) => sum + p.stock_restant, 0);
  const produitRupture = produits.filter(p => p.stock_restant === 0).length;

  return (
    <div className="min-h-screen bg-amber-50">
      <nav className="bg-amber-800 text-white px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin')} className="hover:bg-amber-700 p-2 rounded-lg">
            <FaArrowLeft size={16} />
          </button>
          <FaBox size={22} />
          <h1 className="text-xl font-bold">Gestion des Produits</h1>
        </div>
        <button
          onClick={ouvrirAjout}
          className="flex items-center gap-2 bg-white text-amber-800 px-4 py-2 rounded-xl font-bold text-sm hover:bg-amber-100 transition">
          <FaPlus size={14} />
          Ajouter un produit
        </button>
      </nav>

      <div className="p-6 max-w-4xl mx-auto">
        {succes && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 mb-4 text-sm text-center font-semibold">
            {succes}
          </div>
        )}
        {erreur && !afficherFormulaire && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-4 text-sm text-center">
            {erreur}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-4 shadow border border-amber-100 text-center">
            <p className="text-sm text-gray-500">Total produits</p>
            <p className="text-2xl font-bold text-amber-800">{produits.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow border border-amber-100 text-center">
            <MdInventory size={20} className="text-amber-600 mx-auto mb-1" />
            <p className="text-sm text-gray-500">Stock total</p>
            <p className="text-2xl font-bold text-amber-800">{stockTotal}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow border border-red-100 text-center">
            <p className="text-sm text-gray-500">Ruptures de stock</p>
            <p className="text-2xl font-bold text-red-500">{produitRupture}</p>
          </div>
        </div>

        {/* FORMULAIRE */}
        {afficherFormulaire && (
          <div className="bg-white rounded-2xl shadow border border-amber-100 p-6 mb-6">
            <h2 className="font-bold text-amber-800 text-lg mb-4">
              {produitEnEdition ? 'Modifier le produit' : 'Ajouter un produit'}
            </h2>

            {erreur && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-4 text-sm">
                {erreur}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du produit *</label>
                <input
                  value={form.nom}
                  onChange={e => setForm({ ...form, nom: e.target.value })}
                  placeholder="Ex: Robe florale"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prix (FCFA) *</label>
                <input
                  type="number"
                  value={form.prix}
                  onChange={e => setForm({ ...form, prix: e.target.value })}
                  placeholder="Ex: 15000"
                  min="0"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stock {produitEnEdition ? '(modifier ajuste automatiquement le stock restant)' : 'initial *'}
                </label>
                <input
                  type="number"
                  value={form.stock_initial}
                  onChange={e => setForm({ ...form, stock_initial: e.target.value })}
                  placeholder="Ex: 20"
                  min="0"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL de l'image (optionnel)</label>
                <input
                  value={form.image}
                  onChange={e => setForm({ ...form, image: e.target.value })}
                  placeholder="https://..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={fermerFormulaire}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={enregistrer}
                disabled={enregistrement}
                className="flex-1 bg-amber-700 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-amber-800 disabled:opacity-50">
                {enregistrement ? 'Enregistrement...' : produitEnEdition ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </div>
        )}

        {/* LISTE */}
        {chargement ? (
          <div className="text-center py-12 text-amber-600">Chargement...</div>
        ) : produits.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow">
            <FaBox size={48} className="text-amber-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">Aucun produit pour le moment.</p>
            <button onClick={ouvrirAjout} className="bg-amber-700 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-amber-800">
              Ajouter le premier produit
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {produits.map(produit => (
              <div key={produit.id}
                className={`bg-white rounded-2xl shadow border flex items-center gap-4 p-4 ${
                  produit.stock_restant === 0 ? 'border-red-100' : 'border-amber-100'
                }`}>
                {produit.image ? (
                  <img src={produit.image} alt={produit.nom}
                    className="w-16 h-16 object-contain rounded-xl bg-amber-50 shrink-0" />
                ) : (
                  <div className="w-16 h-16 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                    <FaBox size={24} className="text-amber-300" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-amber-800 truncate">{produit.nom}</p>
                  <p className="text-sm text-amber-600 font-semibold">{produit.prix.toLocaleString()} FCFA</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      produit.stock_restant === 0
                        ? 'bg-red-100 text-red-600'
                        : produit.stock_restant <= 3
                        ? 'bg-orange-100 text-orange-600'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {produit.stock_restant === 0
                        ? 'Rupture'
                        : `Stock: ${produit.stock_restant} / ${produit.stock_initial}`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => ouvrirEdition(produit)}
                    className="bg-amber-50 text-amber-700 p-2.5 rounded-xl hover:bg-amber-100 border border-amber-200">
                    <FaEdit size={14} />
                  </button>
                  <button
                    onClick={() => supprimerProduit(produit)}
                    className="bg-red-50 text-red-500 p-2.5 rounded-xl hover:bg-red-100 border border-red-100">
                    <FaTrash size={14} />
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
