"""
One-time migration script to encrypt existing plain-text OAuth tokens

This script reads plain-text access_token and refresh_token values from the database
and re-saves them so they get encrypted by sqlalchemy-utils EncryptedType.

Run this ONCE before re-enabling ENABLE_FIELD_ENCRYPTION=true in production.

Usage:
    python migrate_encrypt_tokens.py
"""
import asyncio
import os
import sys

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.core.config import settings


def migrate_tokens():
    """
    Migrate plain-text tokens to encrypted format

    This works by:
    1. Reading the raw plain-text token values directly from the database
    2. Using SQLAlchemy ORM to update the records
    3. When we set the values via ORM with encryption enabled, they get encrypted automatically
    """

    # Connect to database
    print(f"Connecting to database...")
    print(f"DATABASE_URL: {settings.DATABASE_URL[:50]}...")  # Show first 50 chars only
    print(f"ENABLE_FIELD_ENCRYPTION: {settings.ENABLE_FIELD_ENCRYPTION}")
    print(f"DATABASE_ENCRYPTION_KEY set: {bool(settings.DATABASE_ENCRYPTION_KEY)}")
    print()

    if not settings.ENABLE_FIELD_ENCRYPTION:
        print("⚠️  WARNING: ENABLE_FIELD_ENCRYPTION is currently FALSE")
        print("This script should be run with ENABLE_FIELD_ENCRYPTION=true")
        print("so that tokens get encrypted when saved.")
        print()
        response = input("Continue anyway? (y/N): ")
        if response.lower() != 'y':
            print("Aborted.")
            return

    if not settings.DATABASE_ENCRYPTION_KEY:
        print("❌ ERROR: DATABASE_ENCRYPTION_KEY is not set!")
        print("Cannot encrypt tokens without an encryption key.")
        return

    # Create sync engine for this script
    engine = create_engine(
        settings.DATABASE_URL.replace('+aiosqlite', '').replace('postgresql+asyncpg', 'postgresql+psycopg')
    )

    with Session(engine) as session:
        # Query to get all Salesforce connections
        result = session.execute(
            text("""
                SELECT id, organization_id, access_token, refresh_token
                FROM salesforce_connections
                WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL
            """)
        )

        connections = result.fetchall()

        if not connections:
            print("✅ No connections found with tokens. Nothing to migrate.")
            return

        print(f"Found {len(connections)} connection(s) with tokens.")
        print()

        # Now use ORM to re-save the tokens (which will encrypt them)
        from app.domain.models import SalesforceConnection

        migrated = 0
        for conn_id, org_id, access_token, refresh_token in connections:
            print(f"Processing connection {conn_id} (org: {org_id})...")

            # Get the ORM object
            connection = session.get(SalesforceConnection, conn_id)

            if connection:
                # Re-assign the token values
                # When encryption is enabled, setting these values will encrypt them
                if access_token:
                    connection.access_token = access_token
                    print(f"  ✓ Access token will be encrypted (length: {len(access_token)})")

                if refresh_token:
                    connection.refresh_token = refresh_token
                    print(f"  ✓ Refresh token will be encrypted (length: {len(refresh_token)})")

                migrated += 1

        # Commit all changes
        print()
        print(f"Committing changes for {migrated} connection(s)...")
        session.commit()
        print()
        print("✅ Migration completed successfully!")
        print()
        print("Next steps:")
        print("1. Verify ENABLE_FIELD_ENCRYPTION=true in Railway environment variables")
        print("2. Redeploy the backend service")
        print("3. Test that sync still works")


if __name__ == "__main__":
    print("="*60)
    print("OAuth Token Encryption Migration")
    print("="*60)
    print()
    migrate_tokens()
