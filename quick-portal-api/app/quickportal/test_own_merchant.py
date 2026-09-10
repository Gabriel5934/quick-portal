import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from quickportal.services.own_merchant import (
    MerchantRegistrationError,
    register_merchant,
)


class OwnMerchantTraceTests(SimpleTestCase):
    payload = {"cnpj": "61805098000149", "complemento": "Loja 1"}

    @patch("quickportal.services.own_merchant.get_own_token", return_value="token")
    @patch("quickportal.services.own_merchant.requests.post")
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

    @patch("quickportal.services.own_merchant.get_own_token", return_value="token")
    @patch("quickportal.services.own_merchant.requests.post")
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

    @patch("quickportal.services.own_merchant.get_own_token", return_value="token")
    @patch("quickportal.services.own_merchant.requests.post")
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
