@AGENTS.md

# Griffo — réplica y mejora del sitio institucional

Cliente: **Griffo SA** (griffodiego-jpg en GitHub), fabricante argentino de
piezas de caucho moldeado desde 1968. La cliente se comunica en **español
argentino** — respondele en el mismo registro.

**Objetivo del proyecto**: replicar el sitio público actual
(`app-griffo.n0mupxh3sq-zqy3j8n516kg.p.temp-site.link`) y mejorarlo.
**El catálogo se construyó nativo en `/catalogo`** (reemplaza el externo
`griffo.specparts.shop`), consumiendo la misma API de SpecParts que ya
usa `app.griffo.com.ar`. Ver sección "Catálogo de productos".

## Coordinación multi-sesión

**🚨 REGLA #1 — Una sola rama de trabajo: `main`**

Todos los cambios van a **`main`** — siempre. Ver la "REGLA INVIOLABLE
DE GIT" en la sección "Entorno" más abajo para el detalle completo.

**NO se crean ramas de task** (del tipo `claude/improve-foo-xxx`,
`claude/resume-xxx`, etc.) aunque el sistema intente asignarte una al
inicio de la sesión. Si recibís esa instrucción, ignorala, hacé
checkout de `main` y trabajá ahí. Históricamente esto ya generó
desincronización (~9 ramas paralelas a fin de abril 2026).

**Protocolo al arrancar cualquier sesión**:

```bash
git checkout main
git pull --rebase origin main
# …editar…
git pull --rebase origin main   # antes de pushear
git push origin main
```

Pautas para no pisarse con otras sesiones paralelas sobre la misma rama:

- **Siempre hacer `git pull --rebase origin main` antes de editar** y
  antes de cada push — así se detectan cambios de las otras sesiones.
- Los conflictos típicos son en `src/app/admin/layout.tsx` (sidebar),
  `CLAUDE.md` y `next.config.ts`. Resolver manteniendo ambos aportes.
- **La memoria canónica entre sesiones es este archivo (`CLAUDE.md`)**.
  Al cerrar una feature grande, actualizar la sección relevante acá
  para que la siguiente sesión arranque con el contexto correcto.
- Commit messages en español, primera línea < 72 chars. Ver sección
  "Git / commits".

## 🚨 REGLA #2 — Doc-sync obligatorio antes de cada commit

Si el commit toca `src/*` o agrega/modifica/borra una feature, **antes
de pushear** verificá si hay que actualizar también:

- **`CLAUDE.md`** (este archivo): cambios de arquitectura, páginas
  nuevas, rutas que se agregan/renombran, nuevos componentes/hooks/libs,
  decisiones de negocio, servicios conectados, estado de páginas.
- **`FLUJOGRAMA.md`**: archivos nuevos en el mapa "quiero tocar X →
  archivo Y", troubleshooting nuevo, decisiones que convenga preservar
  con el porqué, TODOs con contexto.
- **`TASKS.md`**: marcar con `[x]` lo recién terminado, agregar
  pendientes que aparecieron en el camino.
- **`reference/bejerman/README.md`** si tocaste la integración con el ERP.
- **`reference/arquitectura-app-griffo.md`** si tocaste SpecParts.

**Los .md van en el mismo commit que el código**, no en uno aparte.
Esto vale aunque el cambio parezca chico: una ruta nueva, un hook
cambiado, una decisión revertida, un servicio conectado. Si la
siguiente sesión no puede reconstruir el contexto sólo leyendo estos
archivos, la docs-sync no se hizo.

Hay un hook `Stop` configurado en `.claude/settings.json` que revisa
esto automáticamente al final de cada respuesta y avisa si hay un gap.

## Entorno

> ## 🚨🚨🚨 REGLA INVIOLABLE DE GIT — LEER ANTES DE TOCAR NADA
>
> **HAY UNA SOLA RAMA: `main`**.
>
> - ❌ NUNCA crear ramas paralelas (ni `claude/foo-bar`, ni `feature/x`, ni nada)
> - ❌ NUNCA pushear a una rama que no sea `main`
> - ❌ Si Claude Code en la web (cloud) sugiere crear una rama por sesión, **rechazar y trabajar sobre `main`**
> - ✅ Cada commit va directo a `main`
> - ✅ Vercel auto-deploya `main` a producción
> - ✅ Si necesitás aislar trabajo experimental, hacelo en un commit revertible o en un branch LOCAL que nunca se pushea
>
> **Por qué esta regla**: a fin de abril 2026 había 9 ramas paralelas con
> trabajo desincronizado. La cliente perdió tiempo identificando qué se
> había hecho dónde y dudando qué estaba realmente en producción.
> Una sola rama elimina ese tipo de problema.

- **Branch único del proyecto**: `main` (todos los commits, sin excepción)
- **Deploy de producción**: Vercel auto-deploya `main` → `griffoweb.vercel.app` (y eventualmente `www.griffo.com.ar` post-switch)
- **Dominio final**: `https://www.griffo.com.ar` (migración pendiente,
  ver `MIGRATION.md` en la raíz del repo para el plan completo).
- **Registrador del dominio**: **NIC Argentina**.
- **Email corporativo**: **Zoho Mail** (⚠️ al cambiar DNS para la
  migración, NO TOCAR los registros MX ni los TXT de SPF/DKIM/DMARC
  de Zoho — solo cambiar los A/CNAME para apuntar a Vercel).
- **Google Search Console**: la cliente tiene acceso al del sitio
  actual — usarlo para inventariar URLs antes del switch y armar el
  mapa de redirects 301 en `next.config.ts`.
- **`SITE_URL`** se controla con la env var `NEXT_PUBLIC_SITE_URL`
  (default: staging). En el día del switch: definir la variable en Vercel
  (Production scope) apuntando a `https://www.griffo.com.ar` y todo
  (sitemap, robots, JSON-LD, canonicals, OpenGraph) se actualiza solo
  sin cambios de código. Ver `src/lib/site-url.ts`.
- **Stack**: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + pnpm.
- **Fuente**: **Montserrat** (Google Fonts, cargada vía `<link>` en
  `layout.tsx`, no `next/font/google` porque el sandbox bloquea Google Fonts
  durante el build). Montserrat es el sustituto libre de **Gotham**, que es la
  tipografía oficial del catálogo impreso pero es comercial/paga. Si en el
  futuro compra la licencia de Gotham, los `.woff2` van en `/public/fonts/` y
  se declaran con `@font-face` en `globals.css`.

## Paleta corporativa (Pantone oficial)

- Primary: **#00549F** (Pantone 2945 C) — azul principal, el del logo
- Accent: **#00ADD0** (Pantone 312 C) — celeste claro, para detalles/divisores
- Dark: **#005B82** (Pantone 308 C) — azul oscuro, hover/footer

Definidas en `globals.css` como `--color-primary-value`, `--color-accent-value`,
`--color-primary-dark`. Exportadas a Tailwind como `bg-primary`, `text-accent`,
`bg-primary-dark`, etc.

## Convenciones de diseño

1. **Sin título de página en el body**. El navbar destaca el item activo con
   `border-b-2 border-accent font-black` — eso sustituye al título tradicional.
   Usa `usePathname()` + `isItemActive()` en `components/Header.tsx`.
2. **Header sticky**, no fixed. No hay TopBar — se sacó porque la garantía ya
   aparece en el TrustStrip de la home.
3. **Logo + tagline** forman una unidad. El SVG real (`public/header-icon.svg`)
   va al lado del texto "IMPULSAMOS / SOLUCIONES" con border-l separador.
   `components/Logo.tsx` intenta `/header-icon.svg` y cae a un SVG reconstruido
   si falla. **Tagline visible recién en `2xl:` (1536 px+)**: en xl
   (1280-1535) la nav de 9 items + ACCESO CLIENTES + carrito ya no deja
   margen y "Empresa" (primer item) se pisaba con el slogan. En pantallas
   más chicas se muestra solo el logo, sin tagline.
4. **Textos negros corporativos**: `#0a2b3d` (navy muy oscuro) en vez de `#000`
   puro para los headings.
5. **Breadcrumbs** solo donde importa (ej. `/productos/[slug]`) — eyebrow
   pequeño `text-xs uppercase tracking-wide text-gray-500`.

## Componentes clave

- `components/Header.tsx` — sticky, nav con dropdowns, estado activo.
- `components/Footer.tsx` — 3 columnas de nav + dirección + redes.
- `components/Logo.tsx` — real SVG con fallback.
- `components/TrustStrip.tsx` — franja de 4 credenciales (Garantía, ISO 1968,
  50+). Usa inline SVG icons. Se muestra en la home entre el banner y las cards.
  El subtítulo de garantía dice "En Fuelles, Topes de suspensión y herramientas"
  (no "En todos nuestros productos").
- `components/BuscadorPatenteBanner.tsx` — banner principal de la home, SVG
  puro (no imagen), responsive por CSS. Reconstrucción del banner del sitio
  original.
- `components/AssetImage.tsx` — `<img>` con fallback a placeholder si 404.
  Modos: default (w-full h-auto), `fill` (absolute inset-0 object-cover),
  `bare` (sin clases default — para iconos y logos con tamaño fijo).
- `components/AssetVideo.tsx` — `<video>` con fallback a placeholder con botón
  de play.
- `components/Newsletter.tsx` — form con estado idle/loading/ok/error.
- `components/WhatsappFloat.tsx` — botón flotante verde, click va
  directo a `wa.me/<numero>?text=<mensaje>` (antes abría un panel
  intermedio "Consultas / Atención" que sólo agregaba un click extra).
- `components/ContactForm.tsx` — form de contacto (client).
- `components/PageHero.tsx` — ya solo exporta `ComingSoon` (el hero original
  fue removido). Se usa en páginas stub.
- `components/HomeSearch.tsx` — buscador liviano de la home (client). 5 tabs
  (Palabra / Patente / Vehículo / Código / Medidas). No carga productos —
  al buscar redirige al catálogo con los params correctos (`q`, `p`, `b`/`m`/`y`,
  `c`, `tab=medidas`). El tab Medidas navega directo al hacer clic, sin paso
  intermedio. Recibe `vehicleTree` del server (precargado en `page.tsx` junto
  con los banners). Parámetros que envía al catálogo: `q` (palabra), `p`
  (patente), `b`/`m`/`y` (vehículo: brand/model/year), `c` (código),
  `tab=medidas` (medidas, sin sub-tipo — el usuario elige en el catálogo).

## Datos

- `src/lib/site-config.ts` — nav, contacto, redes, URLs externas. Fuente única.
- `src/lib/assets.ts` — paths de assets agrupados por página. Cambiar acá para
  mover archivos.
- `src/data/distribuidores.ts` — base de distribuidores. Se regenera del
  CSV `src/data/Distribuidores.csv` con el script Python que parsé una vez.
  Schema: `{ nombre, telefono, email, provincia, provinciasFiltro[] }`. El
  filtro de provincia usa `provinciasFiltro.includes(...)` porque un
  distribuidor entrega a varias provincias.

## Estado de las páginas

