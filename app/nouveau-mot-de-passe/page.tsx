'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FalloraLogo } from '../components/Logo';

// Page d'arrivee du lien « mot de passe oublie ».
//
// Le lien Supabase revient ici avec soit ?code=... (flux PKCE, par defaut :
// le client navigateur l'echange tout seul a l'initialisation, d'ou le
// getSession() en premier), soit ?token_hash=...&type=recovery (si le modele
// d'e-mail a ete personnalise). Une fois la session de recuperation ouverte,
// updateUser() enregistre le nouveau mot de passe.

type Etat = 'verification' | 'formulaire' | 'invalide' | 'termine';

export default function NouveauMotDePassePage() {
  const [etat, setEtat] = useState<Etat>('verification');
  const [detail, setDetail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  useEffect(() => {
    (async () => {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const erreurLien = query.get('error_description') || hash.get('error_description');
      if (erreurLien) {
        setDetail(/expired|invalid/i.test(erreurLien) ? 'Ce lien a expiré ou a déjà été utilisé.' : erreurLien);
        setEtat('invalide');
        return;
      }

      let { data: { session } } = await supabase.auth.getSession();

      const code = query.get('code');
      const tokenHash = query.get('token_hash');
      if (!session && code) {
        const { data } = await supabase.auth.exchangeCodeForSession(code);
        session = data.session;
        if (!session) setDetail("Ce lien doit être ouvert sur l'appareil et dans le navigateur où vous avez fait la demande.");
      } else if (!session && tokenHash) {
        const { data } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
        session = data.session;
      }

      // Retire code / jeton de la barre d'adresse.
      window.history.replaceState(null, '', window.location.pathname);
      setEtat(session ? 'formulaire' : 'invalide');
    })();
  }, []);

  const enregistrer = async () => {
    if (motDePasse.length < 6) { setErreur('Le mot de passe doit faire au moins 6 caractères.'); return; }
    if (motDePasse !== confirmation) { setErreur('Les deux mots de passe ne correspondent pas.'); return; }
    setErreur(''); setChargement(true);
    const { data, error } = await supabase.auth.updateUser({ password: motDePasse });
    if (error || !data.user) {
      setChargement(false);
      setErreur(/different|same/i.test(error?.message || '')
        ? "Choisissez un mot de passe différent de l'ancien."
        : error?.message || "Échec de l'enregistrement. Redemandez un lien.");
      return;
    }

    const { data: profil } = await supabase
      .from('utilisateurs')
      .select('role, actif')
      .eq('auth_id', data.user.id)
      .single();
    setChargement(false);

    if (!profil || !profil.actif) {
      await supabase.auth.signOut();
      setDetail('Mot de passe changé, mais ce compte est désactivé. Contactez un administrateur.');
      setEtat('invalide');
      return;
    }
    setEtat('termine');
    setTimeout(() => window.location.replace(profil.role === 'admin' ? '/admin' : '/vendeuse'), 1500);
  };

  const champ = (id: string, label: string, valeur: string, maj: (v: string) => void) => (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: '12px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-55)', marginBottom: '8px' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', height: '52px', borderRadius: '14px', background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
        <span className="ms" style={{ fontSize: '20px', color: 'var(--accent)' }}>lock</span>
        <input id={id} type="password" autoComplete="new-password" placeholder="••••••••" value={valeur} onChange={e => maj(e.target.value)} onKeyDown={e => e.key === 'Enter' && enregistrer()} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '15px', letterSpacing: '2px' }} />
      </div>
    </div>
  );

  const bouton: React.CSSProperties = { marginTop: '6px', height: '54px', border: 'none', borderRadius: '15px', cursor: 'pointer', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontSize: '15.5px', fontWeight: 700, letterSpacing: '.3px', boxShadow: 'var(--shadow-accent)' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(16px,5vw,40px)', background: 'radial-gradient(ellipse at top,var(--bg-top),var(--bg-bottom))' }}>
      <div style={{ width: '100%', maxWidth: '430px', padding: 'clamp(30px,6vw,48px) clamp(22px,5vw,44px)', borderRadius: '28px', background: 'var(--surface-2)', border: '1px solid var(--accent-20)', backdropFilter: 'blur(26px)', boxShadow: 'var(--shadow-lg)', animation: 'fadeUp .6s ease' }}>
        <div style={{ marginBottom: '30px' }}>
          <FalloraLogo layout="stack" markSize={58} wordSize={40} tagline="Nouveau mot de passe" />
        </div>

        {etat === 'verification' && (
          <div style={{ textAlign: 'center', color: 'var(--ink-55)', fontSize: '14px' }}>Vérification du lien…</div>
        )}

        {etat === 'formulaire' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {champ('nouveau', 'NOUVEAU MOT DE PASSE', motDePasse, setMotDePasse)}
            {champ('confirmation', 'CONFIRMER LE MOT DE PASSE', confirmation, setConfirmation)}
            {erreur && (
              <div role="alert" style={{ padding: '12px 16px', borderRadius: '12px', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', fontSize: '13.5px', textAlign: 'center' }}>{erreur}</div>
            )}
            <button onClick={enregistrer} disabled={chargement} style={{ ...bouton, cursor: chargement ? 'not-allowed' : 'pointer', opacity: chargement ? 0.7 : 1 }}>
              {chargement ? 'Enregistrement...' : 'Enregistrer le mot de passe'}
            </button>
          </div>
        )}

        {etat === 'termine' && (
          <div role="status" style={{ padding: '14px 16px', borderRadius: '12px', background: 'var(--success-tint)', border: '1px solid var(--success-line)', color: 'var(--success)', fontSize: '14px', fontWeight: 600, textAlign: 'center' }}>
            Mot de passe enregistré. Connexion en cours…
          </div>
        )}

        {etat === 'invalide' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div role="alert" style={{ padding: '12px 16px', borderRadius: '12px', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', fontSize: '13.5px', textAlign: 'center', lineHeight: 1.5 }}>
              {detail || 'Ce lien est invalide ou a expiré.'} Redemandez un lien depuis la page de connexion.
            </div>
            <button onClick={() => window.location.replace('/')} style={bouton}>Retour à la connexion</button>
          </div>
        )}
      </div>
    </div>
  );
}
