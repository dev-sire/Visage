import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Paints the confirm button red. Use for deletes and other irreversible actions. */
  destructive?: boolean;
  onConfirm: () => void;
};

/**
 * Themed replacement for window.confirm(). Focus starts on Cancel, Escape and
 * clicking outside dismiss it, and it closes itself after Confirm.
 */
const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
}: ConfirmDialogProps) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
      </AlertDialogHeader>

      <AlertDialogFooter>
        <AlertDialogCancel className="small-medium border-dark-2 bg-transparent text-white hover:bg-dark-2 hover:text-white">
          {cancelLabel}
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          className={
            destructive
              ? "small-medium bg-red text-white hover:bg-red/85"
              : "small-medium bg-primary-500 text-white hover:bg-primary-500/85"
          }>
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default ConfirmDialog;
