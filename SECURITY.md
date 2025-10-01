# Security Policy

## 🔒 Security Best Practices

### Environment Variables

**CRITICAL**: Never commit real credentials to version control.

#### Required Security Configuration

1. **SESSION_SECRET** (REQUIRED for production)
   ```bash
   # Generate a secure random string
   openssl rand -base64 32
   ```
   Update this value in your `.env` file:
   ```
   SESSION_SECRET=<your-generated-secure-string>
   ```

2. **OpenAI API Key**
   - Obtain from https://platform.openai.com/api-keys
   - Store securely in `.env` file
   - Never commit to git
   - Rotate regularly

3. **Google OAuth Credentials**
   - Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Use separate credentials for development and production
   - Restrict redirect URIs to your actual domains
   - Enable only required APIs

### Credentials Management

#### Storage Directory
The `storage/` directory contains sensitive credentials and should never be committed to version control.

**Files to protect:**
- `storage/ring-credentials.json` - Ring doorbell authentication tokens
- Any camera configuration files with passwords
- SSL/TLS certificates

**What to do:**
1. Ensure `storage/` is in `.gitignore` (already configured)
2. Back up credentials securely using encrypted storage
3. Document credential locations in a secure location (password manager)

#### Ring Doorbell Credentials
Ring authentication uses refresh tokens that are automatically stored in `storage/ring-credentials.json`.

**Security measures:**
- This file is excluded from git by `.gitignore`
- Tokens are automatically refreshed by the Ring API
- Back up this file securely if needed
- Never share refresh tokens

### Production Deployment Checklist

- [ ] Generate and set a secure `SESSION_SECRET`
- [ ] Use production-grade Google OAuth credentials
- [ ] Enable HTTPS (required for secure cookies)
- [ ] Set `NODE_ENV=production`
- [ ] Configure secure cookie settings:
  ```javascript
  cookie: {
    secure: true,  // Requires HTTPS
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 24  // 24 hours
  }
  ```
- [ ] Set up firewall rules
- [ ] Configure rate limiting
- [ ] Enable access logging
- [ ] Set up monitoring and alerts
- [ ] Create database backups
- [ ] Document disaster recovery procedures

### Database Security

#### PostgreSQL Configuration

1. **Connection String Security**
   ```bash
   # Use strong passwords
   DATABASE_URL=postgresql://username:strong_password@host:5432/guarddog
   ```

2. **Access Control**
   - Create dedicated database user for GuardDog
   - Grant minimal required permissions
   - Use SSL/TLS for database connections
   - Restrict network access to database

3. **Backup Strategy**
   ```bash
   # Regular backups
   pg_dump guarddog > backup_$(date +%Y%m%d).sql
   
   # Encrypt backups
   pg_dump guarddog | gpg --encrypt --recipient your@email.com > backup.sql.gpg
   ```

### API Security

#### Authentication
All API endpoints (except health checks) require authentication via session cookies.

**Protected Routes:**
- `/api/cameras/*`
- `/api/recordings/*`
- `/api/detections/*`
- `/api/cloud-files/*`

**Public Routes:**
- `/api/health` - System health check
- `/api/auth/*` - Authentication endpoints

#### WebSocket Security
WebSocket connections are authenticated via the same session mechanism.

**Security measures:**
- Session validation on connection
- Message origin verification
- Rate limiting on events
- Automatic disconnection on session expiry

### File Upload Security

**Current Limits:**
- Maximum file size: 100MB (configurable via `MAX_FILE_SIZE`)
- Allowed file types: Images (jpg, jpeg, png) and Videos (mp4, avi, mov)
- Files are validated before storage

**Best Practices:**
- Store uploads outside web root
- Scan uploaded files for malware
- Implement virus scanning if handling user uploads
- Set appropriate file permissions (640 or 600)

### HTTPS Configuration

**Production Requirements:**
GuardDog must run behind HTTPS in production for:
- Secure cookie transmission
- Protected WebSocket connections
- OAuth redirect security
- Camera stream encryption

**Recommended Setup:**
1. Use a reverse proxy (nginx, Apache, or cloud load balancer)
2. Obtain SSL/TLS certificates (Let's Encrypt recommended)
3. Configure HTTP to HTTPS redirect
4. Enable HSTS headers

**Example nginx configuration:**
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Network Security

#### Camera Network Isolation
**Recommended:**
- Isolate cameras on separate VLAN
- Restrict internet access for cameras
- Allow only GuardDog server to access camera network
- Use strong passwords for camera authentication

#### Firewall Configuration
**Required Ports:**
- `5000` - GuardDog web interface (or custom `PORT`)
- `5432` - PostgreSQL (if using external database)

**Recommended Rules:**
- Block all incoming traffic by default
- Allow only necessary ports
- Restrict database access to localhost or specific IPs
- Use VPN for remote access

### Regular Security Maintenance

#### Weekly Tasks
- [ ] Review access logs for suspicious activity
- [ ] Check for failed authentication attempts
- [ ] Monitor disk usage and recording retention

#### Monthly Tasks
- [ ] Update dependencies: `npm update`
- [ ] Review and rotate API keys
- [ ] Audit user access and sessions
- [ ] Test backup restoration

#### Quarterly Tasks
- [ ] Security audit of configuration
- [ ] Review and update firewall rules
- [ ] Penetration testing (if applicable)
- [ ] Update security documentation

### Vulnerability Reporting

If you discover a security vulnerability, please:

1. **DO NOT** open a public GitHub issue
2. Email security concerns to the repository owner
3. Include detailed information:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work on a fix immediately.

### Security Audit Log

| Date | Action | Description |
|------|--------|-------------|
| 2024-01-XX | Initial Security Review | Removed exposed credentials from repository |
| 2024-01-XX | Documentation | Created comprehensive security policy |

### Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Google OAuth 2.0 Security](https://developers.google.com/identity/protocols/oauth2/web-server#security-considerations)

---

**Remember**: Security is an ongoing process, not a one-time setup. Stay vigilant and keep your system updated.
