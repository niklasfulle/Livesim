export interface TextureRect {
  color: string;
  height: number;
  part?: "crown" | "detail" | "shadow" | "trunk";
  width: number;
  x: number;
  y: number;
}

const variation = (x: number, y: number, index: number): number => {
  let value = Math.imul(x + 1, 374_761_393) + Math.imul(y + 1, 668_265_263) + index * 1_597_334_677;
  value = Math.imul(value ^ (value >>> 13), 1_274_126_177);
  return (value ^ (value >>> 16)) >>> 0;
};

const GRASS_COLORS = ["#477a40", "#578d48", "#69a052", "#7fb35d", "#9cc66c"];
const WATER_COLORS = ["#236d96", "#3185aa", "#48a0bd", "#75bfd0"];
const SAND_COLORS = ["#b98f51", "#cba65f", "#e1c77a", "#f0da94"];

export const waterTexture = (patchX: number, patchY: number): TextureRect[] => {
  const texture: TextureRect[] = [{ color: "#287aa3", height: 63, width: 63, x: 0, y: 0 }];
  for (let detail = 0; detail < 24; detail += 1) {
    const random = variation(patchX, patchY, detail + 211);
    const width = detail % 4 === 0 ? 12 : 8;
    texture.push({
      color: WATER_COLORS[detail % WATER_COLORS.length],
      height: 4,
      width,
      x: ((random % 12) + 1) * 4,
      y: (Math.floor(random / 32) % 16) * 4
    });
  }
  return texture;
};

export const sandTexture = (patchX: number, patchY: number): TextureRect[] => {
  const texture: TextureRect[] = [{ color: "#d5b86d", height: 63, width: 63, x: 0, y: 0 }];
  for (let detail = 0; detail < 28; detail += 1) {
    const random = variation(patchX, patchY, detail + 307);
    const width = detail % 6 === 0 ? 8 : 4;
    texture.push({
      color: SAND_COLORS[detail % SAND_COLORS.length],
      height: 4,
      width,
      x: ((random % 14) + 1) * 4,
      y: ((Math.floor(random / 32) % 14) + 1) * 4
    });
  }
  return texture;
};

export const grassTexture = (patchX: number, patchY: number): TextureRect[] => {
  const texture: TextureRect[] = [{ color: "#538647", height: 63, width: 63, x: 0, y: 0 }];
  for (let detail = 0; detail < 32; detail += 1) {
    const random = variation(patchX, patchY, detail);
    const width = detail % 6 === 0 ? 8 : 4;
    const maxColumn = width === 8 ? 13 : 14;
    texture.push({
      color: GRASS_COLORS[detail % GRASS_COLORS.length],
      height: 4,
      width,
      x: ((random % maxColumn) + 1) * 4,
      y: ((Math.floor(random / 32) % 14) + 1) * 4
    });
  }
  for (let clump = 0; clump < 7; clump += 1) {
    const random = variation(patchX, patchY, clump + 47);
    const x = ((random % 13) + 1) * 4;
    const y = ((Math.floor(random / 64) % 12) + 2) * 4;
    texture.push(
      { color: "#3c6a3a", height: 8, width: 4, x, y },
      { color: "#afd17a", height: 4, width: 4, x: x + 4, y: y - 4 }
    );
  }
  return texture;
};

const CROWN_ROW_WIDTHS = [48, 80, 112, 136, 152, 160, 168, 168, 168, 168, 168, 160, 152, 136, 112, 80, 48];
const CROWN_COLORS = ["#559b50", "#377844", "#2b673b", "#173f2b"];
const LEAF_COLORS = ["#438b49", "#559b50", "#70aa5b", "#8abd68"];

export const treeTexture = (patchX: number, patchY: number, stock: number): TextureRect[] => {
  const texture: TextureRect[] = [];
  const crownTop = -36;
  CROWN_ROW_WIDTHS.forEach((width, row) => {
    texture.push({
      color: "rgba(12, 25, 18, 0.28)",
      height: 8,
      part: "shadow",
      width,
      x: 40 - width / 2,
      y: crownTop + row * 8 + 8
    });
  });
  texture.push(
    { color: "#3c261c", height: 44, part: "trunk", width: 16, x: 24, y: 24 },
    { color: "#75452b", height: 40, part: "trunk", width: 8, x: 28, y: 20 }
  );
  CROWN_ROW_WIDTHS.forEach((width, row) => {
    texture.push({
      color: CROWN_COLORS[Math.min(CROWN_COLORS.length - 1, Math.floor(row / 4))],
      height: 8,
      part: "crown",
      width,
      x: 32 - width / 2,
      y: crownTop + row * 8
    });
  });
  for (let detail = 0; detail < 42; detail += 1) {
    const random = variation(patchX, patchY, detail + 101);
    const row = (random % 15) + 1;
    const rowWidth = CROWN_ROW_WIDTHS[row];
    const detailWidth = detail % 7 === 0 ? 16 : 8;
    const availableColumns = Math.max(1, Math.floor((rowWidth - 16 - detailWidth) / 8));
    texture.push({
      color: LEAF_COLORS[detail % LEAF_COLORS.length],
      height: 8,
      part: "detail",
      width: detailWidth,
      x: 32 - rowWidth / 2 + 8 + (Math.floor(random / 32) % availableColumns) * 8,
      y: crownTop + row * 8
    });
  }
  texture.push(
    { color: "#4a2d1f", height: 12, part: "trunk", width: 12, x: 26, y: 26 },
    { color: "#a2663c", height: 8, part: "trunk", width: 4, x: 30, y: 26 }
  );
  if (stock < 300) {
    texture.push(
      { color: "rgba(45, 31, 22, 0.48)", height: 16, part: "detail", width: 40, x: -16, y: 52 },
      { color: "rgba(45, 31, 22, 0.48)", height: 16, part: "detail", width: 32, x: 48, y: 68 }
    );
  }
  return texture;
};
