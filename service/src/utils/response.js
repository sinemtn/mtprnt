function sukses(res, pesan, data = null, status = 200) {
  return res.status(status).json({ sukses: true, pesan, data });
}

function gagal(res, pesan, status = 400, detail = null) {
  return res.status(status).json({ sukses: false, pesan, detail });
}

module.exports = { sukses, gagal };
