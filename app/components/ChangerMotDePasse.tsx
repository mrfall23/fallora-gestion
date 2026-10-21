'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// Bouton + fenetre « Changer mon mot de passe » pour l'utilisateur connecte.
// Le mot de passe actuel est redemande (re-connexion) : une session restee
// ouverte sur un telephone prete ne suffit pas a changer le mot de passe.

const inputStyle: React.CSSProperties = { height: '46px', padding: '0 14px', borderRadius: '12px', background: 'var(--surface-inset)', border: '1px solid var(--line)', outline: 'none', color: 'var(--ink)', fontSize: '14.5px', width: '100%' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11.5px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-55)', marginBottom: '6px', textTransform: 'uppercase' };

export default function ChangerMotDePasse({ bouton }: { bouton: (ouvrir: () => void) => React.ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState(false);
  const [chargement, setChargement] = useState(false);

  const ouvrir = () => { setOuvert(true); setActuel(''); setNouveau(''); setConfirmation(''); setErreur(''); setSucces(false); };
  const fermer = () => { if (!chargement) setOuvert(false); };

  const enregistrer = async () => {
    if (!actuel) { setErreur('Entrez votre mot de passe actuel.'); return; }
    if (nouveau.length < 6) { setErreur('Le nouveau mot de passe doit faire au moins 6 caractères.'); return; }
    if (nouveau !== confirmation) { setErreur('Les deux mots de passe ne correspondent pas.'); return; }
    if (nouveau === actuel) { setErreur("Choisissez un mot de passe différent de l'actuel."); return; }
    setErreur(''); setChargement(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setChargement(false); setErreur('Session expirée. Reconnectez-vous.'); return; }

    const { error: erreurActuel } = await supabase.auth.signInWithPassword({ email: user.email, password: actuel });
    if (erreurActuel) { setChargement(false); setErreur('Mot de passe actuel incorrect.'); return; }

    const { error } = await supabase.auth.updateUser({ password: nouveau });
    setChargement(false);
    if (error) { setErreur(error.message || "Échec de l'enregistrement."); return; }
    setSucces(true);
    setTimeout(() => setOuvert(false), 1800);
  };

  return (
    <>
      {bouton(ouvrir)}
      {ouvert && (
        <div onClick={fermer} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(62,44,32,.45)', backdropFilter: 'blur(3px)' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="titre-mdp" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '400px', padding: '26px 24px', borderRadius: '22px', background: 'var(--surface-2)', border: '1px solid var(--accent-20)', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <span className="ms" style={{ fontSize: '22px', color: 'var(--accent)' }}>key</span>
              <span id="titre-mdp" style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)', flex: 1 }}>Changer mon mot de passe</span>
              <button onClick={fermer} aria-label="Fermer" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-45)', display: 'flex', padding: '4px' }}>
                <span className="ms" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>

            {succes ? (
              <div role="status" style={{ padding: '14px 16px', borderRadius: '12px', background: 'var(--success-tint)', border: '1px solid var(--success-line)', color: 'var(--success)', fontSize: '14px', fontWeight: 600, textAlign: 'center' }}>
                Mot de passe modifié.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label htmlFor="mdp-actuel" style={labelStyle}>Mot de passe actuel</label>
                  <input id="mdp-actuel" type="password" autoComplete="current-password" style={inputStyle} value={actuel} onChange={e => setActuel(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="mdp-nouveau" style={labelStyle}>Nouveau mot de passe</label>
                  <input id="mdp-nouveau" type="password" autoComplete="new-password" placeholder="6 caractères minimum" style={inputStyle} value={nouveau} onChange={e => setNouveau(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="mdp-confirmation" style={labelStyle}>Confirmer</label>
                  <input id="mdp-confirmation" type="password" autoComplete="new-password" style={inputStyle} value={confirmation} onChange={e => setConfirmation(e.target.value)} onKeyDown={e => e.key === 'Enter' && enregistrer()} />
                </div>
                {erreur && (
                  <div role="alert" style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', fontSize: '13px', textAlign: 'center' }}>{erreur}</div>
                )}
                <button onClick={enregistrer} disabled={chargement} style={{ marginTop: '4px', height: '48px', border: 'none', borderRadius: '13px', cursor: chargement ? 'not-allowed' : 'pointer', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontSize: '15px', fontWeight: 700, opacity: chargement ? 0.7 : 1 }}>
                  {chargement ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
