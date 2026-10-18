import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  // S262: 装飾的なピル型バッジは使わない方針。API はそのまま、見た目は「色付きの文字」にする。
  'inline-flex items-center gap-1 text-xs font-bold leading-normal focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'text-primary',
        secondary: 'text-muted-foreground',
        destructive: 'text-destructive',
        outline: 'text-foreground',
        ok: 'text-ok',
        warn: 'text-warn',
        muted: 'text-muted-foreground font-medium',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
