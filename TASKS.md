# Griffo — Tareas pendientes

Documento vivo con el estado de todo el proyecto. Marcar con `[x]` lo
que se va completando. Cuando una tarea tiene una etiqueta `(yo)` la
hago yo sin intervención; `(cliente)` necesita algo de vos.

Última actualización: 2026-04-30. Rama de desarrollo canónica:
`main` (única — todos los commits van directo ahí, ver REGLA #1 en
`CLAUDE.md`). Producción: `https://griffoweb.vercel.app`.
Destino final: `https://www.griffo.com.ar`.

---

## 🔴 Bloqueantes — definiciones abiertas

- [x] ~~**Login / cuenta corriente / descarga de facturas**~~ — **resuelto**.
  La cliente confirmó que son features del sitio nuevo. Se construyó el
  Portal B2B (`/cuenta/*`) con datos mock + integración real del ERP
  Bejerman para cuenta corriente, facturas, clientes y pedidos. Ver
  `CLAUDE.md` sección "Portal B2B".

---

## 🟢 Completado — sprint 2026-04 (audit post-factum)

Todo lo siguiente se construyó entre el merge de la rama nueva y el
2026-04-21, pero no se había marcado acá:

### Catálogo nativo (`/catalogo`)
- [x] Buscador con 5 tabs (Palabra / Patente / Vehículo / Código / Medidas)
- [x] Sidebar de filtros facetados (Línea, Tipo, Ubicación, Lado,
      Marca, Modelo, Motor, Año) con contadores dinámicos
- [x] URL shareable con back/forward del browser
- [x] Detalle `/catalogo/[slug]` con masonry de vehículos compatibles
- [x] Tabla de medidas con 3 sub-tipos + llamadores + modal de versiones
- [x] `/catalogo/download` con 3 secciones + forms de captura gated
- [x] Sticky header de una sola fila + imagen de card más compacta
- [x] Tab "Tope Amortiguador" renombrado a "Suspensión"; tabla unificada
      fuelles + topes con 7 columnas (Ø Menor/Mayor Fuelle, Largo Fuelle,
      Ø Int. Tope, Largo Tope, Código, Foto)
- [x] hasFuelle/hasTope: detección por nombre + atributos no-ambiguos
      (evita que attrs de topes contaminen cols de fuelle)
- [x] Card Dirección muestra "Tipo: Mecánica / Hidráulica" desde attr "tipo"

### Portal B2B (`/cuenta/*`)
- [x] Login mock + `PortalNav` + layout con `ImpersonationBanner`
- [x] Resumen (KPIs saldo/facturas 12m/pedidos activos)
- [x] Armar pedido con 3 modos: grilla código / catálogo / Excel + preview
- [x] Mis pedidos (lista + detalle + cancelar)
- [x] Facturas con descarga PDF real del ERP (ownership validation)
- [x] Cuenta corriente con datos reales del ERP
- [x] Listas de precios (PDF/XLSX publicadas desde admin)
- [x] Perfil (datos / cambiar contraseña / visualización de precios)
- [x] Carrito con confirmación → email + persistencia Redis

### Admin (`/admin/*`)
- [x] Dashboard operativo con semáforos (5 servicios) + widgets
- [x] `/admin/banners` carousel funcional (no más stub)
- [x] `/admin/novedades` publicar/despublicar + marcar "Nuevo"
- [x] `/admin/clientes` + detalle con impersonación y cambio pw
- [x] `/admin/pedidos` + detalle con acciones inline
- [x] `/admin/listas-precios` (sube XLSX/PDF + notifica)
- [x] `/admin/catalogo-imagenes` (tréboles)
- [x] `/admin/leads` 4 tabs + export CSV por tab
- [x] `/admin/banco-imagenes` ZIP auto-generado con todas las fotos
      del catálogo + cron semanal + link público estable
- [x] **Defensa en profundidad**: route group `(protected)` con
      verificación server-side de la sesión en cada render del
      layout. Cierra el gap de prefetches/CDN del proxy edge solo.
- [x] **Analytics del catálogo**: eventos GA4 (search,
      view_search_results, select_item) + log Redis de búsquedas con
      cero resultados + `/admin/busquedas` con ranking + card en el
      dashboard. La cliente ve qué busca la gente y qué piden y no
      encuentran. Reemplaza el "historial por usuario" de la app
      vieja con tracking agregado anónimo (sin login público).

### Novedades (`/novedades`)
- [x] Auto-detección desde SpecParts + admin para publicar
- [x] Badge "NUEVO" por vehículo en aplicaciones + modal extendido

