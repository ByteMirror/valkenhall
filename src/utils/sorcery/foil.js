export const FOIL_LABEL = { F: 'Foil', R: 'Rainbow Foil' };
export const FOIL_LABEL_COLOR = { F: 'text-cyan-400', R: 'text-fuchsia-400' };
export const FOIL_OVERLAY_CLASSES = 'foil-overlay foil-overlay--always';

export function isFoilFinish(foiling) {
  return foiling === 'F' || foiling === 'R';
}
