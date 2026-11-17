/*
 * Paleta de colores base (aprox. Miyuki Delica 11/0).
 *
 * IMPORTANTE: los códigos "C01..C50" son IDs internos de referencia, NO códigos
 * oficiales de Miyuki, y los hex son aproximaciones de pantalla. Para que la
 * plantilla indique el código real a comprar (p. ej. "DB0010"), reemplaza cada
 * ID por el código oficial de tu carta Miyuki y ajusta nombre/hex si hace falta.
 * Formato: ["CÓDIGO", "Nombre", "#rrggbb"]. Puedes añadir o quitar filas.
 */
window.MIYUKI_PALETTE = [
  // Neutros
  ["C01", "Negro opaco", "#1b1b1d"],
  ["C02", "Blanco tiza opaco", "#f1eee6"],
  ["C03", "Gris claro opaco", "#a9a9a7"],
  ["C04", "Gris oscuro opaco", "#5d5e60"],
  ["C05", "Marfil opaco", "#eadfc4"],
  ["C06", "Beige arena opaco", "#cdb894"],
  ["C07", "Taupe opaco", "#8d7a69"],
  // Rojos / rosas
  ["C08", "Rojo opaco", "#c2272d"],
  ["C09", "Rojo oscuro opaco", "#8e1b24"],
  ["C10", "Burdeos opaco", "#5e1424"],
  ["C11", "Coral opaco", "#ef6a5b"],
  ["C12", "Rosa chicle opaco", "#f08cb4"],
  ["C13", "Rosa pálido opaco", "#f6c9d3"],
  ["C14", "Fucsia opaco", "#cf2a7b"],
  ["C15", "Magenta opaco", "#a3205f"],
  // Naranjas / amarillos
  ["C16", "Naranja opaco", "#ea6a1f"],
  ["C17", "Melocotón opaco", "#f4a37d"],
  ["C18", "Mostaza opaco", "#d9a21b"],
  ["C19", "Amarillo opaco", "#f2c82e"],
  ["C20", "Amarillo limón opaco", "#f4e04a"],
  ["C21", "Crema amarillo opaco", "#f5e8a9"],
  // Verdes
  ["C22", "Verde lima opaco", "#9bc83a"],
  ["C23", "Verde hierba opaco", "#4fa23a"],
  ["C24", "Verde bosque opaco", "#2a6a36"],
  ["C25", "Verde oliva opaco", "#6b7a2e"],
  ["C26", "Verde menta opaco", "#9fd9b8"],
  ["C27", "Verde jade opaco", "#2e9a84"],
  ["C28", "Verde pino oscuro", "#17402f"],
  // Azules / turquesas
  ["C29", "Turquesa opaco", "#17a8b4"],
  ["C30", "Aguamarina opaco", "#6fd0cf"],
  ["C31", "Celeste opaco", "#7db8e6"],
  ["C32", "Azul cielo opaco", "#3f8fd6"],
  ["C33", "Azul cobalto opaco", "#1f5bb4"],
  ["C34", "Azul marino opaco", "#17285e"],
  ["C35", "Azul petróleo opaco", "#1d4f63"],
  // Morados
  ["C36", "Lavanda opaco", "#b9a5de"],
  ["C37", "Lila opaco", "#9a72c4"],
  ["C38", "Violeta opaco", "#6c3fa0"],
  ["C39", "Ciruela opaco", "#4a2160"],
  // Marrones
  ["C40", "Marrón claro opaco", "#b07c4e"],
  ["C41", "Marrón chocolate opaco", "#5f3a22"],
  ["C42", "Marrón oscuro opaco", "#35201a"],
  ["C43", "Terracota opaco", "#b4553a"],
  ["C44", "Piel clara opaco", "#f0c9a8"],
  ["C45", "Piel media opaco", "#d49a6e"],
  // Metálicos
  ["C46", "Plata metálico", "#bfc3c8"],
  ["C47", "Oro 24k metálico", "#d8b23a"],
  ["C48", "Níquel metálico", "#7f8288"],
  ["C49", "Bronce oscuro metálico", "#6a4a2c"],
  ["C50", "Cobre metálico", "#b36b3c"]
];
