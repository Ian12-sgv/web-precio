// controllers/buscar.js
// Multiplica el PrecioDetal por 1.16 antes de retornar
// y retorna PrecioPromocion SOLO si Promocion == 1

'use strict';

const { query, sql } = require('../db/sqlserver');

const allowedBarcodeCols = new Set([
  'CodigoBarra', 'CodigoBarras', 'Codigo_Barra', 'CodBarra', 'EAN', 'UPC', 'CodigoDeBarras'
]);
const envCol = (process.env.BARCODE_COL || '').trim();
const BARCODE_COL = allowedBarcodeCols.has(envCol) ? envCol : 'CodigoBarra';

const IVA_FACTOR = 1.16;

// Helpers numéricos simples
const toNum = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Promoción: acepta 1/'1'/true, etc.
const isPromoActive = (row) => {
  const v = row.Promocion ?? row.promocion ?? row.PROMOCION;
  const n = toNum(v);
  return n === 1 || v === true;
};

const getPromoPrice = (row) => {
  return row.PrecioPromocion ?? row.precioPromocion ?? row.precio_promocion ?? row.PRECIOPROMOCION;
};

module.exports.buscar = async (req, res, next) => {
  try {
    const data = Object.keys(req.body || {}).length ? req.body : req.query;

    const referencia = (data.referencia || data.ref || data.q || data.termino || data.codigo || '')
      .toString()
      .trim();

    const barcode = (data.barcode || data.codigo_barra || data.codigobarra || data.codbarra || data.ean || data.upc || '')
      .toString()
      .trim();

    const one = (data.one === '1' || data.one === 1 || data.one === true);

    let sqlText, params, modo;

    // NOTA: Aquí asumo que en dbo.INVENTARIO existen columnas:
    // Promocion y PrecioPromocion.
    // Si tus columnas se llaman distinto, podemos hacer alias:
    //   ISNULL(promocion,0) AS Promocion, precio_promocion AS PrecioPromocion
    const selectCols = `
      Referencia,
      Nombre,
      PrecioDetal,
      CostoInicial,
      CAST(ISNULL(Promocion, 0) AS int) AS Promocion,
      PrecioPromocion,
      ${BARCODE_COL} AS CodigoBarra
    `;

    if (barcode) {
      modo = 'barcode';
      sqlText = `
        SELECT TOP 50 ${selectCols}
        FROM dbo.INVENTARIO
        WHERE ${BARCODE_COL} = @barcode
        ORDER BY Referencia
      `;
      params = [{ name: 'barcode', type: sql.VarChar, value: barcode }];
    } else if (referencia) {
      modo = 'referencia';
      sqlText = `
        SELECT TOP 1 ${selectCols}
        FROM dbo.INVENTARIO
        WHERE Referencia LIKE @filtro
        ORDER BY Referencia
      `;
      params = [{ name: 'filtro', type: sql.VarChar, value: `%${referencia}%` }];
    } else {
      return res.status(400).json({ ok: false, error: 'Falta parámetro: referencia o barcode' });
    }

    const result = await query(sqlText, params);
    const rows = result.recordset || [];

    // Aplica IVA 16% al PrecioDetal y al PrecioPromocion (si aplica)
    const outRows = rows.map(r => {
      const promoActive = isPromoActive(r);

      const baseDetal = toNum(r.PrecioDetal);
      const detalConIva = baseDetal != null ? round2(baseDetal * IVA_FACTOR) : null;

      const basePromo = toNum(getPromoPrice(r));
      const promoConIva = basePromo != null ? round2(basePromo * IVA_FACTOR) : null;

      // Construimos salida: PrecioPromocion SOLO si promoActive
      const out = {
        ...r,
        PrecioDetal: detalConIva,
        Promocion: promoActive ? 1 : 0,
      };

      if (promoActive) {
        out.PrecioPromocion = promoConIva;
      } else {
        // Asegura que NO salga el campo
        delete out.PrecioPromocion;
      }

      return out;
    });

    const rowsOut = one ? outRows.slice(0, 1) : outRows;

    res.json({ ok: true, by: modo, one: !!one, count: rowsOut.length, data: rowsOut });
  } catch (err) {
    next(err);
  }
};
