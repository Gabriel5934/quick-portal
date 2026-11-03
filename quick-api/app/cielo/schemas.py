"""Request and response bodies for /cielo, and the parts of Cielo's responses
Quick API reads.

Clients send snake_case; ``to_cielo`` renders the PascalCase payload Cielo
expects. Limits mirror Cielo's seller onboarding reference; anything else
(formats, bank codes, CPF/CNPJ digits) is left for Cielo to validate, and its
400 is relayed to the client. Unknown fields, including MasterMerchantId and
Type, are ignored rather than forwarded.
"""

import uuid
from typing import Any, Literal, Self

from pydantic import (
    AliasGenerator,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_pascal

from app.cielo.models import (
    DOCUMENT_NUMBER_MAX_LENGTH,
    FANCY_NAME_MAX_LENGTH,
    CieloDocumentType,
    CieloSeller,
)

SELLER_TYPE = "Subordinate"
# Codes listed in Cielo's business activities table.
MIN_BUSINESS_ACTIVITY_ID = 1
MAX_BUSINESS_ACTIVITY_ID = 100

DocumentTypeLabel = Literal["CPF", "CNPJ"]


def _required(max_length: int) -> Any:
    return Field(min_length=1, max_length=max_length)


def _optional(max_length: int) -> Any:
    return Field(default=None, max_length=max_length)


class _CieloPayload(BaseModel):
    # snake_case on the way in, PascalCase when dumped by alias.
    model_config = ConfigDict(
        alias_generator=AliasGenerator(serialization_alias=to_pascal)
    )


class BankAccountIn(_CieloPayload):
    bank: str = _required(3)
    bank_account_type: Literal["CheckingAccount", "SavingsAccount"]
    number: str = _required(10)
    operation: str | None = _optional(10)
    verifier_digit: str = _required(1)
    agency_number: str = _required(4)
    # "x" when the agency has no digit.
    agency_digit: str = _required(1)
    # No document fields: the account holder is always the seller, so
    # OnboardIn.to_cielo copies the seller's document. A client-sent one is
    # ignored like any other unknown field.


class AddressIn(_CieloPayload):
    street: str = _required(100)
    number: str = _required(15)
    complement: str | None = _optional(80)
    neighborhood: str = _required(50)
    city: str = _required(50)
    state: str = _required(2)
    zip_code: str = _required(9)


class OnboardIn(_CieloPayload):
    contact_name: str = _required(100)
    contact_phone: str = _required(11)
    corporate_name: str = _required(100)
    document_number: str = _required(DOCUMENT_NUMBER_MAX_LENGTH)
    document_type: DocumentTypeLabel
    fancy_name: str = _required(FANCY_NAME_MAX_LENGTH)
    mail_address: str = _required(50)
    website: str | None = _optional(200)
    # Passed through as sent. Cielo expects YYYY/MM/DD on input, although its
    # sample responses show YYYY-MM-DD. Required for CPF.
    birthday_date: str | None = _optional(10)
    # A string for Cielo; a JSON number is accepted too. Required for CPF.
    business_activity_id: str | None = None
    bank_account: BankAccountIn | None = None
    address: AddressIn | None = None

    @field_validator("business_activity_id", mode="before")
    @classmethod
    def _business_activity_as_string(cls, value: object) -> object:
        if isinstance(value, int) and not isinstance(value, bool):
            return str(value)
        return value

    @field_validator("business_activity_id")
    @classmethod
    def _business_activity_in_range(cls, value: str | None) -> str | None:
        if value is not None and not (
            value.isdigit()
            and MIN_BUSINESS_ACTIVITY_ID <= int(value) <= MAX_BUSINESS_ACTIVITY_ID
        ):
            raise ValueError(
                f"must be a code from {MIN_BUSINESS_ACTIVITY_ID} to "
                f"{MAX_BUSINESS_ACTIVITY_ID}"
            )
        return value

    @model_validator(mode="after")
    def _cpf_requires_birthday_and_activity(self) -> Self:
        if self.document_type == "CPF":
            missing = [
                name
                for name in ("birthday_date", "business_activity_id")
                if not getattr(self, name)
            ]
            if missing:
                raise ValueError(f"{' and '.join(missing)} required for CPF sellers")
        return self

    def to_cielo(self, master_merchant_id: str) -> dict[str, Any]:
        """The Cielo payload.

        Type and MasterMerchantId are set by the server, and the bank account's
        document is the seller's own.
        """
        payload = {
            "Type": SELLER_TYPE,
            "MasterMerchantId": master_merchant_id,
            **self.model_dump(by_alias=True, exclude_none=True),
        }
        if "BankAccount" in payload:
            payload["BankAccount"]["DocumentNumber"] = self.document_number
            payload["BankAccount"]["DocumentType"] = self.document_type
        return payload


class OnboardOut(BaseModel):
    """A seller as Quick API returns it (onboard and get-sellers)."""

    id: uuid.UUID
    document_type: DocumentTypeLabel
    document_number: str
    fancy_name: str

    @classmethod
    def from_seller(cls, seller: "CieloSeller") -> Self:
        """Maps the stored integer DocumentType to its label."""
        return cls(
            id=seller.id,
            document_type=seller.document_type.name,
            document_number=seller.document_number,
            fancy_name=seller.fancy_name,
        )


class CieloSellerCreated(BaseModel):
    """What Quick API keeps from Cielo's 2xx onboarding response.

    Strict, so ``"1"`` or ``true`` is not a DocumentType and a number is not an
    Id. Other response fields are ignored.
    """

    model_config = ConfigDict(strict=True)

    id: uuid.UUID = Field(alias="Id")
    document_type: CieloDocumentType = Field(alias="DocumentType")
    document_number: str = Field(
        alias="DocumentNumber", min_length=1, max_length=DOCUMENT_NUMBER_MAX_LENGTH
    )

    @field_validator("document_type", mode="before")
    @classmethod
    def _not_a_bool(cls, value: object) -> object:
        # Strict mode still lets true through as 1 for int enums.
        if isinstance(value, bool):
            raise ValueError("must be an integer")
        return value

    def to_out(self, fancy_name: str) -> OnboardOut:
        """``fancy_name`` is the one from the request, as it was saved."""
        return OnboardOut(
            id=self.id,
            document_type=self.document_type.name,
            document_number=self.document_number,
            fancy_name=fancy_name,
        )
