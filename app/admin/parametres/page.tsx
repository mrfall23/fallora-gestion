'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Plus de mot_de_passe : les mots de passe vivent dans auth.users, haches
// par Supabase. L'app ne peut plus les lire, et c'est le but.
type Vendeuse = { id: number; nom: string; email: string; actif: boolean; role: string };
const FORM_VIDE = { nom: '', email: '', mot_de_passe: '' };

const inputStyle: React.CSSProperties = {
  height: '44px', padding: '0 14px', borderRadius: '12px',
  background: 'var(--surface-inset)', border: '1px solid var(--line)',
  outline: 'none', color: 'var(--ink)', fontSize: '14px', width: '100%',
};

export default function AdminParametres() {
  const [vendeuses, setVendeuses] = useState<Vendeuse[]>([]);
  const [chargement, setChargement] = useState(true);
  const [formOuvert, setFormOuvert] = useState(false);
  const [editee, setEditee] = useState<Vendeuse | null>(null);
  const [form, setForm] = useState(FORM_VIDE);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');

  useEffect(() => { chargerVendeuses(); }, []);

  const chargerVendeuses = async () => {
    const { data } = await supabase
      .from('utilisateurs')
      .select('id, nom, email, actif, role')
      .eq('role', 'vendeuse')
      .order('nom');
    setVendeuses(data || []);
    setChargement(false);
  };

  const ouvrirAjout = () => { setForm(FORM_VIDE); setEditee(null); setFormOuvert(true); setErreur(''); };
  // Le mot de passe part vide en edition : il n'est plus lisible, et le
  // laisser vide signifie « ne pas le changer ».
  const ouvrirEdit = (v: Vendeuse) => { setForm({ nom: v.nom, email: v.email, mot_de_passe: '' }); setEditee(v); setFormOuvert(true); setErreur(''); };
  const fermer = () => { setFormOuvert(false); setEditee(null); setErreur(''); };

  const afficherMessage = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  // Creer un compte exige la cle secrete, qui ne doit jamais atteindre le
  // navigateur : tout passe par /api/vendeuses, qui verifie cote serveur que
  // l'appelant est bien admin. Le controle d'unicite de l'email est laisse a
  // la contrainte UNIQUE en base — un pre-check ici laisserait une fenetre
  // entre la verification et l'insertion.
  const sauvegarder = async () => {
    if (!form.nom.trim() || !form.email.trim()) {
      setErreur('Le nom et l\'email sont obligatoires.'); return;
    }
    if (!editee && !form.mot_de_passe.trim()) {
      setErreur('Le mot de passe est obligatoire.'); return;
    }
    if (form.mot_de_passe && form.mot_de_passe.length < 6) {
      setErreur('Le mot de passe doit faire au moins 6 caractères.'); return;
    }

    setSauvegarde(true); setErreur('');

    const reponse = await fetch('/api/vendeuses', {
      method: editee ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(editee ? { id: editee.id } : {}),
        nom: form.nom,
        email: form.email,
        motDePasse: form.mot_de_passe || undefined,
      }),
    });

    const resultat = await reponse.json().catch(() => ({}));
    setSauvegarde(false);

    if (!reponse.ok) {
      setErreur(resultat.message || 'Une erreur est survenue.');
      return;
    }

    afficherMessage(editee ? 'Compte mis à jour avec succès.' : 'Compte vendeuse créé avec succès.');
    await chargerVendeuses();
    fermer();
  };

  const toggleActif = async (v: Vendeuse) => {
    await supabase.from('utilisateurs').update({ actif: !v.actif }).eq('id', v.id);
    afficherMessage(v.actif ? `${v.nom} désactivée.` : `${v.nom} réactivée.`);
    await chargerVendeuses();
  };

  const actives = vendeuses.filter(v => v.actif);
  const inactives = vendeuses.filter(v => !v.actif);

  return (
    <div className="fade-up">
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { icon: 'group', label: 'Total comptes', value: vendeuses.length.toString(), color: 'var(--ink)' },
          { icon: 'check_circle', label: 'Actives', value: actives.length.toString(), color: 'var(--success)' },
          { icon: 'block', label: 'Désactivées', value: inactives.length.toString(), color: 'var(--danger)' },
        ].map(s => (
          <div key={s.label} style={{ padding: '20px', borderRadius: '18px', background: 'var(--surface)', border: '1px solid var(--accent-12)', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-12)', border: '1px solid var(--accent-20)', flexShrink: 0 }}>
              <span className="ms" style={{ fontSize: '22px', color: 'var(--accent)' }}>{s.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-55)', textTransform: 'uppercase' as const }}>{s.label}</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Message succès */}
      {message && (
        <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'var(--success-tint)', border: '1px solid var(--success-line)', color: 'var(--success)', fontSize: '13.5px', textAlign: 'center', marginBottom: '16px', fontWeight: 600 }}>
          <span className="ms" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '6px' }}>check_circle</span>{message}
        </div>
      )}

      {/* Bouton ajouter */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <button onClick={ouvrirAjout} style={{ display: 'flex', alignItems: 'center', gap: '9px', height: '46px', padding: '0 22px', border: 'none', borderRadius: '14px', cursor: 'pointer', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontSize: '14.5px', fontWeight: 700, boxShadow: 'var(--shadow-accent)' }}>
          <span className="ms" style={{ fontSize: '20px' }}>person_add</span>Ajouter une vendeuse
        </button>
      </div>

      {/* Formulaire */}
      {formOuvert && (
        <div style={{ marginBottom: '20px', padding: '24px', borderRadius: '20px', background: 'var(--surface-2)', border: '1px solid var(--accent-20)', backdropFilter: 'blur(20px)' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', marginBottom: '18px' }}>
            {editee ? `Modifier — ${editee.nom}` : 'Nouveau compte vendeuse'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>NOM COMPLET *</div>
              <input style={inputStyle} placeholder="Ex : Mariam Koné" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>ADRESSE EMAIL *</div>
              <input style={inputStyle} type="email" placeholder="vendeuse@fallora.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>
                {editee ? 'NOUVEAU MOT DE PASSE' : 'MOT DE PASSE *'}
              </div>
              <input style={inputStyle} type="password" placeholder={editee ? 'Laisser vide pour ne pas changer' : '6 caractères minimum'} value={form.mot_de_passe} onChange={e => setForm({ ...form, mot_de_passe: e.target.value })} />
            </div>
          </div>
          {erreur && (
            <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', fontSize: '13px', marginBottom: '14px' }}>{erreur}</div>
          )}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={sauvegarder} disabled={sauvegarde} style={{ flex: 1, height: '46px', border: 'none', borderRadius: '13px', cursor: 'pointer', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontWeight: 700, fontSize: '14px' }}>
              {sauvegarde ? 'Sauvegarde...' : editee ? 'Enregistrer les modifications' : 'Créer le compte'}
            </button>
            <button onClick={fermer} style={{ height: '46px', padding: '0 20px', border: '1px solid var(--line)', borderRadius: '13px', cursor: 'pointer', background: 'transparent', color: 'var(--ink-55)', fontSize: '14px' }}>Annuler</button>
          </div>
        </div>
      )}

      {chargement ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink-45)' }}>Chargement...</div>
      ) : vendeuses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink-45)' }}>
          <span className="ms" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: 'var(--accent-30)' }}>group</span>
          Aucune vendeuse. Commencez par en ajouter une.
        </div>
      ) : (
        <>
          {/* Vendeuses actives */}
          {actives.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--success)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="ms" style={{ fontSize: '16px' }}>check_circle</span>Comptes actifs ({actives.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {actives.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', rowGap: '12px', flexWrap: 'wrap', padding: '18px 22px', borderRadius: '18px', background: 'var(--surface)', border: '1px solid var(--success-line)', backdropFilter: 'blur(20px)' }}>
                    <div style={{ width: '46px', height: '46px', borderRadius: '14px', background: 'var(--success-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--success-line)', flexShrink: 0 }}>
                      <span style={{ fontFamily: "var(--font-cormorant), serif", fontSize: '22px', color: 'var(--success)', fontWeight: 600 }}>{v.nom[0].toUpperCase()}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{v.nom}</div>
                      <div style={{ fontSize: '13px', color: 'var(--ink-45)', marginTop: '2px' }}>{v.email}</div>
                    </div>
                    <div style={{ padding: '4px 12px', borderRadius: '20px', background: 'var(--success-tint)', border: '1px solid var(--success-line)', fontSize: '12px', fontWeight: 700, color: 'var(--success)' }}>Active</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => ouvrirEdit(v)} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 14px', borderRadius: '11px', cursor: 'pointer', background: 'var(--accent-12)', border: '1px solid var(--accent-25)', color: 'var(--accent-deep)', fontSize: '13px', fontWeight: 600 }}>
                        <span className="ms" style={{ fontSize: '17px' }}>edit</span>Modifier
                      </button>
                      <button onClick={() => toggleActif(v)} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 14px', borderRadius: '11px', cursor: 'pointer', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', fontSize: '13px', fontWeight: 600 }}>
                        <span className="ms" style={{ fontSize: '17px' }}>block</span>Désactiver
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vendeuses inactives */}
          {inactives.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--danger)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="ms" style={{ fontSize: '16px' }}>block</span>Comptes désactivés ({inactives.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {inactives.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', rowGap: '12px', flexWrap: 'wrap', padding: '18px 22px', borderRadius: '18px', background: 'var(--surface)', border: '1px solid var(--line)', opacity: 0.7 }}>
                    <div style={{ width: '46px', height: '46px', borderRadius: '14px', background: 'var(--surface-inset)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)', flexShrink: 0 }}>
                      <span style={{ fontFamily: "var(--font-cormorant), serif", fontSize: '22px', color: 'var(--ink-45)', fontWeight: 600 }}>{v.nom[0].toUpperCase()}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink-70)' }}>{v.nom}</div>
                      <div style={{ fontSize: '13px', color: 'var(--ink-35)', marginTop: '2px' }}>{v.email}</div>
                    </div>
                    <div style={{ padding: '4px 12px', borderRadius: '20px', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', fontSize: '12px', fontWeight: 700, color: 'var(--danger)' }}>Désactivée</div>
                    <button onClick={() => toggleActif(v)} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 14px', borderRadius: '11px', cursor: 'pointer', background: 'var(--success-tint)', border: '1px solid var(--success-line)', color: 'var(--success)', fontSize: '13px', fontWeight: 600 }}>
                      <span className="ms" style={{ fontSize: '17px' }}>check_circle</span>Réactiver
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
