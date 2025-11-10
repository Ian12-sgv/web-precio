// JSON puro para la API
const { query, sql } = require('../db/sqlserver');

const allowedBarcodeCols = new Set([
  'CodigoBarra','CodigoBarras','Codigo_Barra','CodBarra','EAN','UPC','CodigoDeBarras'
]);
const envCol = (process.env.BARCODE_COL || '').trim();
const BARCODE_COL = allowedBarcodeCols.has(envCol) ? envCol : 'CodigoBarra';

module.exports.buscar = async (req, res, next) => {
  try {
    const data = Object.keys(req.body || {}).length ? req.body : req.query;
    const referencia = (data.referencia || data.ref || data.q || data.termino || data.codigo || '').toString().trim();
    const barcode    = (data.barcode || data.codigo_barra || data.codigobarra || data.codbarra || data.ean || data.upc || '').toString().trim();
    const one        = (data.one === '1' || data.one === 1 || data.one === true);

    let sqlText, params, modo, filtroTexto;
    if (barcode) {
      modo = 'barcode'; filtroTexto = barcode;
      sqlText = `
        SELECT TOP 50 Referencia, Nombre, PrecioDetalConIva, CostoInicial, ${BARCODE_COL} AS CodigoBarra
        FROM dbo.INVENTARIO
        WHERE ${BARCODE_COL} = @barcode
        ORDER BY Referencia`;
      params = [{ name: 'barcode', type: sql.VarChar, value: barcode }];
    } else if (referencia) {
      modo = 'referencia'; filtroTexto = referencia;
      sqlText = `
        SELECT TOP 50 Referencia, Nombre, PrecioDetalConIva, CostoInicial, ${BARCODE_COL} AS CodigoBarra
        FROM dbo.INVENTARIO
        WHERE Referencia LIKE @filtro
        ORDER BY Referencia`;
      params = [{ name: 'filtro', type: sql.VarChar, value: `%${referencia}%` }];
    } else {
      return res.status(400).json({ ok:false, error:'Falta parámetro: referencia o barcode' });
    }

    const result = await query(sqlText, params);
    const rows = result.recordset || [];
    const rowsOut = one ? rows.slice(0,1) : rows;

    res.json({ ok:true, by:modo, one:!!one, count:rowsOut.length, data:rowsOut });
  } catch (err) { next(err); }
};
