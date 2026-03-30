import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { CreditCard } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getBestAssetImageUrl } from '../../lib/cardMapping';

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
  showSkeleton = true
}) {
  const imageUrl = getBestAssetImageUrl(asset);
  const dominantColor = asset?.dominantColor;
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(Boolean(imageUrl));

  // Reset state when asset image URL changes
  useEffect(() => {
    setImageError(false);
    setImageLoading(Boolean(imageUrl));
  }, [imageUrl]);

  // Callback ref: detecta imágenes que ya se cargaron desde cache
  // antes de que React adjunte el handler onLoad
  const imgRef = useCallback((node) => {
    if (node?.complete && node.naturalWidth > 0) {
      setImageLoading(false);
    }
  }, []);

  const shouldShowImage = Boolean(imageUrl) && !imageError;
  const fallbackText = asset?.display || fallbackLabel;

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
            src={imageUrl}
            alt={alt || asset?.value || 'Asset'}
            className={cn(
              'w-full h-full transition-opacity duration-400 ease-out',
              fit === 'contain' ? 'object-contain' : 'object-cover',
              imageLoading ? 'opacity-0' : 'opacity-100',
              imageClassName
            )}
            onLoad={() => setImageLoading(false)}
            onError={() => { setImageError(true); setImageLoading(false); }}
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
        >
          {fallbackText ? (
            <span className="text-lg leading-none select-none">{fallbackText}</span>
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
  showSkeleton: PropTypes.bool
};