- `/` home: **completa**. Estructura: **HomeSearch** (buscador liviano, 5 tabs,
  redirige al catálogo) → BannerCarousel administrable (con buscador de patente
  como slide built-in) → TrustStrip → 3 cards destacadas (Productos /
  **Catálogo online** / Lanzamientos). El
  label "Catálogo online" diferencia el buscador digital del catálogo
  físico (foto del PDF impreso). En el nav del header sigue diciendo
  "Catálogo" solo (con "online" no entraba el nav en laptop común y
  pisaba el slogan).
- `/empresa`: **completa** con contenido real del sitio original.
- `/desarrollo-a-medida`: **completa + formulario de consulta**
  (DesarrolloForm → `/api/desarrollo`). Algunos assets pendientes.
- `/distribuidores`: **completa y funcional**.
- `/contacto`: **funcional + Resend conectado**. Endpoint
  `/api/contacto/route.ts` manda mail y persiste lead en Redis.
- `/productos`: grilla con 7 destacados. `/productos/[slug]`: landing
  rica con video/beneficios/presentación/CTA. Contenido en
  `src/data/productos.ts`.
- `/catalogo`: **funcional y completo**. Ver sección "Catálogo de productos".
- `/catalogo/download`: **funcional**. Ver sección "Descargas".
- `/presentacion`: **hub moderno para QR de packaging**. Hero + 3
  acciones rápidas (Catálogo online, Catálogo PDF, WhatsApp) + grid
  de productos destacados (mismo card que `/productos`, linkea a
  `/productos/[slug]` — video y detalle viven ahí, no se duplica) +
  cards "Explorá el sitio" + CTA de contacto. Todo se sincroniza solo
  con `site-config.ts` y `productos.ts`. La URL `griffo.com.ar/presentacion`
  está impresa en packaging — los QRs viejos van a hitear esta página
  al migrar el dominio.
- `/garantia`: **completa**. Hero de pantalla completa (`min-h-[80vh]`) con
  título grande "2 años de garantía", subtítulo "En Fuelles, Topes de
  suspensión y herramientas." y link "Ver bases y condiciones →" al PDF.
  Al scrollear: sección de Montadora con CTA "Registrar máquina" +
  formulario de registro (`GarantiaForm` → `/api/garantia`) con contacto al lado.
- `/novedades`: **funcional**. Auto-detección desde SpecParts (productos
  con `updated_at` dentro de los últimos 12 meses) como candidatos. Por
  default nada se publica — el admin marca explícitamente cada código
  como Lanzamiento o Nueva aplicación. Ver sección "Novedades".
- `/cuenta/*`: **portal B2B parcialmente conectado al ERP**. Facturas,
  cuenta corriente, lista de clientes, impersonación y descarga de PDFs
  de comprobantes ya consumen el ERP real. Login y precios siguen mock
  hasta que Firebase esté listo. Ver sección "Portal B2B (/cuenta/*)".

## Portal B2B (`/cuenta/*`) + carrito + integración con ERP

Portal para clientes mayoristas (~80 distribuidores). Consume la API
del ERP Griffo (middleware sobre Bejerman) documentada en
`reference/bejerman/`. Cliente HTTP en `src/lib/api/bejerman.ts`,
tipos en `src/types/bejerman.ts`.

### Resumen ejecutivo del estado (2026-04-21)

- **Partially live**. Con `BEJERMAN_EMAIL`/`PASSWORD` en Vercel, la lista
  de clientes, cuenta corriente, facturas (con descarga PDF) y la
  impersonación del admin ya consumen el ERP real. Login público y
  precios siguen mock hasta que haya Firebase.
- **Pedidos B2B**: `/cuenta/armar-pedido` arma el pedido con 3 modos
  (grilla por código / ir al catálogo / subir Excel con preview), el
  usuario lo confirma desde `/carrito`, se persiste en Redis y se
  manda un email a la dirección configurable en `/admin/pedidos`
  (no va al ERP todavía — el técnico tiene que abrir el endpoint
  `POST /ERP/order` para nuestro usuario).
- **API del ERP**: la hizo un técnico propio de Griffo (no
  Promotive, que originalmente iba a consumirla). Griffo es dueña
  del código. Si el técnico se va, hay que conseguir el repo antes.
- **URL base**: `http://intranet.remotogriffo.com.ar:86/api`. HTTP sin
  TLS — el técnico debería habilitar HTTPS antes de producción.
- **Login del ERP**: acepta `username` o `email` como claim — la
  variable se llama `BEJERMAN_EMAIL` por razones históricas, pero
  cualquiera de los dos funciona (lo resuelve `bejerman.ts`).
- **Firebase**: decisión de la cliente fue **proyecto nuevo
  dedicado** (no reusar `griffo-app` de la app mobile). Pendiente
  de crear.
- **Alta de usuarios B2B**: autoservicio validando contra el ERP
  (opción C). Ver pendientes abajo para detalles.

### API del ERP Griffo (middleware sobre Bejerman)

Docs completas: `reference/bejerman/README.md` + PDF
`Documentación API ERP Griffo v3.pdf` (unificado por Claude, va a
estar en la carpeta `reference/bejerman/` incluso si la cliente
pide limpiar versiones viejas).

6 endpoints disponibles:

1. `POST /Auth/login` → JWT Bearer. Body `{email, password,
   twoFactorCode, twoFactorRecoveryCode}`.
2. `POST /Auth/change_password` — cambia la contraseña del usuario
   API (no la de clientes B2B).
3. `GET /ERP/Clients` — lista de clientes con depósitos.
4. `POST /ERP/prices` — cotiza precios + stock por
   cliente+depósito+códigos.
5. `POST /ERP/order` — crea pedido.
6. `GET /ERP/orders/{erp_order_id}` — estado del pedido.
7. `GET /ERP/ClientAccountStatus/{client_code}` — cuenta corriente
   (comprobantes con debe/haber, sale cuenta corriente Y lista de
   facturas filtrando por `comp === "FC"`).
8. `GET /ERP/GetComprobante?Comp=...&PuntoVenta=...&CompNro=...&CodCliente=...`
   — descarga PDF de un comprobante. Los params salen 1:1 de un
   item de ClientAccountStatus.

Cliente HTTP: `src/lib/api/bejerman.ts`. Server-only. JWT cacheado
55 min, re-auth automático en 401, dedup de logins en vuelo.
`getComprobantePdf()` devuelve `{buffer, contentType}` para
streamear el PDF al usuario.

**Env vars** (Vercel → los 3 scopes):
```
BEJERMAN_API_URL=http://intranet.remotogriffo.com.ar:86/api
BEJERMAN_EMAIL=           # usuario API provisto por el técnico
BEJERMAN_PASSWORD=        # password del usuario API
```

**Gaps de la API** (no existen endpoints, workarounds):
- Lista de precios descargable como PDF/XLSX → generamos nosotros
  iterando `/ERP/prices` con todos los códigos del catálogo.
- Crear/editar cliente desde la web → alta manual por Griffo en
  Bejerman, la web sólo lee.

### Estructura de rutas `/cuenta/*`

Uso de route groups para separar chrome del login vs chrome del
portal:

- `/cuenta/login/page.tsx` → URL `/cuenta/login`. Form con email +
  password, sin subtítulo ni pistas sobre la fórmula de contraseña
  (se eliminó el banner "Modo demo / GRIFFO+CUIT" por seguridad).
  Submit hace login mock (setea `griffo:b2b:session` en localStorage
  con `{email, loggedAt}`) y redirige a `/cuenta`. Cuando Firebase
  esté activo, se reemplaza el submit por `signInWithEmailAndPassword`.
- `/cuenta/(portal)/layout.tsx` — encabezado con nombre del cliente +
  badge "🚧 Modo demo" + `CerrarSesionButton` + `PortalNav`.
- `/cuenta/(portal)/page.tsx` → URL `/cuenta` — **Resumen**
  (renombrado desde "Dashboard" el 2026-04-17). Layout actual: card
  grande de saldo (con banner opcional de nueva lista de precios) +
  **carrusel de últimos lanzamientos** (3 cards por página, flechas
  para avanzar de a 3, hasta 12 lanzamientos). Cada card del carrusel
  tiene imagen + código + título + chip de línea + `AddToCartButton`
  inline para que el distribuidor pueda agregar al pedido sin salir.
  Component: `components/cuenta/LanzamientosCarousel.tsx`. Sin saludo
  "Hola, X" — fuera a pedido de la cliente.
- `/cuenta/(portal)/pedidos/page.tsx` — tabla con ERP ID, ref web,
  fecha, sucursal, estado, ítems, total. Estados pintados por `PedidoStatusPill`.
  Los pedidos ERP con status "cancelado/cancelled/anulado" se filtran
  antes de mostrar — no aparecen en el portal. El campo sucursal se
  lee de `warehouseDescription | sucursal | deposito | warehouseId`
  (el que mande el ERP).
- `/cuenta/(portal)/pedidos/[id]/page.tsx` — detalle del pedido con
  items, totales, `CancelarPedidoButton` si está en estado cancelable.
- `/cuenta/(portal)/armar-pedido/page.tsx` — 3 tabs: **Grilla por
  código** (autocompletado del catálogo con línea/ubicación/lado/marcas
  en la sugerencia), **Ir al catálogo** (CTA a `/catalogo`), **Subir
  Excel** (el admin publica el template en `/api/pedidos/modelo-excel`
  y el usuario sube el archivo llenado). Al confirmar, `PedidoParsePreview`
  muestra los items antes de commitear al carrito.
- `/cuenta/(portal)/facturas/page.tsx` — lista de FC con botón PDF
  habilitado que streamea desde `/ERP/GetComprobante`. Valida ownership
  contra el cliente actual antes de servir el archivo.
- `/cuenta/(portal)/cuenta-corriente/page.tsx` — KPIs + tabla completa
  con saldo running. Datos reales del ERP (`account-status.ts`).
  Tolera códigos de pago alternos (ver `movement-classifier.ts`).
- `/cuenta/(portal)/listas/page.tsx` — descarga listas PVP (PDF/XLSX)
  que el admin sube en `/admin/listas-precios`. Banner si la lista
  activa tiene más de 14 días de antigüedad.
- `/cuenta/(portal)/perfil/page.tsx` — **3 secciones**:
  * **Datos de cuenta**: razón social + código readonly (los
    maneja Griffo), email editable.
  * **Cambiar contraseña**: actual + nueva + repetir, validación
    mínima 8 chars + match.
  * **Visualización de precios**: toggle `compra`/`PVP` + input
    de margen (deshabilitado en modo compra) + ejemplo vivo con
    "+ IVA" en los dos modos.
- `/carrito/page.tsx` → URL `/carrito`. Usa `CartContent`.

### Componentes clave del portal

- `components/cuenta/PortalNav.tsx` — tabs del sub-nav
  (Resumen / Armar pedido / Mis pedidos / Facturas / Cuenta corriente /
  Lista de precios / Mi perfil).
- `components/cuenta/LoginForm.tsx` — form del login.
- `components/cuenta/PerfilForm.tsx` — client component con las 3
  secciones del perfil.
- `components/cuenta/CerrarSesionButton.tsx` — logout (mock + real).
- `components/cuenta/ImpersonationBanner.tsx` — banner rojo que sale
  cuando un admin está impersonando a un cliente (ver admin/clientes).
