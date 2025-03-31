'use client';

import React from 'react';

interface SectionProps {
  title?: string;
  children: React.ReactNode;
}

// Basic placeholder for Section component
export function Section({ title, children }: SectionProps) {
  return (
    <div className="my-2">
      {title && <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{title}</h3>}
      {children}
    </div>
  );
}

interface ToolArgsSectionProps {
  tool: string;
  number?: number;
  children: React.ReactNode;
}

// Basic placeholder for ToolArgsSection component
export function ToolArgsSection({ tool, number, children }: ToolArgsSectionProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {/* Simple representation, might need icons or better formatting later */}
      <span>Tool: {tool}</span>
      {number !== undefined && <span>({number} results)</span>}
      <span className="truncate font-medium text-foreground">: {children}</span>
    </div>
  );
} 