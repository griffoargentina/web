#!/usr/bin/env python3
"""
Genera src/data/transmision-lado.ts desde la Tabla de Aplicaciones de Promotive.

Uso:
    python3 scripts/gen-transmision-lado.py RUTA_AL_EXCEL.xlsx

El Excel debe tener columnas:
  Col 1: CODIGO PROMOTIVE
  Col 3: CODIGO DE PIEZA
  Col 5: OBSERVACION APLICACIÓN  (contiene "Lado Rueda" / "Lado Caja")
"""
import openpyxl, json, sys, os
from collections import defaultdict

def main(xlsx_path):
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb.active

    by_pieza = defaultdict(lambda: defaultdict(set))
    for row in ws.iter_rows(min_row=2, values_only=True):
        cod_prom = str(row[0] or '').strip()
        cod_pieza = str(row[2] or '').strip()
        obs = str(row[4] or '').strip().lower()
        if not cod_pieza or not cod_prom or not obs:
            continue
        if 'rueda' in obs:
            by_pieza[cod_pieza][cod_prom].add('RUEDA')
        if 'caja' in obs:
            by_pieza[cod_pieza][cod_prom].add('CAJA')

    product_side = {}
    for cod, veh in by_pieza.items():
        all_sides = set(s for sides in veh.values() for s in sides)
        if all_sides == {'RUEDA'}:
            product_side[cod] = 'RUEDA'
        elif all_sides == {'CAJA'}:
            product_side[cod] = 'CAJA'
        else:
            product_side[cod] = 'AMBOS'

    vehicle_side = {}
    for cod, veh in by_pieza.items():
        if product_side.get(cod) != 'AMBOS':
            continue
        veh_map = {}
        for cod_prom, sides in veh.items():
            if sides == {'RUEDA'}:
                veh_map[cod_prom] = 'RUEDA'
            elif sides == {'CAJA'}:
                veh_map[cod_prom] = 'CAJA'
            else:
                veh_map[cod_prom] = 'AMBOS'
        vehicle_side[cod] = veh_map

    from datetime import date
    today = date.today().strftime('%Y-%m-%d')
    out = []
    out.append('/**')
    out.append(' * Lookup de LADO CAJA / LADO RUEDA para productos de Transmisión.')
    out.append(f' * Generado desde Tabla_Aplicaciones de SpecParts/Promotive ({today}).')
    out.append(' *')
    out.append(' * productSide: código de pieza → lado fijo (RUEDA | CAJA | AMBOS).')
    out.append(' *   AMBOS = la misma pieza sirve en ambos lados (varía por vehículo).')
    out.append(' * vehicleSide: solo para piezas AMBOS → por CODIGO PROMOTIVE (vehicle.code).')
    out.append(' *')
    out.append(' * Para actualizar: correr este script con el nuevo Excel de Promotive.')
    out.append(' */')
    out.append('')
    out.append("export type TransmisionLado = 'RUEDA' | 'CAJA' | 'AMBOS';")
    out.append('')
    out.append('export const productSide: Record<string, TransmisionLado> = {')
    for code, lado in sorted(product_side.items()):
        out.append(f'  "{code}": "{lado}",')
    out.append('};')
    out.append('')
    out.append('/**')
    out.append(' * Solo incluye piezas AMBOS.')
    out.append(' * Clave externa: código de pieza. Clave interna: CODIGO PROMOTIVE (vehicle.code).')
    out.append(' */')
    out.append('export const vehicleSide: Record<string, Record<string, TransmisionLado>> = {')
    for code, veh_map in sorted(vehicle_side.items()):
        out.append(f'  "{code}": {{')
        for vprom, lado in sorted(veh_map.items()):
            out.append(f'    "{vprom}": "{lado}",')
        out.append('  },')
    out.append('};')
    out.append('')
    out.append("/** Devuelve el lado para un producto (y opcionalmente un vehículo específico). */")
    out.append('export function getTransmisionLado(')
    out.append('  productCode: string,')
    out.append('  vehicleCode?: string')
    out.append('): TransmisionLado | null {')
    out.append('  const pSide = productSide[productCode];')
    out.append('  if (!pSide) return null;')
    out.append("  if (pSide !== 'AMBOS' || !vehicleCode) return pSide;")
    out.append("  return vehicleSide[productCode]?.[vehicleCode] ?? 'AMBOS';")
    out.append('}')
    out.append('')

    dest = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'transmision-lado.ts')
    with open(dest, 'w') as f:
        f.write('\n'.join(out))
    print(f'Generado: {dest}')
    print(f'  productos: {len(product_side)} (RUEDA:{sum(1 for v in product_side.values() if v=="RUEDA")}, CAJA:{sum(1 for v in product_side.values() if v=="CAJA")}, AMBOS:{sum(1 for v in product_side.values() if v=="AMBOS")})')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1])