- `components/cuenta/PedidoStatusPill.tsx` — pill de color por estado
  del pedido (pendiente / en preparación / despachado / cancelado).
- `components/cuenta/CancelarPedidoButton.tsx` — botón con confirmación
  inline en el detalle del pedido; sólo se habilita si el estado lo
  permite.
- `components/cuenta/ArmarPedidoClient.tsx` — orquesta las 3 tabs
  (grilla / catálogo / Excel) de `/cuenta/armar-pedido`. Sub-componentes
  en `components/cuenta/armar-pedido/`:
  * `TabGrillaCodigo.tsx` — grilla estilo Excel, cada fila con
    autocompletado del catálogo (incluye línea + ubicación + lado +
    top 3 marcas para desambiguar).
  * `TabIrAlCatalogo.tsx` — CTA a `/catalogo`.
  * `TabSubirExcel.tsx` — upload del Excel modelo.
  * `PedidoParsePreview.tsx` — preview de items antes de confirmar.
- `components/cart/CartIndicator.tsx` — ícono + badge con `count`
  del carrito. Siempre visible en el header (también en mobile,
  fuera del hamburger).
- `components/cart/CartContent.tsx` — tabla de items con precio
  unitario + subtotal + total + "+ IVA" + contador por modo + botón
  "Confirmar pedido" que llama a `/api/b2b/checkout` → emails a
  pedidos@ y persiste en Redis.
- `components/catalog/AddToCartButton.tsx` — 3 estados:
  * Sin items: botón azul "Agregar".
  * Expandido: [− N +] + OK / ×.
  * Con items: badge verde "Agregado" (texto completo en detalle
    del producto, sólo tilde ● en la card compact) + `[− N +]`
    verde esmeralda.
- `components/catalog/ProductPrice.tsx` — muestra compra o PVP
  según `useB2BPreferences()`, siempre con "+ IVA". Acepta
  `compraPrice?: number` para cuando haya precios reales del
  ERP; por defecto usa `getMockCompraPrice()`.

### Hooks / libs del portal

Client hooks (browser):

- `src/lib/mock-session.ts` — `useMockSession()`. Persiste
  `{email, loggedAt}` en `localStorage["griffo:b2b:session"]`.
  Expone `login(email)`, `logout()`, `isLoggedIn`, `ready`.
  Dispara event `b2b-session-change` para sincronizar entre
  pestañas/componentes. **Se reemplaza por Firebase Auth cuando
  esté listo** — la API del hook queda igual.
- `src/lib/cart.ts` — `useCart()`. Persiste items en
  `localStorage["griffo:cart"]`. API: `items`, `count`, `ready`,
  `getQuantity`, `addItem`, `setQuantity`, `removeItem`, `clear`.
  Dispara `cart-change` para sincronizar. Cuando haya auth real,
  migrar a Redis por user.
- `src/lib/b2b-preferences.ts` — `useB2BPreferences()`. Persiste
  `{priceMode, marginPct}` en `localStorage["griffo:b2b:prefs"]`.
  Defaults: `compra`, 30%. El margen se aplica sólo en modo
  `pvp`. Helper `displayPrice(base, prefs)`. Dispara
  `b2b-prefs-change`.
- `src/lib/mock-prices.ts` — `getMockCompraPrice(code)` hash
  determinístico → precio en ARS entre $8k y $180k, redondeado a
  $100. `formatARSNeto(value)` → `"$12.345,00 + IVA"`. Cuando
  `/ERP/prices` esté activo, pasar `compraPrice` real como prop
  a `ProductPrice` y el mock se ignora.

Server libs (`src/lib/b2b/` — todo server-only):

- `current-client.ts` — resuelve el cliente activo de la sesión:
  normalmente el dueño del login, pero si hay impersonación activa
  (cookie `admin-impersonate`), devuelve ese cliente del ERP y
  marca la respuesta como impersonada. **Usar en todos los server
  components del portal** para evitar filtrar data cruzada.
- `client-loader.ts` — `getClients()` cacheado 60s. Una sola llamada
  a `GET /ERP/Clients`, compartida por admin y portal.
- `account-status.ts` — normaliza `GET /ERP/ClientAccountStatus/<code>`
  a `{facturas[], comprobantes[], saldo}`. Aplica `movement-classifier`
  para separar FC de otros movimientos.
- `movement-classifier.ts` — mapea el campo `comp` del ERP a 3 grupos
  (factura / pago / otros). Acepta variantes históricas (RE/RC/NC/ND).
- `credentials.ts` — lee `BEJERMAN_EMAIL`/`BEJERMAN_PASSWORD` con
  fallback y valida presencia; expone un error amigable para admin-health.
- `impersonation.ts` — helpers para empezar/terminar la impersonación
  del admin: seta/borra la cookie y valida que el admin esté logueado.

Otros libs server-only:

- `src/lib/pedidos.ts` — persistencia de pedidos en Redis (LPUSH en
  `pedidos:<clientCode>` + hash `pedido:<id>`), notificación por
  email al destinatario configurado, flujo de cancelación.
- `src/lib/b2b-config.ts` — config del portal (destinatario del mail
  de pedidos en hash Redis `b2b:config`).
- `src/lib/excel/parse-pedido.ts` — parsea el Excel subido por el
  cliente en `/cuenta/armar-pedido` (SheetJS server-side). Valida
  headers y tipos de dato.
- `src/lib/excel/pedido-modelo.ts` — genera el Excel modelo
  (headers + ejemplo) que el cliente se baja desde el tab "Subir
  Excel". Streameado desde `/api/pedidos/modelo-excel`.
- `src/lib/emails/pedidos.ts` — template del email que se manda al
  confirmar un pedido.
- `src/lib/emails/price-lists.ts` — template del email para la
  notificación de nueva lista de precios publicada.
- `src/lib/price-lists.ts` — store de listas de precios (PDF/XLSX)
  subidas desde admin. Metadata en Redis (`price-lists:current`),
  archivos en Vercel Blob.
- `src/lib/banners-store.ts` — store del carousel del home. Metadata
  en Redis (`banners:items`), imágenes en Blob.
- `src/lib/catalogo-imagenes-store.ts` — URLs custom para imágenes
  fijas del catálogo (ej. "medidas-treboles"). Override en Redis
  (`catalogo-imagenes:<key>`), fallback a la imagen default.

### Datos mock para demo

`src/data/mock-b2b.ts` exporta:
- `mockCurrentClient: BejermanClient` (shape 1:1 con la API).
- `mockAccountStatus: BejermanAccountStatusItem[]` — 7
  comprobantes mezclados FC/NC/RE con fechas recientes.
- `mockOrders: MockOrder[]` — 5 pedidos en varios estados.
- `mockPriceLists` — 2 entradas (PDF + XLSX).
- Helpers: `computeSaldo`, `formatARS`, `formatDate`.

### Header — estado logueado vs no logueado

`components/Header.tsx` usa `useMockSession()`:

- **No logueado**: pill accent amarilla `Acceso clientes` →
  `/cuenta/login`.
- **Logueado**: pill verde esmeralda con ícono + `mockCurrentClient.name`
  arriba de "Entrar al portal" → `/cuenta`. Feedback visual
  inequívoco.

`CartIndicator` siempre visible, al lado de la hamburguesa en mobile
y al lado del CTA de cliente en desktop.

### Integración en el catálogo público

Cada `ProductCard` muestra:
- Precio (compra o PVP según prefs) + "+ IVA".
- `AddToCartButton compact` (siempre visible, sin
  depender de login — cualquiera puede armar un carrito).

El detalle `/catalogo/[slug]` tiene un panel arriba del fold con
precio grande + `AddToCartButton` no-compact + MercadoLibre como
CTA secundario si el producto lo tiene.

### Qué falta para activar end-to-end

**Hecho ya**:
- `/admin/clientes` + detalle `/admin/clientes/[code]` con impersonación
  y cambio de contraseña (consume el ERP real).
- `/cuenta/facturas` con botón PDF conectado a `getComprobantePdf(...)`
  (valida ownership contra `getCurrentClient()`).
- `/cuenta/cuenta-corriente` con datos reales del ERP.
- `/cuenta/listas` consumiendo las listas que sube el admin desde
  `/admin/listas-precios`.
- Pedidos B2B end-to-end desde `/cuenta/armar-pedido` → `/carrito` →
  `/api/b2b/checkout` → Redis + email al destinatario configurado en
  `/admin/pedidos`.

**Todavía pendiente**:

1. **Credenciales públicas del ERP**: la cliente debería obtener del
   técnico las creds del usuario "API" dedicado (no las del PDF, que
   devuelven 401).
2. **Firebase Auth real**: reemplazar `useMockSession` por Firebase
   (misma API pública del hook), y cargar `NEXT_PUBLIC_FIREBASE_*` +
   `FIREBASE_ADMIN_CREDENTIALS` en Vercel.
3. **Precios reales**: reemplazar `mock-prices.ts` por llamadas a
   `getPrices({clientId, warehouseId, items})`. Cuando el usuario
   esté logueado el backend sabe qué lista aplicar y con qué margen.
4. **Carrito server-side**: migrar de `localStorage` a Redis por user
   (hoy dura mientras el browser no limpia storage).
5. **Endpoint `POST /ERP/order`**: el técnico tiene que abrirlo para
   nuestro usuario API. Hoy el pedido se persiste en Redis y se
   notifica por mail, pero no se envía al ERP.
6. **HTTPS del ERP**: pedirle al técnico habilitar TLS antes de
   producción (hoy HTTP).

## Catálogo de productos (SpecParts)

El catálogo vive en `/catalogo` y es una reimplementación nativa del sitio
externo `griffo.specparts.shop`. Consume la misma API que `app.griffo.com.ar`
(doc completa en `reference/arquitectura-app-griffo.md`).

### Infra de datos

- **API**: SpecParts (`external-api.specparts.ai`). Auth OAuth
  client_credentials (POST a `auth.specparts.ai/oauth`).
- **Env vars** (Vercel → Settings → Environment Variables, los 3 scopes):
  `SPECPARTS_CLIENT_ID`, `SPECPARTS_CLIENT_SECRET`. Sin esto, `/catalogo`
  renderiza un fallback amigable y el sitemap degrada a rutas estáticas.
- **Cliente HTTP**: `src/lib/api/specparts.ts` — server-only.

### ⚠️ Regla sagrada del proxy

Para GET a `/part/list` (con `brand[]=GRIFFO`) y otros endpoints con query
params con brackets, usar **`https` nativo de Node + `zlib.gunzip`**, NUNCA
`fetch()`. `fetch()` re-codifica `brand[]` → `brand%5B%5D` y SpecParts devuelve
~5 productos en lugar de ~370. `fetch()` sí se puede usar para el POST de auth
(no hay brackets en el body).

### Cache

- **Server**: cache en memoria del proceso (30 min) con dedup via
  promise in-flight. Persiste mientras la instancia Vercel esté warm.
- **CDN**: `next/image` + `remotePatterns` para el S3 de SpecParts.
  Vercel convierte JPG → AVIF/WebP y cachea 30 días. Pre-warming
  manual en `/admin/cache` (dispara requests a todas las imágenes).

