import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Bug, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/feedback")({
  component: FeedbackPage,
});

function FeedbackPage() {
  const [kind, setKind] = useState<"suggestion" | "bug">("suggestion");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error("Please add a title and a description.");
      return;
    }
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSubmitting(false);
      toast.error("You need to be signed in.");
      return;
    }
    const { error } = await supabase.from("feedback").insert({
      user_id: userData.user.id,
      kind,
      message: `${title.trim()}\n\n${message.trim()}`,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Thanks! Your feedback has been sent.");
    setTitle("");
    setMessage("");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Suggestions & bug reports
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Found something broken or have an idea to make Hazri better? Tell us
          below — every note is read.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="rounded-3xl bg-card border border-border p-5 space-y-4"
      >
        <div className="grid grid-cols-2 gap-2 p-1 rounded-full bg-secondary">
          <button
            type="button"
            onClick={() => setKind("suggestion")}
            className={`flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-full transition ${kind === "suggestion" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            <Lightbulb className="h-4 w-4" /> Suggestion
          </button>
          <button
            type="button"
            onClick={() => setKind("bug")}
            className={`flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-full transition ${kind === "bug" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            <Bug className="h-4 w-4" /> Bug report
          </button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={
              kind === "bug"
                ? "Short summary of the bug"
                : "Short summary of your idea"
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="message">Details</Label>
          <Textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            rows={6}
            placeholder={
              kind === "bug"
                ? "Steps to reproduce, what you expected, what happened."
                : "Describe your idea and why it would help."
            }
          />
          <p className="text-[11px] text-muted-foreground text-right">
            {message.length}/2000
          </p>
        </div>

        <Button
          type="submit"
          className="w-full rounded-full h-11"
          disabled={submitting}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send
        </Button>
      </form>
    </div>
  );
}