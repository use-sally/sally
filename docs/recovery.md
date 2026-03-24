# AutomateThis PM backup / recovery basics

## What gets backed up
- PostgreSQL database (`database.dump`)
- Uploaded files from `apps/api/uploads` (`uploads.tar.gz`)
- Backup manifest (`manifest.txt`)

## Backup location on VPS
- Root: `/var/backups/automatethis-pm`
- Latest symlink: `/var/backups/automatethis-pm/latest`

## Manual backup
```bash
sudo /opt/automatethis-pm/ops/backup.sh
```

## Restore procedure

### 1. Stop app services
```bash
sudo systemctl stop automatethis-web
sudo systemctl stop automatethis-api
```

### 2. Restore database
```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' /opt/automatethis-pm/apps/api/.env | cut -d= -f2-)
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" /var/backups/automatethis-pm/latest/database.dump
```

### 3. Restore uploads
```bash
mkdir -p /opt/automatethis-pm/apps/api/uploads
rm -rf /opt/automatethis-pm/apps/api/uploads/*
tar -C /opt/automatethis-pm/apps/api/uploads -xzf /var/backups/automatethis-pm/latest/uploads.tar.gz
```

### 4. Start services
```bash
sudo systemctl start automatethis-api
sudo systemctl start automatethis-web
```

### 5. Verify
```bash
curl -sS https://projects.kraftfabrik.com/api/health
```

## Notes
- The backup script keeps backups for 14 days by default.
- The app should be considered recoverable only if both the DB dump and uploads archive are present.
- After any restore, verify login, project list, task list, uploads, and password-reset mail flow.
