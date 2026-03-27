import { describe, it, expect } from 'vitest';
import {
  getBestAssetImageUrl,
  normalizeCardMappingsFromDeck,
  buildCardMappingsPayload
} from '../cardMapping';

describe('cardMapping utilities', () => {
  describe('getBestAssetImageUrl', () => {
    it('returns thumbnailUrl when available', () => {
      const asset = { thumbnailUrl: '/thumb.webp', imageUrl: '/full.jpg' };
      expect(getBestAssetImageUrl(asset)).toBe('/thumb.webp');
    });

    it('falls back to imageUrl when no thumbnailUrl', () => {
      const asset = { imageUrl: '/full.jpg' };
      expect(getBestAssetImageUrl(asset)).toBe('/full.jpg');
    });

    it('returns null when asset is null', () => {
      expect(getBestAssetImageUrl(null)).toBeNull();
    });

    it('returns null when asset is undefined', () => {
      expect(getBestAssetImageUrl(undefined)).toBeNull();
    });

    it('returns null when asset has no image URLs', () => {
      expect(getBestAssetImageUrl({})).toBeNull();
    });
  });

  describe('normalizeCardMappingsFromDeck', () => {
    it('normalizes from cardMappings property', () => {
      const deck = {
        cardMappings: [
          { uid: 'AA000001', assignedValue: 'Cat', displayData: { value: 'Cat' } }
        ]
      };
      const result = normalizeCardMappingsFromDeck(deck);

      expect(result).toHaveLength(1);
      expect(result[0].uid).toBe('AA000001');
    });

    it('falls back to cards property', () => {
      const deck = {
        cards: [
          { uid: 'AA000001', displayData: { value: 'Cat' } }
        ]
      };
      const result = normalizeCardMappingsFromDeck(deck);

      expect(result).toHaveLength(1);
      expect(result[0].uid).toBe('AA000001');
    });

    it('filters out mappings without uid', () => {
      const deck = {
        cardMappings: [
          { uid: 'AA000001', assignedValue: 'Cat' },
          { assignedValue: 'Dog' },
          { uid: null, assignedValue: 'Bird' }
        ]
      };
      const result = normalizeCardMappingsFromDeck(deck);

      expect(result).toHaveLength(1);
      expect(result[0].uid).toBe('AA000001');
    });

    it('returns empty array for null/undefined deck', () => {
      expect(normalizeCardMappingsFromDeck(null)).toEqual([]);
      expect(normalizeCardMappingsFromDeck(undefined)).toEqual([]);
    });

    it('returns empty array for deck without mappings', () => {
      expect(normalizeCardMappingsFromDeck({})).toEqual([]);
    });

    it('merges assignedValue from mapping and displayData', () => {
      const deck = {
        cardMappings: [
          { uid: 'AA000001', assignedValue: 'Cat', displayData: { key: 'k1', display: '🐱' } }
        ]
      };
      const result = normalizeCardMappingsFromDeck(deck);

      expect(result[0].assignedValue).toBe('Cat');
      expect(result[0].displayData.key).toBe('k1');
      expect(result[0].displayData.display).toBe('🐱');
    });
  });

  describe('buildCardMappingsPayload', () => {
    it('builds payload with card assignments', () => {
      const cards = [{ uid: 'AA000001' }, { uid: 'AA000002' }];
      const assignments = {
        AA000001: { value: 'Cat', display: '🐱', imageUrl: '/cat.jpg' },
        AA000002: { value: 'Dog', display: '🐶' }
      };

      const result = buildCardMappingsPayload(cards, assignments);

      expect(result).toHaveLength(2);
      expect(result[0].uid).toBe('AA000001');
      expect(result[0].assignedValue).toBe('Cat');
      expect(result[0].displayData.imageUrl).toBe('/cat.jpg');
    });

    it('uses uid as fallback for assignedValue', () => {
      const cards = [{ uid: 'AA000001' }];
      const assignments = {};

      const result = buildCardMappingsPayload(cards, assignments);

      expect(result[0].assignedValue).toBe('AA000001');
    });

    it('includes all asset URLs in displayData', () => {
      const cards = [{ uid: 'AA000001' }];
      const assignments = {
        AA000001: {
          value: 'Cat',
          imageUrl: '/cat.jpg',
          thumbnailUrl: '/cat-thumb.webp',
          audioUrl: '/cat.mp3'
        }
      };

      const result = buildCardMappingsPayload(cards, assignments);
      const dd = result[0].displayData;

      expect(dd.imageUrl).toBe('/cat.jpg');
      expect(dd.thumbnailUrl).toBe('/cat-thumb.webp');
      expect(dd.audioUrl).toBe('/cat.mp3');
    });
  });
});
