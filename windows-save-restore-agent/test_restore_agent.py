import hashlib
import json
import os
import tempfile
import threading
import time
import unittest
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch

import requests

import restore_agent


class RestoreAgentSecurityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.agent = restore_agent.RestoreAgent.__new__(restore_agent.RestoreAgent)
        self.agent.stop_event = threading.Event()
        self.agent.max_members = 100
        self.agent.max_file_bytes = 1024 * 1024
        self.agent.max_total_bytes = 2 * 1024 * 1024
        self.agent.max_ratio = 20
        self.agent.max_depth = 8
        self.agent.max_path = 240
        self.agent.device_id = "test-device"

    def make_zip(self, root: Path, members: dict[str, bytes]) -> Path:
        archive_path = root / "save.zip"
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
            for name, content in members.items():
                archive.writestr(name, content)
        return archive_path

    def test_rejects_untrusted_urls(self) -> None:
        with self.assertRaises(ValueError):
            restore_agent.validate_url(
                "https://example.com/save.zip",
                frozenset({restore_agent.API_HOST}),
                "download",
            )
        with self.assertRaises(ValueError):
            restore_agent.validate_url(
                "http://api.luugame.fun/save.zip",
                frozenset({restore_agent.API_HOST}),
                "download",
            )

    def test_update_metadata_binds_version_size_digest_and_url(self) -> None:
        digest = "a" * 64
        parsed = restore_agent.parse_update_info({
            "available": True,
            "version": "1.2.3",
            "size": 123,
            "sha256": digest,
            "downloadUrl": f"/api/agent/download/{digest}",
        }, restore_agent.API_BASE_URL)
        self.assertEqual(parsed["sha256"], digest)
        self.assertEqual(parsed["download_url"], f"{restore_agent.API_BASE_URL}/api/agent/download/{digest}")

        invalid = [
            {"available": True, "version": "v1.2.3", "size": 123, "sha256": digest,
             "downloadUrl": f"/api/agent/download/{digest}"},
            {"available": True, "version": "1.2.3", "size": 0, "sha256": digest,
             "downloadUrl": f"/api/agent/download/{digest}"},
            {"available": True, "version": "1.2.3", "size": 123, "sha256": digest.upper(),
             "downloadUrl": f"/api/agent/download/{digest.upper()}"},
            {"available": True, "version": "1.2.3", "size": 123, "sha256": digest,
             "downloadUrl": "/api/agent/download"},
        ]
        for payload in invalid:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                restore_agent.parse_update_info(payload, restore_agent.API_BASE_URL)

    def test_manual_link_refresh_requests_a_new_session_for_linked_key(self) -> None:
        agent = restore_agent.RestoreAgent.__new__(restore_agent.RestoreAgent)
        agent.device_id = "test-device"
        agent.display_name = "Test device"
        agent.api_key = "a" * 64
        agent.link_started = False
        agent.link_expires_at = 0.0
        agent.emit = Mock()
        response = Mock()
        response.json.return_value = {
            "already_linked": False,
            "verification_url": "https://luugame.fun/?device_link=new-token",
            "expires_in_seconds": 600,
        }
        agent._request = Mock(return_value=response)

        with patch.object(restore_agent.webbrowser, "open", return_value=True):
            agent.start_link_flow(force=True)

        self.assertTrue(agent._request.call_args.kwargs["json"]["force_relink"])
        agent.emit.assert_called_once_with(
            "link_required",
            verification_url="https://luugame.fun/?device_link=new-token",
            device_id="test-device",
            api_key="a" * 64,
        )

    def test_already_linked_response_releases_waiting_ui(self) -> None:
        agent = restore_agent.RestoreAgent.__new__(restore_agent.RestoreAgent)
        agent.device_id = "test-device"
        agent.display_name = "Test device"
        agent.api_key = "a" * 64
        agent.link_started = False
        agent.link_expires_at = 0.0
        agent.emit = Mock()
        response = Mock()
        response.json.return_value = {"already_linked": True}
        agent._request = Mock(return_value=response)

        agent.start_link_flow()

        agent.emit.assert_called_once_with("link_not_required")

    def test_rejects_zip_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = self.make_zip(root, {"../escaped.dat": b"unsafe"})
            with self.assertRaises(ValueError):
                self.agent._extract_zip(archive, root / "output")
            self.assertFalse((root / "escaped.dat").exists())

    def test_rejects_excessive_compression_ratio(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = self.make_zip(root, {"save.dat": b"0" * 100_000})
            with self.assertRaisesRegex(ValueError, "compression ratio"):
                self.agent._extract_zip(archive, root / "output")

    def test_restore_overlays_files_without_removing_unrelated_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "game-save"
            target.mkdir()
            (target / "stale.dat").write_bytes(b"old")
            (target / "same.dat").write_bytes(b"old version")
            archive = self.make_zip(root, {"current.dat": b"new", "same.dat": b"new version"})

            self.agent.apply_restore(archive, str(target), None)

            self.assertEqual((target / "current.dat").read_bytes(), b"new")
            self.assertEqual((target / "same.dat").read_bytes(), b"new version")
            self.assertEqual((target / "stale.dat").read_bytes(), b"old")

    def test_single_file_restore_preserves_other_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "game-save"
            target.mkdir()
            (target / "keep.dat").write_bytes(b"keep")
            (target / "save.dat").write_bytes(b"old")
            artifact = root / "download.bin"
            artifact.write_bytes(b"new")

            self.agent.apply_restore(artifact, str(target), "save.dat")

            self.assertEqual((target / "save.dat").read_bytes(), b"new")
            self.assertEqual((target / "keep.dat").read_bytes(), b"keep")

    def test_restore_preserves_nested_existing_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "game-save"
            (target / "profile").mkdir(parents=True)
            (target / "profile" / "keep.dat").write_bytes(b"keep")
            archive = self.make_zip(root, {"profile/new.dat": b"new"})

            self.agent.apply_restore(archive, str(target), None)

            self.assertEqual((target / "profile" / "new.dat").read_bytes(), b"new")
            self.assertEqual((target / "profile" / "keep.dat").read_bytes(), b"keep")

    def test_restore_rejects_file_directory_conflict_without_changing_target(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "game-save"
            target.mkdir()
            (target / "profile").write_bytes(b"existing file")
            archive = self.make_zip(root, {"profile/save.dat": b"new"})

            with self.assertRaisesRegex(ValueError, "file/directory conflict"):
                self.agent.apply_restore(archive, str(target), None)

            self.assertEqual((target / "profile").read_bytes(), b"existing file")

    def test_restore_never_moves_or_deletes_the_target_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "game-save"
            target.mkdir()
            (target / "original.dat").write_bytes(b"original")
            archive = self.make_zip(root, {"replacement.dat": b"replacement"})

            with patch.object(self.agent, "_move_directory") as move_directory:
                self.agent.apply_restore(archive, str(target), None)

            self.assertEqual((target / "original.dat").read_bytes(), b"original")
            self.assertEqual((target / "replacement.dat").read_bytes(), b"replacement")
            move_directory.assert_not_called()

    def test_restore_to_broad_path_preserves_sibling_directories(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "all-game-saves"
            (target / "other-game").mkdir(parents=True)
            (target / "other-game" / "save.dat").write_bytes(b"other")
            archive = self.make_zip(root, {"selected-game/save.dat": b"selected"})

            self.agent.apply_restore(archive, str(target), None)

            self.assertEqual((target / "selected-game" / "save.dat").read_bytes(), b"selected")
            self.assertEqual((target / "other-game" / "save.dat").read_bytes(), b"other")

    def test_process_task_requires_save_path_before_download(self) -> None:
        self.agent.device_id = "test-device"
        task = {
            "id": 1,
            "device_id": "test-device",
            "file_url": "https://api.luugame.fun/api/save/download/1",
            "save_path": None,
            **self.lease_fields(),
        }
        with self.assertRaisesRegex(ValueError, "save_path is required"):
            self.agent.process_task(task)

    @staticmethod
    def lease_fields() -> dict[str, object]:
        return {
            "lease_token": "lease-token-1",
            "lease_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
            "lease_seconds": 300,
        }

    def configure_journals(self, root: Path) -> None:
        self.agent.ack_file = root / "pending-acks.json"
        self.agent.dead_ack_file = root / "dead-letter-acks.json"
        self.agent.transaction_index_file = root / "restore-transactions.json"
        self.agent.pending_acks = []
        self.agent.dead_acks = []

    def write_transaction(self, root: Path, target: Path, staging: Path, backup: Path,
                          phase: str, original_existed: bool = True) -> Path:
        journal = self.agent._transaction_path(target)
        transaction = {
            "task_id": 7,
            "device_id": self.agent.device_id,
            "lease_token": "lease-token-7",
            "sha256": "a" * 64,
            "target": str(target),
            "staging": str(staging),
            "backup": str(backup),
            "original_existed": original_existed,
            "phase": phase,
        }
        restore_agent.atomic_write(journal, json.dumps(transaction).encode())
        restore_agent.atomic_write(self.agent.transaction_index_file, json.dumps([str(journal)]).encode())
        return journal

    def test_strictly_validates_lease_fields(self) -> None:
        valid = self.lease_fields()
        token, _expires, seconds, expiry = restore_agent.parse_lease_fields(valid)
        self.assertEqual(token, "lease-token-1")
        self.assertEqual(seconds, 300)
        self.assertGreater(expiry, time.time())

        invalid_values = [
            {**valid, "lease_token": ""},
            {**valid, "lease_seconds": True},
            {**valid, "lease_seconds": 0},
            {**valid, "lease_expires_at": "2026-01-01T00:00:00"},
            {**valid, "lease_expires_at": "2000-01-01T00:00:00Z"},
        ]
        for payload in invalid_values:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                restore_agent.parse_lease_fields(payload)

    def test_lease_loss_immediately_before_commit_preserves_original(self) -> None:
        class LostBeforeCommit:
            def ensure_owned(self) -> None:
                return

            def renew_now(self) -> None:
                raise restore_agent.LeaseLostError("simulated ownership loss")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.configure_journals(root)
            target = root / "game-save"
            target.mkdir()
            (target / "original.dat").write_bytes(b"original")
            archive = self.make_zip(root, {"replacement.dat": b"replacement"})

            with self.assertRaisesRegex(restore_agent.LeaseLostError, "ownership loss"):
                self.agent.apply_restore(archive, str(target), None, LostBeforeCommit(), 9,
                                         "lease-token-9", "b" * 64)

            self.assertEqual((target / "original.dat").read_bytes(), b"original")
            self.assertFalse((target / "replacement.dat").exists())

    def test_recovery_queues_success_for_already_published_commit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.configure_journals(root)
            target = root / "game-save"
            target.mkdir()
            (target / "new.dat").write_bytes(b"new")
            staging = root / ".game-save.staging-dead"
            backup = root / ".game-save.backup-dead"
            backup.mkdir()
            (backup / "old.dat").write_bytes(b"old")
            journal = self.write_transaction(root, target, staging, backup, "publish_pending")

            self.agent.recover_transactions()

            self.assertFalse(journal.exists())
            self.assertFalse(backup.exists())
            self.assertEqual(self.agent.pending_acks[0]["lease_token"], "lease-token-7")
            self.assertTrue(self.agent.pending_acks[0]["success"])

    def test_recovery_restores_backup_for_incomplete_publish(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.configure_journals(root)
            target = root / "game-save"
            staging = root / ".game-save.staging-dead"
            staging.mkdir()
            (staging / "new.dat").write_bytes(b"new")
            backup = root / ".game-save.backup-dead"
            backup.mkdir()
            (backup / "old.dat").write_bytes(b"old")
            journal = self.write_transaction(root, target, staging, backup, "publish_pending")

            self.agent.recover_transactions()

            self.assertFalse(journal.exists())
            self.assertEqual((target / "old.dat").read_bytes(), b"old")
            self.assertFalse(staging.exists())
            self.assertEqual(self.agent.pending_acks, [])

    def test_recovery_preserves_unsafe_journal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.configure_journals(root)
            target = root / "game-save"
            staging = root / "unrelated-staging"
            backup = root / ".game-save.backup-dead"
            journal = self.write_transaction(root, target, staging, backup, "staged")

            self.agent.recover_transactions()

            self.assertTrue(journal.exists())
            self.assertIn(str(journal), self.agent._load_transaction_index())

    def test_missing_indexed_journal_blocks_new_restore(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.configure_journals(root)
            target = root / "game-save"
            journal = self.agent._transaction_path(target)
            restore_agent.atomic_write(self.agent.transaction_index_file, json.dumps([str(journal)]).encode())
            archive = self.make_zip(root, {"new.dat": b"new"})

            with self.assertRaisesRegex(RuntimeError, "Unresolved restore transaction"):
                self.agent.apply_restore(archive, str(target), None, task_id=8,
                                         lease_token="lease-token-8", artifact_hash="c" * 64)

            self.assertFalse(target.exists())

    def test_terminal_ack_conflict_moves_to_dead_letter_and_continues(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.configure_journals(root)
            self.agent.queue_ack(1, True, lease_token="lease-1")
            self.agent.queue_ack(2, True, lease_token="lease-2")
            response = requests.Response()
            response.status_code = 409
            conflict = requests.HTTPError("conflict", response=response)
            self.agent.report_done = Mock(side_effect=[conflict, None])

            self.assertTrue(self.agent.retry_acks())
            self.assertEqual(self.agent.pending_acks, [])
            self.assertEqual([item["task_id"] for item in self.agent.dead_acks], [1])
            self.assertEqual(self.agent.report_done.call_count, 2)

    def test_hash_fixture_matches_backend_format(self) -> None:
        payload = b"cloudsave-integrity"
        self.assertEqual(
            hashlib.sha256(payload).hexdigest(),
            "5ba0a1a598c04ac226178389ea6fb0ea3f94e50e7a260268687a2a2ff473688d",
        )


if __name__ == "__main__":
    unittest.main()
