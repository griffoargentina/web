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

// ─── Parsing de application_details ──────────────────────────────────────────

export type ParsedAppDetails = {
  /** Izquierdo / Derecho / ambos / desconocido */
  izqDer: "IZQ" | "DER" | "AMBOS" | null;
  /** Lado Caja / Lado Rueda / ambos / no aplica */
  lado: "CAJA" | "RUEDA" | "AMBOS" | null;
};

/**
 * Parsea el texto libre de `vehicle.application_details` extrayendo:
 *  - IZQ/DER (si aparece "izq", "izquier", "der", "derech")
 *  - CAJA/RUEDA (si aparece "caja" o "rueda")
 *
 * Ejemplo: "Semiejes Izq y Der / Lado Rueda" → { izqDer: "AMBOS", lado: "RUEDA" }
 */
export function parseAppDetails(text: string): ParsedAppDetails {
  const norm = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const hasIzq = /\bizq(uier)?/.test(norm);
  const hasDer = /\bder(ech)?/.test(norm);
  let izqDer: ParsedAppDetails["izqDer"] = null;
  if (hasIzq && hasDer) izqDer = "AMBOS";
  else if (hasIzq) izqDer = "IZQ";
  else if (hasDer) izqDer = "DER";

  const hasCaja = norm.includes("caja");
  const hasRueda = norm.includes("rueda");
  let lado: ParsedAppDetails["lado"] = null;
  if (hasCaja && hasRueda) lado = "AMBOS";
  else if (hasCaja) lado = "CAJA";
  else if (hasRueda) lado = "RUEDA";

  return { izqDer, lado };
}

/**
 * Agrega `application_details` de todos los vehículos del producto,
 * haciendo unión de IZQ/DER y CAJA/RUEDA (si algún vehículo tiene ambos → AMBOS).
 * Devuelve null en los campos que ningún vehículo aportó.
 */
export function getProductAppDetails(product: SpecPartsProduct): ParsedAppDetails {
  const parsed = (product.vehicles ?? [])
    .map((v) => (v.application_details ? parseAppDetails(v.application_details) : null))
    .filter((d): d is ParsedAppDetails => d !== null && (d.izqDer !== null || d.lado !== null));

  if (parsed.length === 0) return { izqDer: null, lado: null };

  const izqSet = new Set(parsed.map((d) => d.izqDer).filter(Boolean) as string[]);
  const ladoSet = new Set(parsed.map((d) => d.lado).filter(Boolean) as string[]);

  let izqDer: ParsedAppDetails["izqDer"] = null;
  if (izqSet.has("AMBOS") || (izqSet.has("IZQ") && izqSet.has("DER"))) izqDer = "AMBOS";
  else if (izqSet.has("IZQ")) izqDer = "IZQ";
  else if (izqSet.has("DER")) izqDer = "DER";

  let lado: ParsedAppDetails["lado"] = null;
  if (ladoSet.has("AMBOS") || (ladoSet.has("CAJA") && ladoSet.has("RUEDA"))) lado = "AMBOS";
  else if (ladoSet.has("CAJA")) lado = "CAJA";
  else if (ladoSet.has("RUEDA")) lado = "RUEDA";

  return { izqDer, lado };
}

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
    // Fuente primaria: application_details por vehículo (API SpecParts — jul-2026).
    // Fallback: lookup estático del Excel Promotive (para productos sin application_details).
    const apiDetails = getProductAppDetails(product);
    const ladoFinal = apiDetails.lado ?? (() => {
      const lookup = getTransmisionLado(product.code);
      if (!lookup) return null;
      return lookup as "CAJA" | "RUEDA" | "AMBOS";
    })();

    if (ladoFinal) {
      const label =
        ladoFinal === "RUEDA"
          ? "Lado Rueda"
          : ladoFinal === "CAJA"
            ? "Lado Caja"
            : "Caja-Rueda (Según vehículo)";
      ubicaciones = [label];
      lados = [];
    } else {
      // Sin dato en API ni lookup: filtrar CAJA/RUEDA de los atributos crudos.
      ubicaciones = ubicaciones.filter((loc) => {
        const upper = loc.toUpperCase();
        return upper.includes("CAJA") || upper.includes("RUEDA");
      });
    }
  }

  return { ubicaciones, lados, tipoDireccion };
}
