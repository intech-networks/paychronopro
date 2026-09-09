const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;

export function isHexColor(value) {
  return hexColorPattern.test(String(value || ''));
}

export function hexToRgb(value) {
  if (!isHexColor(value)) return null;
  const normalized = String(value).slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
}

export function relativeLuminance(value) {
  const rgb = hexToRgb(value);
  if (!rgb) return 0;
  return rgb
    .map((channel) => channel / 255)
    .map((channel) => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

export function contrastRatio(first, second) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + .05) / (darker + .05);
}

export function bestContrastColor(background) {
  return contrastRatio(background, '#FFFFFF') >= contrastRatio(background, '#17314D') ? '#FFFFFF' : '#17314D';
}

export function mixHex(color, target, targetWeight) {
  const sourceRgb = hexToRgb(color);
  const targetRgb = hexToRgb(target);
  if (!sourceRgb || !targetRgb) return target;
  return `#${sourceRgb.map((channel, index) => Math.round(channel + (targetRgb[index] - channel) * targetWeight).toString(16).padStart(2, '0')).join('')}`;
}

export function readableTextColor(color, background, direction) {
  if (contrastRatio(color, background) >= 4.5) return color;
  for (const weight of [.2, .4, .6, .8, 1]) {
    const candidate = mixHex(color, direction, weight);
    if (contrastRatio(candidate, background) >= 4.5) return candidate;
  }
  return direction;
}

export function applySiteTheme(settings, fallback = {}) {
  const root = document.documentElement;
  const primary = settings?.primaryColor || fallback.primaryColor || '#17314D';
  const secondary = settings?.secondaryColor || fallback.secondaryColor || '#3F5872';
  const accent = settings?.accentColor || fallback.accentColor || '#9A6D4A';
  const darkMode = root.dataset.theme === 'dark';
  const appPage = darkMode ? '#18191A' : '#EDF1F4';
  const readableLink = readableTextColor(accent, appPage, darkMode ? '#FFFFFF' : '#17314D');
  root.style.setProperty('--navy', primary);
  root.style.setProperty('--slate', secondary);
  root.style.setProperty('--copper', accent);
  root.style.setProperty('--app-link', readableLink);
  root.style.setProperty('--peach', mixHex(accent, '#FFFFFF', .72));
  root.style.setProperty('--mist', mixHex(secondary, '#FFFFFF', .48));
  root.style.setProperty('--silver', mixHex(secondary, '#FFFFFF', .78));
  root.style.setProperty('--navy-contrast', bestContrastColor(primary));
  root.style.setProperty('--slate-contrast', bestContrastColor(secondary));
  root.style.setProperty('--copper-contrast', bestContrastColor(accent));
}
