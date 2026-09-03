"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  customerPhotoForEachSize,
  resolveCakePhoto,
  sizeLabelForPhoto,
  sortCakePhotos,
  suggestedDefaultPhotoId,
} from "@/engines/menu/cake-photos";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import { FormError, FormField, FormInput, FormSelect } from "@/components/ui/form";
import type { LibraryCakeDetail, LibraryCakePhoto } from "@/types/library-cake";
import { libraryActionInitialState } from "@/workspaces/library/action-state";
import {
  assignCakePhotoSizeAction,
  deleteCakePhotoAction,
  moveCakePhotoAction,
  replaceCakePhotoAction,
  setCakePhotoDefaultAction,
  uploadCakePhotoAction,
} from "@/workspaces/library/cakes/photo-actions";

type CakePhotoManagerProps = {
  cake: LibraryCakeDetail;
  canManage?: boolean;
};

function asResolvable(photos: LibraryCakePhoto[]) {
  return photos.map((photo) => ({
    id: photo.id,
    url: photo.imageUrl,
    altText: photo.altText,
    sortOrder: photo.sortOrder,
    cakeSizeId: photo.cakeSizeId,
    isDefault: photo.isDefault,
  }));
}

export function CakePhotoManager({
  cake,
  canManage = true,
}: CakePhotoManagerProps) {
  const photos = sortCakePhotos(asResolvable(cake.photos));
  const suggestedId = suggestedDefaultPhotoId(photos, cake.sizes);

  return (
    <section className="border-fog space-y-5 rounded-xl border bg-white p-4 sm:p-5">
      <div>
        <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
          Cake photos
        </h2>
        <p className="text-skyline mt-1 text-sm">
          Customers see the photo for the size they pick. If that size has no
          photo, they see the Default photo. A 6&quot; photo is the usual
          default when one exists — you can choose a different default.
        </p>
      </div>

      <CustomerSizePreview cake={cake} />

      {cake.photos.length === 0 ? (
        <p className="text-skyline text-sm">No photos yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortCakePhotos(cake.photos).map((photo, index) => (
            <li key={photo.id}>
              <PhotoCard
                cake={cake}
                canManage={canManage}
                index={index}
                photo={photo}
                suggestedDefault={photo.id === suggestedId}
                total={cake.photos.length}
              />
            </li>
          ))}
        </ul>
      )}

      {canManage ? <AddPhotoForm cake={cake} /> : null}
    </section>
  );
}

