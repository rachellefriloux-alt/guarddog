/**
 * Empty state with optional CTA. Used everywhere in place of blank tables /
 * grids so the UI never feels broken when there's no data yet.
 */
import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
  children?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action, className, children }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-6 rounded-lg border border-dashed border-border bg-muted/30",
        className,
      )}
      role="status"
      data-testid="empty-state"
    >
      {Icon && (
        <div className="mb-4 h-14 w-14 rounded-full bg-background flex items-center justify-center shadow-sm">
          <Icon className="h-7 w-7 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-md mb-4">{description}</p>}
      {children}
      {action && (
        <Button onClick={action.onClick} className="mt-2" data-testid="empty-state-action">
          {action.label}
        </Button>
      )}
    </div>
  );
}
