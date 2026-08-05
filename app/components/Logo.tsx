/*
 * Logo Fallora — recréation vectorielle du logo (visage de profil + wordmark).
 *
 * Le SVG est une reconstruction fidèle et redimensionnable de la marque, teintée
 * via les tokens de la charte (terracotta). Pour utiliser le fichier officiel tel
 * quel, déposez-le dans /public (ex. /public/fallora.svg) et remplacez <FalloraMark/>
 * par une <img src="/fallora.svg" />.
 */

let gradId = 0;

/** Le visage de profil seul, en trait terracotta dégradé. */
export function FalloraMark({ size = 40, tone = 'accent' }: { size?: number; tone?: 'accent' | 'cream' | 'ink' }) {
  const id = `fallora-face-${gradId++}`;
  const stops =
    tone === 'cream'
      ? ['#FBF3E6', '#EAD3B4']
      : tone === 'ink'
        ? ['#5C3A26', '#3E2C20']
        : ['#6E4128', '#C08552']; // terracotta (défaut, comme le logo)

  return (
    <svg width={size} height={size * 1.18} viewBox="0 0 80 94" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="20" y1="8" x2="46" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={stops[0]} />
          <stop offset="1" stopColor={stops[1]} />
        </linearGradient>
      </defs>
      <g stroke={`url(#${id})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Contour : front → nez → lèvres → menton → cou */}
        <path d="M55 10 C44 5 33 11 33 29 C33 39 28 42 22 50 C18 55 18 59 23 61 C27 63 30 62 29 67 C28 72 33 73 33 78 C33 85 40 89 42 94" />
        {/* Sourcil */}
        <path d="M31 44 C34 41 39 41 43 44" strokeWidth="2" />
        {/* Œil clos */}
        <path d="M32 51 C35 49 39 49 43 51" strokeWidth="1.8" />
      </g>
      {/* Lèvres — touche terracotta plus chaude */}
      <path d="M24 66 C27 64 30 65 29 68" stroke="#B9764A" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/**
 * Logo complet. `layout="row"` = pastille + wordmark côte à côte (headers/sidebar).
 * `layout="stack"` = visage au-dessus du wordmark (écrans vitrine, ex. login).
 */
export function FalloraLogo({
  layout = 'row',
  markSize = 40,
  wordSize = 26,
  tagline,
}: {
  layout?: 'row' | 'stack';
  markSize?: number;
  wordSize?: number;
  tagline?: string;
}) {
  const wordmark = (
    <span
      style={{
        fontFamily: "var(--font-cormorant), serif",
        fontSize: `${wordSize}px`,
        fontWeight: 600,
        letterSpacing: layout === 'stack' ? '6px' : '.5px',
        color: 'var(--ink)',
        lineHeight: 1,
        paddingLeft: layout === 'stack' ? '6px' : 0,
      }}
    >
      {layout === 'stack' ? 'FALLORA' : 'Fallora'}
    </span>
  );

  if (layout === 'stack') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
        <FalloraMark size={markSize} />
        {wordmark}
        {tagline && (
          <div style={{ marginTop: '2px', fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--ink-45)', fontWeight: 500 }}>
            {tagline}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
      <div
        style={{
          width: `${markSize + 8}px`,
          height: `${markSize + 8}px`,
          borderRadius: '13px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #F6EEDF, #ECE0CC)',
          border: '1px solid var(--accent-25)',
          boxShadow: 'var(--shadow-md)',
          flexShrink: 0,
        }}
      >
        <FalloraMark size={markSize * 0.62} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {wordmark}
        {tagline && (
          <div style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink-45)', fontWeight: 600 }}>
            {tagline}
          </div>
        )}
      </div>
    </div>
  );
}
