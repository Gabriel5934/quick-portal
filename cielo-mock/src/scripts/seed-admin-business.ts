import { databaseFile, MOCK_MERCHANT_ID } from "../config.js";
import { SqliteStore } from "../store.js";
import { validateSellerPayload } from "../validation.js";

// Keep in sync with quick-portal-api's create_admin_business command, which
// creates the same seller in Quick Portal. Both overwrite conflicting records.
const ADMIN_MERCHANT_ID = "00000000-0000-0000-0000-000000000000";
const ADMIN_DOCUMENT = "11222333000181";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// The same payload Quick Portal would send for this CNPJ seller.
const validation = validateSellerPayload({
  Type: "Subordinate",
  MasterMerchantId: MOCK_MERCHANT_ID,
  ContactPhone: "11900000000",
  ContactName: "Quick Digital",
  MailAddress: "contato@quickdigital.example",
  DocumentType: "CNPJ",
  DocumentNumber: ADMIN_DOCUMENT,
  CorporateName: "Quick Digital",
  FancyName: "Quick Digital",
  BankAccount: {
    Bank: "341",
    BankAccountType: "CheckingAccount",
    Number: "12345",
    VerifierDigit: "6",
    AgencyNumber: "1234",
    DocumentType: "CNPJ",
    DocumentNumber: ADMIN_DOCUMENT,
  },
  Address: {
    Number: "1000",
    ZipCode: "01310100",
    Street: "Avenida Paulista",
    Neighborhood: "Bela Vista",
    City: "São Paulo",
    State: "SP",
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
