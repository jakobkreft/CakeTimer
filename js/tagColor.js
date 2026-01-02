(() => {
  'use strict';

  const DEFAULT_ACCENT = '#16a34a';
  const tagColorCache = new Map();

  const colorParserCtx = (() => {
    try {
      return document.createElement('canvas').getContext('2d');
    } catch {
      return null;
    }
  })();

  function resolveColorInfo(color) {
    if (!colorParserCtx) return null;
    try {
      colorParserCtx.fillStyle = color;
      const normalized = colorParserCtx.fillStyle;
      if (!normalized) return null;
      if (normalized.startsWith('#')) {
        return hexToRgb(normalized);
      }
      const match = normalized.match(/rgba?\(([^)]+)\)/i);
      if (match) {
        const parts = match[1].split(',').map(part => parseFloat(part.trim()));
        if (parts.length >= 3) {
          return { r: parts[0], g: parts[1], b: parts[2], normalized };
        }
      }
    } catch { }
    return null;
  }

  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) {
      h = h.split('').map(ch => ch + ch).join('');
    }
    if (h.length !== 6) return null;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b, normalized: `#${h}` };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
        case g: h = ((b - r) / d + 2); break;
        default: h = ((r - g) / d + 4); break;
      }
      h /= 6;
    }
    return [h * 360, s || 0, l];
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1 = 0, g1 = 0, b1 = 0;
    if (hp >= 0 && hp < 1) { r1 = c; g1 = x; }
    else if (hp < 2) { r1 = x; g1 = c; }
    else if (hp < 3) { g1 = c; b1 = x; }
    else if (hp < 4) { g1 = x; b1 = c; }
    else if (hp < 5) { r1 = x; b1 = c; }
    else { r1 = c; b1 = x; }
    const m = l - c / 2;
    return [
      Math.round((r1 + m) * 255),
      Math.round((g1 + m) * 255),
      Math.round((b1 + m) * 255)
    ];
  }

  function hslToRgbString(h, s, l) {
    const [r, g, b] = hslToRgb(h, s, l);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function normalizeTagKey(tag) {
    return (typeof tag === 'string' && tag.trim())
      ? tag.trim().toLowerCase()
      : '';
  }

  const defaultAccentInfo = resolveColorInfo(DEFAULT_ACCENT) || { r: 22, g: 163, b: 74, normalized: DEFAULT_ACCENT };
  const defaultAccentMeta = {
    accentKey: defaultAccentInfo.normalized || DEFAULT_ACCENT,
    baseHsl: rgbToHsl(defaultAccentInfo.r, defaultAccentInfo.g, defaultAccentInfo.b),
  };

  function resolveAccentMeta(accent) {
    const info = resolveColorInfo(accent);
    if (!info) return defaultAccentMeta;
    return {
      accentKey: info.normalized || accent || DEFAULT_ACCENT,
      baseHsl: rgbToHsl(info.r, info.g, info.b),
    };
  }

  function normalizeAccentMeta(accent) {
    if (accent && typeof accent === 'object' && Array.isArray(accent.baseHsl)) {
      return accent;
    }
    return resolveAccentMeta(accent);
  }

  function jitterColorFromAccent(baseHsl, key) {
    const [baseH, baseS, baseL] = baseHsl;
    const hash = hashString(key || '');
    const hueShift = ((hash & 0xff) / 255 - 0.5) * 40;
    const satShift = (((hash >>> 8) & 0xff) / 255 - 0.5) * 0.4;
    const lightShift = (((hash >>> 16) & 0xff) / 255 - 0.5) * 0.34;
    const h = (baseH + hueShift + 360) % 360;
    const s = Math.max(0.2, Math.min(0.95, baseS + satShift));
    const l = Math.max(0.2, Math.min(0.7, baseL + lightShift));
    return hslToRgbString(h, s, l);
  }

  function colorForTag(tag, fallbackKey, accent, overrides) {
    const keyTag = normalizeTagKey(tag);
    const keyFallback = normalizeTagKey(fallbackKey);
    const map = overrides && typeof overrides === 'object' ? overrides : {};
    if (keyTag && map[keyTag]) {
      return map[keyTag];
    }
    if (!keyTag && keyFallback && map[keyFallback]) {
      return map[keyFallback];
    }
    const accentMeta = normalizeAccentMeta(accent);
    const cacheKey = `${accentMeta.accentKey}|${keyTag || keyFallback || 'untagged'}`;
    let color = tagColorCache.get(cacheKey);
    if (!color) {
      const jitterKey = keyTag || keyFallback || 'untagged';
      color = jitterColorFromAccent(accentMeta.baseHsl, jitterKey);
      tagColorCache.set(cacheKey, color);
    }
    return color;
  }

  function clearCache() {
    tagColorCache.clear();
  }

  function randomColor(accent) {
    const accentMeta = normalizeAccentMeta(accent);
    const [baseH, baseS, baseL] = accentMeta.baseHsl;
    const hueShift = (Math.random() - 0.5) * 40;
    const satShift = (Math.random() - 0.5) * 0.4;
    const lightShift = (Math.random() - 0.5) * 0.24;
    const h = (baseH + hueShift + 360) % 360;
    const s = Math.max(0.2, Math.min(0.95, baseS + satShift));
    const l = Math.max(0.2, Math.min(0.7, baseL + lightShift));
    return hslToRgbString(h, s, l);
  }

  function sessionFallbackKey(startMs) {
    if (typeof startMs !== 'number' || Number.isNaN(startMs)) return 'session-unknown';
    return `session-${Math.round(startMs)}`;
  }

  window.TagColor = {
    DEFAULT_ACCENT,
    normalizeTagKey,
    resolveAccentMeta,
    colorForTag,
    clearCache,
    randomColor,
    sessionFallbackKey,
  };
})();
