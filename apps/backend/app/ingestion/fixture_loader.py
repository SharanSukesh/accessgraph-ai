"""
Demo Fixture Loader
Loads demo data from JSON fixtures
"""
import json
import logging
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger(__name__)


class FixtureLoader:
    """Load demo data from fixture files"""

    def __init__(self, fixture_path: str = "fixtures/demo_org.json"):
        self.fixture_path = Path(fixture_path)

    def load(self) -> Dict[str, Any]:
        """
        Load fixture data

        Returns:
            Dict with all fixture data
        """
        if not self.fixture_path.exists():
            raise FileNotFoundError(f"Fixture file not found: {self.fixture_path}")

        with open(self.fixture_path, "r") as f:
            data = json.load(f)

        logger.info(f"Loaded fixture: {data.get('org_name')}")
        logger.info(f"  Users: {len(data.get('users', []))}")
        logger.info(f"  Roles: {len(data.get('roles', []))}")
        logger.info(f"  Profiles: {len(data.get('profiles', []))}")
        logger.info(f"  Permission Sets: {len(data.get('permission_sets', []))}")
        logger.info(f"  PSG: {len(data.get('permission_set_groups', []))}")
        logger.info(f"  Object Permissions: {len(data.get('object_permissions', []))}")
        logger.info(f"  Field Permissions: {len(data.get('field_permissions', []))}")

        return data
