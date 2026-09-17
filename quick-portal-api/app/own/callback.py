"""Diagnostic capture of OWN registration callbacks; never changes signup state."""

import base64
import json
import logging
import os
import secrets
import uuid
from pathlib import Path

from django.conf import settings
from django.core.exceptions import RequestDataTooBig
from django.http import Http404, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods


MAX_CALLBACK_BYTES = 64 * 1024
logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["GET", "POST", "PUT", "PATCH"])
def own_signup_callback(request, secret):
    """Record an unknown callback shape for inspection, without trusting it."""
    configured_secret = settings.OWN_CALLBACK_SECRET
    if (
        not settings.OWN_CALLBACK_BASE_URL
        or not configured_secret
        or not secrets.compare_digest(secret, configured_secret)
    ):
        raise Http404

    try:
        content_length = int(request.META.get("CONTENT_LENGTH") or 0)
    except (TypeError, ValueError):
        return JsonResponse({"received": False}, status=400)
    if content_length > MAX_CALLBACK_BYTES:
        return JsonResponse({"received": False}, status=413)
    try:
        body = request.body
    except RequestDataTooBig:
        return JsonResponse({"received": False}, status=413)
    if len(body) > MAX_CALLBACK_BYTES:
        return JsonResponse({"received": False}, status=413)

    capture = {
        "received_at": timezone.now().isoformat(),
        "method": request.method,
        "query_string": request.META.get("QUERY_STRING", ""),
        "content_type": request.headers.get("Content-Type", ""),
        "header_names": sorted(request.headers.keys()),
    }
    try:
        capture["body_text"] = body.decode("utf-8")
    except UnicodeDecodeError:
        capture["body_base64"] = base64.b64encode(body).decode("ascii")

    try:
        trace_dir = Path(settings.OWN_CALLBACK_TRACE_DIR)
        trace_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        filename = f"{timezone.now():%Y%m%dT%H%M%S%fZ}-{uuid.uuid4().hex}.json"
        descriptor = os.open(
            trace_dir / filename,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as trace_file:
            json.dump(capture, trace_file, ensure_ascii=False, indent=2)
    except OSError:
        logger.exception("Unable to write OWN callback capture")
        return JsonResponse({"received": False}, status=503)

    return JsonResponse({"received": True})
