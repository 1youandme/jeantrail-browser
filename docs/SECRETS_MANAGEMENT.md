# Professional Secrets Management

## CRITICAL SECURITY RULES

### DO NOT:
1. NEVER commit .env files to Git
2. NEVER share API keys via email/Slack
3. NEVER store plaintext secrets in code
4. NEVER use same keys for dev/staging/production
5. NEVER log sensitive data

### DO:
1. Use GitHub Secrets for CI/CD
2. Use 1Password/Vault for local dev
3. Rotate keys monthly (weekly is best)
4. Use service accounts with minimum permissions
5. Enable MFA on all API dashboards

## System Architecture

- Layer 1: Local Dev (1Password/Vault)
- Layer 2: CI/CD (GitHub Secrets)
- Layer 3: Production (AWS Secrets/Kubernetes)
- Layer 4: Runtime (Environment variables only)

## Step 1: Local Development

### Using 1Password CLI
```bash
brew install 1password-cli
op vault create --name JeanTrail
op item create --title "Google API Key" --vault JeanTrail
```

## Step 2: GitHub Secrets Setup

1. Go to: Settings > Secrets and variables > Actions
2. Add each secret individually (NEVER paste real keys)
3. Use in workflows with: ${{ secrets.KEY_NAME }}

## Step 3: Production (AWS Secrets Manager)

```bash
aws secretsmanager create-secret --name jeantrail/api-key
```

## Step 4: Key Rotation Schedule

- DAILY: Monitor access logs
- WEEKLY: Rotate payment keys
- MONTHLY: Rotate ALL keys
- QUARTERLY: Security audit

## Step 5: Emergency Response

IF key is compromised:
1. Deactivate immediately
2. Generate new key
3. Update all environments
4. File incident report

## Monitoring & Auditing

```bash
git secrets --scan
trufflehog github --repo https://github.com/1youandme/jeantrail-browser
```

## New Integration Checklist

- [ ] Create separate API key
- [ ] Add to .env.example as PLACEHOLDER_*
- [ ] Add to GitHub Secrets
- [ ] Enable rate limiting
- [ ] Set up monitoring
- [ ] Document rotation schedule
