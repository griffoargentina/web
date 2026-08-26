/**
 * Reglas de presentación de atributos por línea (categoría).
 * Se aplica tanto en ProductCard (grilla del catálogo) como en la page
 * de detalle. Un único punto de verdad.
 *
 * Reglas:
 *  - Suspensión: no mostrar 'Lado' cuando el valor es izquierdo/derecho.
 *    El lado DELANTERO/TRASERO sí queda como 'Ubicación'.
 *  - Dirección:  'Lado' izquierdo/derecho se promociona a 'Ubicación'
 *    (ahí es el dato principal de la aplicación).
 *  - Transmisión: en 'Ubicación' sólo interesa LADO CAJA / LADO RUEDA;
 *    el DELANTERO/TRASERO no aporta y se filtra.
 *  - Resto de líneas: sin transformación.
 */

import type { SpecPartsProduct } from "@/types/specparts";
import { getAttrValue, getAttrValues, getProductLocations } from "./utils";
import { getTransmisionLado } from "@/data/transmision-lado";

export type DisplayApplication = {
  ubicaciones: string[];
  lados: string[];
  /** Para productos de Dirección: "Mecánica" / "Hidráulica" / etc. */
  tipoDireccion?: string;
};

export function isIzqDer(value: string): boolean {
  const norm = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return /^(izquier|derech|izq\b|der\b)/.test(norm);
}

export function getDisplayApplication(product: SpecPartsProduct): DisplayApplication {
  const category = (product.category || "").toLowerCase();
  const isSuspension = category.includes("susp");
  const isDireccion = category.includes("direc");
  const isTransmision = category.includes("trans");

  const rawLocations = getProductLocations(product);
  const rawSides = getAttrValues(product, "lado").filter(
    (v) => !rawLocations.includes(v),
  );

  let ubicaciones: string[] = [...rawLocations];
  let lados: string[] = [...rawSides];

  if (isSuspension) {
    lados = lados.filter((s) => !isIzqDer(s));
  }

  let tipoDireccion: string | undefined;

  if (isDireccion) {
    const izqDer = lados.filter(isIzqDer);
    lados = lados.filter((s) => !isIzqDer(s));
    for (const s of izqDer) {
      if (!ubicaciones.includes(s)) ubicaciones.push(s);
    }
    // "Tipo de dirección" → Mecánica / Hidráulica / Eléctrica.
    // Se filtra con allowlist para no confundir "Tipo de pieza" = "Fuelle"
    // (atributo de SpecParts que también contiene "tipo" en el nombre).
    const t = getAttrValue(product, "tipo");
    if (t) {
      const norm = t
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
      if (
        norm.includes("hidraul") ||
        norm.includes("mecan") ||
        norm.includes("electr")
      ) {
        tipoDireccion = t;
      }
    }
    // Fallback: extraer el tipo desde la descripción cuando el atributo
    // "Tipo" no tiene un valor de mecanismo válido.
    // Descripción puede ser "Dirección: HIDRÁULICA" o "FUELLE CREMALLERA HIDRÁULICA".
    if (!tipoDireccion && product.description) {
      const desc = product.description
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
      if (desc.includes("hidraul")) tipoDireccion = "Hidráulica";
      else if (desc.includes("mecan")) tipoDireccion = "Mecánica";
      else if (desc.includes("electrohidraul")) tipoDireccion = "Electrohidráulica";
      else if (desc.includes("electr")) tipoDireccion = "Eléctrica";
    }
  }

  if (isTransmision) {
    // Primero intentar el lookup estático (fuente: Tabla Aplicaciones de Promotive).
    // Es más confiable que los atributos de SpecParts, que suelen estar vacíos.
    const lookup = getTransmisionLado(product.code);
    if (lookup) {
      const label =
        lookup === "RUEDA"
          ? "Lado Rueda"
          : lookup === "CAJA"
            ? "Lado Caja"
            : "Caja-Rueda (Según vehículo)";
      ubicaciones = [label];
      lados = [];
    } else {
      // Fallback: leer del atributo de SpecParts si el código no está en el lookup.
      ubicaciones = ubicaciones.filter((loc) => {
        const upper = loc.toUpperCase();
        return upper.includes("CAJA") || upper.includes("RUEDA");
      });
    }
  }

  return { ubicaciones, lados, tipoDireccion };
}
