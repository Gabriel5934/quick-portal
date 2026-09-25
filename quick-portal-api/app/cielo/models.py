from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models

from cielo.validators import validate_cnpj, validate_cpf


digits_only = RegexValidator(r"^\d+$", "This field must contain only digits.")


class CieloSubmissionStatus(models.TextChoices):
    FAILED = "FAILED", "Falhou"
    PENDING = "PENDING", "Pendente"
    INTERVENTION_REQUIRED = "INTERVENTION_REQUIRED", "Intervenção necessária"


class CieloDocumentType(models.TextChoices):
    CPF = "CPF", "CPF"
    CNPJ = "CNPJ", "CNPJ"


class CieloBankAccountType(models.TextChoices):
    CHECKING = "CheckingAccount", "Conta corrente"
    SAVINGS = "SavingsAccount", "Conta poupança"


class CieloBusinessActivity(models.TextChoices):
    ACTIVITY_001 = "1", "Não encontrado"
    ACTIVITY_002 = "2", "Salão de beleza barbearia"
    ACTIVITY_003 = "3", "Dentistas e ortodontistas"
    ACTIVITY_004 = "4", "Lanchonete"
    ACTIVITY_005 = "5", "Vendas de roupas"
    ACTIVITY_006 = "6", "Taxi e limusine"
    ACTIVITY_007 = "7", "Mercearias e supermercados"
    ACTIVITY_008 = "8", "Lojas de variedades"
    ACTIVITY_009 = "9", "Bares discotecas casas noturnas"
    ACTIVITY_010 = "10", "Empreiteiros em geral"
    ACTIVITY_011 = "11", "Cosméticos"
    ACTIVITY_012 = "12", "Conveniência delicatessen"
    ACTIVITY_013 = "13", "Médicos e clínicas"
    ACTIVITY_014 = "14", "Serviços veterinários"
    ACTIVITY_015 = "15", "Lojas de reparos e serviços"
    ACTIVITY_016 = "16", "Comida rápida (doces e salgados)"
    ACTIVITY_017 = "17", "Diversão e recreação"
    ACTIVITY_018 = "18", "Creches"
    ACTIVITY_019 = "19", "Alfaiates / costureiras (os)"
    ACTIVITY_020 = "20", "Clínicas de beleza - spa"
    ACTIVITY_021 = "21", "Serviços legais"
    ACTIVITY_022 = "22", "Fabricação de máquinas, ferramentas, peças e acessórios"
    ACTIVITY_023 = "23", "Lojas de utensílios"
    ACTIVITY_024 = "24", "Restaurantes"
    ACTIVITY_025 = "25", "Peças e serviços para veículos"
    ACTIVITY_026 = "26", "Corretor imobiliário"
    ACTIVITY_027 = "27", "Fornecedores de alimentos ou mantimentos"
    ACTIVITY_028 = "28", "Conserto - rádio, tv, aparelho de som"
    ACTIVITY_029 = "29", "Presentes, cartões, souvenirs"
    ACTIVITY_030 = "30", "Lojas de acessórios para veículos"
    ACTIVITY_031 = "31", "Serviços de horticultura e jardinagem"
    ACTIVITY_032 = "32", "Lojas de material de construção"
    ACTIVITY_033 = "33", "Lojas de sapatos"
    ACTIVITY_034 = "34", "Joalherias e relojoarias"
    ACTIVITY_035 = "35", "Atacadista"
    ACTIVITY_036 = "36", "Serviços educacionais"
    ACTIVITY_037 = "37", "Padarias"
    ACTIVITY_038 = "38", "Lojas de bebidas"
    ACTIVITY_039 = "39", "Equipamentos e peças eletrônicas"
    ACTIVITY_040 = "40", "Consertos elétricos"
    ACTIVITY_041 = "41", "Borracheiro"
    ACTIVITY_042 = "42", "Drogarias farmácias"
    ACTIVITY_043 = "43", "Serviços de carpintaria"
    ACTIVITY_044 = "44", "Loja de animais"
    ACTIVITY_045 = "45", "Campo de esportes clubes"
    ACTIVITY_046 = "46", "Estúdio fotográfico"
    ACTIVITY_047 = "47", "Eletricista"
    ACTIVITY_048 = "48", "Transportes urbanos"
    ACTIVITY_049 = "49", "Laboratórios médicos dentários"
    ACTIVITY_050 = "50", "Docerias e confeitarias"
    ACTIVITY_051 = "51", "Lava rápido"
    ACTIVITY_052 = "52", "Mobilia e utilidades para o lar"
    ACTIVITY_053 = "53", "Laticínios"
    ACTIVITY_054 = "54", "Dança academias"
    ACTIVITY_055 = "55", "Serviços de manutenção e conservação"
    ACTIVITY_056 = "56", "Brinquedos e jogos"
    ACTIVITY_057 = "57", "Hotéis motéis"
    ACTIVITY_058 = "58", "Serviços de administração e consultoria"
    ACTIVITY_059 = "59", "Serviços de pesquisa para arquitetura e engenharia"
    ACTIVITY_060 = "60", "Banca de jornais"
    ACTIVITY_061 = "61", "Pedicure"
    ACTIVITY_062 = "62", "Lojas de departamento"
    ACTIVITY_063 = "63", "Floricultura"
    ACTIVITY_064 = "64", "Conserto e manutenção de computadores"
    ACTIVITY_065 = "65", "Materiais de construção"
    ACTIVITY_066 = "66", "Óticas"
    ACTIVITY_067 = "67", "Serviços escolares"
    ACTIVITY_068 = "68", "Casas de massagem"
    ACTIVITY_069 = "69", "Funilaria lanternagem"
    ACTIVITY_070 = "70", "Armarinhos tecidos"
    ACTIVITY_071 = "71", "Reparo e restauração de móveis"
    ACTIVITY_072 = "72", "Centros de serviços e oficinas de metal"
    ACTIVITY_073 = "73", "Conserto - joias e relógios"
    ACTIVITY_074 = "74", "Artigos de segunda mão"
    ACTIVITY_075 = "75", "Serviços de processamentos de dados"
    ACTIVITY_076 = "76", "Conserto de chapéus sapatos"
    ACTIVITY_077 = "77", "Livros, periódicos e jornais"
    ACTIVITY_078 = "78", "Cópias fotocópias"
    ACTIVITY_079 = "79", "Aluguel de roupas"
    ACTIVITY_080 = "80", "Lojas de ferragens"
    ACTIVITY_081 = "81", "Materiais de escritório"
    ACTIVITY_082 = "82", "Casas de repouso serviços de enfermagem"
    ACTIVITY_083 = "83", "Material esportivos"
    ACTIVITY_084 = "84", "Clubes atletismo - sócios"
    ACTIVITY_085 = "85", "Bicicletas - vendas e serviços"
    ACTIVITY_086 = "86", "Estacionamento de automóveis"
    ACTIVITY_087 = "87", "Escola vocação e ocupação"
    ACTIVITY_088 = "88", "Lojas de informática - software"
    ACTIVITY_089 = "89", "Papelarias"
    ACTIVITY_090 = "90", "Anúncios classificados propaganda"
    ACTIVITY_091 = "91", "Tapeçaria cortinas"
    ACTIVITY_092 = "92", "Rede de computadores provedores"
    ACTIVITY_093 = "93", "Aluguel de equipamentos e mobílias"
    ACTIVITY_094 = "94", "Organização religiosa"
    ACTIVITY_095 = "95", "Corretor de seguros"
    ACTIVITY_096 = "96", "Serviços de auditoria e contabilidade"
    ACTIVITY_097 = "97", "Galerias de arte leilão de arte"
    ACTIVITY_098 = "98", "Sapataria"
    ACTIVITY_099 = "99", "Tv a cabo, satélite, e outros tipos de tv"
    ACTIVITY_100 = "100", "Serviço de frete"


