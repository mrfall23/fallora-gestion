'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toutLire, lireParIds } from '@/lib/requetes';
import { useIsMobile } from '../../components/useMediaQuery';
import { normaliserTel, sansAccents } from '@/lib/recherche';

type Cliente = { id: number; nom: string; telephone: string | null; created_at: string; nbVentes: number; totalDepense: number; resteAPayer: number; derniereVisite: string | null };

const BADGE_PAID = { fontSize: '12px', fontWeight: 700, color: 'var(--success)', background: 'var(--success-tint)', border: '1px solid var(--success-line)', padding: '4px 10px', borderRadius: '20px' } as const;
const BADGE_PART = { fontSize: '12px', fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)', padding: '4px 10px', borderRadius: '20px' } as const;

// Modes de paiement proposes a l'encaissement d'un acompte.
const MODES: { valeur: string; libelle: string }[] = [
  { valeur: 'cash', libelle: 'Espèces' },
  { valeur: 'mobile_money', libelle: 'Mobile Money' },
  { valeur: 'orange_money', libelle: 'Orange Money' },
];

export default function AdminClients() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [recherche, setRecherche] = useState('');
  const [filtreDette, setFiltreDette] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [clienteSelectee, setClienteSelectee] = useState<Cliente | null>(null);
  const [ventesCliente, setVentesCliente] = useState<any[]>([]);
  const [chargementDetail, setChargementDetail] = useState(false);
  // Encaissement d'acompte : id de la vente dont le formulaire est ouvert.
  const [venteEncaisse, setVenteEncaisse] = useState<number | null>(null);
  const [montantAcompte, setMontantAcompte] = useState('');
  const [modeAcompte, setModeAcompte] = useState('cash');
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurAcompte, setErreurAcompte] = useState('');
  // Modification / fusion de la fiche selectionnee.
  const [edition, setEdition] = useState(false);
  const [formNom, setFormNom] = useState('');
  const [formTel, setFormTel] = useState('');
  const [fusionOuverte, setFusionOuverte] = useState(false);
  const [rechercheFusion, setRechercheFusion] = useState('');
  const [cibleFusion, setCibleFusion] = useState<Cliente | null>(null);
  const [garderSelectee, setGarderSelectee] = useState(true); // true = on garde la fiche ouverte
  const [erreurFiche, setErreurFiche] = useState('');
  const [messageFiche, setMessageFiche] = useState('');
  const [operationFiche, setOperationFiche] = useState(false);
  const [voirDoublons, setVoirDoublons] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => { chargerClientes(); }, []);

  const chargerClientes = async (): Promise<Cliente[]> => {
    const clientesData = await toutLire(() => supabase.from('clientes').select('*').order('nom').order('id'));
    if (clientesData.length === 0) { setClientes([]); setChargement(false); return []; }
    const ventes = await toutLire(() => supabase.from('ventes').select('id, cliente_id, total, reste_a_payer, date_vente').eq('annulee', false).not('cliente_id', 'is', null).order('id'));
    const liste: Cliente[] = clientesData.map((c: any) => {
      const vv = (ventes || []).filter((v: any) => v.cliente_id === c.id);
      const dates = vv.map((v: any) => v.date_vente).sort().reverse();
      return { ...c, nbVentes: vv.length, totalDepense: vv.reduce((s: number, v: any) => s + v.total, 0), resteAPayer: vv.reduce((s: number, v: any) => s + v.reste_a_payer, 0), derniereVisite: dates[0] || null };
    });
    setClientes(liste);
    setChargement(false);
    return liste;
  };

  const chargerVentesDetail = async (clienteId: number) => {
    setChargementDetail(true);
    const ventesData = await toutLire(() => supabase.from('ventes').select('*').eq('cliente_id', clienteId).eq('annulee', false).order('date_vente', { ascending: false }).order('id', { ascending: false }));
    if (ventesData.length === 0) { setVentesCliente([]); setChargementDetail(false); return; }
    const vp = await lireParIds('vente_produits', '*', 'vente_id', ventesData.map((v: any) => v.id));
    const produits = await lireParIds('produits', 'id, nom', 'id', vp.map((x: any) => x.produit_id));
    const utilisateurs = await lireParIds('utilisateurs', 'id, nom', 'id', ventesData.map((v: any) => v.vendeuse_id));
    setVentesCliente(ventesData.map((v: any) => ({ ...v, utilisateurs: (utilisateurs || []).find((u: any) => u.id === v.vendeuse_id) || null, vente_produits: (vp || []).filter((x: any) => x.vente_id === v.id).map((x: any) => ({ ...x, produits: (produits || []).find((p: any) => p.id === x.produit_id) || null })) })));
    setChargementDetail(false);
  };

  const voirDetail = async (c: Cliente) => {
    if (clienteSelectee?.id === c.id) { setClienteSelectee(null); setVentesCliente([]); return; }
    setClienteSelectee(c);
    setVenteEncaisse(null); setErreurAcompte('');
    fermerOutilsFiche();
    await chargerVentesDetail(c.id);
  };

  const ouvrirEncaissement = (v: any) => {
    setVenteEncaisse(v.id);
    setMontantAcompte(String(v.reste_a_payer));
    setModeAcompte('cash');
    setErreurAcompte('');
  };

  const soumettreAcompte = async (v: any) => {
    const montant = Number(montantAcompte);
    if (!montant || montant <= 0) { setErreurAcompte('Entrez un montant valide.'); return; }
    if (montant > v.reste_a_payer) { setErreurAcompte('Montant supérieur au reste dû.'); return; }
    setEnregistrement(true); setErreurAcompte('');
    const { error } = await supabase.rpc('enregistrer_paiement', { p_vente_id: v.id, p_montant: montant, p_mode: modeAcompte });
    setEnregistrement(false);
    if (error) { setErreurAcompte(error.message || "Échec de l'enregistrement."); return; }
    setVenteEncaisse(null); setMontantAcompte('');
    const liste = await chargerClientes();
    const maj = liste.find(x => x.id === clienteSelectee?.id) || null;
    if (maj) setClienteSelectee(maj);
    if (clienteSelectee) await chargerVentesDetail(clienteSelectee.id);
  };

  const fermerOutilsFiche = () => { setEdition(false); setFusionOuverte(false); setCibleFusion(null); setRechercheFusion(''); setErreurFiche(''); setMessageFiche(''); };

  const ouvrirEdition = (c: Cliente) => { fermerOutilsFiche(); setFormNom(c.nom); setFormTel(c.telephone || ''); setEdition(true); };

  // Recharge la liste et rouvre la fiche indiquee (ou ferme le detail).
  const rafraichirApres = async (idAOuvrir: number | null) => {
    const liste = await chargerClientes();
    const maj = idAOuvrir !== null ? liste.find(x => x.id === idAOuvrir) || null : null;
    setClienteSelectee(maj);
    if (maj) await chargerVentesDetail(maj.id); else setVentesCliente([]);
  };

  const enregistrerFiche = async (c: Cliente) => {
    if (!formNom.trim()) { setErreurFiche('Le nom est obligatoire.'); return; }
    setOperationFiche(true); setErreurFiche('');
    const { error } = await supabase.rpc('modifier_cliente', { p_id: c.id, p_nom: formNom, p_telephone: formTel.trim() || null });
    setOperationFiche(false);
    if (error) { setErreurFiche(error.message || 'Enregistrement impossible.'); return; }
    fermerOutilsFiche(); setMessageFiche('Fiche mise à jour.');
    await rafraichirApres(c.id);
  };

  const fusionner = async (c: Cliente, autre: Cliente) => {
    const garder = garderSelectee ? c : autre;
    const absorber = garderSelectee ? autre : c;
    setOperationFiche(true); setErreurFiche('');
    const { data, error } = await supabase.rpc('fusionner_clientes', { p_garder: garder.id, p_absorber: absorber.id });
    setOperationFiche(false);
    if (error) { setErreurFiche(error.message || 'Fusion impossible.'); return; }
    fermerOutilsFiche();
    setMessageFiche(`Fiches fusionnées : ${Number(data) || 0} vente(s) de « ${absorber.nom} » rattachée(s) à « ${garder.nom} ».`);
    await rafraichirApres(garder.id);
  };

  // Relance WhatsApp pre-remplie (numero camerounais local complete en 237).
  const relancer = (c: Cliente) => {
    let num = (c.telephone || '').replace(/[^0-9]/g, '');
    if (num && num.length === 9) num = '237' + num;
    const texte = encodeURIComponent(`Bonjour ${c.nom}, il reste ${c.resteAPayer.toLocaleString('fr-FR')} FCFA à régler sur votre achat chez Fallora. Merci de bien vouloir compléter le paiement. 💛`);
    window.open(num ? `https://wa.me/${num}?text=${texte}` : `https://wa.me/?text=${texte}`, '_blank');
  };

  // Doublons probables : meme numero (normalise) ou meme nom (sans accents).
  const cleTel = (c: Cliente) => { const t = normaliserTel(c.telephone); return t.length >= 9 ? `t:${t}` : ''; };
  const cleNom = (c: Cliente) => { const n = sansAccents(c.nom).replace(/\s+/g, ' '); return n ? `n:${n}` : ''; };
  const compte = new Map<string, number>();
  clientes.forEach(c => [cleTel(c), cleNom(c)].filter(Boolean).forEach(k => compte.set(k, (compte.get(k) || 0) + 1)));
  const cleDoublon = (c: Cliente) => [cleTel(c), cleNom(c)].find(k => k && (compte.get(k) || 0) > 1) || '';
  const nbDoublons = clientes.filter(c => cleDoublon(c)).length;

  const rechercheNorm = sansAccents(recherche);
  const rechercheTel = normaliserTel(recherche);
  const filtrees = clientes
    .filter(c => sansAccents(c.nom).includes(rechercheNorm) || (rechercheTel.length > 0 && normaliserTel(c.telephone).includes(rechercheTel)))
    .filter(c => !filtreDette || c.resteAPayer > 0)
    .filter(c => !voirDoublons || cleDoublon(c))
    .sort((a, b) => voirDoublons ? cleDoublon(a).localeCompare(cleDoublon(b)) : filtreDette ? b.resteAPayer - a.resteAPayer : 0);

  const candidatsFusion = clienteSelectee ? clientes
    .filter(c => c.id !== clienteSelectee.id)
    .filter(c => {
      const q = sansAccents(rechercheFusion), qt = normaliserTel(rechercheFusion);
      if (!q) return cleDoublon(c) !== '' && cleDoublon(c) === cleDoublon(clienteSelectee);
      return sansAccents(c.nom).includes(q) || (qt.length > 0 && normaliserTel(c.telephone).includes(qt));
    })
    .slice(0, 8) : [];
  const totalCA = clientes.reduce((s, c) => s + c.totalDepense, 0);
  const totalAttente = clientes.reduce((s, c) => s + c.resteAPayer, 0);

  return (
    <div className="fade-up">
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '16px', marginBottom: '20px' }}>
        {[
          { icon: 'people', label: 'Clientes', value: clientes.length.toString(), color: 'var(--ink)' },
          { icon: 'payments', label: 'CA Total FCFA', value: totalCA.toLocaleString(), color: 'var(--success)' },
          { icon: 'pending_actions', label: 'En attente FCFA', value: totalAttente.toLocaleString(), color: 'var(--warn)' },
        ].map(s => (
          <div key={s.label} style={{ padding: '20px', borderRadius: '18px', background: 'var(--surface)', border: '1px solid var(--accent-12)', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-12)', border: '1px solid var(--accent-20)', flexShrink: 0 }}>
              <span className="ms" style={{ fontSize: '22px', color: 'var(--accent)' }}>{s.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-55)', textTransform: 'uppercase' as const }}>{s.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recherche + filtre creances */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '48px', padding: '0 16px', borderRadius: '14px', background: 'var(--surface-inset)', border: '1px solid var(--line)', flex: 1, minWidth: '200px' }}>
          <span className="ms" style={{ fontSize: '20px', color: 'var(--ink-45)' }}>search</span>
          <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher par nom ou téléphone..." aria-label="Rechercher une cliente" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '14px' }} />
        </div>
        <button onClick={() => setFiltreDette(v => !v)} aria-pressed={filtreDette} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '48px', padding: '0 16px', borderRadius: '14px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, background: filtreDette ? 'var(--warn-tint)' : 'var(--surface-inset)', color: filtreDette ? 'var(--warn)' : 'var(--ink-55)', border: `1px solid ${filtreDette ? 'var(--warn-line)' : 'var(--line)'}`, whiteSpace: 'nowrap' }}>
          <span className="ms" style={{ fontSize: '18px' }}>{filtreDette ? 'filter_alt' : 'filter_alt_off'}</span>À recouvrer
        </button>
        {nbDoublons > 0 && (
          <button onClick={() => setVoirDoublons(v => !v)} aria-pressed={voirDoublons} title="Fiches avec le même numéro ou le même nom" style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '48px', padding: '0 16px', borderRadius: '14px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, background: voirDoublons ? 'var(--accent-16)' : 'var(--surface-inset)', color: voirDoublons ? 'var(--accent-deep)' : 'var(--ink-55)', border: `1px solid ${voirDoublons ? 'var(--accent-30)' : 'var(--line)'}`, whiteSpace: 'nowrap' }}>
            <span className="ms" style={{ fontSize: '18px' }}>content_copy</span>Doublons possibles ({nbDoublons})
          </button>
        )}
      </div>
      {messageFiche && (
        <div role="status" style={{ marginBottom: '14px', padding: '12px 16px', borderRadius: '12px', background: 'var(--success-tint)', border: '1px solid var(--success-line)', color: 'var(--success)', fontSize: '13.5px', fontWeight: 600 }}>{messageFiche}</div>
      )}

      {/* 2-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: clienteSelectee && !isMobile ? '1fr 380px' : '1fr', gap: '16px', alignItems: 'start' }}>
        {/* Liste */}
        <div>
          {chargement ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink-45)' }}>Chargement...</div>
          ) : filtrees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink-45)' }}>
              <span className="ms" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: 'var(--accent-30)' }}>people</span>
              {recherche ? 'Aucune cliente trouvée.' : 'Aucune cliente enregistrée.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtrees.map(c => (
                <button key={c.id} onClick={() => voirDetail(c)} style={{ width: '100%', padding: '16px 20px', borderRadius: '18px', background: clienteSelectee?.id === c.id ? 'var(--accent-08)' : 'var(--surface)', border: `1px solid ${clienteSelectee?.id === c.id ? 'var(--accent-30)' : 'var(--line)'}`, backdropFilter: 'blur(20px)', cursor: 'pointer', textAlign: 'left', transition: 'all .15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '13px', background: 'var(--avatar)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--accent-20)', flexShrink: 0 }}>
                        <span style={{ fontFamily: "var(--font-cormorant), serif", fontSize: '20px', color: 'var(--accent)', fontWeight: 600 }}>{c.nom[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--ink)' }}>{c.nom}</div>
                        {c.telephone ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--ink-45)' }}>
                            <span className="ms" style={{ fontSize: '13px' }}>phone</span>{c.telephone}
                          </div>
                        ) : <div style={{ fontSize: '12px', color: 'var(--ink-25)' }}>Pas de téléphone</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{c.totalDepense.toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--accent)' }}>FCFA</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', marginTop: '4px' }}>
                        <span style={{ fontSize: '11.5px', background: 'var(--accent-12)', color: 'var(--accent-deep)', padding: '3px 9px', borderRadius: '20px', fontWeight: 600 }}>{c.nbVentes} achat{c.nbVentes > 1 ? 's' : ''}</span>
                        {c.resteAPayer > 0 && <span style={{ fontSize: '11.5px', background: 'var(--warn-tint)', color: 'var(--warn)', padding: '3px 9px', borderRadius: '20px', fontWeight: 600 }}>-{c.resteAPayer.toLocaleString()}</span>}
                      </div>
                    </div>
                  </div>
                  {c.derniereVisite && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '8px', fontSize: '11.5px', color: 'var(--ink-35)' }}>
                      <span className="ms" style={{ fontSize: '13px' }}>schedule</span>
                      Dernière visite : {new Date(c.derniereVisite).toLocaleDateString('fr-FR')}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        {clienteSelectee && (
          <div style={{ position: isMobile ? 'static' : 'sticky', top: '100px', borderRadius: '20px', background: 'var(--surface-2)', border: '1px solid var(--accent-20)', backdropFilter: 'blur(22px)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,var(--accent-16),var(--accent-08))', padding: '20px', borderBottom: '1px solid var(--accent-12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '15px', background: 'var(--avatar)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--accent-30)' }}>
                  <span style={{ fontFamily: "var(--font-cormorant), serif", fontSize: '26px', color: 'var(--accent)', fontWeight: 600 }}>{clienteSelectee.nom[0].toUpperCase()}</span>
                </div>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>{clienteSelectee.nom}</div>
                  {clienteSelectee.telephone ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: 'var(--accent)' }}>
                      <span className="ms" style={{ fontSize: '14px' }}>phone</span>{clienteSelectee.telephone}
                    </div>
                  ) : <div style={{ fontSize: '12px', color: 'var(--ink-35)' }}>Pas de téléphone</div>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {([['edit', 'Modifier', () => edition ? fermerOutilsFiche() : ouvrirEdition(clienteSelectee), edition], ['merge', 'Fusionner', () => { const o = !fusionOuverte; fermerOutilsFiche(); setFusionOuverte(o); setGarderSelectee(true); }, fusionOuverte]] as const).map(([icone, label, action, actif]) => (
                  <button key={label} onClick={action} aria-pressed={actif} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px', borderRadius: '10px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, background: actif ? 'var(--accent)' : 'var(--surface)', color: actif ? 'var(--on-accent)' : 'var(--accent-deep)', border: `1px solid ${actif ? 'var(--accent)' : 'var(--accent-20)'}` }}>
                    <span className="ms" style={{ fontSize: '16px' }}>{icone}</span>{label}
                  </button>
                ))}
              </div>
              {edition && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', padding: '12px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--line)' }}>
                  <input value={formNom} onChange={e => setFormNom(e.target.value)} aria-label="Nom de la cliente" placeholder="Nom *" style={{ height: '40px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--surface-inset)', color: 'var(--ink)', fontSize: '13.5px', outline: 'none' }} />
                  <input value={formTel} onChange={e => setFormTel(e.target.value)} type="tel" aria-label="Téléphone de la cliente" placeholder="Téléphone (optionnel)" style={{ height: '40px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--surface-inset)', color: 'var(--ink)', fontSize: '13.5px', outline: 'none' }} />
                  {erreurFiche && <div role="alert" style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600 }}>{erreurFiche}</div>}
                  <button onClick={() => enregistrerFiche(clienteSelectee)} disabled={operationFiche} style={{ height: '38px', borderRadius: '10px', cursor: operationFiche ? 'default' : 'pointer', fontSize: '13px', fontWeight: 700, background: 'var(--accent-grad)', color: 'var(--on-accent)', border: 'none', opacity: operationFiche ? 0.6 : 1 }}>{operationFiche ? '...' : 'Enregistrer'}</button>
                </div>
              )}
              {fusionOuverte && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', padding: '12px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--line)' }}>
                  {!cibleFusion ? (
                    <>
                      <div style={{ fontSize: '12.5px', color: 'var(--ink-70)' }}>Avec quelle fiche fusionner « {clienteSelectee.nom} » ?</div>
                      <input autoFocus value={rechercheFusion} onChange={e => setRechercheFusion(e.target.value)} aria-label="Rechercher la fiche à fusionner" placeholder="Nom ou téléphone…" style={{ height: '38px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--surface-inset)', color: 'var(--ink)', fontSize: '13px', outline: 'none' }} />
                      {candidatsFusion.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--ink-45)' }}>{rechercheFusion ? 'Aucune fiche trouvée.' : 'Tapez un nom ou un numéro.'}</div>
                      ) : candidatsFusion.map(c => (
                        <button key={c.id} onClick={() => setCibleFusion(c)} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '8px 10px', borderRadius: '9px', cursor: 'pointer', background: 'var(--surface-inset)', border: '1px solid var(--line)', textAlign: 'left', fontSize: '13px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.nom}</span>
                          <span style={{ color: 'var(--ink-45)', whiteSpace: 'nowrap' }}>{c.telephone || 'sans tél.'} · {c.nbVentes} achat{c.nbVentes > 1 ? 's' : ''}</span>
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>Quelle fiche garder ?</div>
                      {[[true, clienteSelectee], [false, cibleFusion]].map(([garder, c]) => {
                        const fiche = c as Cliente;
                        return (
                          <label key={fiche.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer' }}>
                            <input type="radio" name="garder" checked={garderSelectee === garder} onChange={() => setGarderSelectee(garder as boolean)} />
                            <span><b>{fiche.nom}</b> <span style={{ color: 'var(--ink-45)' }}>{fiche.telephone || 'sans tél.'} · {fiche.nbVentes} achat{fiche.nbVentes > 1 ? 's' : ''}</span></span>
                          </label>
                        );
                      })}
                      <div style={{ fontSize: '12px', color: 'var(--ink-55)', lineHeight: 1.45 }}>
                        Tous les achats de « {(garderSelectee ? cibleFusion : clienteSelectee).nom} » seront rattachés à « {(garderSelectee ? clienteSelectee : cibleFusion).nom} », puis sa fiche sera supprimée. Action définitive.
                      </div>
                      {erreurFiche && <div role="alert" style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600 }}>{erreurFiche}</div>}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => fusionner(clienteSelectee, cibleFusion)} disabled={operationFiche} style={{ flex: 1, height: '38px', borderRadius: '10px', cursor: operationFiche ? 'default' : 'pointer', fontSize: '13px', fontWeight: 700, background: 'var(--accent-grad)', color: 'var(--on-accent)', border: 'none', opacity: operationFiche ? 0.6 : 1 }}>{operationFiche ? '...' : 'Fusionner'}</button>
                        <button onClick={() => { setCibleFusion(null); setErreurFiche(''); }} disabled={operationFiche} style={{ height: '38px', padding: '0 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: 'var(--surface-inset)', color: 'var(--ink-55)', border: '1px solid var(--line)' }}>Retour</button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                {[
                  { label: 'Achats', value: clienteSelectee.nbVentes.toString() },
                  { label: 'Total FCFA', value: clienteSelectee.totalDepense.toLocaleString() },
                  { label: 'Reste', value: clienteSelectee.resteAPayer.toLocaleString(), warn: clienteSelectee.resteAPayer > 0 },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surface)', borderRadius: '12px', padding: '10px', textAlign: 'center', border: `1px solid ${s.warn ? 'var(--warn-line)' : 'var(--line)'}` }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: s.warn ? 'var(--warn)' : 'var(--ink)' }}>{s.value}</div>
                    <div style={{ fontSize: '10px', color: 'var(--ink-45)', fontWeight: 600, letterSpacing: '.3px', textTransform: 'uppercase' as const }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {clienteSelectee.resteAPayer > 0 && (
                <button onClick={() => relancer(clienteSelectee)} style={{ marginTop: '12px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '42px', borderRadius: '12px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, background: 'var(--warn-tint)', color: 'var(--warn)', border: '1px solid var(--warn-line)' }}>
                  <span className="ms" style={{ fontSize: '18px' }}>chat</span>Relancer par WhatsApp
                </button>
              )}
            </div>
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                <span className="ms" style={{ fontSize: '18px', color: 'var(--accent)' }}>shopping_bag</span>Historique
              </div>
              {chargementDetail ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--ink-45)', fontSize: '13px' }}>Chargement...</div>
              ) : ventesCliente.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--ink-45)', fontSize: '13px' }}>Aucun achat.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
                  {ventesCliente.map(v => (
                    <div key={v.id} style={{ padding: '12px 14px', borderRadius: '14px', background: 'var(--surface)', border: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-45)' }}>{new Date(v.date_vente).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                          <div style={{ fontSize: '11.5px', color: 'var(--ink-35)' }}>par {v.utilisateurs?.nom || 'Inconnue'}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{v.total?.toLocaleString()} <span style={{ fontSize: '10px', color: 'var(--accent)' }}>FCFA</span></div>
                          <span style={v.statut_paiement === 'paye' ? BADGE_PAID : BADGE_PART}>{v.statut_paiement === 'paye' ? 'Payé' : `Reste : ${v.reste_a_payer?.toLocaleString()}`}</span>
                        </div>
                      </div>
                      {v.vente_produits?.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {v.vente_produits.map((vp: any, i: number) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                              <span style={{ color: 'var(--ink-70)' }}>{vp.produits?.nom || 'Inconnu'} <span style={{ color: 'var(--accent)', fontWeight: 700 }}>x{vp.quantite}</span></span>
                              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{(vp.prix_unitaire * vp.quantite).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {v.reste_a_payer > 0 && (
                        venteEncaisse === v.id ? (
                          <div style={{ marginTop: '10px', borderTop: '1px solid var(--line-soft)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input type="number" inputMode="numeric" value={montantAcompte} onChange={e => setMontantAcompte(e.target.value)} aria-label="Montant de l'acompte" style={{ flex: 1, minWidth: 0, height: '38px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--surface-inset)', color: 'var(--ink)', fontSize: '13px', outline: 'none' }} />
                              <select value={modeAcompte} onChange={e => setModeAcompte(e.target.value)} aria-label="Mode de paiement" style={{ height: '38px', padding: '0 8px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--surface-inset)', color: 'var(--ink)', fontSize: '13px', outline: 'none' }}>
                                {MODES.map(m => <option key={m.valeur} value={m.valeur}>{m.libelle}</option>)}
                              </select>
                            </div>
                            {erreurAcompte && <div style={{ fontSize: '12px', color: 'var(--danger)' }}>{erreurAcompte}</div>}
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => soumettreAcompte(v)} disabled={enregistrement} style={{ flex: 1, height: '38px', borderRadius: '10px', cursor: enregistrement ? 'default' : 'pointer', fontSize: '13px', fontWeight: 700, background: 'var(--success)', color: '#fff', border: 'none', opacity: enregistrement ? 0.6 : 1 }}>{enregistrement ? '...' : 'Valider'}</button>
                              <button onClick={() => { setVenteEncaisse(null); setErreurAcompte(''); }} disabled={enregistrement} style={{ height: '38px', padding: '0 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: 'var(--surface-inset)', color: 'var(--ink-55)', border: '1px solid var(--line)' }}>Annuler</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => ouvrirEncaissement(v)} style={{ marginTop: '10px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px', borderRadius: '10px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, background: 'var(--accent-08)', color: 'var(--accent-deep)', border: '1px solid var(--accent-20)' }}>
                            <span className="ms" style={{ fontSize: '16px' }}>account_balance_wallet</span>Encaisser un acompte
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
