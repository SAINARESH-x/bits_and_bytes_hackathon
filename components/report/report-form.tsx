"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LocationMap } from "@/components/report/location-map";
import type { LatLngValue } from "@/components/report/location-map-leaflet";
import { friendlyError, issueMap, postForm, postJson } from "@/lib/api-client";
import { REPORT_TYPE_LABELS } from "@/lib/format";
import {
  ACCEPTED_PHOTO_TYPES,
  compressImage,
  isAcceptedPhotoType,
} from "@/lib/image/compress";
import { findNearbyActiveProjects, type NearbyProject } from "@/lib/geo-link";
import { citizenReportInputSchema } from "@/lib/schemas";
import type {
  CitizenReport,
  Project,
  ReportType,
  RoadSegment,
} from "@/lib/types";

const CONTROL =
  "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 " +
  "dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

const LABEL =
  "mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300";

const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 500;

const REPORT_TYPES = Object.keys(REPORT_TYPE_LABELS) as ReportType[];

/** The server's answer to a successful report write. */
interface ReportResponse {
  report: CitizenReport;
  linked: boolean;
  isUnlistedWork: boolean;
  distanceMeters: number | null;
}

interface PhotoResponse {
  url: string;
  stored: boolean;
  demo: boolean;
  metadataStripped: boolean;
  notice?: string;
}

type PhotoStatus = "idle" | "compressing" | "ready" | "error";

interface ReportFormProps {
  projects: readonly Project[];
  segments: readonly RoadSegment[];
  /**
   * A project the visitor arrived from (`/report?project=<id>`). Preselected as
   * the intended link only when the chosen location turns out to be in range —
   * the server makes the final call, so this is a convenience, not a promise.
   */
  initialProjectId?: string | null;
}

/**
 * Report an issue (PLAN.md M6 items 1–3).
 *
 * Location is collected three ways so permission can never block a report:
 * browser geolocation, a tap on the map, or typed coordinates. The nearby
 * suggestion below comes from the SAME pure function the server uses, so the
 * project the visitor is offered is the project the server will link to.
 *
 * The photo is compressed in-browser to <= 1 MB and uploaded on submit; the
 * server re-validates it and strips metadata. Every field reuses the shared Zod
 * schema, so the client cannot accept something the server would reject.
 */
