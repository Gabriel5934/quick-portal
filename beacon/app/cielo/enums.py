"""Enums used by Cielo notification models.

Each member carries the value Cielo sends and a human readable ``label``.
"""

from enum import IntEnum, StrEnum


class LabeledStrEnum(StrEnum):
    label: str

    def __new__(cls, value: str, label: str) -> "LabeledStrEnum":
        member = str.__new__(cls, value)
        member._value_ = value
        member.label = label
        return member


class LabeledIntEnum(IntEnum):
    label: str

    def __new__(cls, value: int, label: str) -> "LabeledIntEnum":
        member = int.__new__(cls, value)
        member._value_ = value
        member.label = label
        return member


class CieloMerchantType(LabeledStrEnum):
    SUBORDINATE = "SUBORDINATE", "Subordinate"
    MASTER = "MASTER", "Master"


class CieloDocumentType(LabeledIntEnum):
    CPF = 1, "CPF"
    CNPJ = 2, "CNPJ"


class CieloBankAccountType(LabeledIntEnum):
    CHECKING_ACCOUNT = 1, "CheckingAccount"
    SAVINGS_ACCOUNT = 2, "SavingsAccount"


class CieloOnboardingGlobalStatus(LabeledIntEnum):
    UNDER_ANALYSIS = 1, "UnderAnalysis"
    APPROVED = 2, "Approved"
    AWAITING_MERCHANT_ACTION = 3, "AwaitingMerchantAction"
    UNKNOWN = 4, "Unknown"
    BANNED = 5, "Banned"


class CieloOnboardingChangeType(LabeledIntEnum):
    GLOBAL = 23, "Global"
    BANK_ACCOUNT_VALIDATION = 21, "Bank Account Validation"
    KYC = 20, "KYC"


class CieloTransactionChangeType(LabeledIntEnum):
    TRANSACTION_STATUS = 1, "Change in transaction status"
    RECURRENCE_CREATED = 2, "Recurrence Created"
    ANTI_FRAUD_STATUS = 3, "Change in the anti-fraud status"
    RECURRING_PAYMENT_STATUS = 4, "Change in the recurring payment status"
    CANCELLING_REFUND_DENIED = 5, "Cancelling / refund denied"
    BOLETO_PAID_LESS = 6, "Paid less then the actual boleto value"
    CHARGEBACK_LEGACY = 7, "Chargeback (legacy)"
    FRAUD_ALERT = 8, "Fraud alert"
    PARTIALLY_CANCELLED_OR_REFUNDED = 25, "Cancelled or refunded partially"


class CieloOnboardingKycStatus(LabeledIntEnum):
    UNDER_ANALYSIS = 1, "UnderAnalysis"
    APPROVED = 2, "Approved"
    APPROVED_WITH_RESTRICTION = 3, "ApprovedWithRestriction"
    REJECTED = 4, "Rejected"


class CieloOnboardingBankAccountValidationStatus(LabeledIntEnum):
    INTERNAL_ERROR = 0, "InternalError"
    CREATED = 1, "Created"
    PROCESSING = 2, "Processing"
    SUCCESS = 3, "Success"
    ERROR = 4, "Error"


