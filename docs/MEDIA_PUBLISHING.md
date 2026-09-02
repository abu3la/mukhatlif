# Article Media Runbook

## Storage and Origin

Create a private Cloudflare R2 bucket. Development binds it to the Worker as
`MEDIA`; production accesses the same service from Hostinger through the
S3-compatible adapter in `apps/api/src/storage/r2-s3.ts`. Configure
`MEDIA_PUBLIC_ORIGIN` as the HTTPS origin that serves the runtime's `/media/:id`
route. Hostinger production requires exactly `https://api.mukhtalif.net`.
Outside local development, the API fails closed if storage exists without a
safe origin.

Hostinger receives all five `R2_*` values from its secret store. The adapter
streams uploads through multipart transfer, preserves HTTP metadata and ETags,
and derives full-object size from `Content-Range` for partial reads so the
existing media/audio response contract remains identical to native Worker R2.
Validate a HEAD, full GET, ranged GET, upload, and delete against each live
bucket before production cutover.

Apply `0011_article_media_assets.sql` to Supabase before enabling the binding. The table has RLS enabled and grants no direct `anon` or `authenticated` access. Browsers never receive the R2 object key or credentials.

## Image Upload Contract

The Studio upload is intentionally two-step:

1. `POST /studio/media/uploads` with JSON metadata reserves a pending asset.
2. Authenticated `PUT /studio/media/uploads/:id/content` uploads the raw body with an exact `Content-Type` and `Content-Length`.

Both mutations require `articles.manage`; the ready library requires `articles.view`. The upload accepts only JPEG and PNG, at most 10 MiB, at most 8192 pixels on either side, and at most 24 megapixels. SVG, GIF, WebP, HEIC, encoded request bodies, dimension mismatches, malformed images, and trailing data are rejected.

The API strips JPEG application/comment segments and rejects malformed marker or scan structure and bytes after EOI. For PNG it validates every chunk CRC and ordering, rejects unknown critical chunks, validates the decompressed non-interlaced raster length and row filters, strips ancillary metadata/application chunks, and retains only rendering-critical transparency. Only the sanitized bytes are stored in R2. Public responses are immutable and include `X-Content-Type-Options: nosniff`.

JPEG EXIF orientation is stripped with the rest of the metadata. This v1 path does not rotate or transcode pixels, so Studio clients must normalize camera images before reserving an upload when their display orientation depends on EXIF. A production image-transcoding service should own auto-orientation before expanding the accepted formats.

Pending uploads are not listed or publicly readable. A private-token compare-and-swap lease prevents concurrent PUTs; an abandoned lease may be reclaimed after 15 minutes. Every lease writes to its own attempt-specific R2 key, and only token-fenced completion promotes that key into the ready row, so a stale worker cannot overwrite or delete a newer attempt. There is no delete endpoint in this slice because removing an object already embedded in a sent email would break that immutable edition.

A runtime crash after the R2 write but before database completion can leave an unreferenced attempt object. Production operations should periodically remove only old R2 keys that are absent from `article_media_assets.storage_key`, with a retention window longer than the upload lease. Do not apply a blanket lifecycle rule to attempt-shaped keys because ready assets also retain their successfully fenced attempt key.

## Cover Image Contract

The Studio cover picker accepts a JPEG or PNG source image and opens an interactive crop step powered by `react-image-crop` (ISC). The crop is fixed to `16:9`; the editor may move or resize it with a pointer, touch, or keyboard. The Studio renders that selection into a new file at the selected natural-pixel dimensions before upload. It does not upscale the source. The resulting cover must be at least `1200 x 675` pixels, and `1600 x 900` is recommended. These cover-only rules do not apply to images placed inside article content.

This is currently a Studio usability boundary, not a trusted API invariant. Articles still persist `coverUrl` rather than a purpose-bound media asset ID, so direct API clients and the external-URL fallback can bypass the crop and minimum dimensions. The external path is labeled accordingly and must be reviewed in the previews. Before treating the cover dimensions as a production publishing guarantee, add a purpose-bound `coverMediaId` (or an equivalent upload purpose), validate its ready metadata in the API, and derive the public URL server-side.

## Editor Nodes

- `imageBlock`: `{mediaId, alt, caption?, presentation: 'content' | 'wide', alignment?: 'start' | 'center' | 'end', radius?: 'none' | 'soft' | 'round'}`
- `imageGallery`: `{items: [{mediaId, alt}, ...], caption?}` with two or three unique ready images
- `videoEmbed`: `{provider: 'youtube' | 'vimeo', videoId, title, posterMediaId, caption?}`

Alternative text, title, and captions belong to each placement in an article. Library assets carry only `defaultAlt` and `defaultCaption` suggestions; the API preserves the placement-specific values. It validates that every image or poster is ready before saving, publishing, previewing, synchronizing, or sending.

Image alignment and corner shape are closed enums, not CSS inputs. Existing documents default to centered alignment and square corners (`center` / `none`) when canonicalized or rendered. Web output exposes the normalized values as `data-alignment` and `data-radius` and also applies fixed, server-owned inline styles: `content` is capped at 640px, `wide` fills its container, logical alignment follows the surrounding RTL direction, and radii map to 0 / 12 / 28px. Newsletter output uses the same radius values and maps logical start / center / end to right / center / left with email-safe attributes and margins. The image controls do not apply to video nodes, and `presentation` remains the independent `content` / `wide` width contract.

Gallery items count toward the document-wide limit of 30 images. Web output uses a wrapping, uncropped image row; email output uses a conservative two- or three-column presentation table with one shared caption after it. Every image keeps separate alternative text for accessibility; that text is not rendered as a visible caption. Gallery nodes accept no client CSS or layout attributes.

Studio presentation styles for the editor and its previews live in `apps/admin/src/app/styles/10-article-publisher.css`. The gallery-specific selectors are `.article-image-gallery__grid`, `.article-media-node--gallery`, `.article-content-media--gallery`, and `.article-image-gallery-dialog*`. Change those rules for Studio presentation work; do not place raw CSS in article JSON. Published output continues to use the fixed server-owned responsive and email layouts described above.

Video files and arbitrary iframe/source URLs are not accepted. Web HTML builds only known YouTube privacy-enhanced or Vimeo embed URLs. Newsletter HTML uses a linked poster and explicit watch link, never an iframe or video element. Newsletter media URLs use `MEDIA_PUBLIC_ORIGIN`, independently from `PUBLIC_WEB_URL`.

## Production Checklist

1. Apply migration `0011_article_media_assets.sql` in staging.
2. Bind the private R2 bucket as `MEDIA` in development; configure all five
   Hostinger `R2_*` values for production.
3. Set the stable HTTPS `MEDIA_PUBLIC_ORIGIN`.
4. Upload JPEG and PNG samples, then confirm metadata chunks are absent from stored objects.
5. Confirm pending or malformed uploads return 404 from `/media/:id`.
6. Preview image and video placements in both web and email modes.
7. Confirm Mailchimp fetches poster/image URLs from the stable media origin before a production send.
8. Normalize or deliberately reject JPEGs whose visible orientation depends on EXIF until an auto-orienting transcoder is deployed.
9. Configure a conservative orphan-object reconciliation job and test that it never removes a key referenced by a ready row.
