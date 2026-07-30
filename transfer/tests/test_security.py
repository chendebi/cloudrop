from django.test import TestCase, override_settings

from transfer.models import IpAttempt, SecurityState
from transfer.security import (
    SESSION_GENERATION_KEY,
    authenticate_password,
    get_client_ip,
    get_security_snapshot,
    session_is_authorized,
)


@override_settings(CLOUDROP_ACCESS_PASSWORD="correct-password")
class SecurityTests(TestCase):
    def test_five_consecutive_failures_from_one_ip_lock_server(self) -> None:
        for index in range(4):
            result = authenticate_password("wrong", "203.0.113.5")
            self.assertFalse(result.locked, index)

        result = authenticate_password("wrong", "203.0.113.5")

        self.assertTrue(result.locked)
        self.assertTrue(SecurityState.objects.get(pk=1).locked)

    def test_ten_failures_across_ips_lock_server(self) -> None:
        for index in range(9):
            result = authenticate_password("wrong", f"203.0.113.{index + 1}")
            self.assertFalse(result.locked)

        result = authenticate_password("wrong", "198.51.100.20")

        self.assertTrue(result.locked)

    def test_success_resets_only_that_ip_consecutive_counter(self) -> None:
        authenticate_password("wrong", "203.0.113.8")
        authenticate_password("wrong", "203.0.113.8")

        result = authenticate_password("correct-password", "203.0.113.8")

        self.assertTrue(result.authorized)
        self.assertEqual(IpAttempt.objects.get(ip_address="203.0.113.8").consecutive_failures, 0)
        self.assertEqual(SecurityState.objects.get(pk=1).daily_failures, 2)

    def test_password_change_unlocks_and_invalidates_old_session(self) -> None:
        for _ in range(5):
            locked_result = authenticate_password("wrong", "203.0.113.9")
        old_generation = locked_result.generation

        with override_settings(CLOUDROP_ACCESS_PASSWORD="new-password"):
            snapshot = get_security_snapshot()

        self.assertFalse(snapshot.locked)
        self.assertGreater(snapshot.generation, old_generation)
        self.assertFalse(session_is_authorized({SESSION_GENERATION_KEY: old_generation}, snapshot))
        self.assertFalse(IpAttempt.objects.exists())

    def test_proxy_ip_uses_rightmost_value_for_one_trusted_proxy(self) -> None:
        ip = get_client_ip(
            {
                "REMOTE_ADDR": "172.18.0.3",
                "HTTP_X_FORWARDED_FOR": "198.51.100.1, 203.0.113.20",
            }
        )

        self.assertEqual(ip, "203.0.113.20")

