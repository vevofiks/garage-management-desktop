import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DB Inspector — Garage Management System',
  description: 'Visual SQLite database inspector for local development',
};

export default function DBInspectorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
