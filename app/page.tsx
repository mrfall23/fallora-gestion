'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { FalloraLogo } from './components/Logo';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const [modeOubli, setModeOubli] = useState(false);
  const [lienEnvoye, setLienEnvoye] = useState(false);
  const router = useRouter();

  // Envoie l'e-mail de reinitialisation. Le lien ramene sur
  // /nouveau-mot-de-passe, qui doit figurer dans les « Redirect URLs »
  // autorisees du projet Supabase (Authentication > URL Configuration).
  const envoyerLien = async () => {
    const adresse = email.trim().toLowerCase();
    if (!adresse) { setErreur('Entrez votre adresse email.'); return; }
    setErreur(''); setChargement(true);
    const { error } = await supabase.auth.resetPasswordForEmail(adresse, {
      redirectTo: `${window.location.origin}/nouveau-mot-de-passe`,
    });
    setChargement(false);
    // Meme message que le compte existe ou non : on ne revele pas quelles
    // adresses ont un compte. Seule la limite d'envoi est signalee.
    if (error && /rate|limit|seconds/i.test(error.message)) {
      setErreur("Trop de demandes. Patientez quelques minutes avant de réessayer.");
      return;
    }
    if (error && (!error.status || error.status >= 500)) {
      setErreur("Impossible d'envoyer le lien. Vérifiez votre connexion et réessayez.");
      return;
    }
    setLienEnvoye(true);
  };

  const basculerOubli = (oubli: boolean) => { setModeOubli(oubli); setErreur(''); setLienEnvoye(false); setMotDePasse(''); };

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
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(16px,5vw,40px)', overflow: 'hidden', background: 'radial-gradient(ellipse at top,var(--bg-top),var(--bg-bottom))' }}>
      <div style={{ position: 'absolute', width: '620px', height: '620px', top: '-180px', left: '-120px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(169,103,61,.14),transparent 65%)', animation: 'glowPulse 7s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: '520px', height: '520px', bottom: '-160px', right: '-100px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(198,147,92,.12),transparent 65%)', animation: 'glowPulse 9s ease-in-out infinite', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: '430px', padding: 'clamp(30px,6vw,48px) clamp(22px,5vw,44px)', borderRadius: '28px', background: 'var(--surface-2)', border: '1px solid var(--accent-20)', backdropFilter: 'blur(26px)', boxShadow: 'var(--shadow-lg)', animation: 'fadeUp .6s ease' }}>
        <div style={{ marginBottom: '36px' }}>
          <FalloraLogo layout="stack" markSize={58} wordSize={40} tagline="Ventes privées d'exception" />
        </div>

        {modeOubli ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ fontSize: '14px', color: 'var(--ink-70)', lineHeight: 1.5, textAlign: 'center' }}>
            {lienEnvoye
              ? <>Si un compte existe pour <b style={{ color: 'var(--ink)' }}>{email.trim().toLowerCase()}</b>, un lien pour choisir un nouveau mot de passe vient d&apos;être envoyé. Ouvrez-le <b style={{ color: 'var(--ink)' }}>sur cet appareil</b>, dans ce navigateur. Pensez à regarder dans les spams.</>
              : 'Entrez votre adresse email : vous recevrez un lien pour choisir un nouveau mot de passe.'}
          </div>

          {!lienEnvoye && (
            <div>
              <label htmlFor="email-oubli" style={{ display: 'block', fontSize: '12px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-55)', marginBottom: '8px' }}>ADRESSE EMAIL</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', height: '52px', borderRadius: '14px', background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
                <span className="ms" style={{ fontSize: '20px', color: 'var(--accent)' }}>mail</span>
                <input id="email-oubli" type="email" placeholder="votre@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && envoyerLien()} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '15px' }} />
              </div>
            </div>
          )}

          {erreur && (
            <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', fontSize: '13.5px', textAlign: 'center' }}>
              {erreur}
            </div>
          )}

          {!lienEnvoye && (
            <button onClick={envoyerLien} disabled={chargement} style={{ marginTop: '6px', height: '54px', border: 'none', borderRadius: '15px', cursor: chargement ? 'not-allowed' : 'pointer', background: chargement ? 'var(--accent-30)' : 'var(--accent-grad)', color: 'var(--on-accent)', fontSize: '15.5px', fontWeight: 700, letterSpacing: '.3px', boxShadow: 'var(--shadow-accent)' }}>
              {chargement ? 'Envoi...' : 'Envoyer le lien'}
            </button>
          )}

          <button onClick={() => basculerOubli(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-deep)', fontSize: '13.5px', fontWeight: 600 }}>
            ← Retour à la connexion
          </button>
        </div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label htmlFor="email" style={{ display: 'block', fontSize: '12px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-55)', marginBottom: '8px' }}>ADRESSE EMAIL</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', height: '52px', borderRadius: '14px', background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
              <span className="ms" style={{ fontSize: '20px', color: 'var(--accent)' }}>mail</span>
              <input id="email" type="email" placeholder="votre@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && seConnecter()} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '15px' }} />
            </div>
          </div>

          <div>
            <label htmlFor="motdepasse" style={{ display: 'block', fontSize: '12px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-55)', marginBottom: '8px' }}>MOT DE PASSE</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', height: '52px', borderRadius: '14px', background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
              <span className="ms" style={{ fontSize: '20px', color: 'var(--accent)' }}>lock</span>
              <input id="motdepasse" type="password" placeholder="••••••••" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} onKeyDown={e => e.key === 'Enter' && seConnecter()} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '15px', letterSpacing: '2px' }} />
            </div>
          </div>

          {erreur && (
            <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', fontSize: '13.5px', textAlign: 'center' }}>
              {erreur}
            </div>
          )}

          <button onClick={seConnecter} disabled={chargement} style={{ marginTop: '6px', height: '54px', border: 'none', borderRadius: '15px', cursor: chargement ? 'not-allowed' : 'pointer', background: chargement ? 'var(--accent-30)' : 'var(--accent-grad)', color: 'var(--on-accent)', fontSize: '15.5px', fontWeight: 700, letterSpacing: '.3px', boxShadow: 'var(--shadow-accent)' }}>
            {chargement ? 'Connexion...' : 'Se connecter'}
          </button>

          <button onClick={() => basculerOubli(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-deep)', fontSize: '13.5px', fontWeight: 600 }}>
            Mot de passe oublié ?
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
