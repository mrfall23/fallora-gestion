'use client';
import { useRef } from 'react';
import Recu, { type RecuData } from './Recu';
import { partagerImageRecu, whatsappTexte, telechargerPdfRecu } from './recuPartage';

// Fenetre du reçu + boutons d'envoi (image WhatsApp, texte, PDF).
// Partagee entre l'espace vendeuse (apres une vente) et l'admin (renvoi).
export default function RecuModal({ data, onClose, libelleFermer = 'Fermer', onErreur }: {
  data: RecuData;
  onClose: () => void;
  libelleFermer?: string;
  onErreur?: (message: string) => void;
}) {
  const recuRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(62,44,32,.55)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: '400px', margin: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto' }}>
          <div ref={recuRef} style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
            <Recu data={data} />
          </div>
        </div>
        <button onClick={async () => { if (recuRef.current) await partagerImageRecu(recuRef.current, data); }}
          style={{ height: '52px', border: 'none', borderRadius: '14px', cursor: 'pointer', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', boxShadow: 'var(--shadow-accent)' }}>
          <span className="ms" style={{ fontSize: '20px' }}>ios_share</span>Partager le reçu (WhatsApp)
        </button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => whatsappTexte(data)}
            style={{ flex: 1, height: '46px', border: '1px solid var(--accent-25)', borderRadius: '13px', cursor: 'pointer', background: 'var(--surface)', color: 'var(--accent-deep)', fontSize: '13.5px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <span className="ms" style={{ fontSize: '18px' }}>chat</span>Texte
          </button>
          <button onClick={async () => { if (recuRef.current) { const ok = await telechargerPdfRecu(recuRef.current, data); if (!ok) onErreur?.('Échec de la génération du PDF.'); } }}
            style={{ flex: 1, height: '46px', border: '1px solid var(--accent-25)', borderRadius: '13px', cursor: 'pointer', background: 'var(--surface)', color: 'var(--accent-deep)', fontSize: '13.5px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <span className="ms" style={{ fontSize: '18px' }}>picture_as_pdf</span>PDF
          </button>
        </div>
        <button onClick={onClose}
          style={{ height: '46px', border: '1px solid var(--line)', borderRadius: '13px', cursor: 'pointer', background: 'transparent', color: 'var(--ink-55)', fontSize: '14px', fontWeight: 600 }}>
          {libelleFermer}
        </button>
      </div>
    </div>
  );
}

// Reçu reconstruit a partir d'une vente enregistree (meme numerotation que
// l'espace vendeuse : annee-id). Reflete l'etat ACTUEL : acomptes inclus.
export function recuDepuisVente(v: {
  id: number; date_vente: string; total: number; montant_paye: number; reste_a_payer: number; statut_paiement: string;
  vendeuseNom?: string | null; clienteNom?: string | null; clienteTelephone?: string | null;
  items: { nom: string; quantite: number; prix: number }[]; mode?: string | null;
}): RecuData {
  const d = new Date(v.date_vente);
  return {
    boutique: 'Fallora',
    numero: `${d.getFullYear()}-${String(v.id).padStart(4, '0')}`,
    date: d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    vendeuse: v.vendeuseNom || '',
    client: v.clienteNom || 'Cliente',
    telephone: v.clienteTelephone || null,
    items: v.items,
    total: Number(v.total) || 0,
    paye: Number(v.montant_paye) || 0,
    reste: Number(v.reste_a_payer) || 0,
    mode: v.mode || 'cash',
    statut: v.statut_paiement,
  };
}
