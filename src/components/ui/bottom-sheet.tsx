import { Drawer } from 'vaul';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { ReactNode, useState } from 'react';

import { X } from 'lucide-react';

interface BottomSheetProps {
  children: ReactNode;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
  showHandle?: boolean;
}

export function BottomSheet({
  children,
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  showHandle = true,
}: BottomSheetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  return (
    <Drawer.Root open={isOpen} onOpenChange={setIsOpen}>
      {trigger && (
        <Drawer.Trigger asChild>
          <span className="inline-flex">{trigger}</span>
        </Drawer.Trigger>
      )}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-50 mt-24 flex flex-col rounded-t-[20px] bg-background border-t border-x border-border"
          style={{
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <div className="mx-auto w-full max-w-md">
            {showHandle && (
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
              </div>
            )}
            {title ? (
              <div className="px-5 pt-3 pb-2">
                <Drawer.Title className="text-lg font-semibold text-foreground">
                  {title}
                </Drawer.Title>
                {description ? (
                  <Drawer.Description className="text-sm text-muted-foreground mt-1">
                    {description}
                  </Drawer.Description>
                ) : (
                  <VisuallyHidden.Root><Drawer.Description>Sheet content</Drawer.Description></VisuallyHidden.Root>
                )}
              </div>
            ) : (
              <VisuallyHidden.Root>
                <Drawer.Title>Sheet</Drawer.Title>
                <Drawer.Description>Sheet content</Drawer.Description>
              </VisuallyHidden.Root>
            )}
            <div className="p-5 overflow-y-auto max-h-[85vh]">{children}</div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// Mobile-optimized full screen drawer for forms
interface FullScreenDrawerProps {
  children: ReactNode;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  onSave?: () => void;
  saveLabel?: string;
  showClose?: boolean;
}

export function FullScreenDrawer({
  children,
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  onSave,
  saveLabel = 'Save',
  showClose = true,
}: FullScreenDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  return (
    <Drawer.Root open={isOpen} onOpenChange={setIsOpen}>
      {trigger && (
        <Drawer.Trigger asChild>
          <span className="inline-flex">{trigger}</span>
        </Drawer.Trigger>
      )}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
        <Drawer.Content
          className="fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col bg-background"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              {showClose && (
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-all"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
              <Drawer.Title className="text-lg font-semibold">{title}</Drawer.Title>
              <VisuallyHidden.Root><Drawer.Description>{title}</Drawer.Description></VisuallyHidden.Root>
            </div>
            {onSave && (
              <button
                onClick={onSave}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm active:scale-95 transition-all"
              >
                {saveLabel}
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// Simple mobile action sheet
interface ActionSheetProps {
  actions: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'destructive';
    icon?: ReactNode;
  }[];
  trigger: ReactNode;
  title?: string;
}

export function ActionSheet({ actions, trigger, title }: ActionSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>
        <span className="inline-flex">{trigger}</span>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-[20px] bg-background border-t border-x border-border"
          style={{
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <div className="mx-auto w-full max-w-md">
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
            </div>
            {title ? (
              <div className="px-5 py-3 border-b border-border">
                <Drawer.Title className="text-base font-medium text-center text-muted-foreground">
                  {title}
                </Drawer.Title>
                <VisuallyHidden.Root><Drawer.Description>{title}</Drawer.Description></VisuallyHidden.Root>
              </div>
            ) : (
              <VisuallyHidden.Root>
                <Drawer.Title>Actions</Drawer.Title>
                <Drawer.Description>Action sheet</Drawer.Description>
              </VisuallyHidden.Root>
            )}
            <div className="p-2">
              {actions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => {
                    action.onClick();
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium transition-colors ${
                    action.variant === 'destructive'
                      ? 'text-destructive hover:bg-destructive/10'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
            <div className="p-2 pt-0">
              <button
                onClick={() => setOpen(false)}
                className="w-full px-4 py-3.5 rounded-xl text-base font-semibold bg-muted text-foreground hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
