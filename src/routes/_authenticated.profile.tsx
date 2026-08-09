import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession, sessionKey } from "@/lib/session";
import { profileApi } from "@/lib/data/profile";
import { ImageValidationError } from "@/lib/images";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sparkles,
  MessageSquare,
  Share2,
  Settings,
  
  Loader2,
  HelpCircle,
  ChevronRight,
  Pencil,
  User as UserIcon,
  Shield,
  Mail,
  Download,
} from "lucide-react";
import { DeveloperRow } from "@/components/DeveloperRow";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

const BUILD_INFO = "2026.07.19";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const session = useSession();
  const { data: profile } = useProfile();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarImageId, setAvatarImageId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [avatarDirty, setAvatarDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.display_name ?? "");
      setAvatar(profile.avatar_url ?? null);
    }
  }, [profile]);

  // Track the local IndexedDB image id so avatar replacement overwrites the
  // same record instead of orphaning old blobs.
  useEffect(() => {
    const p = profile as { avatar_image_id?: string | null } | undefined | null;
    if (p && typeof p.avatar_image_id === "string") setAvatarImageId(p.avatar_image_id);
  }, [profile]);

  const email = profile?.email ?? "";
  const nameDirty = (profile?.display_name ?? "") !== name;
  const dirty = nameDirty || avatarDirty;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    const fname = file.name.toLowerCase();
    const okType =
      allowed.includes(file.type) ||
      fname.endsWith(".jpg") ||
      fname.endsWith(".jpeg") ||
      fname.endsWith(".png") ||
      fname.endsWith(".webp");
    if (!okType) {
      toast.error("Only JPG, PNG or WebP images are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be 10 MB or smaller.");
      return;
    }
    await uploadLocal(file);
  }

  async function uploadLocal(file: File) {
    setUploading(true);
    try {
      const { id, url } = await profileApi.setAvatar(session, file, avatarImageId);
      setAvatarImageId(id);
      setAvatar(url);
      setAvatarDirty(true);
      toast.success("Photo saved on this device");
      qc.invalidateQueries({ queryKey: [...sessionKey(session), "profile", "me"] });
    } catch (err) {
      if (err instanceof ImageValidationError) toast.error(err.message);
      else toast.error("Could not read image.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!profile || !dirty || saving || uploading) return;
    setSaving(true);
    try {
      if (nameDirty) {
        await profileApi.setDisplayName(session, (name.trim() || "").slice(0, 10));
      }
      setAvatarDirty(false);
      setEditing(false);
      toast.success("Profile updated");
      await qc.invalidateQueries({ queryKey: [...sessionKey(session), "profile", "me"] });
    } catch (e) {
      toast.error(toUserMessage(e, "Could not save"));
    } finally {
      setSaving(false);
    }
  }

  function handleEditName() {
    if (editing) {
      setEditing(false);
      return;
    }
    setEditing(true);
    requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  }

  const displayName = name || email?.split("@")[0] || "You";
  const initial = displayName[0]?.toUpperCase() ?? "H";

  return (
    <div className="space-y-6">
      <section className="profile-design-card" aria-labelledby="profile-card-title">
        <div className="profile-design-status-corner">
          <span className="profile-design-pill">
            <UserIcon aria-hidden="true" />
            Local
          </span>
        </div>
        <div className="profile-design-hero">
          <div className="profile-design-avatar-wrap">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="profile-design-avatar"
              aria-label="Change profile picture"
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : avatar ? (
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="profile-design-initial">{initial}</span>
              )}
            </button>
          </div>
          <div className="profile-design-summary">
            <h1 id="profile-card-title" className="profile-design-name" title={displayName}>
              <span className="profile-design-name-text">{displayName}</span>
              <button
                type="button"
                onClick={handleEditName}
                className="profile-design-edit profile-design-edit--inline"
                aria-label="Edit name"
              >
                <Pencil aria-hidden="true" />
              </button>
            </h1>
          </div>
        </div>

        <p className="profile-design-email">
          <Mail aria-hidden="true" className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
          Saved on this device
        </p>
        <div className="profile-design-local-note">
          <Shield aria-hidden="true" />
          <span>Photo saved on this device only.</span>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={handleFile}
        />

        <Dialog
          open={editing}
          onOpenChange={(open) => {
            if (!open) {
              setName(profile?.display_name ?? "");
              setEditing(false);
            }
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Change name</DialogTitle>
              <DialogDescription>
                This is how your name will appear in the app.
              </DialogDescription>
            </DialogHeader>
            <div className="profile-design-field-group">
              <label htmlFor="displayName" className="profile-design-label">
                Name
              </label>
              <div className="profile-design-input-shell is-editing">
                <UserIcon aria-hidden="true" className="profile-design-field-icon" />
                <input
                  ref={nameInputRef}
                  id="displayName"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 10))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && dirty && !saving) void save();
                  }}
                  maxLength={10}
                  placeholder="Your name"
                  className="profile-design-input"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setName(profile?.display_name ?? "");
                  setEditing(false);
                }}
                className="flex-1 sm:flex-none h-11 px-5 rounded-full border border-border bg-transparent text-foreground text-sm font-semibold hover:bg-secondary/60 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                className="profile-design-save flex-1 sm:flex-none sm:min-w-[160px] !mt-0 !px-6"
                onClick={save}
                disabled={!dirty || saving || uploading}
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                <span>{saving ? "Saving…" : "Save Changes"}</span>
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="profile-design-footer">
          <span>Build {BUILD_INFO} · APK</span>
        </div>
      </section>

      <a
        href="/pro"
        className="block rounded-3xl p-6 relative overflow-hidden bg-gradient-to-br from-primary via-primary to-accent text-white"
      >
        <div
          className="absolute inset-0 opacity-30"
          style={{ background: "radial-gradient(circle at top right, white, transparent 60%)" }}
        />
        <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-white/90">
              <Sparkles className="h-4 w-4" /> Hazri Pro
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-yellow-300 text-yellow-950">
              Coming soon
            </span>
          </div>
          <div className="mt-2 text-xl font-bold text-white">Unlock everything</div>
          <div className="text-sm text-white/80 mt-1">
            Unlimited subjects, cloud sync, custom themes, more games.
          </div>
        </div>
      </a>

      <MenuGroup title="Data">
        <MenuRow icon={Download} label="Your data" to="/settings/data" />
      </MenuGroup>

      <MenuGroup title="App">
        <MenuRow icon={Settings} label="Settings" to="/settings" />
      </MenuGroup>

      <MenuGroup title="Support">
        <MenuRow icon={HelpCircle} label="FAQs" to="/faqs" />
        <MenuRow icon={MessageSquare} label="Feedback & bug report" to="/feedback" />
      </MenuGroup>

      <MenuGroup title="Share">
        <MenuRow icon={Share2} label="Share with friends" href="#" />
      </MenuGroup>

      <div className="rounded-3xl bg-card border border-border">
        <DeveloperRow />
      </div>


    </div>
  );
}

function MenuRow({
  icon: Icon,
  label,
  href,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  to?: string;
}) {
  const className =
    "flex items-center gap-3 p-4 hover:bg-secondary/50 first:rounded-t-3xl last:rounded-b-3xl transition";
  const inner = (
    <>
      <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center">
        <Icon className="h-4 w-4" />
      </div>
      <span className="font-medium flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </>
  );
  if (to) {
    return (
      <Link to={to} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <a href={href ?? "#"} className={className}>
      {inner}
    </a>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground px-1">
        {title}
      </div>
      <div className="rounded-3xl bg-card border border-border divide-y divide-border">
        {children}
      </div>
    </div>
  );
}
