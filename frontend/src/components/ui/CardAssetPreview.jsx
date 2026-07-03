import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { CreditCard } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getBestAssetImageUrl } from '../../lib/cardMapping';

const MAX_RETRIES = 2;

export default function CardAssetPreview({
  asset,
  alt,
  fit = 'cover',
  loading = 'lazy',
  className,
  imageClassName,
  fallbackClassName,
  fallbackIcon = <CreditCard size={16} className="text-card-ink/50" />,
  fallbackLabel,
  showSkeleton = true,
  largeFallback = false,
  onImageError
}) {
  const imageUrl = getBestAssetImageUrl(asset);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(Boolean(imageUrl));
  // Retries permite recuperarse de fallos transitorios (red inestable, 5xx puntual).
  // Cada retry remonta el <img> vía `key` (re-dispara la carga) manteniendo la URL
  // canónica; antes se usaba ?retry=N, que rompía el cache de CDN/navegador.
  const [retries, setRetries] = useState(0);
  // Referencia al nodo <img> real para poder consultar su estado de carga desde
  // el efecto de cambio de URL (ver abajo por qué es imprescindible).
  const imgNodeRef = useRef(null);

  // Reset al cambiar la URL fuente (asset distinto). NO ponemos `imageLoading`
  // en true a ciegas: en Memoria la carta se voltea con la imagen YA precargada
  // (prefetch del mazo), así que el <img> recién montado con el nuevo src suele
  // estar `complete` en cache. En ese caso el navegador NO vuelve a disparar
  // `onLoad` (la carga ya ocurrió), y como este efecto corre DESPUÉS del callback
  // ref, dejaríamos `imageLoading=true` para siempre → la imagen queda cargada
  // pero en opacity-0 (invisible). Por eso consultamos el nodo real (ya montado
  // en la fase de commit) y solo mostramos "cargando" si de verdad no está listo.
  useEffect(() => {
    setImageError(false);
    setRetries(0);
    const node = imgNodeRef.current;
    const alreadyLoaded = Boolean(node && node.complete && node.naturalWidth > 0);
    setImageLoading(Boolean(imageUrl) && !alreadyLoaded);
  }, [imageUrl]);

  // Callback ref: guarda el nodo y detecta imagenes que ya se cargaron desde
  // cache antes de que React adjunte el handler onLoad. Tambien sincroniza el
  // estado cuando un re-render reusa el mismo <img> con el mismo src (caso comun
  // en juegos donde se barajan las cartas pero los assets se repiten entre rondas).
  const imgRef = useCallback((node) => {
    imgNodeRef.current = node;
    if (!node) return;
    if (node.complete && node.naturalWidth > 0) {
      setImageLoading(false);
      setImageError(false);
    } else if (node.complete && node.naturalWidth === 0 && retries >= MAX_RETRIES) {
      // Imagen completed sin dimensiones reales = error de carga.
      // Solo marcamos error si ya agotamos los reintentos.
      setImageError(true);
      setImageLoading(false);
    }
  }, [retries]);

  const handleError = useCallback(() => {
    if (retries < MAX_RETRIES) {
      setRetries(r => r + 1);
      setImageLoading(true);
      return;
    }
    setImageError(true);
    setImageLoading(false);
    if (typeof onImageError === 'function') {
      onImageError(imageUrl);
    }
  }, [retries, imageUrl, onImageError]);

  // El src se mantiene canónico (cache-friendly). Para reintentar tras un error
  // forzamos el remount del <img> vía `key` (re-dispara la carga) en lugar de
  // ensuciar la URL con ?retry=N, que rompía el cache de CDN/navegador y volvía
  // a descargar la imagen en cada reintento.
  const displaySrc = imageUrl || null;

  const shouldShowImage = Boolean(imageUrl) && !imageError;
  // Preferimos fallbackLabel explicito del caller sobre asset.display porque
  // el caller suele tener mejor contexto sobre que mostrar (e.g. "Vaca" vs
  // un emoji decorativo del seeder). Si no se pasa fallbackLabel, caemos a
  // asset.display como antes.
  const fallbackText = fallbackLabel || asset?.display;

  return (
    <div
      className={cn(
        'relative overflow-hidden flex items-center justify-center',
        // Soporte BLANCO de tarjeta física (MIFARE): el asset se ve como impreso
        // sobre la tarjeta que el alumno maneja. Válido en light y dark.
        'bg-card-surface',
        // Sombra interior sutil para dar profundidad (asset "incrustado")
        shouldShowImage && 'shadow-[inset_0_2px_8px_color-mix(in_oklab,var(--color-card-ink)_18%,transparent)]',
        className
      )}
    >
      {shouldShowImage ? (
        <>
          {/* Placeholder shimmer sobre el blanco de la tarjeta mientras carga. */}
          {showSkeleton && imageLoading && (
            <div
              className="absolute inset-0 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-[color-mix(in_oklab,var(--color-card-ink)_10%,transparent)] before:to-transparent"
            />
          )}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onLoad/onError are lifecycle events, not user interactions */}
          <img
            key={imageUrl ? `${imageUrl}#${retries}` : undefined}
            ref={imgRef}
            src={displaySrc}
            alt={alt || asset?.value || 'Recurso'}
            className={cn(
              'w-full h-full transition-opacity duration-400 ease-out',
              fit === 'contain' ? 'object-contain' : 'object-cover',
              imageLoading ? 'opacity-0' : 'opacity-100',
              imageClassName
            )}
            onLoad={() => setImageLoading(false)}
            onError={handleError}
            loading={loading}
            decoding="async"
          />
        </>
      ) : (
        <div
          className={cn(
            'w-full h-full flex items-center justify-center text-center p-1',
            fallbackClassName
          )}
          title={fallbackText || undefined}
        >
          {fallbackText ? (
            // aria-hidden defensivo cuando el consumidor pide alt="": indica que
            // el contenido NO debe ser accesible (caso MemoryBoard cara oculta).
            // Si el alt tiene texto el consumidor quiere que sea legible y dejamos
            // el span sin aria-hidden para que los lectores lo expongan.
            <span
              aria-hidden={alt === '' ? 'true' : undefined}
              className={cn(
                // Tinta oscura fija (card-ink): el respaldo va sobre el blanco de
                // la tarjeta, así que NO puede usar tokens de texto que en dark
                // son claros (quedarían ilegibles sobre el blanco).
                'select-none truncate max-w-full font-medium leading-tight text-card-ink',
                // largeFallback: usado cuando el consumidor sabe que el fallback debe
                // ser legible para sustituir una imagen que deberia haber cargado
                // (caso FallbackTouchPanel). Escala con el tamaño de la tarjeta.
                largeFallback ? 'text-sm sm:text-base font-semibold' : 'text-[0.65rem]'
              )}
            >
              {fallbackText}
            </span>
          ) : (
            fallbackIcon
          )}
        </div>
      )}
    </div>
  );
}

CardAssetPreview.propTypes = {
  asset: PropTypes.shape({
    display: PropTypes.string,
    value: PropTypes.string,
    imageUrl: PropTypes.string,
    thumbnailUrl: PropTypes.string,
    dominantColor: PropTypes.string
  }),
  alt: PropTypes.string,
  fit: PropTypes.oneOf(['cover', 'contain']),
  loading: PropTypes.oneOf(['lazy', 'eager']),
  className: PropTypes.string,
  imageClassName: PropTypes.string,
  fallbackClassName: PropTypes.string,
  fallbackIcon: PropTypes.node,
  fallbackLabel: PropTypes.string,
  showSkeleton: PropTypes.bool,
  largeFallback: PropTypes.bool,
  onImageError: PropTypes.func
};