'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUtilisateur, seDeconnecter } from '@/lib/utilisateur';

const inputStyle: React.CSSProperties = { height: '44px', padding: '0 14px', borderRadius: '12px', background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.08)', outline: 'none', color: '#F5F5F0', fontSize: '14px', width: '100%' };

export default function VendeusePage() {
  const { utilisateur: user } = useUtilisateur();
  const [produits, setProduits] = useState<any[]>([]);
  const [panier, setPanier] = useState<any[]>([]);
  const [cliente, setCliente] = useState({ nom: '', telephone: '' });
  const [modePaiement, setModePaiement] = useState('cash');
  const [montantPaye, setMontantPaye] = useState<number | ''>('');
  const [statutPaiement, setStatutPaiement] = useState<'paye' | 'partiel'>('paye');
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [succes, setSucces] = useState('');
  const [erreur, setErreur] = useState('');
  const router = useRouter();

  // La redirection si non connecte est prise en charge par useUtilisateur().
  useEffect(() => { chargerProduits(); }, []);

  const chargerProduits = async () => {
    const { data } = await supabase.from('produits').select('*').order('nom');
    setProduits(data || []);
    setChargement(false);
  };

  const ajouterAuPanier = (produit: any) => {
    const reel = produits.find(p => p.id === produit.id);
    if (!reel) return;
    const existant = panier.find(p => p.id === produit.id);
    const qteActuelle = existant?.quantite ?? 0;
    if (qteActuelle >= reel.stock_restant) return;
    if (existant) setPanier(panier.map(p => p.id === produit.id ? { ...p, quantite: p.quantite + 1 } : p));
    else setPanier([...panier, { ...reel, quantite: 1 }]);
  };

  const retirerDuPanier = (id: number) => {
    const ex = panier.find(p => p.id === id);
    if (!ex) return;
    if (ex.quantite === 1) setPanier(panier.filter(p => p.id !== id));
    else setPanier(panier.map(p => p.id === id ? { ...p, quantite: p.quantite - 1 } : p));
  };

  const supprimerDuPanier = (id: number) => setPanier(panier.filter(p => p.id !== id));

  const total = panier.reduce((s, p) => s + p.prix * p.quantite, 0);
  const montantPayeNum = Number(montantPaye) || 0;
  const montantEffectif = statutPaiement === 'paye' ? total : montantPayeNum;
  const resteAPayer = Math.max(0, total - montantEffectif);
  const nbArticles = panier.reduce((s, p) => s + p.quantite, 0);

  // Toute la vente part en un seul appel a enregistrer_vente(), executee en
  // une transaction cote base. Avant, c'etaient 5 inserts separes depuis le
  // navigateur : un echec en cours de route laissait une vente sans produits.
  //
  // On n'envoie ni les prix ni le total : la base les lit et les calcule
  // elle-meme. Ce que le navigateur affirme n'engage plus rien.
  const enregistrerVente = async () => {
    if (panier.length === 0) { setErreur('Ajoutez des produits au panier.'); return; }
    if (!cliente.nom.trim()) { setErreur('Entrez le nom de la cliente.'); return; }
    if (statutPaiement === 'partiel' && (!montantPaye || montantPayeNum <= 0)) { setErreur('Entrez le montant payé.'); return; }
    setErreur(''); setEnregistrement(true);
    try {
      const { error } = await supabase.rpc('enregistrer_vente', {
        p_cliente_nom: cliente.nom,
        p_cliente_telephone: cliente.telephone || null,
        p_produits: panier.map(p => ({ produit_id: p.id, quantite: p.quantite })),
        p_statut_paiement: statutPaiement,
        p_montant_paye: statutPaiement === 'paye' ? null : montantPayeNum,
        p_mode_paiement: modePaiement,
      });

      if (error) {
        // La fonction remonte des messages metier utiles : stock insuffisant,
        // produit inactif, montant invalide.
        setErreur(error.message || 'Erreur lors de l\'enregistrement.');
        return;
      }

      setSucces('Vente enregistrée avec succès !');
      setPanier([]); setCliente({ nom: '', telephone: '' }); setMontantPaye(''); setStatutPaiement('paye'); setModePaiement('cash');
      await chargerProduits();
      setTimeout(() => setSucces(''), 4000);
    } catch { setErreur('Erreur inattendue. Veuillez réessayer.'); }
    finally { setEnregistrement(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', background: 'rgba(10,10,10,.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(212,175,55,.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#F0C040,#D4AF37)' }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '22px', fontWeight: 700, color: '#0A0A0A' }}>F</span>
          </div>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '20px', fontWeight: 600, background: 'linear-gradient(135deg,#F5E7B0,#D4AF37)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Fallora</div>
            <div style={{ fontSize: '11px', color: 'rgba(245,245,240,.4)', letterSpacing: '1px', textTransform: 'uppercase' }}>Espace vendeuse</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderRadius: '12px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg,#2a2a28,#1a1a18)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(212,175,55,.2)' }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '14px', color: '#D4AF37', fontWeight: 600 }}>{user.nom?.[0]?.toUpperCase()}</span>
              </div>
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#F5F5F0' }}>{user.nom}</span>
            </div>
          )}
          <button onClick={seDeconnecter} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.1)', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(245,245,240,.6)', fontSize: '13px' }}>
            <span className="ms" style={{ fontSize: '18px' }}>logout</span>
          </button>
        </div>
      </header>

      {chargement ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'rgba(245,245,240,.4)' }}>Chargement des produits...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', padding: '28px 32px', maxWidth: '1400px', margin: '0 auto' }}>

          {/* Grille produits */}
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#F5F5F0', marginBottom: '16px' }}>
              Sélectionner des articles <span style={{ fontSize: '13px', color: 'rgba(245,245,240,.4)', fontWeight: 400 }}>({produits.filter(p => p.stock_restant > 0).length} disponibles)</span>
            </div>
            {succes && (
              <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'rgba(91,191,137,.1)', border: '1px solid rgba(91,191,137,.25)', color: '#5BBF89', fontSize: '13.5px', textAlign: 'center', marginBottom: '16px', fontWeight: 600 }}>{succes}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: '14px' }}>
              {produits.map(produit => {
                const dansLePanier = panier.find(p => p.id === produit.id);
                const qte = dansLePanier?.quantite ?? 0;
                const stockRestant = produit.stock_restant - qte;
                const epuise = produit.stock_restant === 0;
                const plein = qte >= produit.stock_restant;
                return (
                  <div key={produit.id} style={{ padding: '14px', borderRadius: '16px', background: epuise ? 'rgba(255,255,255,.01)' : 'rgba(255,255,255,.03)', border: `1px solid ${epuise ? 'rgba(255,255,255,.04)' : qte > 0 ? 'rgba(212,175,55,.3)' : 'rgba(255,255,255,.06)'}`, opacity: epuise ? 0.5 : 1 }}>
                    {produit.image ? (
                      <img src={produit.image} alt={produit.nom} style={{ width: '100%', height: '84px', objectFit: 'cover', borderRadius: '12px', marginBottom: '12px' }} />
                    ) : (
                      <div style={{ height: '84px', borderRadius: '12px', marginBottom: '12px', background: '#1a1a18', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,.06)' }}>
                        <span className="ms" style={{ fontSize: '32px', color: 'rgba(212,175,55,.3)' }}>image</span>
                      </div>
                    )}
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#F5F5F0', lineHeight: 1.3, marginBottom: '4px' }}>{produit.nom}</div>
                    <div style={{ fontSize: '11.5px', color: epuise ? '#E37777' : stockRestant <= 2 ? '#F0C040' : 'rgba(245,245,240,.4)', marginBottom: '8px' }}>
                      {epuise ? 'Épuisé' : `${stockRestant} disponible${stockRestant > 1 ? 's' : ''}`}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#D4AF37' }}>{produit.prix?.toLocaleString()} FCFA</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {qte > 0 && (
                          <>
                            <button onClick={() => retirerDuPanier(produit.id)} style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'rgba(212,175,55,.15)', color: '#F0C040', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span className="ms" style={{ fontSize: '16px' }}>remove</span>
                            </button>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#F0C040', minWidth: '16px', textAlign: 'center' }}>{qte}</span>
                          </>
                        )}
                        <button onClick={() => ajouterAuPanier(produit)} disabled={epuise || plein} style={{ width: '32px', height: '32px', borderRadius: '10px', border: 'none', cursor: epuise || plein ? 'not-allowed' : 'pointer', background: epuise || plein ? 'rgba(255,255,255,.05)' : 'linear-gradient(135deg,#F0C040,#D4AF37)', color: epuise || plein ? 'rgba(245,245,240,.25)' : '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="ms" style={{ fontSize: '20px' }}>add</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Panier sticky */}
          <div style={{ position: 'sticky', top: '88px', padding: '24px', borderRadius: '20px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(212,175,55,.14)', backdropFilter: 'blur(22px)', boxShadow: '0 12px 40px rgba(0,0,0,.35)', height: 'fit-content' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <span className="ms" style={{ fontSize: '22px', color: '#F0C040' }}>shopping_bag</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#F5F5F0' }}>Panier</span>
              {nbArticles > 0 && <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 700, color: '#F0C040', background: 'rgba(212,175,55,.15)', padding: '3px 10px', borderRadius: '20px' }}>{nbArticles} article{nbArticles > 1 ? 's' : ''}</span>}
            </div>

            {erreur && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(227,119,119,.1)', border: '1px solid rgba(227,119,119,.25)', color: '#E37777', fontSize: '12.5px', marginBottom: '14px', textAlign: 'center' }}>{erreur}</div>
            )}

            {/* Articles */}
            {panier.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(245,245,240,.3)', fontSize: '13px' }}>
                <span className="ms" style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>shopping_cart</span>
                Panier vide
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                {panier.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '9px', background: 'rgba(212,175,55,.12)', border: '1px solid rgba(212,175,55,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#F0C040', flexShrink: 0 }}>{p.quantite}</div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: '13.5px', fontWeight: 500, color: '#F5F5F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#F5F5F0', flexShrink: 0 }}>{(p.prix * p.quantite).toLocaleString()}</div>
                    <button onClick={() => supprimerDuPanier(p.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(227,119,119,.7)', padding: '4px', display: 'flex' }}>
                      <span className="ms" style={{ fontSize: '16px' }}>close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ height: '1px', background: 'rgba(255,255,255,.08)', margin: '4px 0 16px' }} />

            {/* Infos cliente */}
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.5px', color: 'rgba(245,245,240,.45)', textTransform: 'uppercase', marginBottom: '10px' }}>Informations cliente</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              <input style={inputStyle} placeholder="Nom de la cliente *" value={cliente.nom} onChange={e => setCliente({ ...cliente, nom: e.target.value })} />
              <input style={inputStyle} placeholder="Téléphone (optionnel)" value={cliente.telephone} onChange={e => setCliente({ ...cliente, telephone: e.target.value })} />
            </div>

            {/* Statut paiement */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              {([['paye', 'check_circle', 'Payé complet'], ['partiel', 'schedule', 'Partiel']] as const).map(([val, icon, label]) => (
                <button key={val} onClick={() => setStatutPaiement(val)} style={{ flex: 1, height: '42px', borderRadius: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: statutPaiement === val ? 'linear-gradient(135deg,rgba(240,192,64,.16),rgba(212,175,55,.05))' : 'rgba(255,255,255,.03)', border: `1px solid ${statutPaiement === val ? 'rgba(212,175,55,.3)' : 'rgba(255,255,255,.08)'}`, color: statutPaiement === val ? '#F0C040' : 'rgba(245,245,240,.6)' }}>
                  <span className="ms" style={{ fontSize: '18px' }}>{icon}</span>{label}
                </button>
              ))}
            </div>

            {/* Mode paiement */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
              {[['cash', 'Cash'], ['mobile_money', 'Mobile Money'], ['orange_money', 'Orange']].map(([val, label]) => (
                <button key={val} onClick={() => setModePaiement(val)} style={{ flex: 1, height: '36px', borderRadius: '10px', border: `1px solid ${modePaiement === val ? 'rgba(212,175,55,.4)' : 'rgba(255,255,255,.08)'}`, background: modePaiement === val ? 'rgba(212,175,55,.12)' : 'transparent', color: modePaiement === val ? '#F0C040' : 'rgba(245,245,240,.5)', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}>{label}</button>
              ))}
            </div>

            {/* Montant partiel */}
            {statutPaiement === 'partiel' && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.4px', color: 'rgba(245,245,240,.45)', textTransform: 'uppercase', marginBottom: '6px' }}>Montant payé (FCFA) *</div>
                <input type="number" style={inputStyle} placeholder="0" value={montantPaye} onChange={e => setMontantPaye(e.target.value === '' ? '' : Number(e.target.value))} min="0" />
                {montantPayeNum > 0 && resteAPayer > 0 && (
                  <div style={{ marginTop: '8px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(240,192,64,.08)', border: '1px solid rgba(240,192,64,.2)', fontSize: '13px', color: '#F0C040', fontWeight: 600 }}>
                    Reste à payer : {resteAPayer.toLocaleString()} FCFA
                  </div>
                )}
              </div>
            )}

            {/* Monnaie à rendre (paiement complet) */}
            {statutPaiement === 'paye' && montantPayeNum > total && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(91,191,137,.08)', border: '1px solid rgba(91,191,137,.2)', fontSize: '13px', color: '#5BBF89', fontWeight: 600 }}>
                Monnaie à rendre : {(montantPayeNum - total).toLocaleString()} FCFA
              </div>
            )}

            {/* Total */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '14px 0', marginBottom: '14px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <span style={{ fontSize: '14px', color: 'rgba(245,245,240,.6)' }}>Total</span>
              <span>
                <span style={{ fontSize: '28px', fontWeight: 800, color: '#F5F5F0' }}>{total.toLocaleString()}</span>
                <span style={{ fontSize: '13px', color: '#D4AF37', fontWeight: 700, marginLeft: '5px' }}>FCFA</span>
              </span>
            </div>

            <button onClick={enregistrerVente} disabled={enregistrement || panier.length === 0} style={{ width: '100%', height: '52px', border: 'none', borderRadius: '15px', cursor: enregistrement || panier.length === 0 ? 'not-allowed' : 'pointer', background: panier.length === 0 ? 'rgba(212,175,55,.15)' : 'linear-gradient(135deg,#F0C040,#D4AF37)', color: '#0A0A0A', fontSize: '15px', fontWeight: 700, boxShadow: panier.length > 0 ? '0 12px 30px rgba(212,175,55,.28)' : 'none', opacity: enregistrement ? 0.7 : 1 }}>
              {enregistrement ? 'Enregistrement...' : 'Valider la vente'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