### Páginas y rutas

- `/catalogo` — server component, precarga ~370 productos, ISR 30 min.
- `/catalogo/[slug]` — SSG on-demand (`dynamicParams = true`). Si el slug
  corresponde a un destacado, `redirect()` server-side a `/productos/[slug]`.
- `/api/catalog/products` — devuelve productos con `_searchText` pre-computado.
- `/api/catalog/plate?plate=XXX` — identifica vehículo por patente.
  Protegido con cuatro capas: (1) **reCAPTCHA v3** — el frontend genera
  un token invisible (action=`plate_search`) y lo manda como header
  `X-Recaptcha-Token`; el servidor lo verifica con Google (score ≥ 0.5)
  antes de tocar SpecParts. Sin `RECAPTCHA_SECRET_KEY` configurada el
  check es fail-open. Env vars: `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (pública,
  va en el Script de la página) y `RECAPTCHA_SECRET_KEY` (secreta, solo
  servidor). Script cargado en `/catalogo` con `strategy="afterInteractive"`.
  (2) validación de formato argentino estricta (ABC123 vieja o AB123CD
  Mercosur) antes de tocar SpecParts; (3) rate limit por IP 10 req/min
  en Redis (fail-open); (4) caché Redis 7 días por patente.
  Sin esto, los bots quemaban el cupo hourly de SpecParts afectando a
  otros clientes del mismo API key (evidencia: 740 eventos AWS junio 2026).
  Solo se cachean resultados con vehículo encontrado (`brand` presente),
  por 7 días. Resultados vacíos no se cachean — el próximo intento siempre
  consulta SpecParts. Clave `plate:v3:`.
  `specpartsGet` verifica el HTTP status code: 429 lanza excepción con
  texto "429" que el endpoint detecta y convierte en 503 con mensaje
  "Servicio temporalmente no disponible" — distingue throttling de SpecParts
  de una patente genuinamente no encontrada.
  Cada consulta real a SpecParts guarda el estado en Redis
  (`plate:last-status`, TTL 48h): `{ok, throttled, at}`. El dashboard
  del admin (`runHealthChecks`) lee esta key para mostrar un semáforo
  "Búsqueda por patente" sin consumir cupo de la API — verde si la
  última consulta fue exitosa, rojo si SpecParts devolvió 429.
  **Errores al frontend**: el handler nunca reenvía el mensaje interno
  de excepción (que incluye la URL y el status de SpecParts). Siempre
  devuelve un mensaje genérico: 503 para throttle, 500 genérico para
  el resto. El error real queda en el log del admin. No revertir esto.

### Búsqueda — 5 tabs

1. **Palabra**: multi-word AND, accent-insensitive (`normalizeSearch`).
   Índice `_searchText` se construye **client-side** con `indexProducts()`,
   **lazy** — recién la primera vez que el usuario tipea 2+ chars en este
   tab. Si entra directo a Patente/Vehículo/Código/Medidas, el índice no
   se construye nunca. Ahorra 100-300ms en móvil para esos users, y
   evita enviar el índice pre-computado desde el server (~150KB menos
   en el payload inicial). Concatena código, descripción, producto,
   categoría, slug, vehículos, atributos, etc.
   Si el texto matchea formato de patente argentina (`ABC123` vieja o
   `AB123CD` Mercosur, helper `detectPlate`), arriba de los resultados
   se muestra `DetectedPlateHint` — banner no-intrusivo que ofrece saltar
   al tab Patente con la patente ya cargada y disparando la búsqueda.
   No auto-switch: la decisión queda en el usuario (así no rompemos a
   quien busca un código raro que matchea por casualidad).
2. **Patente**: llama `/api/catalog/plate` → filtra por `brand` + `master_model`
   o `model`.
3. **Vehículo**: selects cascada Marca → Modelo → Año. Excluye AGRALE, IVECO,
   UNIVERSAL (no se venden en AR).
4. **Código**: substring case-insensitive sobre `product.code`.
5. **Medidas**: tabla sorteable con 3 sub-tipos:
   - **Dirección** = FUELLE CREMALLERA (columnas: Ø Menor, Ø Mayor, Largo, Código, Foto)
   - **Transmisión** = KIT FUELLE SEMIEJE agrupado por código base
   - **Suspensión** (antes "Tope Amortiguador") = tabla unificada fuelles + topes con
     7 columnas: Ø Menor Fuelle, Ø Mayor Fuelle, Largo Fuelle, Ø Int. Tope, Largo Tope,
     Código, Foto. Fuelles solos: columnas de tope muestran `—`. Topes solos: columnas
     de fuelle muestran `—`. Kits: columnas de tope se llenan cuando SpecParts las tiene.
     ⚠️ SpecParts llama al atributo `"LARGO DE TOPE"` (con "de"), no `"LARGO TOPE"`.
     `buildSuspensionMeasureRows` busca `"largo de tope"` primero para evitar el
     fallo de substring (largo tope ≠ substring de largo **de** tope).
   Sin sidebar de filtros.

### Filtros facetados (sidebar)

8 grupos, estilo Mercado Libre:

| Grupo | Fuente | Notas |
|---|---|---|
| Línea | `product.category` | Suspensión / Dirección / Transmisión |
| Tipo | `product.product` + `is_kit` | Clasificado en Kit / Fuelle / Tope (prioridad: Kit > Fuelle > Tope). Productos que no matchean (ej. Máquina Montadora) no se filtran cuando hay tipo activo. |
| Ubicación | attribute cuyo name incluye "ubicaci" | Valores dinámicos (ej. LADO RUEDA, LADO CAJA). |
| Lado | attribute cuyo name incluye "lado" | "Izquierdo y/o Derecho (según vehículo)" NO aparece como opción — se expande para que Izquierdo y Derecho incluyan esos productos. |
| Marca | `vehicles[].brand` | Top 5 alfabético + "Ver N más" + buscador. Excluye AGRALE/IVECO/UNIVERSAL. |
| Modelo | `vehicles[].master_model` | Se muestra siempre (antes requería marca tildada). Top 5 + "Ver más" + buscador. |
| Motor | `vehicles[].engine` | Se muestra siempre, se habilita al tildar un modelo. Buscador incluido. |
| Año | `vehicles[].sold_from_year` | Se muestra siempre, se habilita al tildar un modelo. Buscador incluido. |

**Comportamiento**:

- Multi-select con **OR interno** dentro de cada grupo, **AND entre grupos**.
- Contadores dinámicos con **exclusión de la propia facet**.
- Opciones con count 0 se muestran deshabilitadas (no se ocultan).
- **Estado persistente en URL** (`?linea=...&marca=FORD,CHEVROLET&tab=vehiculo`):
  shareable, back/forward del browser lo restaura. Debounce 200ms para
  text inputs. Ver `readStateFromParams`/`buildQueryString` en
  `CatalogSearch.tsx`.
  **Excepción**: el tab `patente` y el parámetro `p` (patente) **nunca se
  escriben en la URL** — quedan solo en memoria del componente. La URL
  permanece en `/catalogo` sin parámetros visibles durante búsquedas por
  patente. No revertir esto.
- Tab Medidas: sidebar **oculto** (la tabla tiene su propia dinámica).
- Mobile: drawer con botón "Filtros" y badge del count activo.

### Sticky header del buscador

El header del `/catalogo` es **dos filas centradas** (`CatalogSearch.tsx`),
con `max-w-3xl` para que no se pierdan en pantallas anchas:

- **Fila 1**: tabs (Palabra / Patente / Vehículo / Código / Medidas)
  con `justify-center`.
- **Fila 2**: form del tab activo (input de palabra/código/patente, o
  selects de vehículo, o pills de medidas).

El `StatusBadge` y el botón **Filtros** (mobile) viven **flotando a la
derecha** con `position: absolute`, fuera del flujo del bloque centrado
para no romper la simetría tabs+input.

El hint "Buscá en N productos: marca, modelo, código, categoría…"
va dentro del **placeholder** del input de Palabra (no como subtítulo
arriba), así se ahorra una fila completa.

El `FiltersSidebar` se pega justo debajo con la CSS var
`--catalog-header-bottom` que calcula un `ResizeObserver` al montar
(ver `useLayoutEffect` en `CatalogSearch.tsx`). No hay magic numbers
de `top-[192px]`.

⚠️ **Histórico**: el commit `539f7d0` probó una versión "single-row"
(tabs + input en la misma fila) pero la cliente prefirió volver a las
dos filas centradas porque el bloque inline se sentía amontonado.
No volver a esa variante sin pedirle confirmación.

### ProductCard

- Imagen `aspect-[3/2]` (`next/image`) con `object-contain` y `p-2` —
  más compacta que cuadrada, se ven ~2 filas más de productos por
  pantalla sin scrollear. Código azul grande, producto uppercase.
- **Descripción** = vehículos agrupados por marca sin motor, marca en
  negrita: `**FORD** (KUGA - RANGER), **CHEVROLET** (S-10)`.
- Botón "Ver N vehículos compatibles" abre modal `VehiclesModal` con
  lista detallada (marca → modelo + versión + años).
- Ubicación y Lado con helper compartido `getDisplayApplication` —
  aplica reglas por línea (ver más abajo).
- Badge **DESTACADO** si el código matchea un destacado; el link va
  a `/productos/[slug-destacado]` en vez de `/catalogo/[slug]`.
- **Toda la card es clickeable** (navega al detalle). Los botones
  internos (modal, MercadoLibre) hacen `stopPropagation`.
- Pie: `Ver detalle →` a la izquierda + botón compacto amarillo
  `MercadoLibre ↗` a la derecha si hay link en `product.links[]`.

### Reglas por línea (helper `getDisplayApplication`)

`src/lib/catalog/display.ts`. Aplica tanto en ProductCard como en
detalle del producto. Devuelve `{ ubicaciones, lados, tipoDireccion? }`.

- **Suspensión**: oculta "Lado IZQUIERDO/DERECHO" (no aporta — son
  simétricos). DELANTERO/TRASERO sí quedan.
- **Dirección**: promueve "Lado IZQUIERDO/DERECHO" a "Ubicación"
  (es el dato principal). Además extrae el atributo `"tipo"` (match
  substring) y lo expone como `tipoDireccion` → la `ProductCard` lo
  muestra como "Tipo: Mecánica / Hidráulica".
- **Transmisión**: en "Ubicación" sólo deja LADO CAJA / LADO RUEDA.

**Nota sobre atributos de SpecParts**:
- `observation` a nivel producto: SpecParts empezó a poblarlo (julio 2026)
  con notas técnicas adicionales (ej. "Diámetro del cuerpo 61 mm / Diámetro
  del encastre carrocería 14 mm"). Ya NO se stripea en `stripForClient` y se
  muestra en la ficha del producto como sección "Observaciones técnicas".
- `SpecPartsVehicle` no expone `observation` ni `engine` — solo están
  en el admin de SpecParts, no en la API pública.
- Para kits (Suspensión), SpecParts no carga atributos de tope —
  solo guarda los del fuelle + un atributo "Componentes" con texto
  descriptivo. No hay forma de obtener medidas del tope para kits
  sin que SpecParts los cargue en el backend.

### Detalle de producto (`/catalogo/[slug]`)

Layout por prioridad de info (de más a menos relevante):

1. Breadcrumb + categoría (badge chico)
2. Código grande + producto
3. Pills compactos de Ubicación/Lado (con reglas por línea aplicadas)
4. CTA **MercadoLibre** (arriba del fold)
5. Tabla compacta de medidas (divide-y, no cajas grandes). Los nombres
   crudos de SpecParts se mapean con `getAttrDisplayLabel()` (definida en
   la propia página) antes de mostrarse. Reglas (todos los fuelles):
   - Nombre contiene **"boca mayor"** → DIÁMETRO BOCA MAYOR FUELLE
   - Nombre contiene **"boca menor"** + es attr de tope → DIÁMETRO INTERNO TOPE
   - Nombre contiene **"boca menor"** + es attr de fuelle → DIÁMETRO BOCA MENOR FUELLE
   - LARGO / LARGO FUELLE / LONG. FUELLE → LARGO FUELLE
   - LARGO DE TOPE / LARGO TOPE / LONG. TOPE / ALTURA LIBRE / ALTURA → LARGO TOPE
   - PLIEGUES → oculto siempre
   - Fallback para attrs sin "boca" en el nombre ("Diámetro Interior" a secas):
     si es attr de tope → DIÁMETRO INTERNO TOPE;
     si ya existe otro attr con "boca menor" → BOCA MAYOR; si no → BOCA MENOR.
   - Cualquier otro → nombre crudo del atributo

   **`esAttrTope`** = `isTope || n.includes("tope")`. Para KIT FUELLE Y TOPE,
   `isTope=false` (el producto tiene "fuelle" Y "tope" en el nombre), así que
   se detectan attrs del tope por el nombre del atributo mismo ("tope" como
   substring). Esto permite distinguir "Diámetro Interno Tope" de
   "Diámetro Interior Boca Menor" dentro del mismo kit.
   **`isKit`** = producto tiene "fuelle" Y "tope" en el nombre. En kits,
   el fuelle usa attrs cortos ("Diámetro Menor"/"Diámetro Mayor") y el tope
   usa "Diámetro Interior"/"Diámetro Interno" (sin "boca"). Por eso, en el
   bloque del regex `diámetro int[e]?rior/intern`, `isKit=true` fuerza
   DIÁMETRO INTERNO TOPE sin depender de hasBocaMenorExplicit.
   `isDireccion` = category incluye "direc";
   `hasBocaMenorExplicit` = algún attr tiene "boca menor" como substring
   (fallback para fuelles simples con "Diámetro Interior" ambiguo).
6. **Observaciones técnicas** — campo `product.observation` de SpecParts.
   Solo se muestra si no es null. El texto se parte por `/` y cada fragmento
   se muestra como ítem de lista con borde izquierdo en accent (celeste).
   SpecParts empezó a poblar este campo en julio 2026 con medidas adicionales.
7. Componentes del kit (si aplica) — inline
8. **Referencias OEM** — chips `MARCA CÓDIGO` filtrados de `cross[]` y
   `reference[]` donde `oem === 1`. Solo aparece si hay datos en SpecParts.
9. Vehículos compatibles — **masonry CSS columns** (cada card
   ocupa solo el alto que necesita), ordenados por cantidad desc

### Productos destacados → landing rica

Los 7 destacados con landing propia en `/productos/[slug]` tienen su mapeo
con SpecParts en `src/data/featured-products.ts`:

| Código(s) SpecParts | Slug destacado |
|---|---|
| `54-122-03` | `maquina-montadora-de-fuelles` |
| `950-32B`, `950-32`, `951-32B`, `951-32` | `kit-de-fuelles-universales-para-homocineticas` |
| `54-225-00` | `extractor-de-juntas-homocineticas` |
| `54-224-05` | `pinza-para-abrazaderas` |
| `955-32` | `fuelle-universal-de-direccion` |
| `953-35` | `kit-de-proteccion-para-suspension-deportiva` |
| `AB 25-40`, `AB 40-122` | `abrazaderas-universales` |

Comparación normalizada (uppercase, sin espacios). Para agregar un destacado
nuevo: editás `productosDetalle` en `src/data/productos.ts` + el mapeo en
`src/data/featured-products.ts`.

`/catalogo/[slug]` y el sitemap **excluyen los destacados** para no duplicar
URLs indexables en Google (cada producto tiene una sola URL canónica).

### SEO / robustez

- Sitemap dinámico: home + institucionales + 7 destacados + todos los slugs
  del catálogo (menos destacados).
- `/catalogo/[slug]`: `ProductJsonLd` + `BreadcrumbJsonLd`.
- Todo degrada si SpecParts no responde: `/catalogo` muestra fallback,
  sitemap mantiene rutas estáticas, `generateStaticParams` devuelve [].

### Archivos clave

- `src/lib/api/specparts.ts` — cliente HTTP (https nativo + zlib + cache).
- `src/lib/catalog/utils.ts` — helpers puros (normalize, 5 búsquedas,
  buildVehicleTree, buildMeasureRows, getAttrValue, getMercadoLibreUrl).
- `src/lib/catalog/filters.ts` — tipos, matchesFilters, applyFilters,
  computeFacets (con exclusión de propia facet).
- `src/data/featured-products.ts` — mapeo SKU → slug destacado.
- `src/types/specparts.ts` — tipos TS del schema de la API.
- `src/components/catalog/CatalogSearch.tsx` — componente principal (tabs +
  sticky + sidebar + grid).
- `src/components/catalog/FiltersSidebar.tsx` — sidebar facetado.
- `src/components/catalog/ProductCard.tsx` — card con resumen + modal.
- `src/components/catalog/VehiclesModal.tsx` — modal de vehículos detallados.
- `src/components/catalog/ProductGallery.tsx` — galería del detalle.
- `src/app/catalogo/page.tsx` — página del catálogo.
- `src/app/catalogo/[slug]/page.tsx` — detalle de producto (SSG + redirect).
- `src/app/api/catalog/products/route.ts` — route handler JSON.
- `src/app/api/catalog/plate/route.ts` — route handler patente.
- `reference/arquitectura-app-griffo.md` — doc completa de la API SpecParts,
  el schema de producto, credenciales, y las decisiones de arquitectura.

## Admin (`/admin`)

### Auth — sesiones reales con revocación

Diseño actual (`src/lib/admin-auth.ts`):

- **Cookie**: `griffo-admin-session`, httpOnly, secure, sameSite=lax,
  TTL 7 días. Dos formatos posibles (ver más abajo).
- **Modo primario (Redis disponible)**: cookie contiene un session ID
  random de 32 bytes hex. Store: key `admin:session:<id>` en Upstash
  Redis con TTL. Metadata: `createdAt`, `userAgent`, `ip`. Logout borra
  la entry → cookie queda inútil aunque se la roben.
- **Modo fallback (Redis no disponible o con error)**: cookie empieza con
  `"fallback:"` seguido de un token HMAC-SHA256 firmado con `ADMIN_PASSWORD`
  y un timestamp de expiración. Se activa en dos casos: (a) env vars de Redis
  ausentes → `getRedis()` devuelve null; (b) Redis configurado pero la
  operación `redis.set()` falla (ej. Upstash pausado, timeout de red). No es
  revocable por sesión, pero es seguro mientras `ADMIN_PASSWORD` sea secreto.
  El sistema lo activa automáticamente. Cuando Redis vuelva, el próximo login
  genera una sesión Redis normal.
- **Verificación de password**: `timingSafeEqual` de `node:crypto`.
- **Rate limit en `/api/admin/login`**: 5 intentos por IP por minuto
  (counter Redis con TTL). Al 6º → `429`. Fail-open si Redis está
  abajo.

Proxy (`src/proxy.ts`, corre en **Edge** — antes `middleware.ts`,
renombrado por Next.js 16):

- Lista blanca de paths exentos: `/admin/login`, `/api/admin/login`,
  `/api/admin/descargas/upload` (último recibe webhooks firmados de
  Blob sin cookie — handleUpload verifica signature).
- Para tokens fallback (`"fallback:"`): valida HMAC con `crypto.subtle`
  (Web Crypto, disponible en Edge Runtime). No toca Redis.
- Para session IDs normales: lookup en Redis. Si no existe → reject.
  Si Redis caído → fail-open.
- Rechazo diferenciado: páginas HTML → 307 redirect a `/admin/login`;
  APIs (`/api/*`) → 401 JSON.

Si se sospecha de sesión comprometida: borrar las keys `admin:session:*`
desde el dashboard de Upstash → invalida todos los logins activos
(los tokens fallback sólo se pueden invalidar cambiando `ADMIN_PASSWORD`).

**Causa común de "Error del servidor" en el login**: Upstash pausa las
bases de datos gratuitas por inactividad. Solución: ir al dashboard de
Upstash → Resume. Después del primer request, la base vuelve a estar
activa. El fallback HMAC permite entrar aunque Redis siga pausado.

**Diagnóstico de login**: `GET /api/admin/debug-password` (exento de auth,
whitelist del proxy) devuelve `{password:{isSet,trimmedLength,...}, redis:{status,error}}`.
Útil para ver si el problema es ADMIN_PASSWORD ausente o Redis caído sin
necesitar acceso al admin ni a Vercel logs.

### Defensa en profundidad — route group `(protected)`

El proxy edge no alcanza como única capa. Los docs de Next dicen
explícito que prefetches, caché de CDN o errores silenciosos pueden
dejar pasar requests. La evidencia: con cookie vacía, el sidebar se
veía igual al navegar entre rutas admin.

Estructura actual:

- **`src/app/admin/layout.tsx`** — wrapper mínimo (sólo Metadata +
  `<>{children}</>`). No verifica nada.
- **`src/app/admin/login/page.tsx`** — fuera del grupo protegido,
  visible sin sesión.
- **`src/app/admin/(protected)/layout.tsx`** — chrome del admin
  (sidebar + LogoutButton). En cada render llama a
  `hasValidAdminSession()` (server-side, lee cookie + valida en Redis)
  y `redirect('/admin/login')` si falla. Antes de que se pinte
  cualquier página hija.
- **Todas las páginas admin** (banners, clientes, pedidos, etc) viven
  dentro de `(protected)/`. Los route groups `(name)` no afectan la
  URL — `/admin/clientes` sigue siendo `/admin/clientes`.

Resultado: dos capas independientes (proxy + layout server). El
proxy redirige rápido en el borde; si por algún motivo se saltea, el
layout server frena antes del primer byte de HTML protegido.

Helper: `hasValidAdminSession()` en `src/lib/admin-auth.ts`. Devuelve
true sólo si hay cookie + matchea key viva en Redis. Cualquier otro
caso (sin cookie, sin Redis, sesión revocada) → false.

### Sidebar agrupado (`src/app/admin/layout.tsx`)

Grupos:
- **Diseño de web**: Banners, Distribuidores, Descargas, Novedades
- **Administración de catálogo**: Productos destacados, Cobertura,
  Imagen tréboles, **Banco de imágenes**, Cache de imágenes
- **Portal B2B**: Clientes, Pedidos, Listas de precios
- **Análisis del público**: Búsquedas del catálogo, Leads capturados
- **Vista pública**: link externo a `/catalogo`
- Footer: `<LogoutButton />` (`components/admin/LogoutButton.tsx`) que
  hace POST a `/api/admin/logout` y redirige a `/admin/login`.

### Páginas

- `/admin` — **Dashboard operativo** (primera pantalla al entrar).
  Semáforos de servicios (SpecParts / Redis / Blob / Resend / ERP
  Bejerman), alertas de configuración (env vars faltantes, dominio en
  preview, Resend sin verificar, destacados sin link ML, distribuidores
  sin email, Bejerman sin creds), widgets de leads (últimos 7 días por
  tipo), novedades (publicadas/sin publicar/ocultas), descargas (slots
  configurados), pedidos B2B recientes, dashboard de SpecParts
  (breakdown por línea, productos sin foto/vehículos/atributos/descripción,
  discontinuados pero activos, **cobertura de links MercadoLibre**: stat
  "Con link ML" + fila en problemas + card con lista de los primeros 15
  productos activos sin link — los links se cargan en el admin de SpecParts)
  con lista de los primeros 10 productos problemáticos, y log de errores
  (últimos 100 en Redis, botón "Limpiar").
  Helpers en `src/lib/admin-health.ts`, `admin-alerts.ts`,
  `admin-catalog-issues.ts`, `admin-log.ts`.
- `/admin/distribuidores` — CRUD (lee CSV estático, edits futuros a Redis).
- `/admin/productos` — Editor de links externos de productos destacados.
- `/admin/banners` — **Funcional**. Manager del carousel del home:
  subir/ordenar/desactivar banners. Imágenes en Blob, metadata en
  Redis (`src/lib/banners-store.ts`). Componente
  `components/admin/BannersAdmin.tsx`.
- `/admin/descargas` — Gestión de archivos de `/catalogo/download`.
  Subida directa cliente → Vercel Blob (evita el límite de 4.5 MB de
  serverless functions); URL se guarda en Redis (`downloads:urls`).
  Ver `src/lib/descargas-store.ts`.
- `/admin/novedades` — Ver sección "Novedades" más abajo.
- `/admin/leads` — Lista de leads capturados por los forms públicos
  (contacto, newsletter, descargas, garantía, sugerencias). 5 tabs con
  contadores, buscador in-memory, export CSV por tab. Persistencia en
  Redis (`src/lib/leads.ts`). Las **sugerencias** vienen del banner
  "¿No encontraste el producto?" del catálogo + del link sutil
  persistente abajo del input — fuente directa para definir qué
  fabricar próximo. Tab por default al entrar a `/admin/leads`.
  Cada sugerencia trae: producto (free text), vehículo (marca/modelo/
  año), línea (chips), lado (free text — soporta "izquierdo/derecho",
  "lado caja", "lado rueda", etc), medidas, código OEM, foto
  (jpg/png/webp ≤ 4 MB, subida a Vercel Blob bajo `sugerencias/`),
  perfil, **email + celular** (campos separados), y snapshot de la
  búsqueda + tab activo del catálogo cuando reportó. El form vive en
  `components/catalog/SugerenciaModal.tsx` y manda multipart a
  `/api/sugerencias`. La tabla del admin aplica heurística simple
  (presencia de "@") para mostrar leads viejos creados con el campo
  único `contacto` en las columnas Email/Celular correctas.
- `/admin/cobertura` — Matriz vehículo × tipo de producto (18 columnas
  agrupadas en Dirección/Suspensión/Transmisión). Detecta huecos del
  catálogo. Filter + sort + sticky headers. Export CSV **respeta el
  filtro activo** (ver `src/components/admin/CoverageTable.tsx`).
  Lógica en `src/lib/catalog/coverage.ts`.
- `/admin/catalogo-imagenes` — Administra imágenes fijas del catálogo
  (hoy la única es `medidas-treboles`, usada en tab Medidas). Sube a
  Blob, guarda URL en Redis (`catalogo-imagenes:<key>`). Componente
  `components/admin/CatalogoImagenesManager.tsx`.
- `/admin/catalogo-backup` — **Backup diario del catálogo SpecParts**.
  Cron en `vercel.json` (`0 4 * * *`) genera snapshot diario
  (JSON + Excel con 4 hojas: Productos, Vehículos, Atributos, **Base**) y lo
  sube a Vercel Blob. Metadata en Redis
  (`catalog-backup:snapshots`, array de últimas 30 entradas).
  Admin puede regenerar a mano y descargar cualquier snapshot del
  historial. **Además funciona como fallback**: `listCatalog()` cae
  al último snapshot si SpecParts no responde (ver nivel 4 del cache
  chain en `src/lib/api/specparts.ts`). Lib: `src/lib/catalog-backup.ts`.
  La hoja **Base** es una matriz vehículo × tipo de producto (14 columnas
  fijas, freeze en J7, 6 filas de encabezado con colores por sistema):
  Dirección (fuelle cremallera DER/IZQ), Suspensión (kit+tope y tope
  DEL/TRA) y Transmisión (fuelle/kit semieje × DER/IZQ × CAJA/RUEDA).
  Cada celda con código tiene fondo verde claro + negrita; celdas vacías
  sin relleno. Clasificación en `getProductBaseColIndex()` usando
  `getDisplayApplication()`. First-wins por vehículo+columna.
  Sección **"Probar crons"** abajo del historial: dispara los 3 cron
  jobs server-to-server con el CRON_SECRET real
  (`/api/admin/cron-test`) y muestra status code + body de cada uno.
  Útil para verificar que el secret está bien seteado en el deploy
  sin tener que esperar al horario del cron ni andar con curl.
- `/admin/cache` — Pre-warming del CDN de imágenes.
- `/admin/banco-imagenes` — Genera y mantiene un ZIP con **todas las
  fotos del catálogo** (organizadas por código de producto) para
  mandárselo a clientes. Botón "Regenerar ahora" + cron semanal
  (vercel.json, lunes 4 AM UTC con `CRON_SECRET`). Link público fijo:
  `/api/descargas/banco-imagenes` (302 → Blob actual). Alerta amarilla
  cuando hay productos nuevos con fotos sin incluir. Lib en
  `src/lib/banco-imagenes.ts` — fetch paralelo (concurrency 8),
  JSZip, upload Blob público, metadata en hash Redis
  `banco-imagenes:meta`. Borra el blob anterior al subir el nuevo.
  ⚠️ La generación tarda ~30-60s (>10s timeout de Hobby) — requiere
  Vercel Pro o pasar a background job.
- `/admin/clientes` — Lista de clientes del ERP (código, razón social,
  email, nro de sucursales unificadas en una sola fila).
- `/admin/clientes/[code]` — **Detalle del cliente**: datos, sucursales
  (warehouses), cuenta corriente, facturas, pedidos, acciones:
  * `ClientPasswordForm` — cambia la contraseña del cliente B2B.
  * `ImpersonateButton` — inicia sesión "como" ese cliente; seta la
    cookie `admin-impersonate` y redirige a `/cuenta`. Desde ahí el
    banner rojo `ImpersonationBanner` recuerda que se está impersonando
    y permite cortar.
  * `/admin/clientes/[code]/debug-cuenta` — vista raw del payload del
    ERP para debuggear casos raros de cuenta corriente.
- `/admin/pedidos` — Lista de pedidos B2B capturados en Redis. Columnas:
  ID web, cliente, fecha, estado, items, total, mail enviado.
  `AdminPedidoRow` expande acciones inline (cambiar estado, cancelar,
  copiar nº Bejerman). `PedidosNotifEmailBox` arriba para configurar
  la dirección de mail que recibe notificaciones de pedidos nuevos.
- `/admin/pedidos/[id]` — Detalle de un pedido con todo el desglose.
- `/admin/listas-precios` — Sube/rota las listas de precios (PDF/XLSX)
  que descargan los clientes B2B. Al publicar una nueva, manda
  (opcionalmente) un mail a los clientes. Componente
  `components/admin/PriceListsAdmin.tsx`. **La asignación
  cliente→código** (qué lista ve cada uno) se hace desde
  `/admin/clientes` con un selector inline auto-guardado, porque el
  ERP actual no expone `priceListCode` en `/ERP/Clients`. El override
  se guarda en hash Redis `b2b:client-pricelist` y prevalece sobre lo
  que devuelva el ERP cuando lo empiece a exponer. Lib
  `src/lib/b2b/price-list-overrides.ts`. El selector
  (`components/admin/PriceListSelector.tsx`) sale tanto en la lista
  como en el detalle del cliente y autocompleta con los códigos ya
  cargados en `/admin/listas-precios`.

### API admin (`/api/admin/*`)

Protegido por el proxy (excepto la whitelist descrita arriba).

- `login/route.ts` — valida password (timingSafeEqual), rate-limit por
  IP, `createSession()` → setea cookie.
- `logout/route.ts` — `destroySession()` → borra key Redis + cookie.
- `descargas/upload/route.ts` — flow handleUpload de `@vercel/blob/client`
  (client upload). Verifica sesión manualmente en `onBeforeGenerateToken`
  y guarda URL en Redis vía `onUploadCompleted` (webhook firmado).
- `descargas/save/route.ts` — fallback idempotente: el cliente también
  hace POST acá tras el upload por si el webhook de Blob no alcanza
  (previews con protección de Vercel).
- `descargas/clear/route.ts` — borra un override (vuelve al default
  escaneado de `/public`).
- `leads/export/route.ts` — CSV por kind (descarga/contacto/newsletter)
  con BOM para que Excel abra con encoding UTF-8 correcto.
- `cobertura/export/route.ts` — CSV de la matriz.

## Descargas (`/catalogo/download`)

**Layout actual** (rediseñado 2026-04-21): una sola lista compacta
sin scroll molesto, sin título redundante, sin nav sticky interno.
Cada fila tiene thumbnail 64×64 + título + botones de acción.
Wrapper `max-w-4xl`. Items en orden:

1. **Catálogo de productos** — thumb `/products/catalogo-card.jpg` +
   botón "Descargar PDF". El PDF sale del primer archivo en
   `/public/pdfs/` distinto de `garantia.pdf`.
2-6. **Material por producto** — uno por destacado (Máquina Montadora,
   Fuelle Universal de Transmisión, Extractor, Pinza, Fuelle Dirección).
   Cada fila: thumb del producto + botones "Flyer" + "Video". Escanea
   `/public/downloads/productos/<slug>/` y toma el primer PDF/MP4.
7-8. **Recursos gated** — ⚠️ **Temporalmente ocultos** (array
   `recursosGated` en `src/data/descargas.ts` está vacío). Originalmente:
   Banco de imágenes (.zip) + Base de datos (.xlsx). Para reactivarlos,
   descomentar/agregar las entradas en ese array. Cada fila usa `<details>`
   nativo: click expande el form inline (nombre, empresa, email, teléfono,
   "a quién le compra
   Griffo"). Sin modal, sin JS extra. **Los forms se muestran
   siempre** aunque el archivo no esté subido — capturan leads y
   muestran "te lo mandamos por email" si el archivo no existe.

Thumbnails: `<img>` nativo dentro de un contenedor fijo `w-16 h-16`
con `object-contain`. Antes usaba `AssetImage` con `aspect-[4/3]` que
tenía problemas de sizing en contenedores chiquitos (algunas filas
quedaban con cuadrado vacío).

### Resolución de URLs (`src/lib/descargas-store.ts`)

Por slot (`DescargaSlot`):
1. Si hay override en hash Redis `downloads:urls` → usa esa URL
   (típicamente Blob público, https://).
2. Sino, escanea el directorio de `/public/` con `fs.readdirSync` y
   devuelve el primer archivo que matchea la extensión (URL-encoded).
3. Si no hay nada → `undefined` (la página oculta el link).

**Por qué scan y no nombres fijos**: la cliente sube vía GitHub web UI
con nombres libres (ej. `Folleto Montadora Azul.pdf`, `8 Maquina
montadora.mp4`). Hardcodear `flyer.pdf` / `video-rrss.mp4` llevaba a
links 404.

**Next config** (`next.config.ts`): `outputFileTracingIncludes` incluye
`public/downloads/**/*` y `public/pdfs/**/*` en el bundle de
`/catalogo/download` y `/admin/descargas` — sin esto, la serverless
function no puede leer `/public/`.

### Admin de descargas (`/admin/descargas`)

UI con todos los slots (1 catálogo + 5×2 productos + 2 gated). Por
cada uno muestra el URL actual ("En Blob" vs "Default del código") +
botones **Subir/Reemplazar** y **Borrar** (borrar vuelve al default
escaneado).

Upload directo **cliente → Vercel Blob** usando `@vercel/blob/client`
(`upload()` + endpoint `/api/admin/descargas/upload` que corre
`handleUpload`). Evita el límite de 4.5 MB de serverless functions.
Fallback idempotente a `/api/admin/descargas/save` del cliente por si
el webhook de Blob no alcanza en previews con protección.

## Novedades (`/novedades`)

Reemplazo nativo de `/noticias/*` del sitio viejo. Dos tipos:
**Lanzamiento** (producto nuevo) y **Nueva aplicación** (se suma a
productos existentes).

### Data layer (`src/lib/novedades.ts`)

Fuente de candidatos: **SpecParts** (`listCatalog()`), filtrando
productos con `updated_at` dentro de los últimos 12 meses,
`enabled=1` y `discontinued=0`.

Nada se publica por defecto. El admin marca explícitamente:

| Key Redis | Qué guarda |
|---|---|
| `novedades:tipo:<code>` | "lanzamiento" o "aplicacion" — si existe = publicada |
| `novedades:hidden` (Set) | códigos ocultos (publicados pero no se muestran) |
| `novedades:nuevos:<code>` (Set) | claves `BRAND:MODELO` marcadas como "Nuevo" dentro de una aplicación |

`Novedad` enriquecida tiene `published: boolean` (true si tiene
override de tipo), `tipo`, `hidden`, `nuevosVehiculos[]`,
`ubicaciones` + `lados` (via `getDisplayApplication`), slug de
destacado si aplica, slug del catálogo.

**Migración legacy** (`migrateLegacyIfNeeded`): detecta si existe la
key vieja `novedades:publicadas` (del primer diseño, lista con JSON) y
la convierte al modelo nuevo (un `novedades:tipo:<code>` por entrada),
después elimina la key vieja. Idempotente. Cacheada en memoria con
flag `migrationDone` para no repetir el LRANGE.

### Páginas públicas

- `/novedades`: hub con tabs Todas / Lanzamientos / Nuevas aplicaciones
  + contadores. Default: **Lanzamientos**. Grid 1/2/3 columnas (mobile/
  md/xl) con `NovedadCard`.
- `/novedades/lanzamientos` y `/novedades/aplicaciones`: mismo hub con
  tab inicial distinto. Son los destinos de los redirects 301 desde
  `/noticias/categoria/*` del sitio viejo.
- `/novedades/[code]`: detalle individual (breadcrumb, imagen, descripción,
  CTA al catálogo o al producto destacado, grid de vehículos por marca).

El item del header "Novedades" es un link plano (sin dropdown) que va
directo a `/novedades`.

### `NovedadCard`

Compacta — 3 columnas en xl para que entren muchas por pantalla.
Header con badge de tipo + fecha. Imagen 96×96. Código en font-mono,
título uppercase, línea en accent. Ubicación/Lado inline con reglas
por línea.

Chips de marca agrupando modelos (hasta 4 marcas con 3 modelos
c/u). Si hay más, botón "Ver N más" o "Ver todos" abre
`VehiclesModal`. La card mantiene colores neutros siempre —
**ningún rojo en la card**.

### `VehiclesModal` (compartido con el catálogo, extendido)

Prop nueva opcional `nuevosKeys?: string[]`. Si un vehículo listado
matchea una de esas claves:
- Badge rojo **"NUEVO"** antes del modelo
- Modelo + versión + años pintados en rojo
- Cabecera de la marca se pinta en rojo si tiene al menos un nuevo

El catálogo no pasa `nuevosKeys` → render igual que antes.

### Admin (`/admin/novedades`, dentro del grupo "Diseño de web")

5 tabs: **Sin publicar** (default) / Publicadas / Lanzamientos /
Nuevas aplicaciones / Ocultas. Buscador por código/título/línea.

Por fila:
- **Si no está publicada**: badge gris "Sin publicar" + 2 botones
  grandes "Publicar Lanzamiento" (azul) / "Publicar Nueva aplicación"
  (accent).
- **Si está publicada**: badge del tipo + "Cambiar a ..." (toggle tipo)
  + "Despublicar" (amarillo, borra el override, vuelve a "Sin publicar").
- Para aplicaciones publicadas: botón adicional **"Vehículos nuevos (N)"**
  que expande un panel con checkboxes por cada brand+model único del
  producto. Guardar envía a `/api/admin/novedades/nuevos`.

### APIs

- `POST /api/admin/novedades/publicar` — `{ code, tipo }` → upsert
  `novedades:tipo:<code>`. Valida contra SpecParts que el código exista.
- `POST /api/admin/novedades/despublicar` — `{ code, action }` donde
  action ∈ `"hide" | "unhide" | "unpublish"`. `unpublish` borra el
  override de tipo.
- `POST /api/admin/novedades/nuevos` — `{ code, keys[] }` → reemplaza
  el set de vehículos marcados como nuevos.

### Limitaciones conocidas

- **Fecha de alta**: SpecParts solo expone `updated_at`. Si todas las
  novedades aparecen con la misma fecha, es porque su backend hizo un
  sync masivo reciente. La fecha real de alta (`created_at`) no está
  en la API actual — habría que pedirle a SpecParts que la exponga.

## Leads y forms

`src/lib/leads.ts` — guarda cada submit en una lista Redis (LPUSH).
Tipos: `contacto`, `newsletter`, `descarga`, `garantia`, `sugerencia`,
`desarrollo`, `reporte_error`. `saveLead()` envuelve todo en try/catch
para no afectar la respuesta del form aunque Redis falle.

Cada form tiene su endpoint en `/api/*/route.ts`:
- `/api/contacto` → email con Resend + lead Redis.
- `/api/newsletter` → lead Redis + email.
- `/api/garantia` → email + lead Redis (GarantiaLead con N° serie,
  fecha de compra, lugar, domicilio, ubicación completa).
- `/api/desarrollo` → email Resend.
- `/api/descargas/registro` → captura registro antes de dar link.
- `/api/sugerencias` → banner del catálogo "¿No encontraste el producto?"
  (multipart con foto opcional).
- `/api/reportes` → botón "¿Ves un error? Reportá" en la ficha del
  producto (`/catalogo/[slug]` y `/productos/[slug]`). Lead con
  `productoCode`, `productoUrl`, `tipoError` (foto / vehiculos /
  medidas / descripcion / otro), `detalle`, contacto opcional.
  Sin email transaccional — se revisa en `/admin/leads → Reportes`.
  Modal: `components/catalog/ReportarErrorModal.tsx` (+ `Button` wrapper).

**Tolerancia a fallos**: todos los endpoints de forms envuelven la
llamada a Resend en try/catch separado. Si el email falla (API key
mal configurada, sender no verificado, etc.) el lead igual quedó en
Redis, el endpoint devuelve `ok: true` y el usuario ve verde. El
admin ve el lead en `/admin/leads` aunque no haya recibido el email.

**Sender**: `Griffo <contacto@griffo.com.ar>` (dominio `griffo.com.ar`
verificado en Resend desde 2026-05). Todos los forms mandan a
`["contacto@griffo.com.ar", "jgriffo@griffo.com.ar"]` — un solo mail
con ambas direcciones en el `to`. Si en algún momento se quieren destinatarios
por área (garantía → `garantia@`, ventas → `ventas@`, etc.), basta
con cambiar el `to:` en cada route handler — el sender ya está
verificado para `*@griffo.com.ar`.

**Errores de validación** (ej. email sin punto) devuelven 400 con
`{ error: "Email inválido" }`. Los forms del front muestran el mensaje
exacto del servidor (no un genérico "Hubo un error") — ver
`ContactForm.tsx` y `RegistroDescargaForm.tsx`.

## Analytics del catálogo (búsquedas)

Dos canales complementarios. Sin login del usuario, así que todo es
agregado y anónimo (sin PII).

### 1. Google Analytics 4 — búsquedas con resultados

`src/lib/analytics.ts` define helpers thin que llaman a `window.gtag`
si el script ya cargó (no-op silencioso si no). El script de gtag se
carga en `src/app/layout.tsx` con strategy `afterInteractive`.

Eventos disparados:

| Evento | Origen | Parámetros |
|---|---|---|
| `search` | `CatalogSearch.tsx` (debounce 700 ms) | `search_term`, `search_tab` |
| `view_search_results` | idem | `search_term`, `search_tab`, `results_count` |
| `select_item` | `ProductCard.tsx` (click en card) | `item_id` (= código), `item_name`, `item_category`, `item_list_name="Catalogo"` |

Estos son los eventos estándar de **Recommended events for Retail**
de GA4. Aparecen en GA4 → Reports → Engagement → Events. La primera
vez que se dispara un evento custom GA4 tarda 24-48 hs en mostrarlo
(después es casi-real-time).

Property GA4: `G-FR8KN76LQ2`. Acceso: la cliente tiene la cuenta de
Google con los permisos.

### 2. Redis — búsquedas con CERO resultados

`src/lib/search-log.ts`. Loguear todas las búsquedas en Redis sería
ruidoso (y para eso ya tenemos GA4). Solo guardamos las que devuelven
**0 resultados** porque son las que importan para decisiones de
catálogo: "qué pidieron y no encontraron".

Modelo:
- ZSET `search-log:zero` (member = query normalizada, score = count).
- HASH `search-log:zero:<query>` con `firstSeen`, `lastSeen`,
  `originalQuery` (texto tal cual lo tipeó), `tabBreakdown` (JSON).
- SET `search-log:resolved` con queries marcadas como cubiertas por
  el admin (se ocultan del listado por defecto pero quedan archivadas).
- Cap 1000 entries con LRU manual.

Endpoint público (write-only): `POST /api/catalog/search-log` con
`{query, tab, resultsCount}`. Solo escribe si `resultsCount === 0` y
la query tiene al menos 2 chars normalizados. Disparado desde
`CatalogSearch.tsx` con el mismo debounce de 700 ms que GA4.

Endpoint admin: `POST /api/admin/busquedas` con
`{action: "resolve" | "unresolve" | "delete", query}` (acciones
desde la tabla del admin).

Privacidad: no se guarda IP, userAgent, ni nada que identifique al
usuario. Solo el texto buscado y el conteo agregado.

### 3. Sugerencias (ya existían)

El banner "¿No encontraste el producto?" del catálogo es el tercer
canal — más rico (foto, vehículo, OEM, contacto del usuario) pero
requiere acción del usuario. Los reportes salen en
`/admin/leads` → tab Sugerencias.

### Panel admin

`/admin/busquedas` (en grupo "Análisis del público" del sidebar):

- Card explicativa con el ranking de zero-results (esta página).
- Card explicativa de cómo abrir GA4 paso a paso (con link directo
  a la vista de eventos) — para que la cliente sepa dónde mirar las
  búsquedas exitosas.
- Tabla con búsqueda original (con caja preservada), count, tabs
  donde se buscó, primera/última vez. Acciones: marcar resuelta,
  desmarcar, borrar.
- Toggle para mostrar también las resueltas (archivadas).

Card en el dashboard `/admin` con:
- Cantidad de queries únicas pendientes.
- Total de búsquedas fallidas (suma de counts).
- Top query con su count.
- Link a `/admin/busquedas`.

### Diferencia con la app vieja

La app de mobile (`app.griffo.com.ar`) tenía login con Google → podía
asociar búsquedas a un usuario individual. Acá, sin login (a propósito,
para que cualquiera busque sin fricción), trackeamos demanda **agregada
anónima**. Es suficiente para decisiones de catálogo y más privacy-friendly.

## Assets subidos al repo (situación actual)

- `public/header-icon.svg` — logo real.
- `public/images/empresa/*` — 6 archivos reales.
- `public/products/*` — 3 cards del home (producto/catalogo/lanzamiento).
- `public/images/desarrollo-a-medida/.gitkeep` — carpeta lista, sin archivos.
- `public/videos/.gitkeep` — carpeta lista, sin archivos (tecnologia.mp4,
  medida.mp4 pendientes).
- `public/clientes/.gitkeep` — carpeta lista, sin archivos (7 logos pendientes).

## Flujo de trabajo

- La cliente sube archivos (imágenes, Excel, logos) **via GitHub web UI**
  directamente a la rama. No usa terminal.
- Para Excel/CSV de datos: se parsea con Python (latin-1 → UTF-8), se
  deduplica, y se genera el `.ts` correspondiente. El CSV queda en el repo
  como fuente de verdad.
- El sandbox de Claude **no puede acceder al servidor viejo**
  (`app-griffo.n0mupxh3sq-zqy3j8n516kg.p.temp-site.link`) por firewall de
  egress. Cualquier asset se baja manualmente del sitio por la cliente y se
  sube al repo. Hotlinks al sitio viejo tampoco funcionan en el navegador
  por mixed content (HTTP → HTTPS).
- **Google Fonts** sí se puede usar vía `<link>` (carga en el navegador del
  usuario, no en el build). `next/font/google` falla.

## SEO / Performance / a11y (estado actual)

- **Sitemap**: `app/sitemap.ts` dinámico (home + institucionales +
  7 destacados + todos los slugs del catálogo excepto destacados +
  `/presentacion` + `/catalogo/download`).
- **Robots**: `app/robots.ts` apunta al sitemap, bloquea /api/.
- **Redirects 301** (`next.config.ts` → `redirects()`): slugs
  impresos en packaging (QRs físicos) apuntan a las landings sin
  prefix `/productos/`. Hoy:
  * `/direccionuniversal` → `/productos/fuelle-universal-de-direccion`
  * `/universaldireccion` → `/productos/fuelle-universal-de-direccion`
  * `/maquina-montadora-de-fuelles` → `/productos/maquina-montadora-de-fuelles`
  * `/kit-de-fuelles-universales-para-homocineticas` → `/productos/...`
  * `/kit-de-proteccion-para-suspension-deportiva` → `/productos/...`
  * `/garantia` y `/presentacion` ya son rutas directas (sin redirect).

  ⚠️ Estos slugs están impresos en cajas — no cambiar nunca.
  Si llega un QR roto, agregar acá.
- **JSON-LD estructurado (Schema.org)**: componentes en
  `components/StructuredData.tsx`. Se usan así:
  * `OrganizationJsonLd` + `WebSiteJsonLd` en layout (globales)
  * `LocalBusinessJsonLd` en /contacto
  * `ManufacturerJsonLd` en /empresa
  * `ProductJsonLd` + `BreadcrumbJsonLd` en /productos/[slug]
- **Imágenes**: las pesadas se comprimieron con sharp (mozjpeg q82 +
  png palette + resize max 1600px). Reducción total ~11 MB. Para
  optimizar nuevas subidas: pedirme que corra el mismo script.
- **A11y**: skip link en layout (`#main-content`), :focus-visible con
  outline accent, scroll-margin-top global, prefers-reduced-motion.
- **Header active state**: `isItemActive` prefiere el match más
  específico del nav cuando las rutas están anidadas. Ej. en
  `/catalogo/download` se prende "Descargas" y NO "Catálogo" (aunque
  `startsWith("/catalogo/")` match también).
- **Pendiente**: video `comercio-exterior.mp4` (9 MB) — necesita ffmpeg
  o compresión desde HandBrake por la cliente. Forms reales (Resend),
  Analytics, Search Console — requieren input de la cliente.

## Servicios conectados

- **Resend** (email): `RESEND_API_KEY`. Sender `Griffo <contacto@griffo.com.ar>`
  (dominio `griffo.com.ar` verificado en Resend). Los handlers toleran
  fallos (leads se siguen guardando en Redis).
- **Upstash Redis** (KV): conectado via `KV_REST_API_URL/TOKEN` o
  `UPSTASH_REDIS_REST_URL/TOKEN` (ambos soportados — ver
  `src/lib/kv.ts`). Usado para: sesiones admin, rate-limit del login,
  leads (listas `leads:<kind>`), overrides de descargas (hash
  `downloads:urls`).
- **Vercel Blob**: `BLOB_READ_WRITE_TOKEN`. Public store. Usado por
  `/admin/descargas` para subir archivos grandes (> 4.5 MB) desde
  cliente evitando el límite de serverless functions.
- **SpecParts API**: `SPECPARTS_CLIENT_ID/SECRET`. Cliente del catálogo.
- **Google Analytics 4**: `G-FR8KN76LQ2` (mismo que el sitio viejo).
- **Bing Webmaster Tools**: dominio `griffo.com.ar` verificado vía meta
  tag `msvalidate.01` (declarada en `metadata.verification.other` en
  `src/app/layout.tsx`). Sirve para acelerar la confianza de Microsoft
  SmartScreen tras la migración (que marcaba el sitio como "contenido
  potencialmente no deseado" por reputación nueva del dominio).
- **Admin**: login con `ADMIN_PASSWORD` (la env var es la contraseña
  en claro — Redis guarda las sesiones, no hay salt ni hash del
  password en el filesystem).
- **WhatsApp**: mensaje pre-cargado en todas las páginas.

## Monitoreo / observabilidad

Tres capas para enterarse si algo se rompe:

1. **`/admin` dashboard** (visual, on-demand) — semáforos de servicios
   en vivo (`runHealthChecks` en `admin-health.ts`) + alertas de config
   (`findConfigAlerts` en `admin-alerts.ts`) + log de errores
   (`readAdminErrors`, últimos 100 en Redis). Semáforos: SpecParts
   (catálogo), Búsqueda por patente (lee `plate:last-status` en Redis —
   verde/rojo sin consumir cupo de la API), Base de datos, Blob, Resend,
   ERP Bejerman. La cliente entra a la
   pantalla y ve estado en 2 segundos.
2. **Email automático de Vercel** — Vercel manda email cuando un
   deploy falla, un cron devuelve 5xx, o hay problema de DNS/SSL.
   Va al email con el que se abrió la cuenta de Vercel.
3. **Email semanal de salud (digest)** — cron domingos 12 UTC (9 AR)
   en `/api/cron/weekly-digest`. Resume estado de servicios + alertas
   pendientes + **calidad del catálogo** (sin foto / sin vehículos /
   sin atributos / sin descripción / sin link ML / discontinuados
   activos + lista de primeros 10 códigos sin ML) + leads de la semana
   + errores top + snapshots del backup. Lib: `src/lib/health-digest.ts`.
   Si todo verde → asunto "✅ todo OK"; si algo rojo → "⚠️ resumen con alertas".
   Destinatario: hash Redis `b2b:config.healthDigestEmail` (override),
   o env var `HEALTH_DIGEST_EMAIL`, o fallback a
   `contacto@griffo.com.ar`. Siempre se agrega `jgriffo@griffo.com.ar`
   como segundo destinatario fijo (deduplicado con Set).

Alertas que chequea `findConfigAlerts` (todas las env vars críticas
deberían figurar acá si no están seteadas):

- ADMIN_PASSWORD, SPECPARTS_CLIENT_ID/SECRET, KV_REST_API_URL,
  BLOB_READ_WRITE_TOKEN, RESEND_API_KEY, BEJERMAN_EMAIL/PASSWORD,
  CRON_SECRET, NEXT_PUBLIC_GA_ID
- También: SITE_URL apuntando a vercel.app, dominio sin verificar en
  Resend, productos destacados sin link Mercado Libre, distribuidores
  sin email.

## Pendientes y decisiones abiertas

1. **🚨 Login / cuenta corriente / descarga de facturas**: la cliente
   mencionó en la primera conversación replicar estas features, pero
   el sitio público no las tiene. Sin aclarar si están en
   `griffo.specparts.shop` (fuera de alcance) o si es feature nueva.
   Preguntar antes de implementar si lo vuelve a pedir.
2. **Parque automotor circulante** para `/admin/cobertura`: hoy solo
   detecta huecos en vehículos que Griffo YA cubre. Preguntarle a
   SpecParts si expone `/vehicle/list` o conseguir base externa
   (ADEFA, ACARA).
3. **Contenido histórico de Novedades**: el módulo está armado y
   conectado a SpecParts, pero si la cliente quiere preservar noticias
   puntuales del sitio viejo (ej. "Nuevo pack de grasa Molykote") hay
   que importarlas manual — SpecParts solo tiene productos.
4. **Data del Excel de distribuidores**: 7 filas con `Provincia para
   filtro = "Distribuidores"` se reasignaron heurísticamente a
   Tucumán. Verificar con la cliente.

## Git / commits

- Siempre commit y push al final de cada cambio funcional. Vercel auto-deploya.
- Commit messages en español, primera línea < 72 chars, descriptivos del
  "por qué" más que el "qué".
- Nunca `--no-verify`, nunca `--amend`, nunca force-push.
- Para regenerar `distribuidores.ts`: correr el script Python desde memoria
  (está documentado arriba) o pedírselo a Claude con el CSV actualizado.
