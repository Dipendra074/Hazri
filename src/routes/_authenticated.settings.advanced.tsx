import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteGuestData } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { SettingsCard, SubPageHeader } from "@/components/settings/ui";

export const Route = createFileRoute("/_authenticated/settings/advanced")({
  ssr: false,
  component: AdvancedPage,
});

function AdvancedPage() {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDeleteGuestData() {
    await qc.cancelQueries();
    qc.clear();
    await deleteGuestData();
    setConfirmDelete(false);
    await qc.invalidateQueries();
    toast.success("Local data permanently deleted.");
  }

  return (
    <div className="space-y-5">
      <SubPageHeader
        title="Advanced"
        description="Destructive controls. Export a backup first."
      />

      <SettingsCard className="space-y-3">
        <div>
          <div className="font-medium">Danger zone</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Deleting your local data cannot be undone. Export a backup first.
          </div>
        </div>
        <Button
          variant="destructive"
          className="w-full rounded-full h-11"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Permanently delete local data
        </Button>
      </SettingsCard>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>Delete all local data?</DialogTitle>
            <DialogDescription>
              This removes every subject, attendance record, routine slot,
              to-do, project and profile image stored on this device. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteGuestData}>
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