export function ReportForm({
  projects,
  segments,
  initialProjectId,
}: ReportFormProps) {
  const [reportType, setReportType] = useState<ReportType>("unsafe_barricade");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<LatLngValue | null>(null);
  // "" means "let the server decide by proximity"; otherwise an explicit id.
  const [linkedProjectId, setLinkedProjectId] = useState<string>("");
  const [forceUnlisted, setForceUnlisted] = useState(false);

  const [geoStatus, setGeoStatus] = useState<
    "idle" | "locating" | "granted" | "denied"
  >("idle");
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  const [photoStatus, setPhotoStatus] = useState<PhotoStatus>("idle");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const photoBlobRef = useRef<Blob | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ReportResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  // Release the object URL when it is replaced or the component unmounts.
  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  const initialProject = useMemo(
    () => projects.find((p) => p.id === initialProjectId) ?? null,
    [projects, initialProjectId],
  );

  const nearby: NearbyProject[] = useMemo(() => {
    if (!location) return [];
    return findNearbyActiveProjects(
      [location.lng, location.lat],
      projects,
      segments,
    );
  }, [location, projects, segments]);

  // Preselect the project the visitor came from, but only once a location is
  // known and that project is genuinely nearby (i.e. the server would accept it).
  useEffect(() => {
    if (!initialProjectId || linkedProjectId || forceUnlisted) return;
    if (nearby.some((m) => m.project.id === initialProjectId)) {
      setLinkedProjectId(initialProjectId);
    }
  }, [initialProjectId, linkedProjectId, forceUnlisted, nearby]);

  const neighbourLabel = useMemo(() => {
    if (!location) return "Set a location to see nearby registered works.";
    if (nearby.length === 0) {
      return "No registered work is within 100 m of this spot — this will be filed as an unlisted work.";
    }
    return `${nearby.length} registered work${nearby.length === 1 ? "" : "s"} within 100 m.`;
  }, [location, nearby]);

  async function onPhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPhotoError(null);
    setFieldErrors((errors) => ({ ...errors, photo_url: "" }));

    if (!file) {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      photoBlobRef.current = null;
      setPhotoPreviewUrl(null);
      setPhotoStatus("idle");
      return;
    }

    if (!isAcceptedPhotoType(file.type)) {
      setPhotoStatus("error");
      setPhotoError("Please attach a JPG, PNG or WebP image.");
      photoBlobRef.current = null;
      return;
    }

    setPhotoStatus("compressing");
    try {
      const compressed = await compressImage(file);
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      photoBlobRef.current = compressed.blob;
      setPhotoPreviewUrl(URL.createObjectURL(compressed.blob));
      setPhotoStatus("ready");
    } catch (error) {
      photoBlobRef.current = null;
      setPhotoStatus("error");
      setPhotoError(
        error instanceof Error ? error.message : "Could not read that image.",
      );
    }
  }

  function clearPhoto() {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoBlobRef.current = null;
    setPhotoPreviewUrl(null);
    setPhotoStatus("idle");
    setPhotoError(null);
  }

  function useMyLocation() {
    setGeoMessage(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("denied");
      setGeoMessage(
        "This browser cannot share your location. Tap the map or type coordinates below.",
      );
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGeoStatus("granted");
      },
      (error) => {
        setGeoStatus("denied");
        setGeoMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Tap the map or type coordinates below."
            : "We could not get your location. Tap the map or type coordinates below.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function setCoordinate(axis: "lat" | "lng", raw: string) {
    const value = raw === "" ? NaN : Number(raw);
    setLocation((current) => {
      const base = current ?? { lat: 13.0674, lng: 80.2376 };
      const next = { ...base, [axis]: value };
      return next;
    });
  }

  async function uploadPhoto(): Promise<string | null> {
    const blob = photoBlobRef.current;
    if (!blob) return null;

    const form = new FormData();
    form.append("photo", blob, "report-photo.jpg");
    const result = await postForm<PhotoResponse>("/api/reports/photo", form);
    if (!result.ok || !result.data?.url) {
      setSubmitError(friendlyError(result));
      return null;
    }
    return result.data.url;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFieldErrors({});
    setSubmitError(null);
    setSuccess(null);

    // The "unlisted work" report type and the explicit override both mean the
    // same thing: no linked project.
    const unlisted = forceUnlisted || reportType === "unlisted_work";
    const candidate = {
      project_id: unlisted ? null : linkedProjectId || null,
      report_type: reportType,
      description,
      photo_url: null,
      lat: location?.lat ?? NaN,
      lng: location?.lng ?? NaN,
      is_unlisted_work: unlisted,
    };

    const parsed = citizenReportInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setFieldErrors(issueMap(
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      ));
      return;
    }

    setPending(true);
    try {
      // The photo goes up first — the report row stores its URL.
      const photoUrl = await uploadPhoto();
      if (photoBlobRef.current && !photoUrl) {
        setPending(false);
        return;
      }

      const result = await postJson<ReportResponse>("/api/reports", {
        ...parsed.data,
        photo_url: photoUrl,
        hp: honeypot,
      });

      if (!result.ok || !result.data) {
        if (result.issues?.length) setFieldErrors(issueMap(result.issues));
        else setSubmitError(friendlyError(result));
        return;
      }

      setSuccess(result.data);
      setDescription("");
      setLocation(null);
      setLinkedProjectId("");
      setForceUnlisted(false);
      clearPhoto();
      setGeoStatus("idle");
      setGeoMessage(null);
    } finally {
      setPending(false);
    }
  }

  const unlisted = forceUnlisted || reportType === "unlisted_work";
  const descriptionRemaining = DESCRIPTION_MAX - description.trim().length;

  if (success) {
    return (
      <div
        role="status"
        className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
      >
        <p className="font-semibold">Thanks — your report was recorded.</p>
        <p className="mt-1">
          {success.linked
            ? "It was linked to a registered project near the location you gave."
            : "No registered project was in range, so it was filed as an unlisted work."}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href="/map"
            className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          >
            See reports on the map →
          </Link>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          >
            File another report
          </button>
        </div>
        <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300">
          Simulated demo data: this write lives in memory for the server&apos;s
          lifetime only.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label="Report an issue"
      className="flex flex-col gap-5 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      {initialProject ? (
        <p className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
          You opened this from{" "}
          <span className="font-medium">{initialProject.title}</span>. It will be
          selected automatically if your location is near it.
        </p>
      ) : null}

      <div>
        <label className={LABEL} htmlFor="report-type">
          What is the problem?
        </label>
        <select
          id="report-type"
          value={reportType}
          onChange={(event) => setReportType(event.target.value as ReportType)}
          className={CONTROL}
        >
          {REPORT_TYPES.map((type) => (
            <option key={type} value={type}>
              {REPORT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        {unlisted ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Unlisted-work reports are never linked to a registry entry.
          </p>
        ) : null}
      </div>

      <div>
        <label className={LABEL} htmlFor="report-description">
          Describe what you saw
        </label>
        <textarea
          id="report-description"
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="e.g. The barricade around the trench has fallen over and the trench is uncovered at night."
          aria-invalid={Boolean(fieldErrors.description)}
          aria-describedby={
            fieldErrors.description ? "report-description-error" : "report-description-count"
          }
          className={CONTROL}
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          {fieldErrors.description ? (
            <p id="report-description-error" className="text-xs text-red-600">
              {fieldErrors.description}
            </p>
          ) : (
            <span />
          )}
          <p
            id="report-description-count"
            className={`text-xs ${
              descriptionRemaining < 0
                ? "text-red-600"
                : "text-neutral-500 dark:text-neutral-500"
            }`}
          >
            {description.trim().length}/{DESCRIPTION_MAX}
            {description.trim().length > 0 && description.trim().length < DESCRIPTION_MIN
              ? ` · at least ${DESCRIPTION_MIN}`
              : ""}
          </p>
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="report-photo">
          Photo{" "}
          <span className="font-normal text-neutral-500">(optional)</span>
        </label>
        <input
          id="report-photo"
          type="file"
          accept={ACCEPTED_PHOTO_TYPES.join(",")}
          onChange={onPhotoChange}
          aria-invalid={Boolean(photoError)}
          aria-describedby={photoError ? "report-photo-error" : "report-photo-help"}
          className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-neutral-300 dark:file:bg-neutral-100 dark:file:text-neutral-900"
        />
        <p id="report-photo-help" className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
          JPG, PNG or WebP. Your photo is resized to under 1 MB in the browser
          and location metadata is stripped before it is stored.
        </p>
        {photoStatus === "compressing" ? (
          <p role="status" className="mt-1 text-xs text-neutral-500">
            Processing photo…
          </p>
        ) : null}
        {photoError ? (
          <p id="report-photo-error" className="mt-1 text-xs text-red-600">
            {photoError}
          </p>
        ) : null}
        {photoPreviewUrl ? (
          <div className="mt-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoPreviewUrl}
              alt="Preview of the photo you attached"
              className="h-20 w-20 rounded border border-neutral-200 object-cover dark:border-neutral-700"
            />
            <button
              type="button"
              onClick={clearPhoto}
              className="text-xs underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Remove photo
            </button>
          </div>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className={LABEL}>Location</legend>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={geoStatus === "locating"}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {geoStatus === "locating" ? "Locating…" : "Use my location"}
          </button>
          {location ? (
            <span className="text-xs text-neutral-600 dark:text-neutral-400">
              {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </span>
          ) : null}
        </div>

        {geoMessage ? (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
            {geoMessage}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="report-lat">
              Latitude
            </label>
            <input
              id="report-lat"
              type="number"
              step="any"
              min={-90}
              max={90}
              value={location && Number.isFinite(location.lat) ? location.lat : ""}
              onChange={(event) => setCoordinate("lat", event.target.value)}
              className={CONTROL}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="report-lng">
              Longitude
            </label>
            <input
              id="report-lng"
              type="number"
              step="any"
              min={-180}
              max={180}
              value={location && Number.isFinite(location.lng) ? location.lng : ""}
              onChange={(event) => setCoordinate("lng", event.target.value)}
              className={CONTROL}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <LocationMap value={location} onChange={setLocation} />
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Tap the map to place the exact spot, or use your location / type
          coordinates above.
        </p>
        {fieldErrors.lat || fieldErrors.lng ? (
          <p role="alert" className="text-xs text-red-600">
            {fieldErrors.lat || fieldErrors.lng}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <legend className={LABEL}>Nearby registered work</legend>
        <p
          aria-live="polite"
          className="text-xs text-neutral-600 dark:text-neutral-400"
        >
          {neighbourLabel}
        </p>

        {nearby.length > 0 && !unlisted ? (
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="link"
                className="mt-1"
                checked={linkedProjectId === ""}
                onChange={() => setLinkedProjectId("")}
              />
              <span>
                <span className="font-medium">Let DigSync decide</span>
                <span className="block text-xs text-neutral-500">
                  Links to the nearest work automatically if it is within 100 m.
                </span>
              </span>
            </label>
            {nearby.slice(0, 5).map((match) => (
              <label
                key={match.project.id}
                className="flex items-start gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="link"
                  className="mt-1"
                  checked={linkedProjectId === match.project.id}
                  onChange={() => setLinkedProjectId(match.project.id)}
                />
                <span>
                  <span className="font-medium">{match.project.title}</span>
                  <span className="block text-xs text-neutral-500">
                    {match.segment.name} · {match.distanceMeters} m away
                  </span>
                </span>
              </label>
            ))}
          </div>
        ) : null}

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={unlisted}
            disabled={reportType === "unlisted_work"}
            onChange={(event) => {
              setForceUnlisted(event.target.checked);
              if (event.target.checked) setLinkedProjectId("");
            }}
          />
          <span>
            <span className="font-medium">This is an unlisted work</span>
            <span className="block text-xs text-neutral-500">
              Nothing here is in the registry — flag it so it can be investigated.
            </span>
          </span>
        </label>
        {fieldErrors.project_id ? (
          <p role="alert" className="text-xs text-red-600">
            {fieldErrors.project_id}
          </p>
        ) : null}
      </fieldset>

      {/* Honeypot: hidden from users and assistive tech, irresistible to bots. */}
      <div
        aria-hidden="true"
        className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden"
      >
        <label htmlFor="report-hp">Leave this field empty</label>
        <input
          id="report-hp"
          name="hp"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
      </div>

      {submitError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {submitError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || photoStatus === "compressing"}
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:enabled:hover:bg-white"
      >
        {pending ? "Submitting…" : "Submit report"}
      </button>
    </form>
  );
}
