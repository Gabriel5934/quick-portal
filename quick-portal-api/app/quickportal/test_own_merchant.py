import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from own.services.own_auth import OWN_TOKEN_CACHE_KEY, get_own_token
from own.services.own_merchant import (
    MerchantRegistrationError,
    register_merchant,
)


class OwnMerchantTraceTests(SimpleTestCase):
    payload = {"cnpj": "61805098000149", "complemento": "Loja 1"}

    @patch("own.services.own_merchant.get_own_token", return_value="token")
    @patch("own.services.own_merchant.requests.post")
    def test_writes_one_trace_with_the_payload_and_json_response(
        self, post, _get_own_token
    ):
        response = Mock(status_code=200, text="{")
        response.json.return_value = {"payloadCallback": "registered"}
        post.return_value = response

        with TemporaryDirectory() as directory:
            with override_settings(
                OWN_BASE_URL="https://own.example",
                OWN_REGISTRATION_TRACE_ENABLED=True,
                OWN_REGISTRATION_TRACE_DIR=Path(directory),
            ):
                result = register_merchant(self.payload)

            traces = list(Path(directory).glob("*.json"))
            self.assertEqual(len(traces), 1)
            trace = json.loads(traces[0].read_text(encoding="utf-8"))

        self.assertEqual(result, {"payloadCallback": "registered"})
        self.assertEqual(trace["request_payload"], self.payload)
        self.assertEqual(trace["url"], "https://own.example/cadastrarConveniada")
        self.assertEqual(trace["response"], {
            "status_code": 200,
            "body": {"payloadCallback": "registered"},
        })

    @patch("own.services.own_merchant.get_own_token", return_value="token")
    @patch("own.services.own_merchant.requests.post")
    def test_writes_a_trace_for_an_upstream_rejection(
        self, post, _get_own_token
    ):
        response = Mock(status_code=400, text="invalid complemento")
        response.json.side_effect = ValueError
        post.return_value = response

        with TemporaryDirectory() as directory:
            with override_settings(
                OWN_REGISTRATION_TRACE_ENABLED=True,
                OWN_REGISTRATION_TRACE_DIR=Path(directory),
            ):
                with self.assertRaises(MerchantRegistrationError):
                    register_merchant(self.payload)

            traces = list(Path(directory).glob("*.json"))
            self.assertEqual(len(traces), 1)
            trace = json.loads(traces[0].read_text(encoding="utf-8"))

        self.assertEqual(trace["request_payload"], self.payload)
        self.assertEqual(trace["response"], {
            "status_code": 400,
            "body": "invalid complemento",
        })

    @patch("own.services.own_merchant.get_own_token", return_value="token")
    @patch("own.services.own_merchant.requests.post")
    def test_does_not_write_a_trace_when_disabled(self, post, _get_own_token):
        response = Mock(status_code=200)
        response.json.return_value = {}
        post.return_value = response

        with TemporaryDirectory() as directory:
            with override_settings(
                OWN_REGISTRATION_TRACE_ENABLED=False,
                OWN_REGISTRATION_TRACE_DIR=Path(directory),
            ):
                register_merchant(self.payload)

            self.assertEqual(list(Path(directory).glob("*.json")), [])


class OwnDebugFailureTests(SimpleTestCase):
    @patch("own.services.own_merchant.get_own_token", return_value="token")
    @patch("own.services.own_merchant.requests.post")
    def test_forced_400_uses_normal_rejection_without_contacting_own(
        self, post, get_own_token
    ):
        with TemporaryDirectory() as directory, override_settings(
            DEBUG=True,
            OWN_DEBUG_FORCE_HTTP_400=True,
            OWN_REGISTRATION_TRACE_ENABLED=True,
            OWN_REGISTRATION_TRACE_DIR=Path(directory),
        ):
            with self.assertRaises(MerchantRegistrationError) as error:
                register_merchant({"cnpj": "61805098000149"})
            trace_path = next(Path(directory).glob("*.json"))
            trace = json.loads(trace_path.read_text(encoding="utf-8"))

        get_own_token.assert_called_once_with()
        post.assert_not_called()
        self.assertEqual(error.exception.status_code, 400)
        self.assertIn("Forced OWN HTTP 400", error.exception.response_body)
        self.assertEqual(trace["response"]["status_code"], 400)

    @patch("own.services.own_merchant.get_own_token", return_value="token")
    @patch("own.services.own_merchant.requests.post")
    def test_force_flag_is_ignored_when_debug_is_off(self, post, get_own_token):
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {"protocolo": "real-response"}

        with override_settings(DEBUG=False, OWN_DEBUG_FORCE_HTTP_400=True):
            result = register_merchant({})

        self.assertEqual(result, {"protocolo": "real-response"})
        get_own_token.assert_called_once_with()
        post.assert_called_once()

    @patch("own.services.own_auth.requests.post")
    def test_auth_request_is_not_forced_to_400(self, post):
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {
            "access_token": "real-token",
            "expires_in": 300,
        }
        cache.delete(OWN_TOKEN_CACHE_KEY)
        try:
            with override_settings(DEBUG=True, OWN_DEBUG_FORCE_HTTP_400=True):
                self.assertEqual(get_own_token(), "real-token")
        finally:
            cache.delete(OWN_TOKEN_CACHE_KEY)

        post.assert_called_once()
