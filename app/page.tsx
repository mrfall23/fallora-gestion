'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const router = useRouter();

  const seConnecter = async () => {
    if (!email || !motDePasse) { setErreur('Veuillez remplir tous les champs.'); return; }
    setErreur('');
    setChargement(true);

    // Supabase compare le mot de passe cote serveur, contre un hash.
    // Le mot de passe ne transite plus en clair et aucune ligne de la table
    // utilisateurs n'est renvoyee avant authentification.
    const { data: auth, error: erreurAuth } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: motDePasse,
    });

    if (erreurAuth || !auth.user) {
      setChargement(false);
      setErreur('Email ou mot de passe incorrect.');
      return;
    }

    const { data: profil } = await supabase
      .from('utilisateurs')
      .select('role, actif')
      .eq('auth_id', auth.user.id)
      .single();

    setChargement(false);

    if (!profil) {
      await supabase.auth.signOut();
      setErreur('Compte introuvable. Contactez un administrateur.');
      return;
    }

    if (!profil.actif) {
      await supabase.auth.signOut();
      setErreur('Ce compte a ete desactive.');
      return;
    }

    // La session vit desormais dans un cookie signe par Supabase, lisible
    // par le serveur. Plus de localStorage ni de cookie de role forgeable.
    router.replace(profil.role === 'admin' ? '/admin' : '/vendeuse');
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', overflow: 'hidden', background: '#0A0A0A' }}>
      <div style={{ position: 'absolute', width: '620px', height: '620px', top: '-180px', left: '-120px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(212,175,55,.16),transparent 65%)', animation: 'glowPulse 7s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: '520px', height: '520px', bottom: '-160px', right: '-100px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(240,192,64,.1),transparent 65%)', animation: 'glowPulse 9s ease-in-out infinite', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: '430px', padding: '48px 44px', borderRadius: '28px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(212,175,55,.16)', backdropFilter: 'blur(26px)', boxShadow: '0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.02),0 8px 40px rgba(212,175,55,.06)', animation: 'fadeUp .6s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: '38px' }}>
          <div style={{ width: '62px', height: '62px', margin: '0 auto 18px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#F0C040,#D4AF37)', boxShadow: '0 10px 30px rgba(212,175,55,.3)' }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '38px', fontWeight: 700, color: '#0A0A0A', lineHeight: 1 }}>F</span>
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '42px', fontWeight: 600, letterSpacing: '1px', background: 'linear-gradient(135deg,#F5E7B0,#D4AF37)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Fallora</div>
          <div style={{ marginTop: '4px', fontSize: '12.5px', letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(245,245,240,.45)', fontWeight: 500 }}>Ventes privées d'exception</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '.4px', color: 'rgba(245,245,240,.55)', marginBottom: '8px' }}>ADRESSE EMAIL</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', height: '52px', borderRadius: '14px', background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.08)' }}>
              <span className="ms" style={{ fontSize: '20px', color: 'rgba(212,175,55,.7)' }}>mail</span>
              <input type="email" placeholder="votre@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && seConnecter()} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#F5F5F0', fontSize: '15px' }} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '.4px', color: 'rgba(245,245,240,.55)', marginBottom: '8px' }}>MOT DE PASSE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', height: '52px', borderRadius: '14px', background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.08)' }}>
              <span className="ms" style={{ fontSize: '20px', color: 'rgba(212,175,55,.7)' }}>lock</span>
              <input type="password" placeholder="••••••••" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} onKeyDown={e => e.key === 'Enter' && seConnecter()} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#F5F5F0', fontSize: '15px', letterSpacing: '2px' }} />
            </div>
          </div>

          {erreur && (
            <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'rgba(227,119,119,.1)', border: '1px solid rgba(227,119,119,.25)', color: '#E37777', fontSize: '13.5px', textAlign: 'center' }}>
              {erreur}
            </div>
          )}

          <button onClick={seConnecter} disabled={chargement} style={{ marginTop: '6px', height: '54px', border: 'none', borderRadius: '15px', cursor: chargement ? 'not-allowed' : 'pointer', background: chargement ? 'rgba(212,175,55,.4)' : 'linear-gradient(135deg,#F0C040,#D4AF37)', color: '#0A0A0A', fontSize: '15.5px', fontWeight: 700, letterSpacing: '.3px', boxShadow: '0 12px 30px rgba(212,175,55,.28)' }}>
            {chargement ? 'Connexion...' : 'Se connecter'}
          </button>
        </div>
      </div>
    </div>
  );
}
