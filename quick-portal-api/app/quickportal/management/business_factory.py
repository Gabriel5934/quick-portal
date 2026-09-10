import re

from quickportal.models import Business, BusinessType, DocumentType


COMPANY_PREFIXES = (
    "Aurora",
    "Bandeirantes",
    "Horizonte",
    "Ipê",
    "Mantiqueira",
    "Pioneira",
    "Serra Azul",
    "Vale Verde",
)
RESELLER_SUFFIXES = ("Pagamentos", "Soluções Financeiras", "Serviços")
STORE_SUFFIXES = ("Comércio", "Empório", "Mercado", "Varejo")
CITIES = ("Campinas", "Curitiba", "Goiânia", "Recife", "São Paulo")


def _cnpj_check_digits(base):
    def digit(value, weights):
        total = sum(int(number) * weight for number, weight in zip(value, weights))
        remainder = total % 11
        return "0" if remainder < 2 else str(11 - remainder)

    first = digit(base, (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    second = digit(base + first, (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    return first + second


def _random_cnpj(rng):
    base = "".join(str(rng.randrange(10)) for _ in range(8)) + "0001"
    return base + _cnpj_check_digits(base)


def create_business(rng, business_type, parent=None):
    prefix = rng.choice(COMPANY_PREFIXES)
    city = rng.choice(CITIES)
    suffixes = STORE_SUFFIXES if business_type == BusinessType.STORE else RESELLER_SUFFIXES
    type_label = {
        BusinessType.RESELLER: "Distribuidora",
        BusinessType.RE_RESELLER: "Representações",
        BusinessType.STORE: rng.choice(suffixes),
    }[business_type]
    document = _random_cnpj(rng)
    while Business.objects.filter(document=document).exists():
        document = _random_cnpj(rng)
    slug = re.sub(r"[^a-z0-9]+", ".", prefix.lower()).strip(".")
    ddd = rng.choice(("11", "19", "21", "31", "41", "51", "61", "81"))
    business = Business(
        type=business_type,
        parent=parent,
        document_type=DocumentType.CNPJ,
        document=document,
        name=f"{prefix} {type_label} {city} Ltda.",
        trade_name=f"{prefix} {rng.choice(suffixes)}",
        email=f"contato.{slug}.{document[-6:]}@example.com",
        phone=f"{ddd}9{rng.randrange(10**8):08d}",
        landline=f"{ddd}3{rng.randrange(10**7):07d}",
    )
    business.full_clean()
    business.save()
    return business
