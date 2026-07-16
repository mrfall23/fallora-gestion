'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Plus de mot_de_passe : les mots de passe vivent dans auth.users, haches
// par Supabase. L'app ne peut plus les lire, et c'est le but.
type Vendeuse = { id: number; nom: string; email: string; actif: boolean; role: string };
const FORM_VIDE = { nom: '', email: '', mot_de_passe: '' };

const inputStyle: React.CSSProperties = {
  height: '44px', padding: '0 14px', borderRadius: '12px',
  background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.1)',
  outline: 'none', color: '#F5F5F0', fontSize: '14px', width: '100%',
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { icon: 'group', label: 'Total comptes', value: vendeuses.length.toString(), color: '#F5F5F0' },
          { icon: 'check_circle', label: 'Actives', value: actives.length.toString(), color: '#5BBF89' },
          { icon: 'block', label: 'Désactivées', value: inactives.length.toString(), color: '#E37777' },
        ].map(s => (
          <div key={s.label} style={{ padding: '20px', borderRadius: '18px', background: 'rgba(255,255,255,.035)', border: '1px solid rgba(212,175,55,.12)', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,rgba(240,192,64,.18),rgba(212,175,55,.06))', border: '1px solid rgba(212,175,55,.2)', flexShrink: 0 }}>
              <span className="ms" style={{ fontSize: '22px', color: '#F0C040' }}>{s.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.4px', color: 'rgba(245,245,240,.5)', textTransform: 'uppercase' as const }}>{s.label}</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Message succès */}
      {message && (
        <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'rgba(91,191,137,.1)', border: '1px solid rgba(91,191,137,.25)', color: '#5BBF89', fontSize: '13.5px', textAlign: 'center', marginBottom: '16px', fontWeight: 600 }}>
          <span className="ms" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '6px' }}>check_circle</span>{message}
        </div>
      )}

      {/* Bouton ajouter */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <button onClick={ouvrirAjout} style={{ display: 'flex', alignItems: 'center', gap: '9px', height: '46px', padding: '0 22px', border: 'none', borderRadius: '14px', cursor: 'pointer', background: 'linear-gradient(135deg,#F0C040,#D4AF37)', color: '#0A0A0A', fontSize: '14.5px', fontWeight: 700, boxShadow: '0 10px 26px rgba(212,175,55,.25)' }}>
          <span className="ms" style={{ fontSize: '20px' }}>person_add</span>Ajouter une vendeuse
        </button>
      </div>

      {/* Formulaire */}
      {formOuvert && (
        <div style={{ marginBottom: '20px', padding: '24px', borderRadius: '20px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(212,175,55,.2)', backdropFilter: 'blur(20px)' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#F5F5F0', marginBottom: '18px' }}>
            {editee ? `Modifier — ${editee.nom}` : 'Nouveau compte vendeuse'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(245,245,240,.45)', letterSpacing: '.5px', marginBottom: '6px' }}>NOM COMPLET *</div>
              <input style={inputStyle} placeholder="Ex : Mariam Koné" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(245,245,240,.45)', letterSpacing: '.5px', marginBottom: '6px' }}>ADRESSE EMAIL *</div>
              <input style={inputStyle} type="email" placeholder="vendeuse@fallora.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(245,245,240,.45)', letterSpacing: '.5px', marginBottom: '6px' }}>
                {editee ? 'NOUVEAU MOT DE PASSE' : 'MOT DE PASSE *'}
              </div>
              <input style={inputStyle} type="password" placeholder={editee ? 'Laisser vide pour ne pas changer' : '6 caractères minimum'} value={form.mot_de_passe} onChange={e => setForm({ ...form, mot_de_passe: e.target.value })} />
            </div>
          </div>
          {erreur && (
            <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(227,119,119,.1)', border: '1px solid rgba(227,119,119,.25)', color: '#E37777', fontSize: '13px', marginBottom: '14px' }}>{erreur}</div>
          )}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={sauvegarder} disabled={sauvegarde} style={{ flex: 1, height: '46px', border: 'none', borderRadius: '13px', cursor: 'pointer', background: 'linear-gradient(135deg,#F0C040,#D4AF37)', color: '#0A0A0A', fontWeight: 700, fontSize: '14px' }}>
              {sauvegarde ? 'Sauvegarde...' : editee ? 'Enregistrer les modifications' : 'Créer le compte'}
            </button>
            <button onClick={fermer} style={{ height: '46px', padding: '0 20px', border: '1px solid rgba(255,255,255,.1)', borderRadius: '13px', cursor: 'pointer', background: 'transparent', color: 'rgba(245,245,240,.6)', fontSize: '14px' }}>Annuler</button>
          </div>
        </div>
      )}

      {chargement ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(245,245,240,.4)' }}>Chargement...</div>
      ) : vendeuses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(245,245,240,.4)' }}>
          <span className="ms" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: 'rgba(212,175,55,.3)' }}>group</span>
          Aucune vendeuse. Commencez par en ajouter une.
        </div>
      ) : (
        <>
          {/* Vendeuses actives */}
          {actives.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', color: '#5BBF89', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="ms" style={{ fontSize: '16px' }}>check_circle</span>Comptes actifs ({actives.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {actives.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '18px 22px', borderRadius: '18px', background: 'rgba(255,255,255,.035)', border: '1px solid rgba(91,191,137,.12)', backdropFilter: 'blur(20px)' }}>
                    <div style={{ width: '46px', height: '46px', borderRadius: '14px', background: 'linear-gradient(135deg,rgba(91,191,137,.2),rgba(91,191,137,.05))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(91,191,137,.25)', flexShrink: 0 }}>
                      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '22px', color: '#5BBF89', fontWeight: 600 }}>{v.nom[0].toUpperCase()}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#F5F5F0' }}>{v.nom}</div>
                      <div style={{ fontSize: '13px', color: 'rgba(245,245,240,.45)', marginTop: '2px' }}>{v.email}</div>
                    </div>
                    <div style={{ padding: '4px 12px', borderRadius: '20px', background: 'rgba(91,191,137,.13)', border: '1px solid rgba(91,191,137,.25)', fontSize: '12px', fontWeight: 700, color: '#5BBF89' }}>Active</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => ouvrirEdit(v)} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 14px', borderRadius: '11px', cursor: 'pointer', background: 'rgba(212,175,55,.1)', border: '1px solid rgba(212,175,55,.25)', color: '#F0C040', fontSize: '13px', fontWeight: 600 }}>
                        <span className="ms" style={{ fontSize: '17px' }}>edit</span>Modifier
                      </button>
                      <button onClick={() => toggleActif(v)} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 14px', borderRadius: '11px', cursor: 'pointer', background: 'rgba(227,119,119,.08)', border: '1px solid rgba(227,119,119,.2)', color: '#E37777', fontSize: '13px', fontWeight: 600 }}>
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
              <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', color: '#E37777', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="ms" style={{ fontSize: '16px' }}>block</span>Comptes désactivés ({inactives.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {inactives.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '18px 22px', borderRadius: '18px', background: 'rgba(255,255,255,.015)', border: '1px solid rgba(255,255,255,.05)', opacity: 0.7 }}>
                    <div style={{ width: '46px', height: '46px', borderRadius: '14px', background: 'rgba(255,255,255,.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
                      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '22px', color: 'rgba(245,245,240,.4)', fontWeight: 600 }}>{v.nom[0].toUpperCase()}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(245,245,240,.6)' }}>{v.nom}</div>
                      <div style={{ fontSize: '13px', color: 'rgba(245,245,240,.3)', marginTop: '2px' }}>{v.email}</div>
                    </div>
                    <div style={{ padding: '4px 12px', borderRadius: '20px', background: 'rgba(227,119,119,.1)', border: '1px solid rgba(227,119,119,.2)', fontSize: '12px', fontWeight: 700, color: '#E37777' }}>Désactivée</div>
                    <button onClick={() => toggleActif(v)} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 14px', borderRadius: '11px', cursor: 'pointer', background: 'rgba(91,191,137,.08)', border: '1px solid rgba(91,191,137,.2)', color: '#5BBF89', fontSize: '13px', fontWeight: 600 }}>
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
