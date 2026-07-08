/**
 * Datos de la página /catalogo/download.
 *
 * Cuatro secciones:
 *   1. Catálogo general PDF — descarga directa.
 *   2. Material por producto (flyer + videos) — descarga directa por item.
 *   3. Banco de imágenes — detrás de form de registro.
 *   4. Base de datos de productos — detrás de form de registro.
 *
 * Los slugs de "material por producto" coinciden con los slugs del nav
 * "Productos destacados" (src/lib/site-config.ts). Así la imagen/título
 * se reusa automáticamente de src/data/productos.ts.
 *
 * Archivos esperados en /public:
 *   - /pdfs/catalogo-griffo.pdf
 *   - /downloads/productos/<slug>/flyer.pdf
 *   - /downloads/productos/<slug>/video-rrss.mp4
 *   - /downloads/banco-de-imagenes.zip
 *   - /downloads/base-de-datos-productos.xlsx
 *
 * Si un archivo falta, el link devuelve 404 al hacer clic. La cliente
 * va a ir subiendo archivos a estas rutas vía GitHub.
 */

export type MaterialProducto = {
  slug: string;
  flyer?: string;
  videoRrss?: string;
};

export type RecursoGated = {
  /** Id único para el form (ej. "banco-imagenes"). */
  id: "banco-imagenes" | "base-datos-productos";
  titulo: string;
  descripcion: string;
  /** URL del archivo — se revela al usuario tras registrarse. */
  fileUrl: string;
  /** Tipo de archivo (para mostrar en la card). */
  tipo: string;
};

export const catalogoGeneralPdf = "/pdfs/catalogo-griffo.pdf";

export const materialPorProducto: MaterialProducto[] = [
  {
    slug: "maquina-montadora-de-fuelles",
    flyer: "/downloads/productos/maquina-montadora-de-fuelles/flyer.pdf",
    videoRrss:
      "/downloads/productos/maquina-montadora-de-fuelles/video-rrss.mp4",
  },
  {
    slug: "kit-de-fuelles-universales-para-homocineticas",
    flyer:
      "/downloads/productos/kit-de-fuelles-universales-para-homocineticas/flyer.pdf",
    videoRrss:
      "/downloads/productos/kit-de-fuelles-universales-para-homocineticas/video-rrss.mp4",
  },
  {
    slug: "extractor-de-juntas-homocineticas",
    flyer: "/downloads/productos/extractor-de-juntas-homocineticas/flyer.pdf",
    videoRrss:
      "/downloads/productos/extractor-de-juntas-homocineticas/video-rrss.mp4",
  },
  {
    slug: "pinza-para-abrazaderas",
    flyer: "/downloads/productos/pinza-para-abrazaderas/flyer.pdf",
    videoRrss: "/downloads/productos/pinza-para-abrazaderas/video-rrss.mp4",
  },
  {
    slug: "fuelle-universal-de-direccion",
    flyer: "/downloads/productos/fuelle-universal-de-direccion/flyer.pdf",
    videoRrss:
      "/downloads/productos/fuelle-universal-de-direccion/video-rrss.mp4",
  },
];

// Vacío por ahora — los items se reactivarán cuando estén disponibles para entregar.
export const recursosGated: RecursoGated[] = [];
