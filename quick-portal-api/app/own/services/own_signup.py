import base64
from urllib.parse import quote

from django.conf import settings

PARTNER_CNPJ = "37924499000133"
CONTRACT_TYPE = "W"


def _encoded_file(stored_file):
    """Read FileField ``stored_file`` in chunks and return Base64 text."""
    encoded_chunks = []
    with stored_file.open("rb"):
        for chunk in stored_file.chunks(chunk_size=57 * 1024):
            encoded_chunks.append(base64.b64encode(chunk).decode("ascii"))
    return "".join(encoded_chunks)


def _attachment_payload(attachment):
    """Return stored ``attachment`` in OWN's name/content/type payload shape."""
    return {
        "nomeArquivo": attachment.original_name,
        "conteudo": _encoded_file(attachment.file),
        "tipo": attachment.type,
    }


def build_own_business_signup_payload(own_business):
    """Build the complete ``/cadastrarConveniada`` request for ``own_business``."""
    business = own_business.business
    plan = own_business.plan
    activity = plan.activity
    phone = business.phone
    landline = business.landline or phone
    identifier = "/".join(
        [
            business.document,
            str(own_business.pk),
            PARTNER_CNPJ,
            own_business.signatory_email,
            own_business.signatory_cpf,
            own_business.signatory_name,
        ]
    )
    payload = {
        "cnpj": business.document,
        "identificadorCliente": identifier,
        "razaoSocial": business.name,
        "nomeFantasia": business.trade_name or business.name,
        "cnae": activity.cnae,
        "ramoAtividade": activity.description,
        "faturamentoPrevisto": format(own_business.forecast_revenue, "f"),
        "email": business.email,
        "dddComercial": landline[:2],
        "telefoneComercial": landline[2:],
        "cep": own_business.postal_code,
        "logradouro": own_business.street,
        "numeroEndereco": own_business.address_number,
        "complemento": own_business.address_complement or "",
        "urlCallback": (
            f"{settings.OWN_CALLBACK_BASE_URL.rstrip('/')}/own/callback/"
            f"{quote(settings.OWN_CALLBACK_SECRET, safe='')}/"
            if settings.OWN_CALLBACK_BASE_URL and settings.OWN_CALLBACK_SECRET
            else ""
        ),
        "bairro": own_business.neighborhood,
        "municipio": own_business.city,
        "uf": own_business.state,
        "dddCel": phone[:2],
        "telefoneCelular": phone[2:],
        "responsavelAssinatura": own_business.signatory_name,
        "quantidadePos": own_business.pos_quantity,
        "faturamentoContratado": format(own_business.contract_revenue, "f"),
        "antecipacaoAutomatica": "N" if plan.anticipation_type == "None" else "S",
        "taxaAntecipacao": 0,
        "mcc": activity.mcc,
        "tipoContrato": CONTRACT_TYPE,
        "cnpjParceiro": PARTNER_CNPJ,
        "idCesta": plan.basketId_id,
        "tarifacao": [
            {"id": plan_fee.fee_id, "valor": format(plan_fee.value, "f")}
            for plan_fee in plan.fees.all()
        ],
        "codBanco": own_business.bank_code,
        "agencia": own_business.bank_branch,
        "digAgencia": own_business.bank_branch_digit,
        "numConta": own_business.bank_account,
        "digConta": own_business.bank_account_digit,
        "documentosSocios": [
            {
                "identificacao": partner.cpf,
                "anexos": [
                    _attachment_payload(attachment)
                    for attachment in partner.attachments.all()
                ],
            }
            for partner in own_business.partners.all()
        ],
        "anexos": [
            _attachment_payload(attachment)
            for attachment in own_business.attachments.all()
        ],
        "hashAceite": "X",
        "codConfiguracao": " ",
        "cnpjOrigem": PARTNER_CNPJ,
    }
    if own_business.core_protocol:
        payload["protocoloCore"] = own_business.core_protocol
    if own_business.contract_number:
        payload["numeroContrato"] = own_business.contract_number
    if plan.anticipation_type != "None":
        payload["tipoAntecipacao"] = "ROTATIVO"
        payload["taxaAntecipacao"] = format(plan.basketId.anticipation_fee, "f")
    return payload
