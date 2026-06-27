'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const NAV = [
  { href: '/admin', icon: 'dashboard', label: 'Tableau de bord' },
  { href: '/admin/produits', icon: 'inventory_2', label: 'Produits' },
  { href: '/admin/ventes', icon: 'receipt_long', label: 'Ventes' },
  { href: '/admin/vendeuses', icon: 'emoji_events', label: 'Vendeuses' },
  { href: '/admin/clients', icon: 'people', label: 'Clientes' },
  { href: '/admin/rapports', icon: 'download', label: 'Rapports' },
];

const TITRES: Record<string, [string, string]> = {
  '/admin': ['Tableau de bord', "Vue d'ensemble de votre activité"],
  '/admin/produits': ['Gestion des produits', 'Catalogue et niveaux de stock'],
  '/admin/ventes': ['Ventes', 'Historique des transactions'],
  '/admin/vendeuses': ['Performance des vendeuses', 'Classement et statistiques du mois'],
  '/admin/clients': ['Clientes', 'Profils et historique des achats'],
  '/admin/rapports': ['Rapports', 'Exportez vos données au format Excel'],
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const userData = localStorage.getItem('fallora_user');
    if (!userData) { router.push('/'); return; }
    const parsed = JSON.parse(userData);
    if (parsed.role !== 'admin') { router.push('/'); return; }
    setUser(parsed);
  }, []);

  const deconnecter = () => {
    localStorage.removeItem('fallora_user');
    document.cookie = 'fallora_role=; path=/; max-age=0';
    router.push('/');
  };

  if (!user) return <div style={{ minHeight: '100vh', background: '#0A0A0A' }} />;

  const [pageTitle, pageSub] = TITRES[pathname] || ['', ''];
  const initial = user.nom?.trim()[0]?.toUpperCase() || 'A';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '252px 1fr', minHeight: '100vh', background: '#0A0A0A' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{ position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', padding: '26px 18px', background: 'linear-gradient(180deg,#111110,#0A0A0A)', borderRight: '1px solid rgba(212,175,55,.1)' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 10px 26px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#F0C040,#D4AF37)', boxShadow: '0 8px 20px rgba(212,175,55,.25)' }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '25px', fontWeight: 700, color: '#0A0A0A' }}>F</span>
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '26px', fontWeight: 600, letterSpacing: '.5px', background: 'linear-gradient(135deg,#F5E7B0,#D4AF37)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Fallora</div>
        </div>

        <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', color: 'rgba(245,245,240,.3)', padding: '0 12px 12px' }}>MENU</div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {NAV.map(item => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            return (
              <button key={item.href} onClick={() => router.push(item.href)}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 16px', borderRadius: '14px', cursor: 'pointer', border: 'none', width: '100%', textAlign: 'left', fontFamily: "'Manrope', sans-serif", fontSize: '14.5px', fontWeight: active ? 600 : 500, letterSpacing: '.2px', background: active ? 'linear-gradient(135deg,rgba(240,192,64,.16),rgba(212,175,55,.05))' : 'transparent', color: active ? '#F0C040' : 'rgba(245,245,240,.6)', boxShadow: active ? 'inset 0 0 0 1px rgba(212,175,55,.22)' : 'none' }}>
                <span className="ms" style={{ fontSize: '21px', color: active ? '#F0C040' : 'rgba(245,245,240,.5)' }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User profile */}
        <div style={{ marginTop: 'auto', padding: '14px', borderRadius: '16px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'linear-gradient(135deg,#2a2a28,#1a1a18)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(212,175,55,.25)', flexShrink: 0 }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '18px', color: '#D4AF37', fontWeight: 600 }}>{initial}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#F5F5F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.nom}</div>
            <div style={{ fontSize: '11.5px', color: 'rgba(245,245,240,.4)' }}>Administratrice</div>
          </div>
          <button onClick={deconnecter} title="Déconnexion" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex' }}>
            <span className="ms" style={{ fontSize: '20px', color: 'rgba(245,245,240,.5)' }}>logout</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: '30%', width: '500px', height: '300px', background: 'radial-gradient(ellipse,rgba(212,175,55,.06),transparent 70%)', pointerEvents: 'none' }} />

        {/* Header */}
        <header style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: '20px', padding: '22px 40px', background: 'rgba(10,10,10,.72)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '30px', fontWeight: 600, color: '#F5F5F0', lineHeight: 1.1 }}>{pageTitle}</div>
            <div style={{ fontSize: '13.5px', color: 'rgba(245,245,240,.45)', marginTop: '2px' }}>{pageSub}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', height: '44px', padding: '0 16px', borderRadius: '13px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', minWidth: '220px' }}>
            <span className="ms" style={{ fontSize: '20px', color: 'rgba(245,245,240,.4)' }}>search</span>
            <input placeholder="Rechercher..." style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#F5F5F0', fontSize: '14px' }} />
          </div>
        </header>

        {/* Content */}
        <div style={{ padding: '32px 40px 56px', position: 'relative' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
