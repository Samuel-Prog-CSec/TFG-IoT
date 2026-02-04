// Componentes UI Premium - Barrel Export
// Importar así: import { SpotlightCard, ButtonPremium, ... } from '@/components/ui';

export { default as SpotlightCard } from './SpotlightCard';
export { default as GlassCard } from './GlassCard';
export { default as ButtonPremium } from './ButtonPremium';
export { default as InputPremium } from './InputPremium';
export { default as SelectPremium } from './SelectPremium';
export { default as ProgressBarPremium, GameTimerBar } from './ProgressBarPremium';
export { default as StatusBadge, CountBadge } from './StatusBadge';
export { default as SkeletonShimmer, SkeletonCard, SkeletonStatCard } from './SkeletonShimmer';

// Modal de confirmación reutilizable
export { default as ConfirmationModal, useConfirmationModal } from './ConfirmationModal';

// Componentes para gestión de mazos (CardDeck)
export { default as WizardStepper, WizardStepperCompact } from './WizardStepper';
export { default as DeckCard, DeckCardSkeleton } from './DeckCard';
export { default as AssetSelector, AssetSelectorCompact } from './AssetSelector';
export { default as RFIDScannerPanel, RFIDScannerMini } from './RFIDScannerPanel';
export { default as CardSelector, getSelectedCards } from './CardSelector';