### Infra / integración
- [x] ERP Bejerman: cliente HTTP con cache JWT + re-auth 401
- [x] Rate-limit en `/api/admin/login` + sesiones Redis revocables
- [x] Stop hook para recordar docs-sync (`.claude/settings.json`)
- [x] Login B2B real (`/api/b2b/login`) — valida contra password
      override (scrypt en Redis) o default `GRIFFO+CUIT`
- [x] Cuenta corriente del portal con datos reales del ERP
      (fallback a mock si código coincide con cliente mock,
      "no disponible" si es otro)

### UX (sprint 2026-04 final)
- [x] Productos destacados: grilla compacta — entra sin scroll
- [x] Distribuidores: thead sticky con headers visibles al scrollear
- [x] Descargas: rediseño compacto en una lista única + thumbnails
      64px + recursos gated con `<details>` inline (sin modal)
- [x] WhatsApp flotante: click directo al chat (sin panel intermedio)
- [x] Tréboles: el botón se deshabilita si el archivo no existe en
      `/public/catalogo/` (antes abría lightbox vacío)
- [x] Catálogo: lightbox al click en fotos de presentación de
      productos destacados + thumbnails de tabla medidas a 64px

---

## 🟢 Completado

### Infraestructura base
- [x] Scaffold Next.js 16 + TypeScript + Tailwind 4 + pnpm
- [x] Branch `claude/rebuild-web-platform-WwmFb` conectada a Vercel
- [x] Auto-deploy en cada push
- [x] Paleta corporativa Pantone (#00549F / #00ADD0 / #005B82)
- [x] Tipografía Montserrat como alternativa libre a Gotham
- [x] Logo oficial SVG subido y conectado
- [x] Slogan "IMPULSAMOS SOLUCIONES" junto al logo en el header
- [x] `site-config.ts` como fuente única de nav/contacto/redes
- [x] `CLAUDE.md` como memoria del proyecto

### Páginas completas
- [x] `/` home con banner vectorial + TrustStrip + 3 cards destacadas
- [x] `/empresa` con todas las secciones y assets reales
- [x] `/desarrollo-a-medida` con todas las secciones + videos
- [x] `/distribuidores` con filtro por provincia + tabla ordenable +
      24 distribuidores reales del Excel
- [x] `/contacto` con form + datos + mapa de Google embebido + dirección
      clickeable
- [x] `/garantia` con intro + CTA montadora + formulario de registro
- [x] `/productos` grilla básica
- [x] `/productos/maquina-montadora-de-fuelles` completo con video
- [x] `/productos/kit-de-fuelles-universales-para-homocineticas`
      (Fuelle Universal de Transmisión + sección Presentación)
- [x] `/productos/extractor-de-juntas-homocineticas`
- [x] `/productos/pinza-para-abrazaderas`
- [x] `/productos/fuelle-universal-de-direccion` (+ kit contiene)
- [x] `/productos/kit-de-proteccion-para-suspension-deportiva`
      (Fuelle de Suspensión Deportiva + kit contiene)

### Componentes compartidos
- [x] `Header.tsx` con nav + dropdowns + estado activo + mobile
- [x] `Footer.tsx` con 3 columnas + contacto + redes
- [x] `Logo.tsx` con fallback SVG
- [x] `TrustStrip.tsx` con 4 credenciales
- [x] `BuscadorPatenteBanner.tsx` (reconstrucción vectorial del banner)
- [x] `AssetImage.tsx` con modos default/fill/bare y fallback a placeholder
- [x] `AssetVideo.tsx` con fallback a placeholder
- [x] `Newsletter.tsx` con estado idle/loading/ok/error
- [x] `ContactForm.tsx` (client)
- [x] `GarantiaForm.tsx` (client)
- [x] `WhatsappFloat.tsx` botón flotante
- [x] `BackToTop.tsx`
- [x] `YouTubeEmbed.tsx` click-to-load para mejor performance
- [x] `StructuredData.tsx` (JSON-LD Schema.org)

### SEO básico
- [x] `app/sitemap.ts` dinámico
- [x] `app/robots.ts`
- [x] JSON-LD: Organization + WebSite globales
- [x] JSON-LD: LocalBusiness en /contacto
- [x] JSON-LD: Manufacturer en /empresa
- [x] JSON-LD: Product + BreadcrumbList en /productos/[slug]
- [x] Canonical URLs por página
- [x] OpenGraph per página con imagen específica
- [x] Twitter cards con summary_large_image
- [x] robots.googleBot con max-image-preview: large

### Accesibilidad (WCAG 2.1 AA)
- [x] Skip link "Saltar al contenido principal"
- [x] `:focus-visible` con outline accent
- [x] `prefers-reduced-motion` respetado
- [x] `scroll-margin-top` para anchors con header sticky
- [x] `<main id="main-content">` como landmark

### Performance — optimización de assets
- [x] Imágenes pesadas comprimidas con sharp (~11 MB ahorrados)
- [x] `sharp` como devDependency para futuras optimizaciones
- [x] Archivo huérfano `abrazadera instalada.jpg` removido
- [x] Videos YouTube con click-to-load

### Migración — preparación
- [x] `src/lib/site-url.ts` con env var `NEXT_PUBLIC_SITE_URL`
- [x] `MIGRATION.md` con plan completo paso a paso
- [x] Datos del dominio confirmados: **NIC Argentina** + **Zoho Mail**
- [x] Acceso a Google Search Console confirmado

---

## 🟡 Pendientes — puedo hacer yo sin intervención

### SEO / Performance
- [ ] **Migrar `<img>` a `next/image` donde sea low-risk** (banner del home,
      imágenes de productos con tamaño conocido). Ganancia: WebP/AVIF
      automático, responsive srcset, blur placeholder, lazy loading,
      CLS protection.
- [ ] **Bundle analyzer** configurado para detectar código muerto.
- [ ] **Preload del LCP** del home (primera imagen visible).
- [x] **Security headers** en `next.config.ts` (X-Content-Type-Options,
      X-Frame-Options, Referrer-Policy, Permissions-Policy).
- [ ] **Image formats** AVIF + WebP en `next.config.ts`.
- [x] **PWA manifest** (`public/manifest.webmanifest`) con theme-color
      y iconos.
- [x] **Meta theme-color** en `layout.tsx`.

### Accesibilidad
- [ ] Review de contrastes `text-gray-600` sobre `bg-white` (borderline WCAG AA).
- [ ] Alt texts: auditoría completa.
- [ ] ARIA labels en botones icon-only.
- [ ] Tab order en menú mobile / dropdowns.

### UX / Mejoras
- [x] **WhatsApp contextual**: prefill del mensaje según la página.
- [x] **Mejor página 404** con sugerencias de navegación.
- [ ] **Loading states** más consistentes en los forms.
- [ ] **Error boundary** para capturar errores client-side.

### Código
- [x] `next.config.ts` con `redirects()` skeleton para la migración.
- [x] `CLAUDE.md` actualizado con toda la info de migración.
- [ ] Revisar unused imports / dead code.

---

## 🔵 Pendientes — necesitan tu intervención

### Conexión de servicios externos
- [x] **Resend** — conectado. Sender `Griffo <contacto@griffo.com.ar>`
      (dominio `griffo.com.ar` verificado en Resend desde 2026-05).
- [ ] **reCAPTCHA v3** en los forms: el sitio viejo ya tenía la key
      `6Lcms9MrAAAAAKHK-bI1K_u2Coqp9oEAve3vrpRR`. Podemos reutilizarla
      o generar una nueva desde tu cuenta de Google.
- [x] **Google Analytics 4** — conectado con `G-FR8KN76LQ2`.
- [ ] **Google Search Console**: verificar dominio actual (preview) y
      `griffo.com.ar` después del switch.

### ERP Bejerman (Portal B2B)
- [ ] **Credenciales del usuario API** reales del técnico (las del
      PDF devuelven 401). Mail borrador en
      `reference/bejerman/mail-al-proveedor.md`.
- [ ] **Abrir endpoint `POST /ERP/order`** para nuestro usuario API —
      hoy el pedido se guarda en Redis pero no se envía al ERP.
- [ ] **HTTPS en el ERP** — hoy corre sobre HTTP plano.

### Firebase Auth (Portal B2B)
- [ ] Crear proyecto nuevo dedicado (no reusar `griffo-app`).
- [ ] Habilitar Email/Password en Authentication.
- [ ] Cargar en Vercel: `NEXT_PUBLIC_FIREBASE_*` +
      `FIREBASE_ADMIN_CREDENTIALS`.
- [ ] Swap `useMockSession` por Firebase Auth (misma API pública).

### Assets faltantes
- [ ] Imagen `PinzaParaAbrazadera.webp` (producto Pinza)
- [ ] Imagen `FuelleUniversalDireccion.webp` (kit contiene del Fuelle Dirección)
- [ ] Imagen `FuelledeSuspensionDeportiva2.webp` (kit contiene Suspensión)
- [ ] Imágenes de presentación del Fuelle Transmisión
      (`presentation/fuelle-chico-universal.png`,
       `presentation/fuelle-universal-grande.jpg`,
       `presentation/kit2.png`,
       `presentation/kit6.png`)
- [ ] Video `comercio-exterior.mp4` comprimido (hoy son 9.3 MB; con
      HandBrake o similar debería quedar en 2-3 MB para 720p h264)

### Contenido
- [x] `/novedades` auto-alimentado desde SpecParts + admin para publicar.
- [x] `/catalogo/download` con 3 secciones + forms de captura.
- [ ] Verificar que las 7 filas del Excel de distribuidores que se
      reasignaron heurísticamente a Tucumán sean correctas
- [ ] **Testimonios reales** de clientes (nombre + empresa + foto + frase)
      para sumar prueba social en el home

### Decisiones de negocio
- [ ] **Gotham**: ¿vale la pena comprar la licencia? ($$$). Mientras
      tanto va Montserrat.
- [x] ~~Login / cuenta corriente / facturas~~ — resuelto, Portal B2B
      construido.

---

## 🟣 Migración a `www.griffo.com.ar`

### Preparación (antes del switch)
- [x] Confirmar registrador del dominio: **NIC Argentina**
- [x] Confirmar proveedor de email: **Zoho Mail** (⚠️ MX + SPF + DKIM
      + DMARC en DNS — no tocar al cambiar los A/CNAME)
- [x] Confirmar acceso a Google Search Console
- [ ] **Inventariar URLs del sitio viejo**: exportar desde Google Search
      Console (Informe de cobertura → Páginas → Exportar)
- [ ] **Comparar URLs del viejo vs. nuevo** y armar el mapa de redirects 301
- [ ] **Backup del sitio viejo completo** (código + base de datos + archivos)
- [ ] **Revisar registros DNS actuales** en NIC Argentina:
  - Anotar los MX de Zoho (no tocar)
  - Anotar TXT de verificación (SPF, DKIM, DMARC — no tocar)
  - Anotar subdominios activos
- [ ] **Configurar redirects 301** en `next.config.ts` con el mapa
- [ ] **Crear env var `NEXT_PUBLIC_SITE_URL`** en Vercel (Production scope)
      con valor `https://www.griffo.com.ar` (sin aplicar todavía —
      aplicar el día del switch)

### Día del switch
- [ ] Agregar `griffo.com.ar` y `www.griffo.com.ar` en Vercel
      (Settings → Domains)
- [ ] Cambiar registros DNS en NIC Argentina:
  - [ ] Registro `A` del apex `griffo.com.ar` → IP de Vercel
  - [ ] Registro `CNAME` de `www` → `cname.vercel-dns.com`
  - [ ] ⚠️ **NO tocar** los MX de Zoho
  - [ ] ⚠️ **NO tocar** los TXT de SPF/DKIM/DMARC de Zoho
- [ ] Esperar propagación DNS (1-24 horas, verificar con `whatsmydns.net`)
- [ ] Verificar SSL activo (Vercel lo emite automáticamente)
- [ ] Verificar que email de Zoho sigue funcionando (test enviar + recibir)
- [ ] Verificar que todos los redirects 301 funcionen
- [ ] Aplicar env var `NEXT_PUBLIC_SITE_URL` → Production y redeploy

### Post-switch (primeras 48 hs)
- [ ] Agregar propiedad `https://www.griffo.com.ar` en Google Search
      Console
- [ ] Enviar sitemap: `https://www.griffo.com.ar/sitemap.xml`
- [ ] Agregar en Bing Webmaster Tools (importar desde GSC)
- [ ] Actualizar URL en redes sociales: Facebook, YouTube
- [ ] Actualizar enlaces en Mercado Libre

### Monitoreo (primeras 4 semanas)
- [ ] Revisar errores de crawl en Search Console cada 3 días
- [ ] Agregar redirects nuevos si aparecen 404s
- [ ] Monitorear caída de tráfico orgánico (meta: <10% caída temporal,
      recuperación en 2-4 semanas)
- [ ] Core Web Vitals en el dominio real (PageSpeed Insights)

### Rollback (plan B)
- [ ] Revertir DNS al server viejo si algo crítico sale mal
- [ ] Mantener el sitio viejo funcionando por 1-2 meses como respaldo

---

## 📊 Métricas objetivo (después del switch)

Estos son los números a los que apuntamos al estar en producción:

- **Lighthouse Performance**: ≥ 90
- **Lighthouse Accessibility**: ≥ 95
- **Lighthouse Best Practices**: ≥ 95
- **Lighthouse SEO**: 100
- **LCP** (Largest Contentful Paint): < 2.5s
- **CLS** (Cumulative Layout Shift): < 0.1
- **INP** (Interaction to Next Paint): < 200ms
- **First Load JS**: < 200 KB por ruta
- **Tráfico orgánico**: no caer más del 10% en las 2 primeras semanas,
  recuperación completa en 4 semanas
