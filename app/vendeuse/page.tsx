'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toutLire } from '@/lib/requetes';
import { useUtilisateur, seDeconnecter } from '@/lib/utilisateur';
import { FalloraLogo } from '../components/Logo';
import { useIsMobile } from '../components/useMediaQuery';
import Recu, { type RecuData } from '../components/Recu';
import { partagerImageRecu, whatsappTexte, telechargerPdfRecu } from '../components/recuPartage';
import { lireFile, ecrireFile, ajouterAFile, nouvelId, type PayloadVente } from '@/lib/fileHorsLigne';

const inputStyle: React.CSSProperties = { height: '44px', padding: '0 14px', borderRadius: '12px', background: 'var(--surface-inset)', border: '1px solid var(--line)', outline: 'none', color: 'var(--ink)', fontSize: '14px', width: '100%' };

export default function VendeusePage() {
  const { utilisateur: user } = useUtilisateur();
  const isMobile = useIsMobile();
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
  const [recu, setRecu] = useState<RecuData | null>(null);
  const [objectifMois, setObjectifMois] = useState(0);
  const [realiseMois, setRealiseMois] = useState(0);
  const [enLigne, setEnLigne] = useState(true);
  const [nbEnAttente, setNbEnAttente] = useState(0);
  const [synchro, setSynchro] = useState(false);
  const recuRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef(false); // garde anti double-synchronisation (concurrence)
  const router = useRouter();

  // La redirection si non connecte est prise en charge par useUtilisateur().
  useEffect(() => {
    chargerProduits(); chargerObjectif();
    setEnLigne(navigator.onLine);
    setNbEnAttente(lireFile().length);
    const auRetour = () => { setEnLigne(true); synchroniser(); };
    const aLaPerte = () => setEnLigne(false);
    window.addEventListener('online', auRetour);
    window.addEventListener('offline', aLaPerte);
    synchroniser(); // depile d'eventuelles ventes en attente d'une session precedente
    return () => { window.removeEventListener('online', auRetour); window.removeEventListener('offline', aLaPerte); };
  }, []);

  // Depile la file locale vers /api/ventes. Garde en file uniquement ce qui
  // echoue par RESEAU ; ce qui est refuse par la base (stock parti...) est
  // retire et signale a la vendeuse. Best-effort, jamais bloquant.
  const synchroniser = async () => {
    if (syncRef.current || !navigator.onLine) return;
    const file = lireFile();
    if (file.length === 0) return;
    syncRef.current = true; setSynchro(true);
    const restants: typeof file = [];
    const refuses: string[] = [];
    try {
      for (const item of file) {
        try {
          const rep = await fetch('/api/ventes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.payload) });
          if (rep.ok) continue; // envoyee -> on la sort de la file
          const r = await rep.json().catch(() => ({}));
          refuses.push(`${item.apercu.cliente} : ${r.message || 'refusée'}`);
        } catch {
          restants.push(item); // reseau encore coupe -> on la garde
        }
      }
      ecrireFile(restants);
      setNbEnAttente(restants.length);
      if (refuses.length > 0) setErreur(`${refuses.length} vente(s) hors ligne non enregistrée(s) — ${refuses.join(' ; ')}`);
      await chargerProduits();
      chargerObjectif();
    } finally {
      syncRef.current = false; setSynchro(false);
    }
  };

  const chargerProduits = async () => {
    const { data } = await supabase.from('produits').select('*').eq('actif', true).order('nom');
    setProduits(data || []);
    setChargement(false);
  };

  // Objectif du mois de la vendeuse + son realise (RLS : ne renvoie que les siens).
  const chargerObjectif = async () => {
    const n = new Date();
    const debutMois = new Date(n.getFullYear(), n.getMonth(), 1);
    const periode = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
    const [{ data: obj }, ventes] = await Promise.all([
      supabase.from('objectifs_vendeuses').select('objectif').eq('periode', periode).maybeSingle(),
      toutLire(() => supabase.from('ventes').select('id, total').eq('annulee', false).gte('date_vente', debutMois.toISOString()).order('id')),
    ]);
    setObjectifMois(Number(obj?.objectif) || 0);
    setRealiseMois(ventes.reduce((s: number, v: any) => s + v.total, 0));
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
    const payload: PayloadVente = {
      cliente_nom: cliente.nom,
      cliente_telephone: cliente.telephone || null,
      produits: panier.map(p => ({ produit_id: p.id, quantite: p.quantite })),
      statut_paiement: statutPaiement,
      montant_paye: statutPaiement === 'paye' ? null : montantPayeNum,
      mode_paiement: modePaiement,
    };
    setErreur(''); setEnregistrement(true);

    // Hors ligne : on met la vente en file d'attente locale, envoi auto au retour.
    if (!navigator.onLine) { mettreEnFile(payload); setEnregistrement(false); return; }

    try {
      // Passe par /api/ventes : la meme RPC enregistrer_vente() est appelee cote
      // serveur (vente identique, atomique, stock verrouille), puis l'admin est
      // notifie. La notification ne peut jamais faire echouer la vente.
      const reponse = await fetch('/api/ventes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const resultat = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        // Messages metier utiles : stock insuffisant, produit inactif, montant invalide.
        setErreur(resultat.message || 'Erreur lors de l\'enregistrement.');
        return;
      }

      // On capture un reçu (snapshot) AVANT de vider le panier.
      const numero = `${new Date().getFullYear()}-${String(resultat?.id ?? '').padStart(4, '0')}`;
      setRecu({
        boutique: 'Fallora',
        numero,
        date: new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        vendeuse: user?.nom || '',
        client: cliente.nom.trim(),
        telephone: cliente.telephone || null,
        items: panier.map(p => ({ nom: p.nom, quantite: p.quantite, prix: p.prix })),
        total,
        paye: montantEffectif,
        reste: resteAPayer,
        mode: modePaiement,
        statut: statutPaiement,
      });

      setSucces('Vente enregistrée avec succès !');
      setPanier([]); setCliente({ nom: '', telephone: '' }); setMontantPaye(''); setStatutPaiement('paye'); setModePaiement('cash');
      await chargerProduits();
      chargerObjectif();
      setTimeout(() => setSucces(''), 4000);
    } catch {
      // Echec RESEAU (fetch a jete) : on bascule en file d'attente plutot que
      // de perdre la vente. Une vraie erreur metier passe par !reponse.ok ci-dessus.
      mettreEnFile(payload);
    } finally { setEnregistrement(false); }
  };

  // Met une vente en file locale + decrement optimiste du stock affiche (pour
  // eviter la survente tant qu'on est hors ligne). Vide le panier.
  const mettreEnFile = (payload: PayloadVente) => {
    const file = ajouterAFile({ id: nouvelId(), payload, apercu: { cliente: cliente.nom.trim(), total, date: new Date().toISOString() } });
    setNbEnAttente(file.length);
    setProduits(prev => prev.map(p => {
      const ligne = panier.find(x => x.id === p.id);
      return ligne ? { ...p, stock_restant: Math.max(0, p.stock_restant - ligne.quantite) } : p;
    }));
    setSucces('Vente enregistrée hors ligne — envoi automatique au retour du réseau.');
    setPanier([]); setCliente({ nom: '', telephone: '' }); setMontantPaye(''); setStatutPaiement('paye'); setModePaiement('cash');
    setTimeout(() => setSucces(''), 5000);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: isMobile ? '14px 16px' : '16px 32px', background: 'rgba(236,229,214,.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--line)' }}>
        <FalloraLogo layout="row" markSize={32} wordSize={22} tagline="Espace vendeuse" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          {user && !isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--line)' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--avatar)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--accent-20)' }}>
                <span style={{ fontFamily: "var(--font-cormorant), serif", fontSize: '14px', color: 'var(--accent)', fontWeight: 600 }}>{user.nom?.[0]?.toUpperCase()}</span>
              </div>
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)' }}>{user.nom}</span>
            </div>
          )}
          <button onClick={seDeconnecter} aria-label="Se déconnecter" style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ink-55)', fontSize: '13px' }}>
            <span className="ms" style={{ fontSize: '18px' }}>logout</span>
          </button>
        </div>
      </header>

      {(!enLigne || nbEnAttente > 0) && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: isMobile ? '14px 16px 0' : '20px 32px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '12px 16px', borderRadius: '14px', background: enLigne ? 'var(--warn-tint)' : 'var(--surface-inset)', border: `1px solid ${enLigne ? 'var(--warn-line)' : 'var(--line)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)' }}>
              <span className="ms" style={{ fontSize: '19px', color: enLigne ? 'var(--warn)' : 'var(--ink-45)' }}>{enLigne ? 'cloud_upload' : 'cloud_off'}</span>
              {!enLigne
                ? <span>Hors ligne — les ventes sont enregistrées et seront envoyées au retour du réseau.{nbEnAttente > 0 ? ` (${nbEnAttente} en attente)` : ''}</span>
                : <span>{nbEnAttente} vente{nbEnAttente > 1 ? 's' : ''} en attente d'envoi.</span>}
            </div>
            {enLigne && nbEnAttente > 0 && (
              <button onClick={synchroniser} disabled={synchro} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 16px', borderRadius: '10px', cursor: synchro ? 'default' : 'pointer', fontSize: '13px', fontWeight: 700, background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', opacity: synchro ? 0.6 : 1 }}>
                <span className="ms" style={{ fontSize: '17px' }}>sync</span>{synchro ? 'Envoi…' : 'Synchroniser'}
              </button>
            )}
          </div>
        </div>
      )}

      {objectifMois > 0 && (() => {
        const pct = Math.min(100, Math.round((realiseMois / objectifMois) * 100));
        const atteint = realiseMois >= objectifMois;
        const reste = Math.max(0, objectifMois - realiseMois);
        const mois = new Date().toLocaleDateString('fr-FR', { month: 'long' });
        return (
          <div style={{ maxWidth: '1400px', margin: '0 auto', padding: isMobile ? '14px 16px 0' : '20px 32px 0' }}>
            <div style={{ padding: isMobile ? '14px 16px' : '16px 20px', borderRadius: '16px', background: atteint ? 'var(--success-tint)' : 'var(--surface)', border: `1px solid ${atteint ? 'var(--success-line)' : 'var(--accent-20)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '9px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
                  <span className="ms" style={{ fontSize: '19px', color: atteint ? 'var(--success)' : 'var(--accent)' }}>flag</span>Mon objectif de {mois}
                </div>
                <div style={{ fontSize: '13.5px', color: 'var(--ink-70)' }}>
                  <b style={{ color: 'var(--ink)' }}>{realiseMois.toLocaleString()}</b> / {objectifMois.toLocaleString()} FCFA
                  <span style={{ marginLeft: '8px', fontWeight: 700, color: atteint ? 'var(--success)' : 'var(--accent)' }}>{pct}%</span>
                </div>
              </div>
              <div style={{ height: '10px', borderRadius: '20px', background: 'var(--surface-inset)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: '20px', background: atteint ? 'var(--success)' : 'var(--accent-grad)' }} />
              </div>
              <div style={{ fontSize: '12.5px', color: atteint ? 'var(--success)' : 'var(--ink-45)', fontWeight: 600, marginTop: '7px' }}>{atteint ? '🎯 Objectif atteint, bravo !' : `Encore ${reste.toLocaleString()} FCFA pour atteindre l'objectif`}</div>
            </div>
          </div>
        );
      })()}

      {chargement ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--ink-45)' }}>Chargement des produits...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: isMobile ? '18px' : '24px', padding: isMobile ? '18px 16px' : '28px 32px', maxWidth: '1400px', margin: '0 auto' }}>

          {/* Grille produits */}
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)', marginBottom: '16px' }}>
              Sélectionner des articles <span style={{ fontSize: '13px', color: 'var(--ink-45)', fontWeight: 400 }}>({produits.filter(p => p.stock_restant > 0).length} disponibles)</span>
            </div>
            {succes && (
              <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'var(--success-tint)', border: '1px solid var(--success-line)', color: 'var(--success)', fontSize: '13.5px', textAlign: 'center', marginBottom: '16px', fontWeight: 600 }}>{succes}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: '14px' }}>
              {produits.map(produit => {
                const dansLePanier = panier.find(p => p.id === produit.id);
                const qte = dansLePanier?.quantite ?? 0;
                const stockRestant = produit.stock_restant - qte;
                const epuise = produit.stock_restant === 0;
                const plein = qte >= produit.stock_restant;
                return (
                  <div key={produit.id} style={{ padding: '14px', borderRadius: '16px', background: 'var(--surface)', border: `1px solid ${epuise ? 'var(--line-soft)' : qte > 0 ? 'var(--accent-30)' : 'var(--line)'}`, opacity: epuise ? 0.55 : 1 }}>
                    {produit.image ? (
                      <img src={produit.image} alt={produit.nom} style={{ width: '100%', height: '84px', objectFit: 'cover', borderRadius: '12px', marginBottom: '12px' }} />
                    ) : (
                      <div style={{ height: '84px', borderRadius: '12px', marginBottom: '12px', background: 'var(--img-empty)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)' }}>
                        <span className="ms" style={{ fontSize: '32px', color: 'var(--accent-30)' }}>image</span>
                      </div>
                    )}
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, marginBottom: '4px' }}>{produit.nom}</div>
                    <div style={{ fontSize: '11.5px', color: epuise ? 'var(--danger)' : stockRestant <= 2 ? 'var(--warn)' : 'var(--ink-45)', marginBottom: '8px' }}>
                      {epuise ? 'Épuisé' : `${stockRestant} disponible${stockRestant > 1 ? 's' : ''}`}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--accent)' }}>{produit.prix?.toLocaleString()} FCFA</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {qte > 0 && (
                          <>
                            <button onClick={() => retirerDuPanier(produit.id)} aria-label={`Retirer un ${produit.nom}`} style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--accent-16)', color: 'var(--accent-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span className="ms" style={{ fontSize: '16px' }}>remove</span>
                            </button>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-deep)', minWidth: '16px', textAlign: 'center' }}>{qte}</span>
                          </>
                        )}
                        <button onClick={() => ajouterAuPanier(produit)} disabled={epuise || plein} aria-label={`Ajouter un ${produit.nom}`} style={{ width: '32px', height: '32px', borderRadius: '10px', border: 'none', cursor: epuise || plein ? 'not-allowed' : 'pointer', background: epuise || plein ? 'var(--surface-inset)' : 'var(--accent-grad)', color: epuise || plein ? 'var(--ink-25)' : 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          <div style={{ position: isMobile ? 'static' : 'sticky', top: '88px', padding: '24px', borderRadius: '20px', background: 'var(--surface-2)', border: '1px solid var(--accent-20)', backdropFilter: 'blur(22px)', boxShadow: 'var(--shadow-lg)', height: 'fit-content' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <span className="ms" style={{ fontSize: '22px', color: 'var(--accent)' }}>shopping_bag</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>Panier</span>
              {nbArticles > 0 && <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 700, color: 'var(--accent-deep)', background: 'var(--accent-16)', padding: '3px 10px', borderRadius: '20px' }}>{nbArticles} article{nbArticles > 1 ? 's' : ''}</span>}
            </div>

            {erreur && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', fontSize: '12.5px', marginBottom: '14px', textAlign: 'center' }}>{erreur}</div>
            )}

            {/* Articles */}
            {panier.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-35)', fontSize: '13px' }}>
                <span className="ms" style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>shopping_cart</span>
                Panier vide
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                {panier.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '9px', background: 'var(--accent-12)', border: '1px solid var(--accent-20)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: 'var(--accent-deep)', flexShrink: 0 }}>{p.quantite}</div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: '13.5px', fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{(p.prix * p.quantite).toLocaleString()}</div>
                    <button onClick={() => supprimerDuPanier(p.id)} aria-label={`Supprimer ${p.nom} du panier`} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px', display: 'flex' }}>
                      <span className="ms" style={{ fontSize: '16px' }}>close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ height: '1px', background: 'var(--line)', margin: '4px 0 16px' }} />

            {/* Infos cliente */}
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.5px', color: 'var(--ink-45)', textTransform: 'uppercase', marginBottom: '10px' }}>Informations cliente</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              <input style={inputStyle} placeholder="Nom de la cliente *" aria-label="Nom de la cliente" value={cliente.nom} onChange={e => setCliente({ ...cliente, nom: e.target.value })} />
              <input style={inputStyle} placeholder="Téléphone (optionnel)" aria-label="Téléphone de la cliente" value={cliente.telephone} onChange={e => setCliente({ ...cliente, telephone: e.target.value })} />
            </div>

            {/* Statut paiement */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              {([['paye', 'check_circle', 'Payé complet'], ['partiel', 'schedule', 'Partiel']] as const).map(([val, icon, label]) => (
                <button key={val} onClick={() => setStatutPaiement(val)} style={{ flex: 1, height: '42px', borderRadius: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: statutPaiement === val ? 'var(--accent-16)' : 'var(--surface)', border: `1px solid ${statutPaiement === val ? 'var(--accent-30)' : 'var(--line)'}`, color: statutPaiement === val ? 'var(--accent-deep)' : 'var(--ink-55)' }}>
                  <span className="ms" style={{ fontSize: '18px' }}>{icon}</span>{label}
                </button>
              ))}
            </div>

            {/* Mode paiement */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
              {[['cash', 'Cash'], ['mobile_money', 'Mobile Money'], ['orange_money', 'Orange']].map(([val, label]) => (
                <button key={val} onClick={() => setModePaiement(val)} style={{ flex: 1, height: '36px', borderRadius: '10px', border: `1px solid ${modePaiement === val ? 'var(--accent-30)' : 'var(--line)'}`, background: modePaiement === val ? 'var(--accent-12)' : 'transparent', color: modePaiement === val ? 'var(--accent-deep)' : 'var(--ink-45)', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}>{label}</button>
              ))}
            </div>

            {/* Montant partiel */}
            {statutPaiement === 'partiel' && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-45)', textTransform: 'uppercase', marginBottom: '6px' }}>Montant payé (FCFA) *</div>
                <input type="number" style={inputStyle} placeholder="0" aria-label="Montant payé" value={montantPaye} onChange={e => setMontantPaye(e.target.value === '' ? '' : Number(e.target.value))} min="0" />
                {montantPayeNum > 0 && resteAPayer > 0 && (
                  <div style={{ marginTop: '8px', padding: '10px 14px', borderRadius: '10px', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)', fontSize: '13px', color: 'var(--warn)', fontWeight: 600 }}>
                    Reste à payer : {resteAPayer.toLocaleString()} FCFA
                  </div>
                )}
              </div>
            )}

            {/* Monnaie à rendre (paiement complet) */}
            {statutPaiement === 'paye' && montantPayeNum > total && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '10px', background: 'var(--success-tint)', border: '1px solid var(--success-line)', fontSize: '13px', color: 'var(--success)', fontWeight: 600 }}>
                Monnaie à rendre : {(montantPayeNum - total).toLocaleString()} FCFA
              </div>
            )}

            {/* Total */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '14px 0', marginBottom: '14px', borderTop: '1px solid var(--line)' }}>
              <span style={{ fontSize: '14px', color: 'var(--ink-55)' }}>Total</span>
              <span>
                <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)' }}>{total.toLocaleString()}</span>
                <span style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 700, marginLeft: '5px' }}>FCFA</span>
              </span>
            </div>

            <button onClick={enregistrerVente} disabled={enregistrement || panier.length === 0} style={{ width: '100%', height: '52px', border: 'none', borderRadius: '15px', cursor: enregistrement || panier.length === 0 ? 'not-allowed' : 'pointer', background: panier.length === 0 ? 'var(--accent-20)' : 'var(--accent-grad)', color: 'var(--on-accent)', fontSize: '15px', fontWeight: 700, boxShadow: panier.length > 0 ? 'var(--shadow-accent)' : 'none', opacity: enregistrement ? 0.7 : 1 }}>
              {enregistrement ? 'Enregistrement...' : 'Valider la vente'}
            </button>
          </div>
        </div>
      )}

      {recu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(62,44,32,.55)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
          <div style={{ width: '100%', maxWidth: '400px', margin: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto' }}>
              <div ref={recuRef} style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
                <Recu data={recu} />
              </div>
            </div>
            <button onClick={async () => { if (recuRef.current) await partagerImageRecu(recuRef.current, recu); }}
              style={{ height: '52px', border: 'none', borderRadius: '14px', cursor: 'pointer', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', boxShadow: 'var(--shadow-accent)' }}>
              <span className="ms" style={{ fontSize: '20px' }}>ios_share</span>Partager le reçu (WhatsApp)
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => whatsappTexte(recu)}
                style={{ flex: 1, height: '46px', border: '1px solid var(--accent-25)', borderRadius: '13px', cursor: 'pointer', background: 'var(--surface)', color: 'var(--accent-deep)', fontSize: '13.5px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span className="ms" style={{ fontSize: '18px' }}>chat</span>Texte
              </button>
              <button onClick={async () => { if (recuRef.current) { const ok = await telechargerPdfRecu(recuRef.current, recu); if (!ok) setErreur('Échec de la génération du PDF.'); } }}
                style={{ flex: 1, height: '46px', border: '1px solid var(--accent-25)', borderRadius: '13px', cursor: 'pointer', background: 'var(--surface)', color: 'var(--accent-deep)', fontSize: '13.5px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span className="ms" style={{ fontSize: '18px' }}>picture_as_pdf</span>PDF
              </button>
            </div>
            <button onClick={() => setRecu(null)}
              style={{ height: '46px', border: '1px solid var(--line)', borderRadius: '13px', cursor: 'pointer', background: 'transparent', color: 'var(--ink-55)', fontSize: '14px', fontWeight: 600 }}>
              Nouvelle vente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