class CieloBank(models.TextChoices):
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


class CieloBusiness(models.Model):
    business = models.OneToOneField(
        "quickportal.Business",
        on_delete=models.PROTECT,
        related_name="cielo_business",
    )
    status = models.CharField(max_length=30, choices=CieloSubmissionStatus.choices)
    merchant_id = models.CharField(max_length=36, null=True, blank=True)
    last_submitted_at = models.DateTimeField(null=True, blank=True)
    contact_name = models.CharField(max_length=100, blank=True)
    website = models.URLField(max_length=200, blank=True)
    corporate_name = models.CharField(max_length=100, blank=True)
    fancy_name = models.CharField(max_length=50, blank=True)
    birthday_date = models.DateField(null=True, blank=True)
    business_activity_id = models.CharField(
        max_length=3,
        choices=CieloBusinessActivity.choices,
        null=True,
        blank=True,
    )
    bank = models.CharField(max_length=3, choices=CieloBank.choices)
    bank_account_type = models.CharField(
        max_length=20, choices=CieloBankAccountType.choices
    )
    bank_account_number = models.CharField(
        max_length=10, validators=[digits_only]
    )
    bank_account_verifier_digit = models.CharField(
        max_length=1, validators=[digits_only]
    )
    bank_agency_number = models.CharField(max_length=4, validators=[digits_only])
    bank_agency_digit = models.CharField(max_length=1, blank=True)
    bank_document_type = models.CharField(
        max_length=4, choices=CieloDocumentType.choices
    )
    bank_document_number = models.CharField(max_length=14)
    address_number = models.CharField(max_length=15, validators=[digits_only])
    address_complement = models.CharField(max_length=80, blank=True)
    address_zip_code = models.CharField(max_length=9, validators=[digits_only])
    address_street = models.CharField(max_length=100)
    address_neighborhood = models.CharField(max_length=50)
    address_city = models.CharField(max_length=50)
    address_state = models.CharField(max_length=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cielo_businesses"

    def clean(self):
        super().clean()
        errors = {}
        bank_validator = (
            validate_cpf
            if self.bank_document_type == CieloDocumentType.CPF
            else validate_cnpj
        )
        try:
            bank_validator(self.bank_document_number)
        except ValidationError as exc:
            errors["bank_document_number"] = exc.messages

        if self.business_id is None:
            errors["business"] = "This field is required."
        else:
            business = self.business
            seller_validator = (
                validate_cpf
                if business.document_type == CieloDocumentType.CPF
                else validate_cnpj
            )
            try:
                seller_validator(business.document)
            except ValidationError as exc:
                errors["business"] = exc.messages

            if business.document_type == CieloDocumentType.CPF:
                if self.birthday_date is None:
                    errors["birthday_date"] = (
                        "This field is required for CPF sellers."
                    )
                if not self.business_activity_id:
                    errors["business_activity_id"] = (
                        "This field is required for CPF sellers."
                    )
                if self.contact_name:
                    errors["contact_name"] = (
                        "This field must be blank for CPF sellers."
                    )
                if self.corporate_name or self.fancy_name:
                    errors["corporate_name"] = (
                        "Managed names must be blank for CPF sellers."
                    )
                if len(business.name) > 50:
                    errors["business"] = (
                        "The business CPF name must contain at most 50 characters."
                    )
            else:
                if not self.contact_name:
                    errors["contact_name"] = (
                        "This field is required for CNPJ sellers."
                    )
                if not self.corporate_name:
                    errors["corporate_name"] = (
                        "This field is required for CNPJ sellers."
                    )
                if self.birthday_date is not None:
                    errors["birthday_date"] = (
                        "This field must be null for CNPJ sellers."
                    )
                if self.business_activity_id:
                    errors["business_activity_id"] = (
                        "This field must be blank for CNPJ sellers."
                    )
            if not business.phone.isdigit() or len(business.phone) != 11:
                errors["business"] = (
                    "The business mobile phone must contain exactly 11 digits."
                )
            if len(business.email) > 50:
                errors["business"] = (
                    "The business email must contain at most 50 characters."
                )
        if not self.bank_agency_number or set(self.bank_agency_number) == {"0"}:
            errors["bank_agency_number"] = "Agency number cannot contain only zeroes."
        if self.bank_agency_digit and not self.bank_agency_digit.isdigit():
            errors["bank_agency_digit"] = "Enter one digit."
        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.business_id} / {self.business.document} / {self.status}"
