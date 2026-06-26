'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const router = useRouter();
  

  const connecter = async () => {
  if (!email || !motDePasse) {
    setErreur('Veuillez remplir tous les champs.');
    return;
  }
  setChargement(true);
  setErreur('');
  try {
    const { data, error } = await supabase
      .from('utilisateurs')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      setErreur('Email ou mot de passe incorrect.');
      setChargement(false);
      return;
    }

    if (data.mot_de_passe !== motDePasse) {
      setErreur('Email ou mot de passe incorrect.');
      setChargement(false);
      return;
    }

    localStorage.setItem('fallora_user', JSON.stringify(data));
    document.cookie = `fallora_role=${data.role}; path=/; max-age=86400; SameSite=Strict`;

    if (data.role === 'admin') {
      router.push('/admin');
    } else {
      router.push('/vendeuse');
    }
  } catch (e) {
    setErreur('Erreur reseau. Veuillez reessayer.');
    setChargement(false);
  }
};

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-amber-800 tracking-widest">Fallora</h1>
          <p className="text-amber-600 text-sm mt-1">Gestion Ventes Privees</p>
        </div>

        {erreur && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-4 text-sm text-center">
            {erreur}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="votre@email.com"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Mot de passe</label>
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            placeholder="••••••••"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400"
          />
        </div>

        <button
          onClick={connecter}
          disabled={chargement}
          className="w-full bg-amber-700 text-white py-3 rounded-xl font-bold text-sm hover:bg-amber-800 transition disabled:opacity-50"
        >
          {chargement ? 'Connexion...' : 'Se connecter'}
        </button>
      </div>
    </div>
  );
}