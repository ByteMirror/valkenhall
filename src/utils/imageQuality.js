// Image quality utilities: measure dimensions, rank printings by resolution, and assess print quality

const MM_PER_INCH = 25.4;
const CARD_WIDTH_MM = 63;   // standard trading card width
const CARD_HEIGHT_MM = 88;  // standard trading card height
const TARGET_DPI = 300;     // target print DPI

const REQUIRED_WIDTH_PX = Math.round((CARD_WIDTH_MM / MM_PER_INCH) * TARGET_DPI);
const REQUIRED_HEIGHT_PX = Math.round((CARD_HEIGHT_MM / MM_PER_INCH) * TARGET_DPI);

export function measureImageDimensions(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0, pixels: (img.naturalWidth || 0) * (img.naturalHeight || 0) });
    };
    img.onerror = () => resolve({ width: 0, height: 0, pixels: 0 });
    img.src = url;
  });
}

export async function rankPrintingsByResolution(card) {
  if (!card || !Array.isArray(card.printings)) {
    return [];
  }
  const results = await Promise.all(
    card.printings.map(async (printing) => {
      const dims = await measureImageDimensions(printing.image_url);
      const width = dims.width || printing.image_width || 0;
      const height = dims.height || printing.image_height || 0;
      const pixels = width * height;
      return { printing, width, height, pixels };
    })
  );

  return sortRankedPrintingsByResolution(results);
}

function sortRankedPrintingsByResolution(entries) {
  return entries
    .slice()
    .sort((a, b) => {
      if (b.pixels !== a.pixels) return b.pixels - a.pixels;
      if (b.width !== a.width) return b.width - a.width;
      return b.height - a.height;
    });
}

export function rankPrintingsByResolutionStatic(card) {
  if (!card || !Array.isArray(card.printings)) {
    return [];
  }

  const results = card.printings.map((printing) => {
    const estimatedDims = estimateDimsFromUrl(printing.image_url);
    const width = printing.image_width || estimatedDims.width || 0;
    const height = printing.image_height || estimatedDims.height || 0;
    const pixels = width * height;

    return {
      printing,
      width,
      height,
      pixels,
    };
  });

  return sortRankedPrintingsByResolution(results);
}

export function estimateDimsFromUrl(url) {
  if (!url || typeof url !== 'string') return { width: 0, height: 0, pixels: 0 };
  const widthMatch = url.match(/width-(\d+)/i);
  if (widthMatch) {
    const width = parseInt(widthMatch[1], 10) || 0;
    const height = Math.round(width * (CARD_HEIGHT_MM / CARD_WIDTH_MM));
    return { width, height, pixels: width * height };
  }
  // Heuristic: fabmaster cardfaces are typically full-res assets
  if (/\/cardfaces\//i.test(url)) {
    const width = 1500; // assume full width sufficient for 300 DPI
    const height = Math.round(width * (CARD_HEIGHT_MM / CARD_WIDTH_MM));
    return { width, height, pixels: width * height };
  }
  // Heuristic: media/images without explicit width are likely originals
  if (/\/media\/images\//i.test(url) && !/width-\d+/i.test(url)) {
    const width = 1200; // reasonable original size fallback
    const height = Math.round(width * (CARD_HEIGHT_MM / CARD_WIDTH_MM));
    return { width, height, pixels: width * height };
  }
  return { width: 0, height: 0, pixels: 0 };
}

export function selectPrintingNewestMeeting300Static(card) {
  if (!card || !Array.isArray(card.printings) || card.printings.length === 0) return null;

  const meetsThreshold = (printing) => {
    const est = estimateDimsFromUrl(printing.image_url);
    const width = printing.image_width || est.width || 0;
    const height = printing.image_height || est.height || 0;
    const q = assessPrintQuality(width, height);
    return Math.min(q.dpiX, q.dpiY) >= 300;
  };

  for (let i = card.printings.length - 1; i >= 0; i--) {
    if (meetsThreshold(card.printings[i])) return card.printings[i];
  }
  // fallback: pick the printing with the highest estimated pixels, preferring newer on ties
  let bestIdx = card.printings.length - 1;
  let bestPixels = -1;
  for (let i = 0; i < card.printings.length; i++) {
    const p = card.printings[i];
    const est = estimateDimsFromUrl(p.image_url);
    const width = p.image_width || est.width || 0;
    const height = p.image_height || est.height || 0;
    const px = width * height;
    if (px > bestPixels || (px === bestPixels && i > bestIdx)) {
      bestPixels = px;
      bestIdx = i;
    }
  }
  return card.printings[bestIdx];
}

export async function selectPrintingNewestMeeting300(card) {
  if (!card || !Array.isArray(card.printings) || card.printings.length === 0) return null;

  const getDims = async (printing) => {
    const measured = await measureImageDimensions(printing.image_url);
    if (measured.width && measured.height) {
      return measured;
    }
    const est = estimateDimsFromUrl(printing.image_url);
    return { width: est.width || 0, height: est.height || 0, pixels: (est.width || 0) * (est.height || 0) };
  };

  // Newest to oldest, pick first meeting 300
  for (let i = card.printings.length - 1; i >= 0; i--) {
    const p = card.printings[i];
    const dims = await getDims(p);
    const quality = assessPrintQuality(dims.width, dims.height);
    const meets = Math.min(quality.dpiX, quality.dpiY) >= 300;
    if (meets) return p;
  }

  // Fallback: highest pixels, prefer newer on tie
  let bestIdx = card.printings.length - 1;
  let bestPixels = -1;
  for (let i = 0; i < card.printings.length; i++) {
    const p = card.printings[i];
    const dims = await getDims(p);
    const px = (dims.width || 0) * (dims.height || 0);
    if (px > bestPixels || (px === bestPixels && i > bestIdx)) {
      bestPixels = px;
      bestIdx = i;
    }
  }
  return card.printings[bestIdx];
}

export function assessPrintQuality(width, height) {
  const dpiX = width > 0 ? width / (CARD_WIDTH_MM / MM_PER_INCH) : 0;
  const dpiY = height > 0 ? height / (CARD_HEIGHT_MM / MM_PER_INCH) : 0;
  const minDpi = Math.min(dpiX, dpiY);

  let label = 'Poor';
  if (minDpi >= 300) {
    label = 'Optimal';
  } else if (minDpi >= 225) {
    label = 'Good';
  } else if (minDpi >= 150) {
    label = 'Fair';
  }

  return {
    label,
    dpiX: Math.round(dpiX),
    dpiY: Math.round(dpiY),
    requiredWidthPx: REQUIRED_WIDTH_PX,
    requiredHeightPx: REQUIRED_HEIGHT_PX,
  };
}

export function findIndexByPrintingUniqueId(list, printing) {
  if (!printing) return -1;
  return list.findIndex((entry) => entry.printing?.unique_id === printing.unique_id);
}

