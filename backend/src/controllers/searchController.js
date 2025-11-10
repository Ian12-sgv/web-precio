// controllers/buscar.js
// Multiplica el PrecioDetal por 1.16 antes de retornar

'use strict';

const { query, sql } = require('../db/sqlserver');

const allowedBarcodeCols = new Set([
  'CodigoBarra','CodigoBarras','Codigo_Barra','CodBarra','EAN','UPC','CodigoDeBarras'
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

module.exports.buscar = async (req, res, next) => {
  try {
    const data = Object.keys(req.body || {}).length ? req.body : req.query;
    const referencia = (data.referencia || data.ref || data.q || data.termino || data.codigo || '').toString().trim();
    const barcode    = (data.barcode || data.codigo_barra || data.codigobarra || data.codbarra || data.ean || data.upc || '').toString().trim();
    const one        = (data.one === '1' || data.one === 1 || data.one === true);

    let sqlText, params, modo;
    if (barcode) {
      modo = 'barcode';
      sqlText = `
        SELECT TOP 50 Referencia, Nombre, PrecioDetal, CostoInicial, ${BARCODE_COL} AS CodigoBarra
        FROM dbo.INVENTARIO
        WHERE ${BARCODE_COL} = @barcode
        ORDER BY Referencia`;
      params = [{ name: 'barcode', type: sql.VarChar, value: barcode }];
    } else if (referencia) {
      modo = 'referencia';
      sqlText = `
        SELECT TOP 50 Referencia, Nombre, PrecioDetal, CostoInicial, ${BARCODE_COL} AS CodigoBarra
        FROM dbo.INVENTARIO
        WHERE Referencia LIKE @filtro
        ORDER BY Referencia`;
      params = [{ name: 'filtro', type: sql.VarChar, value: `%${referencia}%` }];
    } else {
      return res.status(400).json({ ok:false, error:'Falta parámetro: referencia o barcode' });
    }

    const result = await query(sqlText, params);
    const rows = result.recordset || [];

    // Aplica IVA 16% al PrecioDetal
    const withIva = rows.map(r => {
      const base = toNum(r.PrecioDetal);
      const conIva = base != null ? round2(base * IVA_FACTOR) : null;
      return { ...r, PrecioDetal: conIva };
    });

    const rowsOut = one ? withIva.slice(0,1) : withIva;

    res.json({ ok:true, by:modo, one:!!one, count:rowsOut.length, data:rowsOut });
  } catch (err) {
    next(err);
  }
};
