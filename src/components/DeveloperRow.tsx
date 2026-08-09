import { Code2, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useState } from "react";

export function DeveloperRow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full flex items-center gap-3 p-4 hover:bg-secondary/50 transition text-left">
        <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center shrink-0"><Code2 className="h-4 w-4" /></div>
        <div className="flex-1 min-w-0"><div className="font-medium text-sm">About Hazri</div><div className="text-xs text-muted-foreground truncate">Offline-first attendance tracking</div></div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm rounded-3xl">
          <DialogHeader className="items-center text-center">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-2xl font-bold mb-2">H</div>
            <DialogTitle className="text-xl">Hazri</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">An offline-first attendance tracker.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
