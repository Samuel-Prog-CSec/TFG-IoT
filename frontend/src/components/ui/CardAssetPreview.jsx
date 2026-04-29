import { useState, useEffect, useCallback } from 'react';
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
  fallbackIcon = <CreditCard size={16} className="text-text-muted" />,
  fallbackLabel,
  showSkeleton = true,
  largeFallback = false,
  onImageError
}) {
  const imageUrl = getBestAssetImageUrl(asset);
  const dominantColor = asset?.dominantColor;
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(Boolean(imageUrl));
  // Retries permite recuperarse de fallos transitorios (red inestable, 5xx puntual).
  // Cada retry invalida la cache del navegador con ?retry=N para forzar fetch nuevo.
  const [retries, setRetries] = useState(0);

  // Reset total cuando cambia la URL fuente (asset distinto).
  useEffect(() => {
    setImageError(false);
    setImageLoading(Boolean(imageUrl));
    setRetries(0);
  }, [imageUrl]);

  // Callback ref: detecta imagenes que ya se cargaron desde cache antes de
  // que React adjunte el handler onLoad. Tambien sincroniza el estado cuando
  // un re-render reusa el mismo <img> con el mismo src (caso comun en juegos
  // donde se barajan las cartas pero los assets se repiten entre rondas).
  const imgRef = useCallback((node) => {
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

  // Cada retry añade ?retry=N al src para bypasear el cache del error.
  let displaySrc = null;
  if (imageUrl) {
    if (retries > 0) {
      const separator = imageUrl.includes('?') ? '&' : '?';
      displaySrc = `${imageUrl}${separator}retry=${retries}`;
    } else {
      displaySrc = imageUrl;
    }
  }

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
        // Sombra interior sutil para dar profundidad (asset "incrustado" en vez de "pegado")
        shouldShowImage && 'shadow-[inset_0_2px_8px_rgba(0,0,0,0.25)]',
        // Sin dominantColor: fondo base genérico
        !dominantColor && 'bg-background-base/60',
        className
      )}
      // Con dominantColor: placeholder LQIP inmediato que coincide con la imagen
      style={dominantColor ? { backgroundColor: dominantColor } : undefined}
    >
      {shouldShowImage ? (
        <>
          {/* Placeholder: shimmer (sin dominantColor) o color sólido (con dominantColor) */}
          {showSkeleton && imageLoading && !dominantColor && (
            <div
              className="absolute inset-0 bg-background-elevated/80 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-text-primary/5 before:to-transparent"
            />
          )}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onLoad/onError are lifecycle events, not user interactions */}
          <img
            ref={imgRef}
            src={displaySrc}
            alt={alt || asset?.value || 'Asset'}
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
                'select-none truncate max-w-full font-medium text-text-secondary leading-tight',
                // largeFallback: usado cuando el consumidor sabe que el fallback debe
                // ser legible para sustituir una imagen que deberia haber cargado
                // (caso FallbackTouchPanel). Escala con el tamaño de la tarjeta.
                largeFallback ? 'text-sm sm:text-base font-semibold text-text-primary' : 'text-[0.65rem]'
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