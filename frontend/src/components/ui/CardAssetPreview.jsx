import { useState, useEffect } from 'react';
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
  fallbackIcon = <CreditCard size={16} className="text-slate-400" />,
  fallbackLabel,
  showSkeleton = true
}) {
  const imageUrl = getBestAssetImageUrl(asset);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(Boolean(imageUrl));

  // Reset state when asset image URL changes
  useEffect(() => {
    setImageError(false);
    setImageLoading(Boolean(imageUrl));
  }, [imageUrl]);

  const shouldShowImage = Boolean(imageUrl) && !imageError;
  const fallbackText = asset?.display || fallbackLabel;

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-slate-900/60 flex items-center justify-center',
        className
      )}
    >
      {shouldShowImage ? (
        <>
          {/* Shimmer skeleton while loading */}
          {showSkeleton && imageLoading && (
            <div
              className="absolute inset-0 bg-slate-800/80 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-text-primary/5 before:to-transparent"
            />
          )}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onLoad/onError are lifecycle events, not user interactions */}
          <img
            src={imageUrl}
            alt={alt || asset?.value || 'Asset'}
            className={cn(
              'w-full h-full transition-opacity duration-300',
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
    thumbnailUrl: PropTypes.string
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