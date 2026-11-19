"""Business lookup, creation and membership on top of a Session; no HTTP
concerns.

``create_business`` and ``link_user`` run their own ``session.begin()`` block,
so the session passed in must not be inside a transaction. The lookups only
read and leave ending the transaction to the caller.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.service import normalize_email
from app.business.cnpj import normalize_cnpj
from app.business.models import Business, BusinessMembership


class BusinessExists(Exception):
    pass


class UserNotFound(Exception):
    pass


class BusinessNotFound(Exception):
    pass


class AlreadyLinked(Exception):
    pass


def list_businesses(session: Session, user_id: uuid.UUID) -> list[Business]:
    """The businesses the user is a member of, ordered by CNPJ."""
    query = (
        select(Business)
        .join(BusinessMembership, BusinessMembership.business_id == Business.id)
        .where(BusinessMembership.user_id == user_id)
        .order_by(Business.cnpj)
    )
    return list(session.scalars(query))


def get_member_business(
    session: Session, user_id: uuid.UUID, cnpj: str
) -> Business | None:
    """The business with this normalized CNPJ, if the user is a member of it."""
    query = (
        select(Business)
        .join(BusinessMembership, BusinessMembership.business_id == Business.id)
        .where(Business.cnpj == cnpj, BusinessMembership.user_id == user_id)
    )
    return session.scalar(query)


def create_business(session: Session, cnpj: str) -> Business:
    """Raises InvalidCnpj, or BusinessExists when the CNPJ is taken."""
    business = Business(cnpj=normalize_cnpj(cnpj))
    try:
        with session.begin():
            session.add(business)
    except IntegrityError as exc:
        raise BusinessExists from exc
    return business


def link_user(session: Session, email: str, cnpj: str) -> None:
    """Makes the user a member of the business.

    Raises InvalidCnpj, UserNotFound, BusinessNotFound, or AlreadyLinked when
    the membership exists.
    """
    cnpj = normalize_cnpj(cnpj)
    email = normalize_email(email)
    try:
        with session.begin():
            user_id = session.scalar(select(User.id).where(User.email == email))
            if user_id is None:
                raise UserNotFound
            business_id = session.scalar(
                select(Business.id).where(Business.cnpj == cnpj)
            )
            if business_id is None:
                raise BusinessNotFound
            if session.get(BusinessMembership, (business_id, user_id)) is not None:
                raise AlreadyLinked
            session.add(BusinessMembership(business_id=business_id, user_id=user_id))
    except IntegrityError as exc:
        # A concurrent call inserted the membership after the check above.
        raise AlreadyLinked from exc
