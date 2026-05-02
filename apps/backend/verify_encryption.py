"""
Comprehensive encryption verification script

This script verifies that:
1. ENABLE_FIELD_ENCRYPTION is set to true
2. DATABASE_ENCRYPTION_KEY is set
3. Tokens in database are encrypted (not plain text)
4. Tokens can be decrypted and used for Salesforce API calls
"""
import asyncio
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.domain.models import SalesforceConnection

async def verify_encryption():
    """Verify encryption is working correctly"""

    print("="*80)
    print("ENCRYPTION VERIFICATION TEST")
    print("="*80)
    print()

    # Step 1: Check environment configuration
    print("Step 1: Checking environment configuration...")
    print("-"*80)
    print(f"ENABLE_FIELD_ENCRYPTION: {settings.ENABLE_FIELD_ENCRYPTION}")
    print(f"DATABASE_ENCRYPTION_KEY set: {bool(settings.DATABASE_ENCRYPTION_KEY)}")
    print(f"DATABASE_ENCRYPTION_KEY length: {len(settings.DATABASE_ENCRYPTION_KEY) if settings.DATABASE_ENCRYPTION_KEY else 0} chars")
    print()

    if not settings.ENABLE_FIELD_ENCRYPTION:
        print("❌ ERROR: ENABLE_FIELD_ENCRYPTION is False!")
        print("   Encryption should be enabled in production.")
        return False

    if not settings.DATABASE_ENCRYPTION_KEY:
        print("❌ ERROR: DATABASE_ENCRYPTION_KEY is not set!")
        print("   Cannot encrypt/decrypt tokens without a key.")
        return False

    print("✅ Environment configuration looks good!")
    print()

    # Step 2: Check tokens in database (raw SQL to see encrypted values)
    print("Step 2: Checking raw token storage in database...")
    print("-"*80)

    # Use sync engine for raw SQL queries
    sync_engine = create_engine(
        settings.DATABASE_URL.replace('postgresql+asyncpg', 'postgresql+psycopg')
    )

    with Session(sync_engine) as session:
        result = session.execute(
            text("""
                SELECT
                    id,
                    organization_id,
                    instance_url,
                    is_active,
                    SUBSTRING(access_token, 1, 50) as access_token_sample,
                    SUBSTRING(refresh_token, 1, 50) as refresh_token_sample,
                    LENGTH(access_token) as access_token_length,
                    LENGTH(refresh_token) as refresh_token_length
                FROM salesforce_connections
                WHERE access_token IS NOT NULL AND is_active = true
                LIMIT 1
            """)
        )

        connection_data = result.fetchone()

        if not connection_data:
            print("❌ ERROR: No active Salesforce connection found!")
            print("   Please authenticate with Salesforce first.")
            return False

        conn_id, org_id, instance_url, is_active, access_sample, refresh_sample, access_len, refresh_len = connection_data

        print(f"Connection ID: {conn_id}")
        print(f"Organization ID: {org_id}")
        print(f"Instance URL: {instance_url}")
        print(f"Is Active: {is_active}")
        print()
        print(f"Access Token (first 50 chars): {access_sample}")
        print(f"Access Token Length: {access_len} chars")
        print()
        print(f"Refresh Token (first 50 chars): {refresh_sample}")
        print(f"Refresh Token Length: {refresh_len} chars")
        print()

        # Check if tokens look encrypted (not Salesforce format)
        # Salesforce tokens typically start with "00D" or "eyJ" (JWT)
        if access_sample and (access_sample.startswith('00!') or access_sample.startswith('eyJ')):
            print("⚠️  WARNING: Access token looks like PLAIN TEXT (Salesforce format detected)!")
            print("   Expected: Encrypted binary data")
            print("   Got: Salesforce token format")
            return False
        elif access_sample:
            print("✅ Access token appears to be ENCRYPTED (not Salesforce format)")

        if refresh_sample and (refresh_sample.startswith('eyJ') or '!' in refresh_sample[:20]):
            print("⚠️  WARNING: Refresh token looks like PLAIN TEXT (Salesforce format detected)!")
            print("   Expected: Encrypted binary data")
            print("   Got: Salesforce token format")
            return False
        elif refresh_sample:
            print("✅ Refresh token appears to be ENCRYPTED (not Salesforce format)")

    print()

    # Step 3: Check that ORM can decrypt tokens
    print("Step 3: Verifying ORM can decrypt tokens...")
    print("-"*80)

    # Use async engine for ORM queries
    async_engine = create_async_engine(settings.DATABASE_URL)
    async_session_maker = sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session_maker() as async_session:
        from sqlalchemy import select

        stmt = select(SalesforceConnection).where(
            SalesforceConnection.is_active == True
        ).limit(1)

        result = await async_session.execute(stmt)
        connection = result.scalar_one_or_none()

        if not connection:
            print("❌ ERROR: Could not load SalesforceConnection via ORM")
            return False

        print(f"Loaded connection via ORM: {connection.id}")
        print()

        # Check if tokens are decrypted
        if connection.access_token:
            print(f"Decrypted Access Token (first 50 chars): {connection.access_token[:50]}")
            print(f"Decrypted Access Token Length: {len(connection.access_token)} chars")

            # Check if decrypted token looks like Salesforce format
            if connection.access_token.startswith('00!') or connection.access_token.startswith('eyJ'):
                print("✅ Access token successfully DECRYPTED to Salesforce format!")
            else:
                print("⚠️  WARNING: Decrypted token doesn't look like Salesforce format")
                print(f"   Sample: {connection.access_token[:100]}")
        else:
            print("❌ ERROR: Access token is NULL after decryption!")
            return False

        print()

        if connection.refresh_token:
            print(f"Decrypted Refresh Token (first 50 chars): {connection.refresh_token[:50]}")
            print(f"Decrypted Refresh Token Length: {len(connection.refresh_token)} chars")

            if connection.refresh_token.startswith('eyJ') or '!' in connection.refresh_token[:30]:
                print("✅ Refresh token successfully DECRYPTED to Salesforce format!")
            else:
                print("⚠️  WARNING: Decrypted token doesn't look like Salesforce format")
        else:
            print("❌ ERROR: Refresh token is NULL after decryption!")
            return False

    print()

    # Step 4: Test that decrypted tokens can be used for API calls
    print("Step 4: Testing Salesforce API call with decrypted token...")
    print("-"*80)

    async with async_session_maker() as async_session:
        stmt = select(SalesforceConnection).where(
            SalesforceConnection.is_active == True
        ).limit(1)

        result = await async_session.execute(stmt)
        connection = result.scalar_one_or_none()

        # Try to make a simple API call
        import httpx

        try:
            async with httpx.AsyncClient() as client:
                # Test API call to get org info
                url = f"{connection.instance_url}/services/data/v59.0/sobjects"
                headers = {
                    "Authorization": f"Bearer {connection.access_token}",
                    "Content-Type": "application/json"
                }

                print(f"Making API call to: {url}")
                response = await client.get(url, headers=headers, timeout=10.0)

                if response.status_code == 200:
                    print(f"✅ API call successful! Status: {response.status_code}")
                    print(f"   Response preview: {response.text[:100]}...")
                    print()
                    print("🎉 ENCRYPTION VERIFICATION PASSED!")
                    print()
                    print("Summary:")
                    print("  ✅ ENABLE_FIELD_ENCRYPTION is true")
                    print("  ✅ DATABASE_ENCRYPTION_KEY is set")
                    print("  ✅ Tokens are encrypted in database")
                    print("  ✅ Tokens are successfully decrypted by ORM")
                    print("  ✅ Decrypted tokens work for Salesforce API calls")
                    print()
                    return True
                elif response.status_code == 401:
                    print(f"❌ API call returned 401 Unauthorized")
                    print(f"   This means the token was decrypted but is invalid/expired")
                    print(f"   Response: {response.text}")
                    return False
                else:
                    print(f"⚠️  API call returned unexpected status: {response.status_code}")
                    print(f"   Response: {response.text}")
                    return False

        except Exception as e:
            print(f"❌ ERROR making API call: {e}")
            return False

    await async_engine.dispose()

    return False

if __name__ == "__main__":
    print()
    result = asyncio.run(verify_encryption())
    print()
    print("="*80)

    if result:
        print("✅ ENCRYPTION VERIFICATION: PASSED")
        sys.exit(0)
    else:
        print("❌ ENCRYPTION VERIFICATION: FAILED")
        sys.exit(1)
