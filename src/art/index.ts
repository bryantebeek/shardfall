// CONTRACT — procedural pixel art. Everything is drawn at runtime onto canvases; no image files.
// All functions are cached (draw once, return the same object/URL afterwards).
export type { SpriteSheet } from './sprites';
export type { TextureId } from './textures';
export type { UiIcon, AccessoryIcon } from './icons';

/** getSprite(id: SpriteId): SpriteSheet — heroes ~48x56, small enemies 24–56px, elites ~72–88px, boss ~128px. */
export { getSprite } from './sprites';
/** getTexture(id: TextureId): HTMLCanvasElement — seamless tileable 32x32 pixel textures. */
export { getTexture } from './textures';
/** cardArtUrl(art: CardArt): string — 64x40 pixel illustration as PNG data URL. */
export { cardArtUrl } from './cardart';
/** 16x16 pixel icons as PNG data URLs. */
export { elementIconUrl, intentIconUrl, statusIconUrl, uiIconUrl, accessoryIconUrl } from './icons';
/** portraitUrl(id: HeroId): string — 32x32 bust portrait PNG data URL for UI frames. */
export { portraitUrl } from './sprites';
