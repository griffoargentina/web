import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { hasValidAdminSession } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin Griffo" },
  robots: { index: false, follow: false },
};

/**
 * 🔒 Defensa en profundidad: verifica la sesión del admin en cada
 * render del layout, independiente del proxy. Si la sesión no es
 * válida, redirige al login antes de que se pinte ninguna página
 * hija — ningún contenido protegido llega al cliente aunque el
 * proxy falle o un prefetch sirva algo cacheado.
 */

/**
 * Agrupación del sidebar:
 *   1. Diseño de web: contenido que afecta cómo se ve el sitio público.
 *   2. Administración de catálogo: productos destacados + matriz de
 *      cobertura (universo de productos Griffo en SpecParts).
 *   3. Formularios: leads capturados por forms públicos.
 *   4. Catálogo: atajo al catálogo público (para preview).
 */
type NavGroup = {
  label: string;
  items: { href: string; label: string; icon: IconName }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Diseño de web",
    items: [
      { href: "/admin/banners", label: "Banners", icon: "image" },
      { href: "/admin/distribuidores", label: "Distribuidores", icon: "users" },
      { href: "/admin/descargas", label: "Descargas", icon: "download" },
      { href: "/admin/novedades", label: "Novedades", icon: "spark" },
    ],
  },
  {
    label: "Administración de catálogo",
    items: [
      { href: "/admin/productos", label: "Productos destacados", icon: "box" },
      { href: "/admin/links-mercadolibre", label: "Links Mercado Libre", icon: "download" },
      { href: "/admin/catalogo-imagenes", label: "Imagen tréboles", icon: "image" },
      { href: "/admin/banco-imagenes", label: "Banco de imágenes", icon: "download" },
      { href: "/admin/catalogo-backup", label: "Backup del catálogo", icon: "download" },
      { href: "/admin/cache", label: "Cache de imágenes", icon: "zap" },
    ],
  },
  {
    label: "Análisis del público",
    items: [
      { href: "/admin/busquedas", label: "Búsquedas del catálogo", icon: "search" },
      { href: "/admin/leads", label: "Leads capturados", icon: "inbox" },
    ],
  },
  {
    label: "Portal B2B",
    items: [
      { href: "/admin/pedidos", label: "Pedidos", icon: "inbox" },
      { href: "/admin/clientes", label: "Clientes", icon: "users" },
      { href: "/admin/listas-precios", label: "Listas de precios", icon: "download" },
    ],
  },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ok = await hasValidAdminSession();
  if (!ok) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0a2b3d] text-white flex flex-col shrink-0 sticky top-0 h-screen">
        <div className="p-5 border-b border-white/10">
          <Link href="/admin" className="flex items-center gap-3">
            <Logo className="h-8 w-auto" />
            <span className="text-xs font-bold uppercase tracking-wider opacity-70">
              Admin
            </span>
          </Link>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          <SidebarLink href="/admin" label="Dashboard" icon="home" />

          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mt-5">
              <p className="px-3 mb-1 text-[10px] font-black uppercase tracking-wider text-white/40">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarLink key={item.href} {...item} />
                ))}
              </div>
            </div>
          ))}

          <div className="mt-5">
            <p className="px-3 mb-1 text-[10px] font-black uppercase tracking-wider text-white/40">
              Vista pública
            </p>
            <SidebarLink
              href="/catalogo"
              label="Catálogo"
              icon="search"
              external
            />
          </div>
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3">
          <LogoutButton />
          <Link
            href="/"
            className="block text-xs text-white/50 hover:text-white transition"
          >
            ← Volver al sitio
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}

type IconName =
  | "home"
  | "users"
  | "box"
  | "image"
  | "grid"
  | "download"
  | "inbox"
  | "search"
  | "zap"
  | "spark";

function SidebarLink({
  href,
  label,
  icon,
  external,
}: {
  href: string;
  label: string;
  icon: IconName;
  external?: boolean;
}) {
  const icons: Record<IconName, React.ReactNode> = {
    home: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    users: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    box: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    image: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    ),
    grid: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
    download: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
    inbox: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    ),
    search: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    zap: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    spark: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 2z" />
      </svg>
    ),
  };

  const classes =
    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition";

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {icons[icon]}
        <span className="flex-1">{label}</span>
        <ExternalIcon />
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {icons[icon]}
      {label}
    </Link>
  );
}

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <path d="M7 17L17 7M17 7H9M17 7v8" />
    </svg>
  );
}
