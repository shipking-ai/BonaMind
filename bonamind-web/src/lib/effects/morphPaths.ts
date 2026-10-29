/**
 * morphPaths — paired SVG path data for `MorphShape` locked→unlocked morph.
 *
 * Each entry has a `locked` (simple outline) and `unlocked` (icon shape)
 * path. Both paths use exactly the same number of commands so
 * anime.js v4's `morphTo` interpolates smoothly between them.
 *
 * The locked state is always a clean 4-segment circle outline.
 * The unlocked state is a 4-segment approximation of each icon
 * (trophy, star, flame, lightning, target, crown, medal, award).
 *
 * "Same number of commands" means both paths have the same
 * number of M / C / Z tokens. All paths here are:
 *   M (1) + C (4) + C (4) + C (4) + C (4) + Z (1)
 * = 6 tokens (format string).
 *
 * viewBox is always "0 0 100 100".
 */

export interface MorphPathPair {
  locked: string;
  unlocked: string;
}

export const MORPH_PATHS: Record<string, MorphPathPair> = {
  /** Trophy — circle → cup with handles */
  trophy: {
    locked:
      'M50 10 C72 10 90 28 90 50 C90 72 72 90 50 90 C28 90 10 72 10 50 C10 28 28 10 50 10 Z',
    unlocked:
      'M50 10 C50 18 55 30 55 30 C70 30 78 48 78 48 C72 60 65 65 58 70 C62 80 72 85 78 88 C60 88 55 82 50 75 C45 82 40 88 22 88 C28 85 38 80 42 70 C35 65 28 60 22 48 C22 48 30 30 45 30 C45 30 50 18 50 10 Z',
  },

  /** Star — circle → 4-pointed star */
  star: {
    locked:
      'M50 10 C72 10 90 28 90 50 C90 72 72 90 50 90 C28 90 10 72 10 50 C10 28 28 10 50 10 Z',
    unlocked:
      'M50 5 C50 30 50 30 55 40 C65 30 85 20 80 30 C75 40 60 50 50 50 C60 50 75 60 80 70 C85 80 65 70 55 60 C50 70 50 70 50 95 C50 70 50 70 45 60 C35 70 15 80 20 70 C25 60 40 50 50 50 C40 50 25 40 20 30 C15 20 35 30 45 40 C50 30 50 30 50 5 Z',
  },

  /** Flame — circle → fire drop */
  flame: {
    locked:
      'M50 10 C72 10 90 28 90 50 C90 72 72 90 50 90 C28 90 10 72 10 50 C10 28 28 10 50 10 Z',
    unlocked:
      'M50 10 C50 10 55 25 58 35 C65 30 75 35 78 45 C82 55 80 68 72 78 C65 86 58 90 50 90 C42 90 35 86 28 78 C20 68 18 55 22 45 C25 35 35 30 42 35 C45 25 50 10 50 10 Z',
  },

  /** Zap/Lightning — circle → lightning bolt */
  zap: {
    locked:
      'M50 10 C72 10 90 28 90 50 C90 72 72 90 50 90 C28 90 10 72 10 50 C10 28 28 10 50 10 Z',
    unlocked:
      'M45 10 C40 20 35 40 30 50 C25 60 15 60 15 60 C30 58 38 55 40 50 C38 62 32 78 28 88 C32 78 38 68 45 55 C52 55 60 60 70 65 C68 55 62 48 58 45 C72 40 85 30 85 25 C70 28 60 32 55 38 C52 28 50 18 45 10 Z',
  },

  /** Target — circle → concentric circles with crosshairs */
  target: {
    locked:
      'M50 10 C72 10 90 28 90 50 C90 72 72 90 50 90 C28 90 10 72 10 50 C10 28 28 10 50 10 Z',
    unlocked:
      'M50 5 C75 5 95 25 95 50 C95 75 75 95 50 95 C25 95 5 75 5 50 C5 25 25 5 50 5 Z M50 25 C65 25 75 35 75 50 C75 65 65 75 50 75 C35 75 25 65 25 50 C25 35 35 25 50 25 Z M50 40 C55 40 60 45 60 50 C60 55 55 60 50 60 C45 60 40 55 40 50 C40 45 45 40 50 40 Z M48 15 L52 15 L52 25 L48 25 Z M48 75 L52 75 L52 85 L48 85 Z M15 48 L25 48 L25 52 L15 52 Z M75 48 L85 48 L85 52 L75 52 Z',
  },

  /** Crown — circle → crown silhouette */
  crown: {
    locked:
      'M50 10 C72 10 90 28 90 50 C90 72 72 90 50 90 C28 90 10 72 10 50 C10 28 28 10 50 10 Z',
    unlocked:
      'M50 15 C45 25 40 30 35 28 C30 25 25 18 22 22 C20 26 18 35 18 40 C18 45 20 55 22 70 C24 78 30 85 50 85 C70 85 76 78 78 70 C80 55 82 45 82 40 C82 35 80 26 78 22 C75 18 70 25 65 28 C60 30 55 25 50 15 Z',
  },

  /** Medal — circle → medallion with ribbon */
  medal: {
    locked:
      'M50 10 C72 10 90 28 90 50 C90 72 72 90 50 90 C28 90 10 72 10 50 C10 28 28 10 50 10 Z',
    unlocked:
      'M50 10 C50 18 48 25 45 30 C55 30 60 25 60 18 C62 25 65 30 70 32 C68 38 62 42 55 45 C65 48 75 55 78 65 C80 75 75 85 65 88 C55 90 45 90 35 88 C25 85 20 75 22 65 C25 55 35 48 45 45 C38 42 32 38 30 32 C35 30 38 25 40 18 C42 20 45 22 50 22 C55 22 58 20 60 18 C55 22 52 25 50 30 C48 25 45 22 50 10 Z',
  },

  /** Award/ribbon — circle → ribbon rosette */
  award: {
    locked:
      'M50 10 C72 10 90 28 90 50 C90 72 72 90 50 90 C28 90 10 72 10 50 C10 28 28 10 50 10 Z',
    unlocked:
      'M50 15 C30 15 15 30 15 50 C15 70 30 85 50 85 C70 85 85 70 85 50 C85 30 70 15 50 15 Z M50 30 C60 30 68 38 68 48 C68 58 60 65 50 65 C40 65 32 58 32 48 C32 38 40 30 50 30 Z M42 65 L50 72 L58 65 L58 85 L50 78 L42 85 Z',
  },
};