function CustomerSizePreview({ cake }: { cake: LibraryCakeDetail }) {
  if (cake.sizes.length === 0) return null;
  const previews = customerPhotoForEachSize(asResolvable(cake.photos), cake.sizes);

  return (
    <div className="border-fog rounded-lg border bg-mist/60 p-3">
      <p className="text-ink text-xs font-semibold tracking-wide uppercase">
        What customers see
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {previews.map(({ size, photo, exact }) => (
          <li key={size.id}>
            <p className="text-ink text-sm font-medium">{size.label}</p>
            <div className="bg-fog mt-1.5 aspect-square overflow-hidden rounded-lg">
              {photo ? (
                <CakePhotoImage
                  alt={photo.altText || `${cake.name} ${size.label}`}
                  sizes="160px"
                  src={photo.url}
                />
              ) : (
                <div className="text-skyline flex h-full items-center justify-center px-2 text-center text-xs">
                  Photo coming soon
                </div>
              )}
            </div>
            <p className="text-skyline mt-1 text-xs">
              {photo
                ? exact
                  ? `${size.label} photo`
                  : photo.isDefault
                    ? "Default photo"
                    : "Fallback photo"
                : "No photo"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PhotoCard({
  cake,
  photo,
  canManage,
  index,
  total,
  suggestedDefault,
}: {
  cake: LibraryCakeDetail;
  photo: LibraryCakePhoto;
  canManage: boolean;
  index: number;
  total: number;
  suggestedDefault: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [replaceState, replaceAction, replacing] = useActionState(
    replaceCakePhotoAction.bind(null, cake.id, photo.id),
    libraryActionInitialState,
  );
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const sizeLabel = sizeLabelForPhoto(photo, cake.sizes);
  const shown = resolveCakePhoto(asResolvable([photo]));

  function run(task: () => Promise<{ error: string | null }>) {
    startTransition(async () => {
      const result = await task();
      setError(result.error);
    });
  }

  return (
    <article className="border-fog flex h-full flex-col overflow-hidden rounded-xl border">
      <div className="bg-fog aspect-[4/3]">
        {shown ? (
          <CakePhotoImage
            alt={photo.altText || cake.name}
            sizes="280px"
            src={photo.imageUrl}
          />
        ) : (
          <div className="text-skyline flex h-full items-center justify-center text-sm">
            Photo coming soon
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-ink text-sm font-medium">
            {sizeLabel ? `${sizeLabel} photo` : "Gallery photo"}
          </p>
          {photo.isDefault ? (
            <span className="bg-ink text-mist rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
              ★ Default
            </span>
          ) : suggestedDefault ? (
            <span className="text-skyline text-[11px] font-medium">
              Usual default
            </span>
          ) : null}
          <span className="text-skyline ml-auto text-xs tabular-nums">
            {index + 1} of {total}
          </span>
        </div>

        {canManage ? (
          <>
            <form
              action={(formData) =>
                run(() =>
                  assignCakePhotoSizeAction(cake.id, photo.id, formData),
                )
              }
            >
              <FormField htmlFor={`photo-size-${photo.id}`} label="Size">
                <FormSelect
                  defaultValue={photo.cakeSizeId ?? ""}
                  disabled={pending}
                  id={`photo-size-${photo.id}`}
                  name="cake_size_id"
                  onChange={(event) => event.currentTarget.form?.requestSubmit()}
                >
                  <option value="">Gallery — not size-specific</option>
                  {cake.sizes.map((size) => (
                    <option key={size.id} value={size.id}>
                      {size.label}
                    </option>
                  ))}
                </FormSelect>
              </FormField>
            </form>

            <div className="flex flex-wrap gap-2">
              {photo.isDefault ? null : (
                <button
                  className="border-fog text-ink inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-xs font-medium"
                  disabled={pending}
                  onClick={() =>
                    run(() => setCakePhotoDefaultAction(cake.id, photo.id))
                  }
                  type="button"
                >
                  Make default
                </button>
              )}
              <button
                className="border-fog text-ink inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-xs font-medium disabled:opacity-40"
                disabled={pending || index === 0}
                onClick={() =>
                  run(() => moveCakePhotoAction(cake.id, photo.id, "up"))
                }
                type="button"
              >
                Earlier
              </button>
              <button
                className="border-fog text-ink inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-xs font-medium disabled:opacity-40"
                disabled={pending || index === total - 1}
                onClick={() =>
                  run(() => moveCakePhotoAction(cake.id, photo.id, "down"))
                }
                type="button"
              >
                Later
              </button>
              <button
                className="border-fog text-ink inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-xs font-medium"
                disabled={replacing}
                onClick={() => replaceInputRef.current?.click()}
                type="button"
              >
                Replace
              </button>
              <button
                className="text-status-danger inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-xs font-medium"
                disabled={pending}
                onClick={() =>
                  run(() => deleteCakePhotoAction(cake.id, photo.id))
                }
                type="button"
              >
                Delete
              </button>
            </div>

            <form action={replaceAction} className="hidden">
              <input
                accept="image/jpeg,image/png,image/webp"
                name="photo"
                onChange={(event) => {
                  if (event.currentTarget.files?.[0]) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                ref={replaceInputRef}
                type="file"
              />
            </form>
            <FormError message={error ?? replaceState.error} />
          </>
        ) : null}
      </div>
    </article>
  );
}

function AddPhotoForm({ cake }: { cake: LibraryCakeDetail }) {
  const [state, formAction, pending] = useActionState(
    uploadCakePhotoAction.bind(null, cake.id),
    libraryActionInitialState,
  );

  return (
    <form
      action={formAction}
      className="border-fog space-y-3 rounded-xl border border-dashed p-4"
    >
      <h3 className="text-ink text-sm font-semibold">Add photo</h3>
      <p className="text-skyline text-sm">
        JPEG, PNG, or WebP, up to 8 MB. Leave size empty for a gallery or
        lifestyle photo.
      </p>
      <FormField htmlFor="new-photo" label="Photo">
        <input
          accept="image/jpeg,image/png,image/webp"
          className="text-ink text-sm"
          id="new-photo"
          name="photo"
          required
          type="file"
        />
      </FormField>
      <FormField htmlFor="new-photo-size" label="Size">
        <FormSelect defaultValue="" id="new-photo-size" name="cake_size_id">
          <option value="">Gallery — not size-specific</option>
          {cake.sizes.map((size) => (
            <option key={size.id} value={size.id}>
              {size.label}
            </option>
          ))}
        </FormSelect>
      </FormField>
      <FormField htmlFor="new-photo-alt" label="Alt text">
        <FormInput
          id="new-photo-alt"
          name="alt_text"
          placeholder={`${cake.name} photo`}
        />
      </FormField>
      <FormError message={state.error} />
      <button
        className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Uploading…" : "Upload photo"}
      </button>
    </form>
  );
}
