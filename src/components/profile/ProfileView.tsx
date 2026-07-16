"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  getProfile,
  updateProfile,
  submitDataRequest,
  type Profile,
} from "@/lib/api/profile";

type LoadState = "loading" | "ready" | "error";

export interface ProfileViewProps {
  /** The profile id to view/edit (the seeded demo user until auth lands). */
  profileId: string;
}

/**
 * <ProfileView> — profile view/edit plus a PIPEDA privacy panel.
 *
 * The privacy panel submits self-serve data export/delete requests via
 * `POST /api/data-requests`. Delete is guarded behind a confirmation dialog,
 * and both actions surface the resulting pending status. `role` is not editable.
 */
export function ProfileView({ profileId }: ProfileViewProps) {
  const t = useTranslations("profile");
  const c = useTranslations("common");
  const [state, setState] = useState<LoadState>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState<"en" | "tl">("en");
  const [savedMsg, setSavedMsg] = useState(false);
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [privacyStatus, setPrivacyStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState("loading");
      try {
        const p = await getProfile(profileId);
        if (cancelled) return;
        setProfile(p);
        setDisplayName(p.displayName ?? "");
        setCity(p.city ?? "");
        setLanguage(p.preferredLanguage === "tl" ? "tl" : "en");
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(false);
    try {
      const updated = await updateProfile({
        id: profileId,
        displayName: displayName.trim() || null,
        city: city.trim() || null,
        preferredLanguage: language,
      });
      setProfile(updated);
      setSavedMsg(true);
    } catch {
      // Leave the form values intact so the user can retry.
    } finally {
      setSaving(false);
    }
  }

  async function requestData(kind: "export" | "delete") {
    try {
      const res = await submitDataRequest({ subjectId: profileId, kind });
      setPrivacyStatus(res.status);
    } catch {
      setPrivacyStatus("error");
    }
  }

  return (
    <div data-component-id="profile-view" className="mx-auto max-w-xl">
      <h1 className="mb-token-3 text-2xl font-bold text-ink">{t("title")}</h1>

      {state === "loading" ? (
        <Skeleton className="h-64 w-full" />
      ) : null}

      {state === "error" ? (
        <p role="alert" className="text-sm text-danger">
          We couldn&apos;t load your profile. Please try again.
        </p>
      ) : null}

      {state === "ready" && profile ? (
        <>
          <form
            data-component-id="profile-form"
            onSubmit={handleSave}
            className="rounded-lg border border-line bg-surface p-token-3"
          >
            <label className="block text-sm text-ink">
              <span className="mb-1 block font-medium">{t("displayName")}</span>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="mt-token-2 block text-sm text-ink">
              <span className="mb-1 block font-medium">{t("city")}</span>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                autoComplete="address-level2"
              />
            </label>
            <label className="mt-token-2 block text-sm text-ink">
              <span className="mb-1 block font-medium">
                {t("preferredLanguage")}
              </span>
              <select
                data-component-id="profile-language"
                value={language}
                onChange={(e) =>
                  setLanguage(e.target.value === "tl" ? "tl" : "en")
                }
                className="h-10 w-full rounded-sm border border-line bg-surface px-3 text-sm text-ink"
              >
                <option value="en">English</option>
                <option value="tl">Tagalog</option>
              </select>
            </label>

            {savedMsg ? (
              <p role="status" className="mt-token-2 text-xs text-success">
                {t("saved")}
              </p>
            ) : null}

            <Button
              type="submit"
              data-component-id="profile-save"
              disabled={saving}
              className="mt-token-3 w-full"
            >
              {saving ? "…" : t("save")}
            </Button>
          </form>

          <section
            data-component-id="privacy-panel"
            className="mt-token-3 rounded-lg border border-line bg-surface p-token-3"
          >
            <h2 className="text-lg font-semibold text-ink">
              {t("privacyTitle")}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">{t("privacyBody")}</p>

            {privacyStatus ? (
              <p
                role="status"
                data-component-id="privacy-status"
                className="mt-token-2 text-sm text-ink"
              >
                {t("requestPending", { status: privacyStatus })}
              </p>
            ) : null}

            <div className="mt-token-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                data-component-id="privacy-export"
                onClick={() => void requestData("export")}
              >
                {t("exportData")}
              </Button>
              <Button
                variant="danger"
                data-component-id="privacy-delete"
                onClick={() => setConfirmDelete(true)}
              >
                {t("deleteData")}
              </Button>
            </div>
          </section>

          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title={t("deleteConfirmTitle")}
          >
            <p className="text-sm text-ink-soft">{t("deleteConfirmBody")}</p>
            <div className="mt-token-3 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmDelete(false)}
              >
                {c("cancel")}
              </Button>
              <Button
                variant="danger"
                data-component-id="privacy-delete-confirm"
                onClick={() => {
                  setConfirmDelete(false);
                  void requestData("delete");
                }}
              >
                {t("deleteData")}
              </Button>
            </div>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}

export default ProfileView;
