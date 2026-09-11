#!/usr/bin/env python3
"""End-to-end sweep-controller test: Azure + SSH fully stubbed.

Covers the behaviours that live inside main()'s provision/launch loop and so
cannot be reached from the in-file --self-test unit checks:

  1. the quota gate actually ABORTS a sweep (exit 2, zero VMs created);
  2. every finished unit gets parked, freeing its cores mid-sweep.

Both were mutation-tested: reverting either behaviour turns this test red.
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).parent


def load_sweep():
    """Import the sweep module fresh, with a temp run dir so nothing leaks."""
    spec = importlib.util.spec_from_file_location(
        "sweep_under_test", HERE / "persona_matrix_sweep.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Recorder:
    """Stands in for az(), recording every command the controller issues."""

    def __init__(self, used=0, limit=350):
        self.calls = []
        self.used = used
        self.limit = limit
        self._ips: dict = {}

    def __call__(self, *args):
        self.calls.append(args)
        if args[:2] == ("vm", "list-usage"):
            return json.dumps(
                [
                    {
                        "name": {"value": "standardDSv5Family"},
                        "currentValue": self.used,
                        "limit": self.limit,
                    }
                ]
            )
        if args[:2] == ("vm", "show"):
            if "powerState" in args:
                return "VM running"
            # Unique IP per VM name: the controller rightly aborts when two
            # units land on one box, so a shared stub IP would mask the test.
            name = args[args.index("-n") + 1] if "-n" in args else "vm"
            self._ips.setdefault(name, f"10.0.0.{len(self._ips) + 1}")
            return json.dumps(self._ips[name])
        return "[]"

    def verbs(self, verb):
        return [c for c in self.calls if c[:2] == ("vm", verb)]


def harness(mod, tmp, recorder):
    """Neutralise every real side effect: Azure, SSH, scp, golden, sleep."""
    mod.az = recorder
    mod.RUN_DIR = Path(tmp)
    mod.provision_wait_seconds = lambda *a, **k: 0
    mod.wait_ssh = lambda ip: True
    mod.deploy = lambda ip: None
    mod.scp = lambda *a, **k: None
    mod.ssh = lambda *a, **k: "ok"
    mod.launch = lambda ip, model, shard=None: SimpleNamespace(wait=lambda: 0)
    mod.time.sleep = lambda *a: None
    # The controller polls the VM for /tmp/unit.done, then gates on golden.
    mod.subprocess.run = lambda *a, **k: SimpleNamespace(stdout="done 0", returncode=0)
    mod.check_golden = lambda model, ip, shard=None: {
        "count": 98,
        "expected": 98,
        "gate": "exact",
        "execution_id": "stub::suite::model",
    }
    return mod


def run_main(mod, argv):
    saved = sys.argv
    sys.argv = ["persona_matrix_sweep.py"] + argv
    try:
        return mod.main()
    finally:
        sys.argv = saved


def test_quota_gate_aborts_before_provisioning():
    """23 units x 8 cores into 344/350 used must abort, creating nothing."""
    mod = load_sweep()
    rec = Recorder(used=344, limit=350)
    with tempfile.TemporaryDirectory() as tmp:
        harness(mod, tmp, rec)
        rc = run_main(mod, ["--models", ",".join(mod.MODELS[:23]), "--shards", "1"])
    assert rc == 2, f"expected exit 2 (quota abort), got {rc}"
    assert not rec.verbs("create"), (
        f"quota gate let {len(rec.verbs('create'))} VM create(s) through -- "
        "this is the 2026-09-06 10h incident"
    )
    return "quota gate aborts: exit 2, 0 creates"


def test_quota_gate_allows_a_fitting_sweep():
    """The same sweep fits under a clean quota and must proceed to create."""
    mod = load_sweep()
    rec = Recorder(used=64, limit=350)
    with tempfile.TemporaryDirectory() as tmp:
        harness(mod, tmp, rec)
        rc = run_main(mod, ["--models", "eis-openai-gpt-5-4", "--shards", "1"])
    assert rec.verbs("create"), "fitting sweep created no VM -- gate is over-blocking"
    return f"fitting sweep proceeds: {len(rec.verbs('create'))} create(s), rc={rc}"


def test_finished_units_are_parked():
    """Each completed unit must be deallocated, not left billing."""
    mod = load_sweep()
    rec = Recorder(used=0, limit=350)
    with tempfile.TemporaryDirectory() as tmp:
        harness(mod, tmp, rec)
        rc = run_main(mod, ["--models", "eis-openai-gpt-5-4,eis-openai-gpt-5-4-mini"])
    deallocs = rec.verbs("deallocate")
    assert rc == 0, f"stubbed sweep should pass, got rc={rc}"
    assert len(deallocs) == 2, (
        f"expected 2 units parked, got {len(deallocs)} -- finished VMs "
        "holding cores is what exhausted the quota twice"
    )
    assert not rec.verbs("delete"), "park must deallocate (reusable), never delete"
    return f"parked {len(deallocs)}/2 finished units via deallocate"


def test_park_opt_out():
    """PARK_ON_DONE=0 keeps VMs up for debugging."""
    mod = load_sweep()
    rec = Recorder(used=0, limit=350)
    os.environ["PARK_ON_DONE"] = "0"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            harness(mod, tmp, rec)
            run_main(mod, ["--models", "eis-openai-gpt-5-4"])
    finally:
        os.environ.pop("PARK_ON_DONE", None)
    assert not rec.verbs("deallocate"), "PARK_ON_DONE=0 still deallocated"
    return "park opt-out honoured: 0 deallocates"


TESTS = [
    test_quota_gate_aborts_before_provisioning,
    test_quota_gate_allows_a_fitting_sweep,
    test_finished_units_are_parked,
    test_park_opt_out,
]


def main():
    failures = []
    for t in TESTS:
        try:
            detail = t()
            print(f"  PASS {t.__name__}: {detail}")
        except AssertionError as exc:
            failures.append(f"{t.__name__}: {exc}")
            print(f"  FAIL {t.__name__}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{t.__name__}: unexpected {exc!r}")
            print(f"  ERROR {t.__name__}: {exc!r}")
    print(f"controller e2e: {len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
