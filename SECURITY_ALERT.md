# ⚠️  SECURITY ALERT ⚠️
# 
# EXPOSED CREDENTIALS DETECTED IN .env FILE
# 
# The following credentials have been found in your .env file and should be 
# immediately rotated/regenerated for security:
#
# 1. OpenAI API Key: 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
# 2. Google Service Account Token: AQ.Ab8RN6JKp9WqMTdXJS62PcP41uMu3i1SDQMTJX0XkLyAFY6z2g
# 3. Ring refresh token found in storage/ring-credentials.json
#
# IMMEDIATE ACTIONS REQUIRED:
# 
# 1. Regenerate OpenAI API Key:
#    - Go to https://platform.openai.com/api-keys
#    - Delete the exposed key
#    - Generate a new key
#    - Update your .env file
#
# 2. Revoke Google Service Account Token:
#    - Go to Google Cloud Console
#    - Revoke/regenerate the service account credentials
#
# 3. Update Ring Credentials:
#    - Re-authenticate with Ring
#    - Generate new refresh token
#
# 4. Change Session Secret:
#    - Generate a cryptographically secure random string
#    - Update SESSION_SECRET in .env
#
# DO NOT COMMIT THESE CREDENTIALS TO VERSION CONTROL