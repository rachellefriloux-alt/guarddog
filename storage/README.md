# Storage Directory

This directory contains sensitive credentials and runtime data. **It is excluded from git by .gitignore**.

## Directory Structure

```
storage/
├── ring-credentials.json    # Ring doorbell authentication (auto-generated)
├── recordings/              # Camera recordings
├── snapshots/               # Camera snapshots
└── uploads/                 # User uploaded files
```

## Important Files

### ring-credentials.json
**Auto-generated** when you authenticate with Ring API. Contains:
- Email address
- Refresh token (automatically rotated by Ring API)

**Security:**
- Never commit this file to version control
- Back up securely if needed
- Keep file permissions restricted (600 or 640)

## Setup Instructions

1. This directory is automatically created on first run
2. Ring credentials are generated when you first authenticate via the API
3. No manual configuration needed

## Backup

To backup your storage directory:

```bash
# Create encrypted backup
tar -czf storage_backup.tar.gz storage/
gpg --encrypt --recipient your@email.com storage_backup.tar.gz

# Restore from backup
gpg --decrypt storage_backup.tar.gz.gpg | tar -xzf -
```

## Recovery

If you lose `ring-credentials.json`:
1. Delete the file if it exists
2. Re-authenticate via the Ring API endpoint
3. Follow the 2FA prompts
4. New credentials will be automatically saved

## Permissions

Recommended file permissions:
```bash
chmod 700 storage/
chmod 600 storage/ring-credentials.json
chmod 755 storage/recordings/
chmod 755 storage/snapshots/
chmod 755 storage/uploads/
```

## Security Notes

- This directory should **never** be committed to git
- Ensure `.gitignore` includes `storage/`
- Back up credentials securely using encrypted storage
- Document credential locations in a password manager
- Never share credentials in support requests
