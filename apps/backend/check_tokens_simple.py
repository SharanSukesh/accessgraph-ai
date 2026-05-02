"""
Simple script to check token status in database
This helps verify the current state before running migration
"""
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.core.config import settings

def check_tokens():
    """Check current token encryption status"""

    print("="*60)
    print("Token Status Check")
    print("="*60)
    print()
    print(f"ENABLE_FIELD_ENCRYPTION: {settings.ENABLE_FIELD_ENCRYPTION}")
    print(f"DATABASE_ENCRYPTION_KEY set: {bool(settings.DATABASE_ENCRYPTION_KEY)}")
    print()

    # Create sync engine
    engine = create_engine(
        settings.DATABASE_URL.replace('+aiosqlite', '').replace('postgresql+asyncpg', 'postgresql+psycopg')
    )

    with Session(engine) as session:
        # Count total connections
        result = session.execute(
            text("SELECT COUNT(*) FROM salesforce_connections")
        )
        total = result.scalar()
        print(f"Total Salesforce connections: {total}")

        # Count connections with tokens
        result = session.execute(
            text("""
                SELECT COUNT(*) FROM salesforce_connections
                WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL
            """)
        )
        with_tokens = result.scalar()
        print(f"Connections with tokens: {with_tokens}")
        print()

        # Show first 50 chars of tokens
        result = session.execute(
            text("""
                SELECT
                    id,
                    organization_id,
                    LEFT(access_token, 50) as access_sample,
                    LEFT(refresh_token, 50) as refresh_sample
                FROM salesforce_connections
                WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL
                LIMIT 5
            """)
        )

        connections = result.fetchall()

        if connections:
            print("Sample tokens (first 50 chars):")
            print("-"*60)
            for conn_id, org_id, access_sample, refresh_sample in connections:
                print(f"Connection: {conn_id}")
                print(f"  Organization: {org_id}")
                if access_sample:
                    print(f"  Access token: {access_sample}...")
                    # Check if it looks encrypted (random bytes) or plain text
                    if access_sample.startswith("00!") or access_sample.startswith("eyJ"):
                        print(f"  → Looks like PLAIN TEXT (Salesforce token format)")
                    else:
                        print(f"  → Looks like ENCRYPTED (random bytes)")
                if refresh_sample:
                    print(f"  Refresh token: {refresh_sample}...")
                    if refresh_sample.startswith("eyJ") or "!" in refresh_sample[:20]:
                        print(f"  → Looks like PLAIN TEXT (Salesforce token format)")
                    else:
                        print(f"  → Looks like ENCRYPTED (random bytes)")
                print()

        print("="*60)
        print()

        if settings.ENABLE_FIELD_ENCRYPTION and with_tokens > 0:
            print("⚠️  WARNING: Encryption is ENABLED but tokens may be plain text")
            print("   This will cause NULL values when reading tokens")
            print()
            print("Recommended action:")
            print("1. Set ENABLE_FIELD_ENCRYPTION=false")
            print("2. Run migration: python apps/backend/migrate_encrypt_tokens.py")
            print("3. Set ENABLE_FIELD_ENCRYPTION=true")
            print("4. Redeploy")
        elif not settings.ENABLE_FIELD_ENCRYPTION and with_tokens > 0:
            print("✅ Current state is correct for migration:")
            print("   - Encryption is DISABLED")
            print("   - Tokens are accessible as plain text")
            print()
            print("Ready to run migration:")
            print("   python apps/backend/migrate_encrypt_tokens.py")
        else:
            print("No tokens found in database")

if __name__ == "__main__":
    check_tokens()
