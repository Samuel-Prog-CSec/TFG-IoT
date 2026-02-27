import { useState } from 'react';
import PropTypes from 'prop-types';
import { CreditCard } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getBestAssetImageUrl } from '../../lib/cardMapping';

export default function CardAssetPreview({
  asset,
  alt,
  fit = 'cover',
  className,
  imageClassName,
  fallbackClassName,
  fallbackIcon = <CreditCard size={16} className="text-slate-400" />,
  fallbackLabel
}) {
  const [imageError, setImageError] = useState(false);
  const imageUrl = getBestAssetImageUrl(asset);

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
        <img
          src={imageUrl}
          alt={alt || asset?.value || 'Asset'}
          className={cn(
            'w-full h-full',
            fit === 'contain' ? 'object-contain' : 'object-cover',
            imageClassName
          )}
          onError={() => setImageError(true)}
          loading="lazy"
          decoding="async"
        />
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
  className: PropTypes.string,
  imageClassName: PropTypes.string,
  fallbackClassName: PropTypes.string,
  fallbackIcon: PropTypes.node,
  fallbackLabel: PropTypes.string
};