class CieloBank(LabeledStrEnum):
    """Bank (COMPE) codes accepted by Cielo, keyed by numeric string."""

    BANK_001 = "001", "Banco do Brasil"
    BANK_003 = "003", "Amazônia - BASA"
    BANK_004 = "004", "BNB"
    BANK_012 = "012", "BANCO INBURSA"
    BANK_021 = "021", "Est. ES - Banestes"
    BANK_025 = "025", "Alfa"
    BANK_033 = "033", "Santander"
    BANK_037 = "037", "Est. PA - Banpará"
    BANK_041 = "041", "Est. RS - Banrisul"
    BANK_047 = "047", "Est. SE - Banese"
    BANK_063 = "063", "BANCO BRADESCARD"
    BANK_069 = "069", "Banco Crefisa"
    BANK_070 = "070", "BRB - Banco de Brasília"
    BANK_077 = "077", "Banco Inter"
    BANK_081 = "081", "BANCOSEGURO S.A."
    BANK_082 = "082", "Banco Topázio"
    BANK_083 = "083", "BCO DA CHINA BRASIL S.A."
    BANK_084 = "084", "CC Uniprime Norte do Paraná"
    BANK_085 = "085", "CC Cecred"
    BANK_089 = "089", "CC Região da Mogiana"
    BANK_093 = "093", "POLOCRED SCMEPP LTDA."
    BANK_094 = "094", "Banco Finaxis"
    BANK_097 = "097", "CC Centralcredi"
    BANK_099 = "099", "CC Uniprime Central"
    BANK_102 = "102", "XP INVESTIMENTOS CCTVM S/A"
    BANK_104 = "104", "Caixa Econômica Federal"
    BANK_107 = "107", "BBM"
    BANK_120 = "120", "Rodobens"
    BANK_121 = "121", "BCO AGIBANK S.A."
    BANK_125 = "125", "BANCO GENIAL"
    BANK_130 = "130", "Scfi Caruana"
    BANK_133 = "133", "CRESOL CONFEDERAÇÃO"
    BANK_136 = "136", "CC Unicred do Brasil"
    BANK_149 = "149", "FACTA S.A. CFI"
    BANK_174 = "174", "PEFISA S.A. - C.F.I."
    BANK_195 = "195", "VALOR SCD S.A."
    BANK_197 = "197", "STONE PAGAMENTOS S.A"
    BANK_208 = "208", "BANCO BTG PACTUAL S.A"
    BANK_212 = "212", "Banco Original"
    BANK_213 = "213", "Arbi"
    BANK_218 = "218", "Banco BS2"
    BANK_224 = "224", "Fibra"
    BANK_237 = "237", "Bradesco"
    BANK_243 = "243", "Banco Master"
    BANK_246 = "246", "ABC - Brasil"
    BANK_260 = "260", "NU PAGAMENTOS S.A (NUBANK)"
    BANK_274 = "274", "Money Plus SCMEPP LTDA"
    BANK_299 = "299", "BCO SOROCRED S.A. - BM"
    BANK_301 = "301", "Dock Instituição de Pagamento S.A"
    BANK_318 = "318", "BCO BMG S.A."
    BANK_320 = "320", "BCO CCB BRASIL S.A."
    BANK_323 = "323", "Mercado Pago"
    BANK_329 = "329", "QI SCD S.A."
    BANK_330 = "330", "BANCO BARI S.A."
    BANK_335 = "335", "Banco Digio S.A."
    BANK_336 = "336", "Banco C6 S.A"
    BANK_341 = "341", "Itaú Unibanco"
    BANK_348 = "348", "BCO XP S.A."
    BANK_359 = "359", "ZEMA CFI S/A"
    BANK_364 = "364", "GERENCIANET"
    BANK_368 = "368", "BCO CSF S.A."
    BANK_376 = "376", "J. P. Morgan"
    BANK_380 = "380", "PICPAY"
    BANK_382 = "382", "FIDUCIA SCMEPP LTDA"
    BANK_383 = "383", "JUNO"
    BANK_389 = "389", "Mercantil do Brasil"
    BANK_394 = "394", "BCO BRADESCO FINANC. S.A."
    BANK_396 = "396", "HUB PAGAMENTOS"
    BANK_403 = "403", "CORA SCD S.A."
    BANK_404 = "404", "SUMUP SCD S.A."
    BANK_406 = "406", "ACCREDITO SCD S.A."
    BANK_413 = "413", "BCO BV S.A."
    BANK_414 = "414", "WORK SCD S.A."
    BANK_422 = "422", "Safra"
    BANK_435 = "435", "DELCRED SCD S.A."
    BANK_450 = "450", "FITBANK PAGAMENTOS ELETRONICOS S.A."
    BANK_477 = "477", "CITIBANK N.A."
    BANK_487 = "487", "DEUTSCHE BANK S.A.BCO ALEMAO"
    BANK_509 = "509", "CELCOIN INSTITUIÇÃO DE PAGAMENTO S.A"
    BANK_542 = "542", "Cloud Walk Meios de Pagamentos"
    BANK_595 = "595", "Zoop Instituição de Pagamentos"
    BANK_600 = "600", "Luso Brasileiro"
    BANK_604 = "604", "Indl. do Brasil"
    BANK_611 = "611", "Paulista"
    BANK_612 = "612", "Guanabara"
    BANK_613 = "613", "OMNI BANCO S.A."
    BANK_623 = "623", "BANCO PAN"
    BANK_630 = "630", "Banco Smartbank"
    BANK_633 = "633", "Rendimento"
    BANK_634 = "634", "Triângulo"
    BANK_637 = "637", "Sofisa"
    BANK_643 = "643", "Pine"
    BANK_653 = "653", "BANCO VOITER"
    BANK_654 = "654", "Banco Digimais"
    BANK_655 = "655", "Votorantim"
    BANK_707 = "707", "Daycoval"
    BANK_741 = "741", "Ribeirão Preto"
    BANK_743 = "743", "Semear"
    BANK_745 = "745", "Citibank S. A."
    BANK_748 = "748", "Sicredi"
    BANK_752 = "752", "BCO BNP PARIBAS BRASIL S A"
    BANK_753 = "753", "NOVO BCO CONTINENTAL S.A. - BM"
    BANK_755 = "755", "Bank of America Merrill Lynch"
    BANK_756 = "756", "Bancoob - Banco Cooperativo do Brasil (Sicoob)"
    BANK_757 = "757", "BCO KEB HANA DO BRASIL S.A."
