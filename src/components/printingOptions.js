import { assessPrintQuality } from '../utils/imageQuality';

const PRINTING_VARIATION_LABELS = {
  AA: 'Alternate Art',
  AB: 'Alternate Border',
  AT: 'Alternate Text',
  EA: 'Extended Art',
  FA: 'Full Art',
  HS: 'Half Size',
};

export function getQualityTone(qualityLabel) {
  if (qualityLabel === 'Optimal') return 'bg-emerald-500/12 text-emerald-200 ring-1 ring-emerald-500/20';
  if (qualityLabel === 'Good') return 'bg-sky-500/12 text-sky-200 ring-1 ring-sky-500/20';
  if (qualityLabel === 'Fair') return 'bg-amber-500/12 text-amber-200 ring-1 ring-amber-500/20';
  return 'bg-rose-500/12 text-rose-200 ring-1 ring-rose-500/20';
}

export function printingMatchesVariant(printing, tag) {
  if (!printing) {
    return false;
  }

  if (tag === 'V') {
    return printing.rarity === 'V';
  }

  return Array.isArray(printing.art_variations) && printing.art_variations.includes(tag);
}

export function getPrintingVariantLabel(printing) {
  if (!printing) {
    return 'Standard';
  }

  const labels = [];

  if (printing.rarity === 'V') {
    labels.push('Marvel');
  }

  if (Array.isArray(printing.art_variations)) {
    printing.art_variations.forEach((variation) => {
      const label = PRINTING_VARIATION_LABELS[variation];
      if (label && !labels.includes(label)) {
        labels.push(label);
      }
    });
  }

  return labels.length > 0 ? labels.join(' • ') : 'Standard';
}

export function getPrintingMetrics(rankedByResolution, targetPrinting) {
  const dims =
    rankedByResolution.find((entry) => entry.printing.unique_id === targetPrinting?.unique_id) || { width: 0, height: 0 };

  return {
    width: dims.width || 0,
    height: dims.height || 0,
  };
}

export function resolveDefaultPrinting(card, rankedByResolution, forcedPrinting = null) {
  if (!card) {
    return {
      printing: null,
      currentPrintingIdx: 0,
      currentResolution: { width: 0, height: 0, rank: null, quality: null },
    };
  }

  const bestByPixels = rankedByResolution[0]?.printing || card.printings?.[card.printings.length - 1] || card.printings?.[0] || null;

  const findNewestMeeting300 = () => {
    for (let index = (card.printings?.length || 0) - 1; index >= 0; index -= 1) {
      const candidate = card.printings[index];
      const dimensions = getPrintingMetrics(rankedByResolution, candidate);
      const quality = assessPrintQuality(dimensions.width, dimensions.height);

      if (Math.min(quality.dpiX, quality.dpiY) >= 300) {
        return candidate;
      }
    }

    return null;
  };

  const findUpscaledMeeting300 = () => {
    for (let index = (card.printings?.length || 0) - 1; index >= 0; index -= 1) {
      const candidate = card.printings[index];

      if (!candidate._upscaled) {
        continue;
      }

      const dimensions = getPrintingMetrics(rankedByResolution, candidate);
      const quality = assessPrintQuality(dimensions.width, dimensions.height);

      if (Math.min(quality.dpiX, quality.dpiY) >= 300) {
        return candidate;
      }
    }

    return null;
  };

  const printing = forcedPrinting || findUpscaledMeeting300() || findNewestMeeting300() || bestByPixels;
  const currentPrintingIdx = Math.max(
    0,
    card.printings?.findIndex((candidate) => candidate.unique_id === printing?.unique_id) ?? 0
  );
  const currentResolution = getPrintingMetrics(rankedByResolution, printing);
  const quality = assessPrintQuality(currentResolution.width, currentResolution.height);
  const rankIndex = rankedByResolution.findIndex((entry) => entry.printing.unique_id === printing?.unique_id);

  return {
    printing,
    currentPrintingIdx,
    currentResolution: {
      width: currentResolution.width,
      height: currentResolution.height,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      quality,
    },
  };
}

export function buildPrintingOptions(card, rankedByResolution) {
  return (card?.printings || []).map((printing, index) => {
    const metrics = getPrintingMetrics(rankedByResolution, printing);

    return {
      printing,
      index,
      label: getPrintingVariantLabel(printing),
      quality: assessPrintQuality(metrics.width, metrics.height),
    };
  });
}
