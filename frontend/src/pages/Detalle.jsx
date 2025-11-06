// src/pages/Detalle.jsx
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Copy, ArrowLeft, Barcode, Hash, DollarSign, Package, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiBuscar } from '../lib/api';

export default function Detalle() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [item, setItem] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    setItem(null);

    (async () => {
      try {
        const ref = params.get('referencia');
        const bc  = params.get('barcode');
        if (!ref && !bc) {
          if (alive) { setErr('Faltan parámetros'); setLoading(false); }
          return;
        }
        const json = await apiBuscar({ one: 1, ...(bc ? { barcode: bc } : { referencia: ref }) });
        const rows = json?.data || [];
        if (!alive) return;
        setItem(rows[0] || null);
        setLoading(false);
      } catch {
        if (!alive) return;
        setErr('Error consultando el servidor');
        setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [params]);

  // Helpers ---------------------------------------------------------
  const toNum = (v) => {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  const fmtCurrency = (v, currency, min = 2) => {
    const n = toNum(v);
    if (n === null) return v ?? '—';
    try {
      return new Intl.NumberFormat('es-VE', {
        style: 'currency',
        currency,
        minimumFractionDigits: min,
        maximumFractionDigits: 2
      }).format(n);
    } catch {
      return n.toFixed(min);
    }
  };

  const precioDetalVEF = useMemo(
    () => (item ? fmtCurrency(item.PrecioDetal, 'VES') : ''),
    [item]
  );

  const costoUSD = useMemo(
    () => (item ? fmtCurrency(item.CostoInicial, 'USD') : ''),
    [item]
  );

  async function handleGoToScan() {
    // Prime de permisos de cámara (mejora autostart al volver)
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }
        });
        stream.getTracks().forEach(t => t.stop());
        sessionStorage.setItem('scanPrime', '1');
      }
    } catch { /* ignore */ }
    navigate('/scan?autostart=1', { replace: true });
  }

  function handleBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/scan');
  }

  async function copyToClipboard(text, label = 'Valor') {
    try {
      await navigator.clipboard?.writeText(String(text ?? ''));
      toast.success(`${label} copiado`, {
        icon: <CheckCircle2 className="h-4 w-4" />,
        duration: 2000
      });
    } catch {
      toast.error('No se pudo copiar');
    }
  }

  // Loading ---------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="mx-auto max-w-4xl">
          <Card className="border-border bg-card shadow-2xl">
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-40" />
              </div>
              <Skeleton className="h-8 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-8 w-40" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Error / vacío ---------------------------------------------------
  if (err) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="border-destructive bg-card p-8 text-center max-w-md">
          <p className="text-destructive text-lg font-medium">{err}</p>
          <Button onClick={handleBack} variant="outline" className="mt-4">
            Volver
          </Button>
        </Card>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="border-border bg-card p-8 text-center max-w-md">
          <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-foreground text-lg font-medium">
            No se encontró el ítem solicitado
          </p>
          <Button onClick={handleBack} variant="outline" className="mt-4">
            Volver
          </Button>
        </Card>
      </div>
    );
  }

  // Flags -----------------------------------------------------------
  const hasExistencia = item.Existencia != null && item.Existencia !== '';
  const hasPrecioMayor = item.PrecioMayor != null && item.PrecioMayor !== '';
  const hasCostoProm = item.CostoPromedio != null && item.CostoPromedio !== '';

  // Render ----------------------------------------------------------
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <Card className="border-border bg-card shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b border-border">
            <div className="flex items-start justify-between gap-4 mb-4">
              <Button
                onClick={handleBack}
                variant="ghost"
                size="sm"
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Button>
              <Button
                onClick={handleGoToScan}
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30"
              >
                <Barcode className="h-4 w-4" />
                Escanear otro producto
              </Button>
            </div>

            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4 leading-tight">
              {item.Nombre || 'Producto'}
            </h1>

            <div className="flex flex-wrap gap-2">
              {item.Referencia && (
                <Badge
                  variant="secondary"
                  className="gap-1.5 cursor-pointer hover:bg-secondary/80 transition-colors"
                  onClick={() => copyToClipboard(item.Referencia, 'Referencia')}
                >
                  <Hash className="h-3 w-3" />
                  <span className="text-xs">Ref:</span>
                  <span className="font-mono font-semibold">{item.Referencia}</span>
                  <Copy className="h-3 w-3 opacity-50" />
                </Badge>
              )}
              <Badge
                variant="secondary"
                className="gap-1.5 cursor-pointer hover:bg-secondary/80 transition-colors"
                onClick={() => copyToClipboard(item.CodigoBarra || '', 'Código')}
              >
                <Barcode className="h-3 w-3" />
                <span className="text-xs">Código:</span>
                <span className="font-mono font-semibold">
                  {item.CodigoBarra || '—'}
                </span>
                <Copy className="h-3 w-3 opacity-50" />
              </Badge>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-6 space-y-6">
            {/* Price Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30 p-6 hover:shadow-lg hover:shadow-primary/10 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <Copy
                    className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-primary transition-colors"
                    onClick={() => copyToClipboard(costoUSD, 'Costo USD')}
                  />
                </div>
                <p className="text-sm text-muted-foreground mb-1">Costo USD</p>
                <p className="text-3xl font-bold text-foreground tracking-tight">
                  {costoUSD}
                </p>
              </Card>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
