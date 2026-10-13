// Character art for the game, built with the existing pipeline (animation/charlib.js).
// Portraits are crops of the standing character, as planned in docs/plan.md.
import { loadCharacter, buildCharacter } from '../animation/charlib.js';
import { recipeOf } from './core/characters.js';

const built = {}, portraits = {};

/** Built (recoloured, cached) character for drawing; keyed by id + recipe so it stays stable. */
export function characterArt(M, c) {
  const key = c.id + '|' + JSON.stringify(recipeOf(c));
  if (!built[key]) built[key] = loadCharacter(M, recipeOf(c)).then(() => buildCharacter(M, recipeOf(c)));
  return built[key];
}

export function portraitURL(M, c) {
  if (!portraits[c.id]) {
    portraits[c.id] = characterArt(M, c).then(ch => {
      const [skullY, skullX] = ch.face.skull, size = 560, out = 192;
      const cv = document.createElement('canvas');
      cv.width = cv.height = out;
      cv.getContext('2d').drawImage(ch.still, skullX - size / 2, skullY - 70, size, size, 0, 0, out, out);
      return cv.toDataURL('image/png');
    });
  }
  return portraits[c.id];
}

/** Fill every <img data-portrait="id"> under root. */
export function hydratePortraits(M, state, root = document) {
  for (const el of root.querySelectorAll('img[data-portrait]')) {
    const c = state.characters[el.dataset.portrait];
    if (!c || el.dataset.ready === c.id) continue;
    portraitURL(M, c).then(url => { el.src = url; el.dataset.ready = c.id; }).catch(() => {});
  }
}
