function buatNomor(prefix) {
  const now = new Date();
  const tanggal = now.toISOString().slice(0, 10).replace(/-/g, "");
  const acak = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${tanggal}-${acak}`;
}

module.exports = { buatNomor };
