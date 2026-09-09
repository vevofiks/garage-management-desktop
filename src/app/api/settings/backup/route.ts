import fs from 'fs';
import path from 'path';
import { requireRole } from '@/lib/auth';
import { ok, badRequest, withErrorHandling } from '@/lib/http';
import db, { dataDir, getSetting, setSetting } from '@/lib/db';

const backupsDir = path.join(dataDir, 'backups');

export const GET = withErrorHandling(async () => {
  await requireRole('admin');

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const files = fs.readdirSync(backupsDir).filter((file) => file.endsWith('.sqlite'));
  const backups = files
    .map((filename) => {
      const filePath = path.join(backupsDir, filename);
      const stat = fs.statSync(filePath);
      return {
        filename,
        sizeBytes: stat.size,
        createdAt: stat.birthtime ? stat.birthtime.toISOString() : stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const weeklyBackupEnabled = getSetting('weekly_backup_enabled', '1') === '1';
  const lastWeeklyBackupAt = getSetting('last_weekly_backup_at', '');

  return ok({
    weeklyBackupEnabled,
    lastWeeklyBackupAt,
    backups,
  });
});

export const POST = withErrorHandling(async () => {
  await requireRole('admin');

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-');
  const backupFileName = `garage-backup-${dateStr}.sqlite`;
  const backupPath = path.join(backupsDir, backupFileName);

  await db.backup(backupPath);
  setSetting('last_manual_backup_at', now.toISOString());

  const stat = fs.statSync(backupPath);

  return ok({
    filename: backupFileName,
    sizeBytes: stat.size,
    createdAt: stat.birthtime ? stat.birthtime.toISOString() : stat.mtime.toISOString(),
  });
});

export const PATCH = withErrorHandling(async (req) => {
  await requireRole('admin');
  const body = (await req.json()) as { weekly_backup_enabled?: boolean };

  if (typeof body.weekly_backup_enabled !== 'boolean') {
    return badRequest('weekly_backup_enabled must be a boolean');
  }

  setSetting('weekly_backup_enabled', body.weekly_backup_enabled ? '1' : '0');

  return ok({
    weeklyBackupEnabled: body.weekly_backup_enabled,
  });
});
