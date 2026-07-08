import type { NextConfig } from "next";

/**
 * Configuración de Next.js.
 *
 * Incluye:
 * - Security headers (X-Frame-Options, Permissions-Policy, etc.)
 * - Optimización de imágenes: AVIF + WebP automático
 * - Skeleton de redirects() para la migración a www.griffo.com.ar
 *   (completar con el inventario del sitio viejo — ver MIGRATION.md)
 */
const nextConfig: NextConfig = {
  // Incluir /public/downloads y /public/pdfs en el bundle de las
  // serverless functions para poder leer los directorios con
  // fs.readdirSync en runtime. Sin esto, /catalogo/download no puede
  // detectar qué archivos están realmente subidos vía GitHub.
  outputFileTracingIncludes: {
    "/catalogo/download": [
      "./public/downloads/**/*",
      "./public/pdfs/**/*",
    ],
    "/admin/descargas": [
      "./public/downloads/**/*",
      "./public/pdfs/**/*",
    ],
  },
  // Scroll al top cuando se navega entre páginas
  experimental: {
    scrollRestoration: false,
  },
  // Optimización de imágenes por Next/Image
  images: {
    // Prioridad de formatos: AVIF (mejor compresión) → WebP → original
    formats: ["image/avif", "image/webp"],
    // Tamaños responsive para srcset automático
    deviceSizes: [640, 750, 828, 1080, 1200, 1600, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Cache de 30 días para imágenes optimizadas
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Hosts externos permitidos (Next/Image las optimiza on-the-fly y cachea)
    remotePatterns: [
      {
        protocol: "https",
        hostname: "production-specparts-search-api-images-bucket.s3.amazonaws.com",
      },
      // Otros buckets de SpecParts — por si cambian la infra.
      {
        protocol: "https",
        hostname: "*.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "specparts-*.s3.*.amazonaws.com",
      },
    ],
  },

  // Compression (Vercel ya usa Brotli/gzip, esto es redundante pero explícito)
  compress: true,

  // Strict mode para detectar patrones problemáticos en dev
  reactStrictMode: true,

  // Security headers aplicados a todas las rutas
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Evita que el browser adivine el content-type (XSS prevention)
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Clickjacking prevention (no permitir iframes desde otros sitios,
          // excepto desde el propio dominio — necesario para el mapa de Google)
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          // Información mínima sobre el referrer al navegar a otros sitios
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Permissions-Policy: deshabilitamos APIs que el sitio no usa
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // DNS prefetch control
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
        ],
      },
    ];
  },

  /**
   * Redirects 301 — preservan SEO cuando cambian URLs y mantienen los
   * QRs impresos en packaging que apuntan a URLs viejas.
   *
   * IMPORTANTE: los slugs del bloque "QRs de packaging" están físicamente
   * impresos en cajas de producto. No cambiarlos nunca. Si llega un QR
   * roto, agregar el redirect acá.
   *
   * Los otros redirects vienen del inventario de URLs del sitio viejo
   * (Search Console, abril 2026, `reference/search-console/`). Si
   * alguna URL vieja genera clicks o impresiones, mantenerla con 301
   * para no perder SEO.
   */
  async redirects() {
    return [
      // ---- QRs de packaging del sitio viejo — sin /productos/ prefix ----
      {
        // QR impreso en packaging — no cambiar nunca.
        source: "/direccionuniversal",
        destination: "/productos/fuelle-universal-de-direccion",
        permanent: true,
      },
      {
        // QR impreso en packaging (variante con palabras invertidas) — no cambiar nunca.
        source: "/universaldireccion",
        destination: "/productos/fuelle-universal-de-direccion",
        permanent: true,
      },
      {
        source: "/maquina-montadora-de-fuelles",
        destination: "/productos/maquina-montadora-de-fuelles",
        permanent: true,
      },
      {
        source: "/kit-de-fuelles-universales-para-homocineticas",
        destination: "/productos/kit-de-fuelles-universales-para-homocineticas",
        permanent: true,
      },
      {
        source: "/kit-de-proteccion-para-suspension-deportiva",
        destination: "/productos/kit-de-proteccion-para-suspension-deportiva",
        permanent: true,
      },

      // ---- Productos destacados: slugs viejos → slugs nuevos ----
      {
        source: "/abrazaderas-universales",
        destination: "/productos/abrazaderas-universales",
        permanent: true,
      },
      {
        source: "/pinza-para-abrazaderas",
        destination: "/productos/pinza-para-abrazaderas",
        permanent: true,
      },
      {
        source: "/extractor-de-juntas-homocineticas",
        destination: "/productos/extractor-de-juntas-homocineticas",
        permanent: true,
      },
      {
        // Slug viejo del fuelle de dirección (sin el "de").
        source: "/fuelle-universal-direccion",
        destination: "/productos/fuelle-universal-de-direccion",
        permanent: true,
      },
      {
        // "Fuelle Universal" genérico del sitio viejo = el de transmisión
        // (cliente lo confirmó). Era la URL más popular sin /productos/.
        source: "/fuelle-universal",
        destination: "/productos/kit-de-fuelles-universales-para-homocineticas",
        permanent: true,
      },
      {
        // Slug viejo del fuelle de suspensión deportiva.
        source: "/fuelle-de-suspension-deportiva",
        destination: "/productos/kit-de-proteccion-para-suspension-deportiva",
        permanent: true,
      },

      // ---- Páginas institucionales renombradas ----
      {
        source: "/quienes-somos",
        destination: "/empresa",
        permanent: true,
      },
      {
        source: "/piezas-industriales",
        destination: "/empresa",
        permanent: true,
      },
      {
        source: "/descargas",
        destination: "/catalogo/download",
        permanent: true,
      },
      {
        // El sitio viejo tenía /registro para crear cuenta. Lo mandamos
        // a /contacto hasta que (si es) volvamos a tener login.
        source: "/registro",
        destination: "/contacto",
        permanent: true,
      },
      {
        // Buscador de fuelles por medida → tab de medidas del catálogo.
        source: "/buscador-por-medida",
        destination: "/catalogo",
        permanent: true,
      },

      // ---- Noticias → Novedades ----
      // Categorías específicas primero (Next matchea top-to-bottom).
      {
        source: "/noticias/categoria/lanzamientos",
        destination: "/novedades/lanzamientos",
        permanent: true,
      },
      {
        source: "/noticias/categoria/lanzamientos/:page*",
        destination: "/novedades/lanzamientos",
        permanent: true,
      },
      {
        source: "/noticias/categoria/nuevas-aplicaciones",
        destination: "/novedades/aplicaciones",
        permanent: true,
      },
      {
        source: "/noticias/categoria/nuevas-aplicaciones/:page*",
        destination: "/novedades/aplicaciones",
        permanent: true,
      },
      // Catch-all para noticias sueltas y archivos. Va después de las
      // categorías para que esas ganen. Cuando tengamos contenido real
      // en /novedades, la experiencia mejora sola (sin tocar redirects).
      {
        source: "/noticias",
        destination: "/novedades",
        permanent: true,
      },
      {
        source: "/noticias/:path*",
        destination: "/novedades",
        permanent: true,
      },

      // ---- PDFs del CMS viejo (/bundles/appfrontend/pdf/*) ----
      {
        source: "/bundles/appfrontend/pdf/Garantia-Griffo-General.pdf",
        destination: "/pdfs/garantia.pdf",
        permanent: true,
      },
      // Todos los otros PDFs (catálogo, montadora, pinza, extractor, etc.)
      // → página de descargas, donde la cliente los sube.
      {
        source: "/bundles/appfrontend/pdf/:path*",
        destination: "/catalogo/download",
        permanent: true,
      },

      // ---- Imágenes sueltas del CMS viejo que Google indexó ----
      // Van a home porque son JPG/PNG que no tenemos equivalente directo.
      {
        source: "/bundles/appfrontend/img/:path*",
        destination: "/",
        permanent: true,
      },

      // ---- Catch-all de /bundles — cualquier otro recurso del CMS ----
      {
        source: "/bundles/:path*",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
