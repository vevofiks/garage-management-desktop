import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { ok, notFound, badRequest, withErrorHandling } from '@/lib/http';
import { dataDir } from '@/lib/db';

type Ctx = { params: Promise<{ filename: string }> };

const backupsDir = path.join(dataDir, 'backups');

export const GET = withErrorHandling<Ctx>(async (req, { params }) => {
  await requireRole('admin');
  const filename = path.basename((await params).filename);

  if (!filename.endsWith('.sqlite')) {
    return badRequest('Invalid backup filename');
  }

  const filePath = path.join(backupsDir, filename);

  if (!fs.existsSync(filePath)) {
    return notFound('Backup file not found');
  }

  const fileBuffer = fs.readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'application/x-sqlite3',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

export const DELETE = withErrorHandling<Ctx>(async (req, { params }) => {
  await requireRole('admin');
  const filename = path.basename((await params).filename);

  if (!filename.endsWith('.sqlite')) {
    return badRequest('Invalid backup filename');
  }

  const filePath = path.join(backupsDir, filename);

  if (!fs.existsSync(filePath)) {
    return notFound('Backup file not found');
  }

  fs.unlinkSync(filePath);

  return ok({ deleted: true });
});
