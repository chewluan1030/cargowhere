import React, { Component, type ComponentProps, type ReactNode } from 'react';

// inset is reserved strictly for recessed interactive wells (code viewer, canvas stage), never metric/callout sub-boxes inside cards or sidebars.
export const Surface = ({
  inset = false,
  className = '',
  ...p
}: ComponentProps<'div'> & { inset?: boolean }) => (
  <div
    className={`min-w-0 [:where(&)]:rounded-card [:where(&)]:border [:where(&)]:border-border/40 [:where(&)]:text-foreground ${
      inset
        ? '[:where(&)]:bg-background'
        : '[:where(&)]:bg-surface [:where(&)]:shadow-surface'
    } ${className}`}
    {...p}
  />
);

const tones = {
  primary:
    '[:where(&)]:bg-primary [:where(&)]:text-primary-foreground [:where(&)]:border [:where(&)]:border-primary',
  quiet:
    '[:where(&)]:border [:where(&)]:border-border/60 [:where(&)]:bg-surface [:where(&)]:text-foreground hover:[:where(&)]:bg-background',
  ghost:
    '[:where(&)]:border [:where(&)]:border-transparent [:where(&)]:bg-transparent [:where(&)]:text-foreground hover:[:where(&)]:bg-background',
  danger:
    '[:where(&)]:border [:where(&)]:border-danger/50 [:where(&)]:bg-surface [:where(&)]:text-danger hover:[:where(&)]:bg-background',
};

export const Button = ({
  tone = 'primary',
  type = 'button',
  className = '',
  ...p
}: ComponentProps<'button'> & { tone?: keyof typeof tones }) => (
  <button
    type={type}
    className={`[:where(&)]:inline-flex [:where(&)]:min-h-11 [:where(&)]:items-center [:where(&)]:justify-center [:where(&)]:gap-2 whitespace-nowrap [:where(&)]:rounded-control [:where(&)]:px-3.5 [:where(&)]:text-body [:where(&)]:font-medium transition-[color,background-color,border-color,transform,opacity] duration-150 ease-out hover:brightness-95 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
    {...p}
  />
);

export const Field = ({
  label,
  htmlFor,
  hint,
  children,
  className = '',
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
    <label htmlFor={htmlFor} className="text-label font-medium text-foreground">
      {label}
    </label>
    {children}
    {hint ? <p className="text-xs text-muted">{hint}</p> : null}
  </div>
);

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message:
        err instanceof Error
          ? err.message
          : 'An unexpected error interrupted LotWatch SG.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
          <Surface className="max-w-md p-6">
            <div role="alert" className="space-y-4">
              <h1 className="text-title font-semibold text-foreground">
                Unable to render carpark view
              </h1>
              <p className="text-body text-muted">{this.state.message}</p>
              <Button
                tone="primary"
                onClick={() => window.location.reload()}
              >
                Reload application
              </Button>
            </div>
          </Surface>
        </div>
      );
    }
    return this.props.children;
  }
}
