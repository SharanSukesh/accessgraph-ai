# Field Encryption Setup Guide

## Overview

AccessGraph AI now supports AES-256 field-level encryption for sensitive data like OAuth tokens. This document explains how to configure and use encryption.

## What is Encrypted?

The following sensitive fields are now encrypted when `ENABLE_FIELD_ENCRYPTION=True`:

- **SalesforceConnection.access_token** - Salesforce OAuth access tokens
- **SalesforceConnection.refresh_token** - Salesforce OAuth refresh tokens

Encryption is transparent to the application - data is automatically encrypted when written and decrypted when read.

## Configuration

### Step 1: Generate an Encryption Key

Generate a secure 32-byte encryption key using Python:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Example output:
```
tkWjRtmDLvfXubtZFmYhXlVP1lVRkh_V9ADm2B-nL0A
```

### Step 2: Set Environment Variables

Add these environment variables to your deployment:

#### Local Development (.env file)

```bash
# Enable encryption
ENABLE_FIELD_ENCRYPTION=true

# Set encryption key (use the key generated in Step 1)
DATABASE_ENCRYPTION_KEY=tkWjRtmDLvfXubtZFmYhXlVP1lVRkh_V9ADm2B-nL0A
```

#### Railway Deployment

1. Go to your Railway project settings
2. Navigate to the "Variables" tab
3. Add these variables:
   - `ENABLE_FIELD_ENCRYPTION` = `true`
   - `DATABASE_ENCRYPTION_KEY` = `<your-generated-key>`

#### Docker Compose

Update your `docker-compose.yml`:

```yaml
services:
  backend:
    environment:
      - ENABLE_FIELD_ENCRYPTION=true
      - DATABASE_ENCRYPTION_KEY=tkWjRtmDLvfXubtZFmYhXlVP1lVRkh_V9ADm2B-nL0A
```

## Security Best Practices

### Key Management

1. **Never commit encryption keys to version control**
   - The key should only exist in environment variables
   - Add `.env` to `.gitignore` (already done)

2. **Use different keys for different environments**
   - Development: One key
   - Staging: Different key
   - Production: Different, highly secure key

3. **Rotate keys periodically**
   - Plan for key rotation every 6-12 months
   - See "Key Rotation" section below

4. **Backup your encryption key securely**
   - Store in a password manager or secrets vault
   - Without the key, encrypted data cannot be decrypted

### Key Storage

For production deployments, consider using a secrets management service:

- **AWS Secrets Manager**
- **HashiCorp Vault**
- **Google Cloud Secret Manager**
- **Azure Key Vault**
- **Railway's Secret Management** (built-in)

## Key Rotation

### Planning for Key Rotation

Key rotation involves:
1. Decrypting all data with the old key
2. Re-encrypting with the new key
3. Updating the environment variable

### Rotation Script (Future)

A key rotation script will be provided in a future update. For now:

1. Generate a new key
2. Create a migration script to:
   - Read all encrypted records with old key
   - Re-save with new key (automatic re-encryption)
3. Update environment variable

## Testing Encryption

### Run the Encryption Test

```bash
cd apps/backend
python test_encryption.py
```

Expected output:
```
============================================================
Field Encryption Test
============================================================

Encryption enabled: True
Encryption key set: True

Creating test organization...
✓ Created organization: <uuid>

Creating Salesforce connection with test tokens...
✓ Created Salesforce connection: <uuid>

Original access token:  test_access_token_...
Original refresh token: test_refresh_token_...

Reading back from database...

✓ Retrieved access token:  test_access_token_...
✓ Retrieved refresh token: test_refresh_token_...

✓ Access token matches:  True
✓ Refresh token matches: True

Cleaning up test data...
✓ Test data cleaned up

============================================================
✓ ENCRYPTION TEST PASSED
============================================================

OAuth tokens are being properly encrypted and decrypted!
```

## Troubleshooting

### Error: "DATABASE_ENCRYPTION_KEY must be set"

**Cause:** Encryption is enabled but no key is configured.

**Solution:** Generate a key and set the `DATABASE_ENCRYPTION_KEY` environment variable.

### Error: "Fernet key must be 32 url-safe base64-encoded bytes"

**Cause:** Invalid encryption key format.

**Solution:** Generate a new key using the command in Step 1.

### Warning: "Encryption is disabled"

**Cause:** `ENABLE_FIELD_ENCRYPTION` is set to `false` or not set.

**Solution:** Set `ENABLE_FIELD_ENCRYPTION=true` in your environment.

## Migration Notes

### Applying the Migration

The encryption migration has already been created and applied:

```bash
cd apps/backend
python -m alembic upgrade head
```

### Migration Details

- **Migration:** `20260430_2324-31b86119bef3_add_field_encryption_support.py`
- **Type:** Application-level (no schema changes)
- **Backwards Compatible:** Yes (encryption can be toggled on/off)

### Existing Data

**Important:** If you have existing unencrypted tokens in your database:

1. **Without encryption enabled:** Tokens remain unencrypted (readable as plain text)
2. **With encryption enabled:** New tokens will be encrypted; existing tokens need migration

To encrypt existing data:
```python
# Run this script to encrypt existing tokens
# (Script will be provided if needed)
```

## Production Checklist

Before deploying to production with encryption enabled:

- [ ] Generate a secure encryption key
- [ ] Store the key in a secrets manager
- [ ] Set `ENABLE_FIELD_ENCRYPTION=true`
- [ ] Set `DATABASE_ENCRYPTION_KEY` in Railway/deployment platform
- [ ] Test encryption with test_encryption.py
- [ ] Backup the encryption key securely
- [ ] Document key rotation procedure
- [ ] Plan for periodic key rotation (6-12 months)

## How It Works

### Encryption Algorithm

- **Algorithm:** AES-256 (Advanced Encryption Standard)
- **Mode:** CBC (Cipher Block Chaining) with PKCS5 padding
- **Library:** `sqlalchemy-utils` EncryptedType with AesEngine
- **Key Size:** 256 bits (32 bytes, base64-encoded)

### Encryption Flow

1. **Write Operation:**
   ```
   Plain text token → AES-256 encryption → Encrypted binary → Base64 encode → Store in DB
   ```

2. **Read Operation:**
   ```
   Read from DB → Base64 decode → AES-256 decryption → Plain text token
   ```

### Performance Impact

- **Minimal:** Encryption/decryption happens in-memory
- **No query impact:** Encrypted fields are not searchable (by design)
- **Storage:** Encrypted data is ~33% larger than plain text (base64 overhead)

## Compliance

Field-level encryption helps meet compliance requirements for:

- **GDPR** - Secure storage of personal data
- **SOC 2** - Data encryption at rest
- **HIPAA** - Protected health information (if applicable)
- **PCI DSS** - Secure storage of sensitive data

## Support

For questions or issues with encryption:

1. Check this documentation
2. Run `test_encryption.py` to verify setup
3. Check application logs for encryption errors
4. Open a GitHub issue with details

---

**Last Updated:** 2026-04-30
**Version:** 1.0
**Related Files:**
- `app/core/config.py` - Encryption configuration
- `app/domain/models.py` - Encrypted field definitions
- `test_encryption.py` - Encryption test script
- `alembic/versions/20260430_2324-31b86119bef3_add_field_encryption_support.py` - Migration
