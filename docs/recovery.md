# sally_ backup / recovery basics

## What gets backed up
- PostgreSQL database (`database.dump`)
- Uploaded files from `apps/api/uploads` (`uploads.tar.gz`)
- Backup manifest (`manifest.txt`)

## Backup location on VPS
- Root: `/var/backups/sally`
- Latest symlink: `/var/backups/sally/latest`

## Manual backup
```bash
sudo /opt/sally/ops/backup.sh
```

## Restore procedure

### 1. Stop app services
```bash
sudo systemctl stop sally-web
sudo systemctl stop sally-api
```

### 2. Restore database
```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' /opt/sally/apps/api/.env | cut -d= -f2-)
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" /var/backups/sally/latest/database.dump
```

### 3. Restore uploads
```bash
mkdir -p /opt/sally/apps/api/uploads
rm -rf /opt/sally/apps/api/uploads/*
tar -C /opt/sally/apps/api/uploads -xzf /var/backups/sally/latest/uploads.tar.gz
```

### 4. Start services
```bash
sudo systemctl start sally-api
sudo systemctl start sally-web
```

### 5. Verify
```bash
curl -sS https://projects.kraftfabrik.com/api/health
```

## Notes
- The backup script keeps backups for 14 days by default.
- The app should be considered recoverable only if both the DB dump and uploads archive are present.
- After any restore, verify login, project list, task list, uploads, and password-reset mail flow.
