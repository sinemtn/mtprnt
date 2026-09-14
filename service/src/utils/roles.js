const ROLE_ALIASES = {
  "sales-admin": "sales_admin",
  "kepala-teknisi": "kepala_teknisi",
  gudang: "warehouse",
  manajer: "kepala_teknisi"
};

const ROLE_LABELS = {
  admin: "admin",
  sales: "sales",
  sales_admin: "sales-admin",
  kepala_teknisi: "kepala-teknisi",
  teknisi: "teknisi",
  warehouse: "warehouse"
};

const ROLE_VALUES = Object.keys(ROLE_LABELS);

function normalisasiRole(role) {
  return ROLE_ALIASES[role] || role;
}

function tampilkanRole(role) {
  return ROLE_LABELS[role] || role;
}

module.exports = {
  ROLE_VALUES,
  normalisasiRole,
  tampilkanRole
};
