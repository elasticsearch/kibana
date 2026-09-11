#!/usr/bin/env python3
"""Shared model-id handling for sweep gates.

Stored ids are NOT derivable by string rules: `eis-zai-glm-5-2` stores as
`zai-glm-5-2` (hyphen) but `eis-anthropic-claude-4-6-sonnet` stores as
`anthropic-claude-4.6-sonnet` (dot); others use slashes or display names.
Guessing once reported GLM as 0 docs when it had 3,834. Compare on `norm()`,
and resolve against live ids whenever a cluster is reachable.
"""
from __future__ import annotations


def norm(value: str) -> str:
    """Collapse an id to comparable form: lowercase, alphanumerics only."""
    return "".join(ch for ch in value.lower() if ch.isalnum())


def strip_connector_prefix(model_id: str) -> str:
    return model_id[4:] if model_id.startswith("eis-") else model_id


def same_model(a: str, b: str) -> bool:
    """True when two ids denote the same model across id conventions."""
    return norm(strip_connector_prefix(a)) == norm(strip_connector_prefix(b))


def resolve_model_id(connector_id: str, stored_ids: list[str]) -> str | None:
    """Match a connector id to the id actually present in score docs.

    Returns None only when nothing matches — a real "never landed" signal
    rather than an artifact of a bad guess.
    """
    target = norm(strip_connector_prefix(connector_id))
    for stored in stored_ids:
        if norm(stored) == target:
            return stored
    return None
