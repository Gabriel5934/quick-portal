import { databaseFile, MOCK_MERCHANT_ID } from "../config.js";
import { SqliteStore } from "../store.js";
import { validateSellerPayload } from "../validation.js";

// Seeds a fixed admin seller with a known merchant ID and document.
// Seeding overwrites any conflicting records.
const ADMIN_MERCHANT_ID = "00000000-0000-0000-0000-000000000000";
const ADMIN_DOCUMENT = "11222333000181";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// The same payload Quick Portal would send for this CNPJ seller.
const validation = validateSellerPayload({
  type: "Subordinate",
  masterMerchantId: MOCK_MERCHANT_ID,
  contactPhone: "11900000000",
  contactName: "Quick Digital",
  mailAddress: "contato@quickdigital.example",
  documentType: "CNPJ",
  documentNumber: ADMIN_DOCUMENT,
  corporateName: "Quick Digital",
  fancyName: "Quick Digital",
  bankAccount: {
    bank: "341",
    bankAccountType: "CheckingAccount",
    number: "12345",
    verifierDigit: "6",
    agencyNumber: "1234",
    documentType: "CNPJ",
    documentNumber: ADMIN_DOCUMENT,
  },
  address: {
    number: "1000",
    zipCode: "01310100",
    street: "Avenida Paulista",
    neighborhood: "Bela Vista",
    city: "São Paulo",
    state: "SP",
  },
});
if (!validation.success) {
  fail(
    `Invalid Quick Digital seller: ${validation.errors
      .map((error) => error.Message)
      .join(" ")}`,
  );
}

const store = new SqliteStore(databaseFile);
try {
  const { replaced } = store.seedSeller(ADMIN_MERCHANT_ID, validation.data);
  console.log(
    replaced
      ? `Overwrote Quick Digital seller ${ADMIN_MERCHANT_ID}, replacing ${replaced} existing seller(s).`
      : `Created Quick Digital seller ${ADMIN_MERCHANT_ID}.`,
  );
} finally {
  store.close();
}
