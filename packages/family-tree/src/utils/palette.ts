import * as d3 from 'd3';
import { ensureHexColor } from './color';

export const ROLE_PALETTE = ['#8E44AD', '#1976D2', '#00897B', '#F4511E', '#6D4C41', '#039BE5', '#FBC02D', '#5E35B1', '#43A047', '#00838F', '#EF6C00', '#7E57C2'] as const;
export const OWNER_PALETTE = ['#EF5350', '#29B6F6', '#AB47BC', '#26A69A', '#FFA726', '#7E57C2', '#66BB6A', '#FF7043'] as const;
const FALLBACK_ROLE_PALETTE = ['#90CAF9', '#F48FB1', '#CE93D8', '#FFCC80', '#A5D6A7', '#FFAB91', '#9FA8DA', '#80CBC4', '#B39DDB', '#F06292', '#AED581', '#4FC3F7'] as const;

export function generateColorFromIndex(index: number): string {
  const stops = 24;
  if (typeof d3.interpolateRainbow === 'function') {
    const color = d3.color(d3.interpolateRainbow((index % stops) / stops));
    if (color) return ensureHexColor(color.formatHex());
  }
  return ensureHexColor(FALLBACK_ROLE_PALETTE[index % FALLBACK_ROLE_PALETTE.length]);
}
