"""
Test script to verify field encryption is working correctly
"""
import asyncio
import secrets
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.domain.models import Organization, SalesforceConnection
from app.core.config import settings


async def test_encryption():
    """Test that OAuth token encryption works"""

    print("=" * 60)
    print("Field Encryption Test")
    print("=" * 60)

    # Check encryption settings
    print(f"\nEncryption enabled: {settings.ENABLE_FIELD_ENCRYPTION}")
    print(f"Encryption key set: {bool(settings.DATABASE_ENCRYPTION_KEY)}")

    if not settings.ENABLE_FIELD_ENCRYPTION:
        print("\n⚠️  WARNING: Encryption is disabled (ENABLE_FIELD_ENCRYPTION=False)")
        print("Set ENABLE_FIELD_ENCRYPTION=True to test encryption\n")
        return

    if not settings.DATABASE_ENCRYPTION_KEY:
        print("\n⚠️  WARNING: No encryption key configured!")
        print("Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(32))'")
        print("Then set DATABASE_ENCRYPTION_KEY in your .env file\n")
        return

    # Create test data
    async with AsyncSessionLocal() as session:
        # Find or create test org
        stmt = select(Organization).where(Organization.name == "Encryption Test Org")
        result = await session.execute(stmt)
        org = result.scalar_one_or_none()

        if not org:
            print("\nCreating test organization...")
            org = Organization(
                name="Encryption Test Org",
                domain="test-encryption.example.com",
                is_demo=True
            )
            session.add(org)
            await session.commit()
            await session.refresh(org)
            print(f"✓ Created organization: {org.id}")
        else:
            print(f"\n✓ Using existing organization: {org.id}")

        # Create test Salesforce connection with sensitive tokens
        print("\nCreating Salesforce connection with test tokens...")
        test_access_token = f"test_access_token_{secrets.token_hex(16)}"
        test_refresh_token = f"test_refresh_token_{secrets.token_hex(16)}"

        sf_conn = SalesforceConnection(
            organization_id=org.id,
            instance_url="https://test.salesforce.com",
            organization_id_sf="00D000000000001",
            access_token=test_access_token,
            refresh_token=test_refresh_token,
            is_active=True
        )
        session.add(sf_conn)
        await session.commit()
        await session.refresh(sf_conn)

        print(f"✓ Created Salesforce connection: {sf_conn.id}")
        print(f"\nOriginal access token:  {test_access_token[:30]}...")
        print(f"Original refresh token: {test_refresh_token[:30]}...")

        # Read back and verify
        print("\nReading back from database...")
        stmt = select(SalesforceConnection).where(SalesforceConnection.id == sf_conn.id)
        result = await session.execute(stmt)
        retrieved_conn = result.scalar_one()

        # Verify decryption works
        tokens_match_access = retrieved_conn.access_token == test_access_token
        tokens_match_refresh = retrieved_conn.refresh_token == test_refresh_token

        print(f"\n✓ Retrieved access token:  {retrieved_conn.access_token[:30]}...")
        print(f"✓ Retrieved refresh token: {retrieved_conn.refresh_token[:30]}...")
        print(f"\n{'✓' if tokens_match_access else '✗'} Access token matches:  {tokens_match_access}")
        print(f"{'✓' if tokens_match_refresh else '✗'} Refresh token matches: {tokens_match_refresh}")

        # Clean up
        print("\nCleaning up test data...")
        await session.delete(sf_conn)
        await session.delete(org)
        await session.commit()
        print("✓ Test data cleaned up")

        if tokens_match_access and tokens_match_refresh:
            print("\n" + "=" * 60)
            print("✓ ENCRYPTION TEST PASSED")
            print("=" * 60)
            print("\nOAuth tokens are being properly encrypted and decrypted!")
        else:
            print("\n" + "=" * 60)
            print("✗ ENCRYPTION TEST FAILED")
            print("=" * 60)
            print("\nTokens do not match - encryption/decryption may not be working!")


if __name__ == "__main__":
    asyncio.run(test_encryption())
