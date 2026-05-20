/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const getContrastTextColor = (hexcolor: string) => {
  if (!hexcolor) return '#000000';
  const hex = hexcolor.replace('#', '');
  if (hex.length !== 6 && hex.length !== 3) return '#000000';
  
  let r, g, b;
  if (hex.length === 6) {
    r = parseInt(hex.substr(0, 2), 16);
    g = parseInt(hex.substr(2, 2), 16);
    b = parseInt(hex.substr(4, 2), 16);
  } else {
    r = parseInt(hex.substr(0, 1).repeat(2), 16);
    g = parseInt(hex.substr(1, 1).repeat(2), 16);
    b = parseInt(hex.substr(2, 1).repeat(2), 16);
  }
  
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#000000' : '#ffffff';
};
