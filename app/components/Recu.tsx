import { FalloraMark } from './Logo';

// Reçu / facture d'une vente. Composant purement visuel : il est affiche a
// l'ecran ET capture en image (html-to-image) pour l'envoi WhatsApp.
// Couleurs en dur (pas de var CSS) pour que l'image generee soit fidele.

export type RecuData = {
  boutique: string;
  numero: string;
  date: string;      // deja formatee
  vendeuse: string;
  client: string;
  telephone?: string | null;
  items: { nom: string; quantite: number; prix: number }[];
  total: number;
  paye: number;
  reste: number;
  mode: string;      // cash | mobile_money | orange_money
  statut: string;    // paye | partiel
};

const MODE_LABEL: Record<string, string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  orange_money: 'Orange Money',
};

const fmt = (n: number) => n.toLocaleString('fr-FR');

export default function Recu({ data }: { data: RecuData }) {
  return (
    <div style={{ width: '360px', background: '#FBF7EF', color: '#3E2C20', fontFamily: "'Manrope', system-ui, sans-serif", padding: '26px 24px 22px', boxSizing: 'border-box' }}>
      {/* En-tete : logo + boutique */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px', paddingBottom: '18px', borderBottom: '1.5px solid rgba(62,44,32,.18)' }}>
        <FalloraMark size={44} />
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '30px', fontWeight: 600, letterSpacing: '1px', lineHeight: 1, color: '#3E2C20' }}>{data.boutique}</div>
        <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#A9673D', fontWeight: 600 }}>Reçu d'achat</div>
      </div>

      {/* Meta : numero, date, vendeuse, client */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12.5px', padding: '14px 0', borderBottom: '1px dashed rgba(62,44,32,.22)' }}>
        <Ligne label="Reçu N°" val={data.numero} />
        <Ligne label="Date" val={data.date} />
        <Ligne label="Vendeuse" val={data.vendeuse} />
        <Ligne label="Client" val={data.client} />
        {data.telephone ? <Ligne label="Téléphone" val={data.telephone} /> : null}
      </div>

      {/* Articles */}
      <div style={{ padding: '14px 0', borderBottom: '1px dashed rgba(62,44,32,.22)' }}>
        {data.items.map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px', marginBottom: i === data.items.length - 1 ? 0 : '8px' }}>
            <span style={{ flex: 1 }}>
              <span style={{ color: '#A9673D', fontWeight: 700 }}>{it.quantite}×</span> {it.nom}
            </span>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(it.prix * it.quantite)}</span>
          </div>
        ))}
      </div>

      {/* Totaux */}
      <div style={{ padding: '14px 0 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '14px', fontWeight: 700 }}>TOTAL</span>
          <span>
            <span style={{ fontSize: '24px', fontWeight: 800 }}>{fmt(data.total)}</span>
            <span style={{ fontSize: '12px', color: '#A9673D', fontWeight: 700, marginLeft: '4px' }}>FCFA</span>
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'rgba(62,44,32,.7)', marginTop: '8px' }}>
          <span>Payé ({MODE_LABEL[data.mode] || data.mode})</span>
          <span style={{ fontWeight: 600 }}>{fmt(data.paye)} FCFA</span>
        </div>
        {data.reste > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#C08A2E', fontWeight: 700, marginTop: '4px' }}>
            <span>Reste à payer</span>
            <span>{fmt(data.reste)} FCFA</span>
          </div>
        ) : (
          <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '11.5px', fontWeight: 700, color: '#3F9468', background: 'rgba(63,148,104,.12)', border: '1px solid rgba(63,148,104,.28)', borderRadius: '8px', padding: '5px' }}>
            ✓ PAYÉ INTÉGRALEMENT
          </div>
        )}
      </div>

      {/* Pied */}
      <div style={{ textAlign: 'center', marginTop: '18px', paddingTop: '14px', borderTop: '1.5px solid rgba(62,44,32,.18)', fontSize: '12.5px', color: '#3E2C20' }}>
        Merci de votre achat 💛
      </div>
    </div>
  );
}

function Ligne({ label, val }: { label: string; val: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
      <span style={{ color: 'rgba(62,44,32,.55)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{val}</span>
    </div>
  );
}
